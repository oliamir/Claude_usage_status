import Foundation

struct UsageResponse: Codable {
    let sevenDay: UsageBucket?
    let fable: UsageBucket?
    let sevenDayOpus: UsageBucket?
    let sevenDaySonnet: UsageBucket?
    let sevenDayDesign: UsageBucket?
    let sevenDayCowork: UsageBucket?
    let extraUsage: ExtraUsage?

    enum CodingKeys: String, CodingKey {
        case sevenDay = "seven_day"
        case fable = "seven_day_fable"
        case fableAlias = "fable"
        case sevenDayOpus = "seven_day_opus"
        case sevenDaySonnet = "seven_day_sonnet"
        case sevenDayDesign = "seven_day_omelette"
        case sevenDayDesignAlias = "seven_day_design"
        case sevenDayCowork = "seven_day_cowork"
        case extraUsage = "extra_usage"
        case limits
        case modelScoped = "model_scoped"
    }

    init(
        sevenDay: UsageBucket? = nil,
        fable: UsageBucket? = nil,
        sevenDayOpus: UsageBucket? = nil,
        sevenDaySonnet: UsageBucket? = nil,
        sevenDayDesign: UsageBucket? = nil,
        sevenDayCowork: UsageBucket? = nil,
        extraUsage: ExtraUsage? = nil
    ) {
        self.sevenDay = sevenDay
        self.fable = fable
        self.sevenDayOpus = sevenDayOpus
        self.sevenDaySonnet = sevenDaySonnet
        self.sevenDayDesign = sevenDayDesign
        self.sevenDayCowork = sevenDayCowork
        self.extraUsage = extraUsage
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let directSevenDay = try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDay)
        let directFable = try container.decodeIfPresent(UsageBucket.self, forKey: .fable)
            ?? (try container.decodeIfPresent(UsageBucket.self, forKey: .fableAlias))
        let directOpus = try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDayOpus)
        let directSonnet = try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDaySonnet)
        let directDesign = try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDayDesign)
            ?? (try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDayDesignAlias))
        let directCowork = try container.decodeIfPresent(UsageBucket.self, forKey: .sevenDayCowork)
        let extra = try container.decodeIfPresent(ExtraUsage.self, forKey: .extraUsage)

        let limits = try container.decodeIfPresent([UsageLimitEntry].self, forKey: .limits) ?? []
        let modelScoped = try container.decodeIfPresent([ModelScopedEntry].self, forKey: .modelScoped) ?? []

        let limitsSevenDay = Self.bucketFromLimits(limits, kind: "weekly_all")
        let limitsFable = Self.scopedBucketFromLimits(limits, modelName: "fable")
            ?? Self.bucketFromModelScoped(modelScoped, modelName: "fable")
        let limitsOpus = Self.scopedBucketFromLimits(limits, modelName: "opus")
            ?? Self.bucketFromModelScoped(modelScoped, modelName: "opus")
        let limitsSonnet = Self.scopedBucketFromLimits(limits, modelName: "sonnet")
            ?? Self.bucketFromModelScoped(modelScoped, modelName: "sonnet")
        let limitsDesign = Self.scopedBucketFromLimits(limits, modelName: "design")
            ?? Self.scopedBucketFromLimits(limits, modelName: "omelette")
            ?? Self.bucketFromModelScoped(modelScoped, modelName: "design")

        self.sevenDay = Self.merged(primary: directSevenDay, fallback: limitsSevenDay)
        self.fable = Self.merged(primary: directFable, fallback: limitsFable)
        self.sevenDayOpus = Self.merged(primary: directOpus, fallback: limitsOpus)
        self.sevenDaySonnet = Self.merged(primary: directSonnet, fallback: limitsSonnet)
        self.sevenDayDesign = Self.merged(primary: directDesign, fallback: limitsDesign)
        self.sevenDayCowork = directCowork
        self.extraUsage = extra
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(sevenDay, forKey: .sevenDay)
        try container.encodeIfPresent(fable, forKey: .fable)
        try container.encodeIfPresent(sevenDayOpus, forKey: .sevenDayOpus)
        try container.encodeIfPresent(sevenDaySonnet, forKey: .sevenDaySonnet)
        try container.encodeIfPresent(sevenDayDesign, forKey: .sevenDayDesign)
        try container.encodeIfPresent(sevenDayCowork, forKey: .sevenDayCowork)
        try container.encodeIfPresent(extraUsage, forKey: .extraUsage)
    }

    /// Returns all per-model / scoped 7-day buckets that have active utilization data.
    var activeModelBuckets: [(label: String, bucket: UsageBucket)] {
        let candidates: [(String, UsageBucket?)] = [
            ("Opus", sevenDayOpus),
            ("Sonnet", sevenDaySonnet),
            ("Design", sevenDayDesign),
            ("Cowork", sevenDayCowork),
        ]
        return candidates.compactMap { label, bucket in
            guard let bucket, bucket.utilization != nil else { return nil }
            return (label: label, bucket: bucket)
        }
    }

    private static func merged(primary: UsageBucket?, fallback: UsageBucket?) -> UsageBucket? {
        guard let primary else { return fallback }
        guard let fallback else { return primary }
        return UsageBucket(
            utilization: primary.utilization ?? fallback.utilization,
            resetsAt: primary.resetsAt ?? fallback.resetsAt,
            usedDollars: primary.usedDollars ?? fallback.usedDollars,
            limitDollars: primary.limitDollars ?? fallback.limitDollars,
            remainingDollars: primary.remainingDollars ?? fallback.remainingDollars,
            isActive: primary.isActive ?? fallback.isActive
        )
    }

    private static func bucketFromLimits(_ limits: [UsageLimitEntry], kind: String) -> UsageBucket? {
        guard let entry = limits.first(where: { $0.kind?.lowercased() == kind.lowercased() }) else {
            return nil
        }
        return entry.asUsageBucket
    }

    private static func scopedBucketFromLimits(_ limits: [UsageLimitEntry], modelName: String) -> UsageBucket? {
        let target = modelName.lowercased()
        guard let entry = limits.first(where: { entry in
            guard entry.kind?.lowercased() == "weekly_scoped" || entry.group?.lowercased() == "weekly" else {
                return false
            }
            if let displayName = entry.scope?.model?.displayName?.lowercased(), displayName.contains(target) {
                return true
            }
            if let modelId = entry.scope?.model?.id?.lowercased(), modelId.contains(target) {
                return true
            }
            return false
        }) else {
            return nil
        }
        return entry.asUsageBucket
    }

    private static func bucketFromModelScoped(_ entries: [ModelScopedEntry], modelName: String) -> UsageBucket? {
        let target = modelName.lowercased()
        guard let entry = entries.first(where: {
            $0.displayName?.lowercased().contains(target) == true
        }) else {
            return nil
        }
        return UsageBucket(
            utilization: entry.utilization ?? entry.percent,
            resetsAt: entry.resetsAt
        )
    }

    func reconciled(with previous: UsageResponse?, now: Date = Date()) -> UsageResponse {
        let sevenDayInterval: TimeInterval = 7 * 24 * 60 * 60
        return UsageResponse(
            sevenDay: sevenDay?.reconciled(
                with: previous?.sevenDay,
                resetInterval: sevenDayInterval,
                now: now
            ),
            fable: fable?.reconciled(
                with: previous?.fable,
                resetInterval: sevenDayInterval,
                now: now
            ),
            sevenDayOpus: sevenDayOpus?.reconciled(
                with: previous?.sevenDayOpus,
                resetInterval: sevenDayInterval,
                now: now
            ),
            sevenDaySonnet: sevenDaySonnet?.reconciled(
                with: previous?.sevenDaySonnet,
                resetInterval: sevenDayInterval,
                now: now
            ),
            sevenDayDesign: sevenDayDesign?.reconciled(
                with: previous?.sevenDayDesign,
                resetInterval: sevenDayInterval,
                now: now
            ),
            sevenDayCowork: sevenDayCowork?.reconciled(
                with: previous?.sevenDayCowork,
                resetInterval: sevenDayInterval,
                now: now
            ),
            extraUsage: extraUsage
        )
    }
}

private struct UsageLimitEntry: Decodable {
    let kind: String?
    let group: String?
    let percent: Double?
    let utilization: Double?
    let resetsAt: String?
    let isActive: Bool?
    let scope: Scope?

    struct Scope: Decodable {
        let model: ModelScope?
    }

    struct ModelScope: Decodable {
        let id: String?
        let displayName: String?

        enum CodingKeys: String, CodingKey {
            case id
            case displayName = "display_name"
        }
    }

    enum CodingKeys: String, CodingKey {
        case kind
        case group
        case percent
        case utilization
        case resetsAt = "resets_at"
        case isActive = "is_active"
        case scope
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.kind = try container.decodeIfPresent(String.self, forKey: .kind)
        self.group = try container.decodeIfPresent(String.self, forKey: .group)
        self.percent = try container.decodeIfPresent(Double.self, forKey: .percent)
        self.utilization = try container.decodeIfPresent(Double.self, forKey: .utilization)
        self.resetsAt = UsageBucket.decodeFlexibleResetString(from: container, forKey: .resetsAt)
        self.isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive)
        self.scope = try container.decodeIfPresent(Scope.self, forKey: .scope)
    }

    var asUsageBucket: UsageBucket {
        UsageBucket(
            utilization: utilization ?? percent,
            resetsAt: resetsAt,
            isActive: isActive
        )
    }
}

private struct ModelScopedEntry: Decodable {
    let displayName: String?
    let utilization: Double?
    let percent: Double?
    let resetsAt: String?

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case utilization
        case percent
        case resetsAt = "resets_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
        self.utilization = try container.decodeIfPresent(Double.self, forKey: .utilization)
        self.percent = try container.decodeIfPresent(Double.self, forKey: .percent)
        self.resetsAt = UsageBucket.decodeFlexibleResetString(from: container, forKey: .resetsAt)
    }
}

struct UsageBucket: Codable {
    let utilization: Double?
    let resetsAt: String?
    let usedDollars: Double?
    let limitDollars: Double?
    let remainingDollars: Double?
    let isActive: Bool?

    enum CodingKeys: String, CodingKey {
        case utilization
        case percent
        case resetsAt = "resets_at"
        case usedDollars = "used_dollars"
        case limitDollars = "limit_dollars"
        case remainingDollars = "remaining_dollars"
        case isActive = "is_active"
    }

    init(
        utilization: Double?,
        resetsAt: String?,
        usedDollars: Double? = nil,
        limitDollars: Double? = nil,
        remainingDollars: Double? = nil,
        isActive: Bool? = nil
    ) {
        self.utilization = utilization
        self.resetsAt = resetsAt
        self.usedDollars = usedDollars
        self.limitDollars = limitDollars
        self.remainingDollars = remainingDollars
        self.isActive = isActive
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let util = try container.decodeIfPresent(Double.self, forKey: .utilization)
            ?? (try container.decodeIfPresent(Double.self, forKey: .percent))
        self.utilization = util
        self.resetsAt = Self.decodeFlexibleResetString(from: container, forKey: .resetsAt)
        self.usedDollars = try container.decodeIfPresent(Double.self, forKey: .usedDollars)
        self.limitDollars = try container.decodeIfPresent(Double.self, forKey: .limitDollars)
        self.remainingDollars = try container.decodeIfPresent(Double.self, forKey: .remainingDollars)
        self.isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(utilization, forKey: .utilization)
        try container.encodeIfPresent(resetsAt, forKey: .resetsAt)
        try container.encodeIfPresent(usedDollars, forKey: .usedDollars)
        try container.encodeIfPresent(limitDollars, forKey: .limitDollars)
        try container.encodeIfPresent(remainingDollars, forKey: .remainingDollars)
        try container.encodeIfPresent(isActive, forKey: .isActive)
    }

    static func decodeFlexibleResetString<K: CodingKey>(
        from container: KeyedDecodingContainer<K>,
        forKey key: K
    ) -> String? {
        if let str = try? container.decodeIfPresent(String.self, forKey: key) {
            return str
        }
        if let timestamp = try? container.decodeIfPresent(Double.self, forKey: key) {
            return resetString(from: Date(timeIntervalSince1970: timestamp))
        }
        return nil
    }

    var resetsAtDate: Date? {
        Self.parseResetDate(from: resetsAt)
    }

    /// Formatted dollar usage string when the API includes dollar figures on the bucket.
    var formattedDollarSummary: String? {
        if let used = usedDollars, let limit = limitDollars {
            return "\(ExtraUsage.formatUSD(used)) / \(ExtraUsage.formatUSD(limit))"
        }
        if let remaining = remainingDollars {
            return "\(ExtraUsage.formatUSD(remaining)) left"
        }
        if let used = usedDollars {
            return "\(ExtraUsage.formatUSD(used)) used"
        }
        return nil
    }

    /// Fraction (0.0...1.0) of the rolling window that has elapsed at `now`.
    func elapsedFraction(
        windowDuration: TimeInterval = 7 * 24 * 60 * 60,
        now: Date = Date()
    ) -> Double? {
        guard windowDuration > 0, let resetDate = resetsAtDate else { return nil }
        let remaining = resetDate.timeIntervalSince(now)
        guard remaining > 0, remaining <= windowDuration else { return nil }
        let elapsed = windowDuration - remaining
        return min(max(elapsed / windowDuration, 0.0), 1.0)
    }

    /// Difference between utilization fraction (0.0...1.0) and elapsed time fraction (0.0...1.0).
    /// Positive means burning faster than a steady linear pace; negative means under pace.
    func paceDelta(
        windowDuration: TimeInterval = 7 * 24 * 60 * 60,
        now: Date = Date()
    ) -> Double? {
        guard let util = utilization,
              let elapsed = elapsedFraction(windowDuration: windowDuration, now: now) else {
            return nil
        }
        return (util / 100.0) - elapsed
    }

    func reconciled(with previous: UsageBucket?, resetInterval: TimeInterval, now: Date) -> UsageBucket {
        guard resetsAtDate == nil else { return self }
        guard let previousDate = previous?.resetsAtDate else { return self }

        let resolvedDate = Self.nextResetDate(
            from: previousDate,
            resetInterval: resetInterval,
            now: now
        )

        return UsageBucket(
            utilization: utilization,
            resetsAt: Self.resetString(from: resolvedDate),
            usedDollars: usedDollars,
            limitDollars: limitDollars,
            remainingDollars: remainingDollars,
            isActive: isActive
        )
    }

    private static func parseResetDate(from value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }

        let isoFormatters: [ISO8601DateFormatter.Options] = [
            [.withInternetDateTime, .withFractionalSeconds],
            [.withInternetDateTime]
        ]

        for options in isoFormatters {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = options
            if let date = formatter.date(from: value) {
                return date
            }
        }

        let fallbackPatterns = [
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss"
        ]

        for pattern in fallbackPatterns {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = pattern
            if let date = formatter.date(from: value) {
                return date
            }
        }

        return nil
    }

    private static func nextResetDate(from previous: Date, resetInterval: TimeInterval, now: Date) -> Date {
        guard resetInterval > 0 else { return previous }
        guard previous <= now else { return previous }

        let elapsed = now.timeIntervalSince(previous)
        let stepCount = floor(elapsed / resetInterval) + 1
        return previous.addingTimeInterval(stepCount * resetInterval)
    }

    fileprivate static func resetString(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

struct ExtraUsage: Codable {
    let isEnabled: Bool
    let utilization: Double?
    let usedCredits: Double?
    let monthlyLimit: Double?

    enum CodingKeys: String, CodingKey {
        case isEnabled = "is_enabled"
        case utilization
        case usedCredits = "used_credits"
        case monthlyLimit = "monthly_limit"
    }

    /// API returns credits in minor units (cents); convert to dollars.
    var usedCreditsAmount: Double? {
        usedCredits.map { $0 / 100.0 }
    }

    var monthlyLimitAmount: Double? {
        monthlyLimit.map { $0 / 100.0 }
    }

    static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 2
        return f
    }()

    static func formatUSD(_ amount: Double) -> String {
        currencyFormatter.string(from: NSNumber(value: amount))
            ?? String(format: "$%.2f", amount)
    }
}

import Foundation

struct UsageDataPoint: Codable, Identifiable {
    var id: UUID
    let timestamp: Date
    let pct7d: Double
    let pctFable: Double

    enum CodingKeys: String, CodingKey {
        case id
        case timestamp
        case pct7d
        case pctFable
    }

    init(timestamp: Date = Date(), pct7d: Double, pctFable: Double) {
        self.id = UUID()
        self.timestamp = timestamp
        self.pct7d = pct7d
        self.pctFable = pctFable
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? container.decode(UUID.self, forKey: .id)) ?? UUID()
        self.timestamp = try container.decode(Date.self, forKey: .timestamp)
        self.pct7d = try container.decodeIfPresent(Double.self, forKey: .pct7d) ?? 0
        self.pctFable = try container.decodeIfPresent(Double.self, forKey: .pctFable) ?? 0
    }
}

struct UsageHistory: Codable {
    var dataPoints: [UsageDataPoint] = []
}

enum TimeRange: String, CaseIterable, Identifiable {
    case hour6 = "6h"
    case day1 = "1d"
    case day7 = "7d"
    case day14 = "14d"
    case day30 = "30d"

    var id: String { rawValue }

    var interval: TimeInterval {
        switch self {
        case .hour6: return 6 * 3600
        case .day1: return 86400
        case .day7: return 7 * 86400
        case .day14: return 14 * 86400
        case .day30: return 30 * 86400
        }
    }

    var targetPointCount: Int {
        switch self {
        case .hour6: return 180
        case .day1: return 200
        case .day7: return 200
        case .day14: return 200
        case .day30: return 200
        }
    }
}

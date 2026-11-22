import Foundation
import os
@preconcurrency import UserNotifications

struct ThresholdAlert: Equatable {
    let window: String
    let pct: Int
}

/// Pure logic: returns which threshold alerts should fire given a state transition.
func crossedThresholds(
    threshold7d: Int,
    thresholdFable: Int,
    thresholdExtra: Int,
    previous7d: Double,
    previousFable: Double,
    previousExtra: Double,
    current7d: Double,
    currentFable: Double,
    currentExtra: Double
) -> [ThresholdAlert] {
    var alerts = [ThresholdAlert]()

    if threshold7d > 0 {
        let t = Double(threshold7d)
        if current7d >= t && previous7d < t {
            alerts.append(ThresholdAlert(window: "7-day", pct: Int(round(current7d))))
        }
    }

    if thresholdFable > 0 {
        let t = Double(thresholdFable)
        if currentFable >= t && previousFable < t {
            alerts.append(ThresholdAlert(window: "Fable", pct: Int(round(currentFable))))
        }
    }

    if thresholdExtra > 0 {
        let t = Double(thresholdExtra)
        if currentExtra >= t && previousExtra < t {
            alerts.append(ThresholdAlert(window: "Extra usage", pct: Int(round(currentExtra))))
        }
    }

    return alerts
}

private class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

@MainActor
class NotificationService: ObservableObject {
    private nonisolated static let logger = Logger(subsystem: "com.local.ClaudeUsageBar", category: "Notifications")
    /// 0 = off, 5–100 = alert when window reaches this %.
    @Published private(set) var threshold7d: Int
    @Published private(set) var thresholdFable: Int
    @Published private(set) var thresholdExtra: Int

    private var previousPct7d: Double?
    private var previousPctFable: Double?
    private var previousPctExtra: Double?
    private let delegate = NotificationDelegate()

    init() {
        threshold7d = Self.load("notificationThreshold7d")
        thresholdFable = Self.load("notificationThresholdFable")
        thresholdExtra = Self.load("notificationThresholdExtra")
        if Bundle.main.bundleIdentifier != nil {
            UNUserNotificationCenter.current().delegate = delegate
        }
    }

    func setThreshold7d(_ value: Int) {
        threshold7d = clamp(value)
        UserDefaults.standard.set(threshold7d, forKey: "notificationThreshold7d")
        previousPct7d = nil
        if threshold7d > 0 { requestPermission() }
    }

    func setThresholdFable(_ value: Int) {
        thresholdFable = clamp(value)
        UserDefaults.standard.set(thresholdFable, forKey: "notificationThresholdFable")
        previousPctFable = nil
        if thresholdFable > 0 { requestPermission() }
    }

    func setThresholdExtra(_ value: Int) {
        thresholdExtra = clamp(value)
        UserDefaults.standard.set(thresholdExtra, forKey: "notificationThresholdExtra")
        previousPctExtra = nil
        if thresholdExtra > 0 { requestPermission() }
    }

    func requestPermission() {
        guard Bundle.main.bundleIdentifier != nil else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func checkAndNotify(pct7d: Double, pctFable: Double, pctExtra: Double) {
        let current7d = pct7d * 100
        let currentFable = pctFable * 100
        let currentExtra = pctExtra * 100

        let prev7d = previousPct7d ?? 0
        let prevFable = previousPctFable ?? 0
        let prevExtra = previousPctExtra ?? 0

        defer {
            previousPct7d = current7d
            previousPctFable = currentFable
            previousPctExtra = currentExtra
        }

        let alerts = crossedThresholds(
            threshold7d: threshold7d,
            thresholdFable: thresholdFable,
            thresholdExtra: thresholdExtra,
            previous7d: prev7d,
            previousFable: prevFable,
            previousExtra: prevExtra,
            current7d: current7d,
            currentFable: currentFable,
            currentExtra: currentExtra
        )

        for alert in alerts {
            sendNotification(window: alert.window, pct: alert.pct)
        }
    }

    private func sendNotification(window: String, pct: Int) {
        guard Bundle.main.bundleIdentifier != nil else {
            Self.logger.debug("Skipped notification for \(window) at \(pct)% — no bundle identifier")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Claude Usage"
        content.body = "\(window) usage has reached \(pct)%"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "usage-\(window)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                Self.logger.error("Failed to deliver notification: \(error.localizedDescription)")
            } else {
                Self.logger.debug("Delivered notification: \(window) at \(pct)%")
            }
        }
    }

    private func clamp(_ value: Int) -> Int {
        max(0, min(100, value))
    }

    private static func load(_ key: String) -> Int {
        let value = UserDefaults.standard.integer(forKey: key)
        return max(0, min(100, value))
    }
}

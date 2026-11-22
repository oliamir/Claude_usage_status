import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct NotificationServiceTests {
    @Test func noAlertsWhenAllOff() {
        let alerts = crossedThresholds(
            threshold7d: 0, thresholdFable: 0, thresholdExtra: 0,
            previous7d: 30, previousFable: 40, previousExtra: 20,
            current7d: 85, currentFable: 90, currentExtra: 80
        )
        #expect(alerts.isEmpty)
    }

    @Test func onlyFableFires() {
        let alerts = crossedThresholds(
            threshold7d: 0, thresholdFable: 80, thresholdExtra: 0,
            previous7d: 50, previousFable: 70, previousExtra: 10,
            current7d: 90, currentFable: 85, currentExtra: 50
        )
        #expect(alerts == [ThresholdAlert(window: "Fable", pct: 85)])
    }

    @Test func only7dFires() {
        let alerts = crossedThresholds(
            threshold7d: 80, thresholdFable: 0, thresholdExtra: 0,
            previous7d: 70, previousFable: 70, previousExtra: 10,
            current7d: 85, currentFable: 85, currentExtra: 50
        )
        #expect(alerts == [ThresholdAlert(window: "7-day", pct: 85)])
    }

    @Test func onlyExtraFires() {
        let alerts = crossedThresholds(
            threshold7d: 0, thresholdFable: 0, thresholdExtra: 50,
            previous7d: 70, previousFable: 70, previousExtra: 40,
            current7d: 85, currentFable: 85, currentExtra: 60
        )
        #expect(alerts == [ThresholdAlert(window: "Extra usage", pct: 60)])
    }

    @Test func allThreeFireSimultaneously() {
        let alerts = crossedThresholds(
            threshold7d: 80, thresholdFable: 80, thresholdExtra: 50,
            previous7d: 70, previousFable: 70, previousExtra: 40,
            current7d: 90, currentFable: 85, currentExtra: 60
        )
        #expect(alerts == [
            ThresholdAlert(window: "7-day", pct: 90),
            ThresholdAlert(window: "Fable", pct: 85),
            ThresholdAlert(window: "Extra usage", pct: 60),
        ])
    }

    @Test func noAlertWhenStayingAbove() {
        let alerts = crossedThresholds(
            threshold7d: 80, thresholdFable: 80, thresholdExtra: 50,
            previous7d: 90, previousFable: 85, previousExtra: 60,
            current7d: 92, currentFable: 88, currentExtra: 65
        )
        #expect(alerts.isEmpty)
    }

    @Test func noAlertWhenStayingBelow() {
        let alerts = crossedThresholds(
            threshold7d: 80, thresholdFable: 80, thresholdExtra: 50,
            previous7d: 60, previousFable: 50, previousExtra: 30,
            current7d: 75, currentFable: 70, currentExtra: 45
        )
        #expect(alerts.isEmpty)
    }

    @Test func exactThresholdTriggers() {
        let alerts = crossedThresholds(
            threshold7d: 0, thresholdFable: 80, thresholdExtra: 0,
            previous7d: 50, previousFable: 79, previousExtra: 10,
            current7d: 50, currentFable: 80, currentExtra: 10
        )
        #expect(alerts == [ThresholdAlert(window: "Fable", pct: 80)])
    }

    @Test func firstPollFiresWhenAlreadyAboveThreshold() {
        let alerts = crossedThresholds(
            threshold7d: 5, thresholdFable: 25, thresholdExtra: 0,
            previous7d: 0, previousFable: 0, previousExtra: 0,
            current7d: 40, currentFable: 60, currentExtra: 10
        )
        #expect(alerts == [
            ThresholdAlert(window: "7-day", pct: 40),
            ThresholdAlert(window: "Fable", pct: 60),
        ])
    }

    @Test func firstPollDoesNotFireWhenBelowThreshold() {
        let alerts = crossedThresholds(
            threshold7d: 80, thresholdFable: 80, thresholdExtra: 0,
            previous7d: 0, previousFable: 0, previousExtra: 0,
            current7d: 50, currentFable: 30, currentExtra: 10
        )
        #expect(alerts.isEmpty)
    }

    @Test func differentThresholdsPerWindow() {
        let alerts = crossedThresholds(
            threshold7d: 50, thresholdFable: 90, thresholdExtra: 70,
            previous7d: 45, previousFable: 85, previousExtra: 65,
            current7d: 55, currentFable: 95, currentExtra: 75
        )
        #expect(alerts == [
            ThresholdAlert(window: "7-day", pct: 55),
            ThresholdAlert(window: "Fable", pct: 95),
            ThresholdAlert(window: "Extra usage", pct: 75),
        ])
    }
}

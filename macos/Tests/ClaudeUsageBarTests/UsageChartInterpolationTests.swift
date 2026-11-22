import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct UsageChartInterpolationTests {
    @Test func interpolateValuesClampsNegativeOvershootAfterReset() {
        let base = Date(timeIntervalSince1970: 0)
        let points = [
            UsageDataPoint(timestamp: base, pct7d: 0.3, pctFable: 0.3),
            UsageDataPoint(timestamp: base.addingTimeInterval(1), pct7d: 0.7, pctFable: 0.7),
            UsageDataPoint(timestamp: base.addingTimeInterval(2), pct7d: 0.0, pctFable: 0.0),
            UsageDataPoint(timestamp: base.addingTimeInterval(3), pct7d: 1.0, pctFable: 1.0),
        ]

        #expect(
            UsageChartInterpolation.catmullRom(0.3, 0.7, 0.0, 1.0, t: 0.966) < 0
        )

        let interpolated = UsageChartInterpolation.interpolateValues(
            at: base.addingTimeInterval(1.966),
            in: points
        )

        #expect(interpolated?.pct7d == 0)
        #expect(interpolated?.pctFable == 0)
    }

    @Test func interpolateValuesClampsPositiveOvershootToHundredPercent() {
        let base = Date(timeIntervalSince1970: 0)
        let points = [
            UsageDataPoint(timestamp: base, pct7d: 0.0, pctFable: 0.0),
            UsageDataPoint(timestamp: base.addingTimeInterval(1), pct7d: 0.5, pctFable: 0.5),
            UsageDataPoint(timestamp: base.addingTimeInterval(2), pct7d: 1.0, pctFable: 1.0),
            UsageDataPoint(timestamp: base.addingTimeInterval(3), pct7d: 0.0, pctFable: 0.0),
        ]

        #expect(
            UsageChartInterpolation.catmullRom(0.0, 0.5, 1.0, 0.0, t: 0.911) > 1
        )

        let interpolated = UsageChartInterpolation.interpolateValues(
            at: base.addingTimeInterval(1.911),
            in: points
        )

        #expect(interpolated?.pct7d == 1)
        #expect(interpolated?.pctFable == 1)
    }
}

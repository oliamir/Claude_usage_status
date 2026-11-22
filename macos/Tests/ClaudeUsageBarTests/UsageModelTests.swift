import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct UsageModelTests {
    @Test func resetDateParsesTimestampWithoutTimezoneAsUTC() throws {
        let bucket = UsageBucket(
            utilization: 25.0,
            resetsAt: "2026-03-05T18:00:00"
        )

        #expect(bucket.resetsAtDate == date("2026-03-05T18:00:00Z"))
    }

    @Test func reconcileKeepsPreviousResetWhenServerTemporarilyDropsIt() throws {
        let previousReset = date("2026-03-05T18:00:00Z")
        let previous = usageResponse(
            sevenDay: UsageBucket(utilization: 88.0, resetsAt: iso(previousReset)),
            fable: UsageBucket(utilization: 40.0, resetsAt: iso(previousReset))
        )
        let current = usageResponse(
            sevenDay: UsageBucket(utilization: 89.0, resetsAt: nil),
            fable: UsageBucket(utilization: 45.0, resetsAt: nil)
        )

        let reconciled = current.reconciled(
            with: previous,
            now: date("2026-03-05T17:30:00Z")
        )

        #expect(reconciled.sevenDay?.resetsAtDate == previousReset)
        #expect(reconciled.fable?.resetsAtDate == previousReset)
    }

    @Test func reconcileAdvancesResetAfterRolloverWhenServerDropsIt() throws {
        let previousReset = date("2026-03-05T18:00:00Z")
        let previous = usageResponse(
            sevenDay: UsageBucket(utilization: 100.0, resetsAt: iso(previousReset)),
            fable: UsageBucket(utilization: 100.0, resetsAt: iso(previousReset))
        )
        let current = usageResponse(
            sevenDay: UsageBucket(utilization: 2.0, resetsAt: "not-a-date"),
            fable: UsageBucket(utilization: 5.0, resetsAt: "not-a-date")
        )

        let reconciled = current.reconciled(
            with: previous,
            now: date("2026-03-05T18:05:00Z")
        )

        #expect(reconciled.sevenDay?.resetsAtDate == date("2026-03-12T18:00:00Z"))
        #expect(reconciled.fable?.resetsAtDate == date("2026-03-12T18:00:00Z"))
    }

    @Test func reconcilePreservesValidServerReset() throws {
        let previous = usageResponse(
            sevenDay: UsageBucket(utilization: 100.0, resetsAt: "2026-03-05T18:00:00Z")
        )
        let current = usageResponse(
            sevenDay: UsageBucket(utilization: 2.0, resetsAt: "2026-03-12T22:00:00Z")
        )

        let reconciled = current.reconciled(
            with: previous,
            now: date("2026-03-05T18:05:00Z")
        )

        #expect(reconciled.sevenDay?.resetsAtDate == date("2026-03-12T22:00:00Z"))
    }

    @Test func decodesTopLevelFableAndLimitsScopedFable() throws {
        let topLevelJSON = """
        {
          "seven_day": { "utilization": 30.0, "resets_at": "2026-07-27T07:00:00Z" },
          "seven_day_fable": { "utilization": 65.0, "resets_at": "2026-07-27T07:00:00Z" }
        }
        """
        let topDecoded = try JSONDecoder().decode(UsageResponse.self, from: Data(topLevelJSON.utf8))
        #expect(topDecoded.sevenDay?.utilization == 30.0)
        #expect(topDecoded.fable?.utilization == 65.0)
        #expect(topDecoded.fable?.resetsAtDate == date("2026-07-27T07:00:00Z"))

        let limitsJSON = """
        {
          "limits": [
            {
              "kind": "weekly_all",
              "group": "weekly",
              "percent": 28,
              "resets_at": "2026-07-27T07:00:00Z",
              "scope": null,
              "is_active": false
            },
            {
              "kind": "weekly_scoped",
              "group": "weekly",
              "percent": 42,
              "resets_at": "2026-07-27T07:00:00Z",
              "scope": {
                "model": {
                  "id": null,
                  "display_name": "Fable"
                }
              },
              "is_active": false
            }
          ]
        }
        """
        let limitsDecoded = try JSONDecoder().decode(UsageResponse.self, from: Data(limitsJSON.utf8))
        #expect(limitsDecoded.sevenDay?.utilization == 28.0)
        #expect(limitsDecoded.fable?.utilization == 42.0)
        #expect(limitsDecoded.fable?.resetsAtDate == date("2026-07-27T07:00:00Z"))
        #expect(limitsDecoded.fable?.isActive == false)
    }

    @Test func activeModelBucketsIncludesSonnetAndDesignEvenWithoutOpus() throws {
        let json = """
        {
          "seven_day": { "utilization": 40.0, "resets_at": "2026-07-27T07:00:00Z" },
          "seven_day_opus": null,
          "seven_day_sonnet": { "utilization": 22.0, "resets_at": "2026-07-27T07:00:00Z" },
          "seven_day_omelette": { "utilization": 15.0, "resets_at": "2026-07-27T07:00:00Z" },
          "seven_day_cowork": { "utilization": 8.0, "resets_at": "2026-07-27T07:00:00Z" }
        }
        """
        let decoded = try JSONDecoder().decode(UsageResponse.self, from: Data(json.utf8))
        let active = decoded.activeModelBuckets
        #expect(active.map(\.label) == ["Sonnet", "Design", "Cowork"])
        #expect(active.map { $0.bucket.utilization } == [22.0, 15.0, 8.0])
    }

    @Test func elapsedFractionAndPaceDeltaReflectSevenDayProgress() {
        let resetDate = date("2026-03-12T18:00:00Z")
        let midpoint = date("2026-03-09T06:00:00Z") // 3.5 days remaining out of 7 days (50% elapsed)
        let bucket = UsageBucket(
            utilization: 65.0,
            resetsAt: iso(resetDate)
        )

        let elapsed = bucket.elapsedFraction(now: midpoint)
        let delta = bucket.paceDelta(now: midpoint)

        #expect(elapsed != nil)
        #expect(abs((elapsed ?? 0) - 0.5) < 0.0001)
        #expect(abs((delta ?? 0) - 0.15) < 0.0001)
    }

    @Test func formattedDollarSummaryAndActiveLimitDecodeAndMerge() throws {
        let json = """
        {
          "seven_day": {
            "utilization": 50.0,
            "resets_at": "2026-07-27T07:00:00Z",
            "used_dollars": 25.0,
            "limit_dollars": 50.0,
            "remaining_dollars": 25.0
          },
          "limits": [
            {
              "kind": "weekly_all",
              "group": "weekly",
              "percent": 50,
              "resets_at": "2026-07-27T07:00:00Z",
              "is_active": true
            }
          ]
        }
        """
        let decoded = try JSONDecoder().decode(UsageResponse.self, from: Data(json.utf8))
        #expect(decoded.sevenDay?.formattedDollarSummary == "$25.00 / $50.00")
        #expect(decoded.sevenDay?.isActive == true)
    }

    private func usageResponse(
        sevenDay: UsageBucket? = nil,
        fable: UsageBucket? = nil
    ) -> UsageResponse {
        UsageResponse(
            sevenDay: sevenDay,
            fable: fable,
            sevenDayOpus: nil,
            sevenDaySonnet: nil,
            extraUsage: nil
        )
    }

    private func date(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }

        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)!
    }

    private func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

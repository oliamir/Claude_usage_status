import Foundation
import Testing
import SwiftUI
@testable import ClaudeUsageBar

@Suite
struct StatusModelTests {

    // MARK: - Full Response Decoding

    @Test func decodesRealisticSummaryResponse() throws {
        let json = """
        {
          "page": {
            "id": "tymt9n04zgry",
            "name": "Claude",
            "url": "https://status.claude.com"
          },
          "status": {
            "indicator": "none",
            "description": "All Systems Operational"
          },
          "components": [
            {
              "id": "rwppv331jlwc",
              "name": "claude.ai",
              "status": "operational",
              "updated_at": "2026-03-18T07:29:09.766Z"
            },
            {
              "id": "k8w3r06qmzrp",
              "name": "Claude API (api.anthropic.com)",
              "status": "operational",
              "updated_at": "2026-03-18T07:29:09.802Z"
            },
            {
              "id": "yyzkbfz2thpt",
              "name": "Claude Code",
              "status": "operational",
              "updated_at": "2026-03-18T07:29:09.819Z"
            }
          ],
          "incidents": []
        }
        """

        let decoded = try JSONDecoder().decode(StatusSummaryResponse.self, from: Data(json.utf8))

        #expect(decoded.page.id == "tymt9n04zgry")
        #expect(decoded.page.name == "Claude")
        #expect(decoded.page.url == "https://status.claude.com")
        #expect(decoded.status.indicator == .none)
        #expect(decoded.status.description == "All Systems Operational")
        #expect(decoded.components.count == 3)
        #expect(decoded.components[0].name == "claude.ai")
        #expect(decoded.components[0].status == .operational)
        #expect(decoded.components[1].name == "Claude API (api.anthropic.com)")
        #expect(decoded.components[2].name == "Claude Code")
        #expect(decoded.incidents.isEmpty)
    }

    // MARK: - hasActiveIncidents

    @Test func hasActiveIncidentsIsFalseWhenEmpty() throws {
        let response = try decode("""
        {
          "page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"},
          "status": {"indicator": "none", "description": "All Systems Operational"},
          "components": [],
          "incidents": []
        }
        """)

        #expect(!response.hasActiveIncidents)
    }

    @Test func hasActiveIncidentsIsTrueWithIncidents() throws {
        let response = try decode("""
        {
          "page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"},
          "status": {"indicator": "major", "description": "Major System Outage"},
          "components": [],
          "incidents": [
            {
              "id": "inc1",
              "name": "API Degradation",
              "status": "investigating",
              "impact": "major",
              "shortlink": "https://stspg.io/abc",
              "created_at": "2026-03-18T10:00:00Z",
              "updated_at": "2026-03-18T10:30:00Z",
              "incident_updates": [
                {
                  "id": "upd1",
                  "status": "investigating",
                  "body": "We are investigating elevated error rates.",
                  "created_at": "2026-03-18T10:30:00Z",
                  "updated_at": "2026-03-18T10:30:00Z"
                }
              ]
            }
          ]
        }
        """)

        #expect(response.hasActiveIncidents)
    }

    // MARK: - ComponentStatus Enum

    @Test func componentStatusOperational() {
        #expect(ComponentStatus.operational.rawValue == "operational")
        #expect(ComponentStatus.operational.color == .green)
        #expect(ComponentStatus.operational.label == "Operational")
        #expect(ComponentStatus.operational.sfSymbol == "checkmark.circle.fill")
    }

    @Test func componentStatusDegradedPerformance() {
        #expect(ComponentStatus.degradedPerformance.rawValue == "degraded_performance")
        #expect(ComponentStatus.degradedPerformance.color == .yellow)
        #expect(ComponentStatus.degradedPerformance.label == "Degraded Performance")
        #expect(ComponentStatus.degradedPerformance.sfSymbol == "exclamationmark.triangle.fill")
    }

    @Test func componentStatusPartialOutage() {
        #expect(ComponentStatus.partialOutage.rawValue == "partial_outage")
        #expect(ComponentStatus.partialOutage.color == .orange)
        #expect(ComponentStatus.partialOutage.label == "Partial Outage")
        #expect(ComponentStatus.partialOutage.sfSymbol == "exclamationmark.circle.fill")
    }

    @Test func componentStatusMajorOutage() {
        #expect(ComponentStatus.majorOutage.rawValue == "major_outage")
        #expect(ComponentStatus.majorOutage.color == .red)
        #expect(ComponentStatus.majorOutage.label == "Major Outage")
        #expect(ComponentStatus.majorOutage.sfSymbol == "xmark.circle.fill")
    }

    @Test func componentStatusUnderMaintenance() {
        #expect(ComponentStatus.underMaintenance.rawValue == "under_maintenance")
        #expect(ComponentStatus.underMaintenance.color == .blue)
        #expect(ComponentStatus.underMaintenance.label == "Under Maintenance")
        #expect(ComponentStatus.underMaintenance.sfSymbol == "wrench.fill")
    }

    @Test func allComponentStatusCasesDecodeFromJSON() throws {
        let cases: [(String, ComponentStatus)] = [
            ("operational", .operational),
            ("degraded_performance", .degradedPerformance),
            ("partial_outage", .partialOutage),
            ("major_outage", .majorOutage),
            ("under_maintenance", .underMaintenance),
        ]

        for (raw, expected) in cases {
            let json = Data(#""\#(raw)""#.utf8)
            let decoded = try JSONDecoder().decode(ComponentStatus.self, from: json)
            #expect(decoded == expected, "Failed to decode \(raw)")
        }
    }

    // MARK: - StatusIndicator Enum

    @Test func statusIndicatorNone() {
        #expect(StatusIndicator.none.rawValue == "none")
        #expect(StatusIndicator.none.color == .green)
        #expect(StatusIndicator.none.label == "All Systems Operational")
        #expect(StatusIndicator.none.sfSymbol == "checkmark.circle.fill")
    }

    @Test func statusIndicatorMinor() {
        #expect(StatusIndicator.minor.rawValue == "minor")
        #expect(StatusIndicator.minor.color == .yellow)
        #expect(StatusIndicator.minor.label == "Minor Issues")
        #expect(StatusIndicator.minor.sfSymbol == "exclamationmark.triangle.fill")
    }

    @Test func statusIndicatorMajor() {
        #expect(StatusIndicator.major.rawValue == "major")
        #expect(StatusIndicator.major.color == .orange)
        #expect(StatusIndicator.major.label == "Major Issues")
        #expect(StatusIndicator.major.sfSymbol == "exclamationmark.circle.fill")
    }

    @Test func statusIndicatorCritical() {
        #expect(StatusIndicator.critical.rawValue == "critical")
        #expect(StatusIndicator.critical.color == .red)
        #expect(StatusIndicator.critical.label == "Critical Issues")
        #expect(StatusIndicator.critical.sfSymbol == "xmark.circle.fill")
    }

    @Test func statusIndicatorMaintenance() {
        #expect(StatusIndicator.maintenance.rawValue == "maintenance")
        #expect(StatusIndicator.maintenance.color == .blue)
        #expect(StatusIndicator.maintenance.label == "Maintenance")
        #expect(StatusIndicator.maintenance.sfSymbol == "wrench.fill")
    }

    @Test func allStatusIndicatorCasesDecodeFromJSON() throws {
        let cases: [(String, StatusIndicator)] = [
            ("none", .none),
            ("minor", .minor),
            ("major", .major),
            ("critical", .critical),
            ("maintenance", .maintenance),
        ]

        for (raw, expected) in cases {
            let json = Data(#""\#(raw)""#.utf8)
            let decoded = try JSONDecoder().decode(StatusIndicator.self, from: json)
            #expect(decoded == expected, "Failed to decode \(raw)")
        }
    }

    // MARK: - Incident with Updates

    @Test func incidentDecodesWithMultipleUpdates() throws {
        let response = try decode("""
        {
          "page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"},
          "status": {"indicator": "critical", "description": "Critical System Outage"},
          "components": [],
          "incidents": [
            {
              "id": "inc42",
              "name": "Complete API Outage",
              "status": "identified",
              "impact": "critical",
              "shortlink": "https://stspg.io/xyz",
              "created_at": "2026-03-18T08:00:00Z",
              "updated_at": "2026-03-18T09:15:00Z",
              "incident_updates": [
                {
                  "id": "upd2",
                  "status": "identified",
                  "body": "The issue has been identified and a fix is being deployed.",
                  "created_at": "2026-03-18T09:15:00Z",
                  "updated_at": "2026-03-18T09:15:00Z"
                },
                {
                  "id": "upd1",
                  "status": "investigating",
                  "body": "We are investigating reports of API errors.",
                  "created_at": "2026-03-18T08:00:00Z",
                  "updated_at": "2026-03-18T08:00:00Z"
                }
              ]
            }
          ]
        }
        """)

        #expect(response.incidents.count == 1)

        let incident = response.incidents[0]
        #expect(incident.id == "inc42")
        #expect(incident.name == "Complete API Outage")
        #expect(incident.status == "identified")
        #expect(incident.impact == .critical)
        #expect(incident.shortlink == "https://stspg.io/xyz")
        #expect(incident.incidentUpdates.count == 2)

        let latest = try #require(incident.latestUpdate)
        #expect(latest.id == "upd2")
        #expect(latest.body == "The issue has been identified and a fix is being deployed.")
    }

    // MARK: - Edge Cases

    @Test func emptyComponentsArray() throws {
        let response = try decode("""
        {
          "page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"},
          "status": {"indicator": "none", "description": "All Systems Operational"},
          "components": [],
          "incidents": []
        }
        """)

        #expect(response.components.isEmpty)
        #expect(!response.hasActiveIncidents)
    }

    @Test func componentWithNilOptionalFields() throws {
        let json = """
        {
          "id": "c1",
          "name": "Test Component",
          "status": "operational"
        }
        """

        let component = try JSONDecoder().decode(StatusComponent.self, from: Data(json.utf8))
        #expect(component.description == nil)
        #expect(component.updatedAt == nil)
    }

    @Test func incidentWithNilOptionalFields() throws {
        let json = """
        {
          "id": "inc1",
          "name": "Test Incident",
          "status": "investigating",
          "impact": "minor",
          "incident_updates": []
        }
        """

        let incident = try JSONDecoder().decode(StatusIncident.self, from: Data(json.utf8))
        #expect(incident.shortlink == nil)
        #expect(incident.createdAt == nil)
        #expect(incident.updatedAt == nil)
        #expect(incident.latestUpdate == nil)
    }

    @Test func incidentUpdateWithNilOptionalFields() throws {
        let json = """
        {
          "id": "upd1",
          "status": "investigating",
          "body": "Looking into it."
        }
        """

        let update = try JSONDecoder().decode(IncidentUpdate.self, from: Data(json.utf8))
        #expect(update.createdAt == nil)
        #expect(update.updatedAt == nil)
    }

    @Test func mixedComponentStatuses() throws {
        let response = try decode("""
        {
          "page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"},
          "status": {"indicator": "major", "description": "Partial System Outage"},
          "components": [
            {"id": "c1", "name": "claude.ai", "status": "operational"},
            {"id": "c2", "name": "API", "status": "major_outage"},
            {"id": "c3", "name": "Code", "status": "degraded_performance"}
          ],
          "incidents": []
        }
        """)

        #expect(response.components[0].status == .operational)
        #expect(response.components[1].status == .majorOutage)
        #expect(response.components[2].status == .degradedPerformance)
    }

    // MARK: - Helpers

    private func decode(_ json: String) throws -> StatusSummaryResponse {
        try JSONDecoder().decode(StatusSummaryResponse.self, from: Data(json.utf8))
    }
}

import Foundation
import SwiftUI

// MARK: - Response

struct StatusSummaryResponse: Codable {
    let page: StatusPage
    let status: StatusOverall
    let components: [StatusComponent]
    let incidents: [StatusIncident]

    var hasActiveIncidents: Bool {
        !incidents.isEmpty
    }
}

// MARK: - Page

struct StatusPage: Codable {
    let id: String
    let name: String
    let url: String
}

// MARK: - Overall Status

struct StatusOverall: Codable {
    let indicator: StatusIndicator
    let description: String
}

// MARK: - Component

struct StatusComponent: Codable, Identifiable {
    let id: String
    let name: String
    let status: ComponentStatus
    let description: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case status
        case description
        case updatedAt = "updated_at"
    }
}

// MARK: - Incident

struct StatusIncident: Codable, Identifiable {
    let id: String
    let name: String
    let status: String
    let impact: StatusIndicator
    let shortlink: String?
    let createdAt: String?
    let updatedAt: String?
    let incidentUpdates: [IncidentUpdate]

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case status
        case impact
        case shortlink
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case incidentUpdates = "incident_updates"
    }

    var latestUpdate: IncidentUpdate? {
        incidentUpdates.first
    }
}

// MARK: - Incident Update

struct IncidentUpdate: Codable, Identifiable {
    let id: String
    let status: String
    let body: String
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case body
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Component Status Enum

enum ComponentStatus: String, Codable {
    case operational
    case degradedPerformance = "degraded_performance"
    case partialOutage = "partial_outage"
    case majorOutage = "major_outage"
    case underMaintenance = "under_maintenance"

    var color: Color {
        switch self {
        case .operational:
            return .green
        case .degradedPerformance:
            return .yellow
        case .partialOutage:
            return .orange
        case .majorOutage:
            return .red
        case .underMaintenance:
            return .blue
        }
    }

    var label: String {
        switch self {
        case .operational:
            return "Operational"
        case .degradedPerformance:
            return "Degraded Performance"
        case .partialOutage:
            return "Partial Outage"
        case .majorOutage:
            return "Major Outage"
        case .underMaintenance:
            return "Under Maintenance"
        }
    }

    var sfSymbol: String {
        switch self {
        case .operational:
            return "checkmark.circle.fill"
        case .degradedPerformance:
            return "exclamationmark.triangle.fill"
        case .partialOutage:
            return "exclamationmark.circle.fill"
        case .majorOutage:
            return "xmark.circle.fill"
        case .underMaintenance:
            return "wrench.fill"
        }
    }
}

// MARK: - Status Indicator Enum

enum StatusIndicator: String, Codable {
    case none
    case minor
    case major
    case critical
    case maintenance

    var color: Color {
        switch self {
        case .none:
            return .green
        case .minor:
            return .yellow
        case .major:
            return .orange
        case .critical:
            return .red
        case .maintenance:
            return .blue
        }
    }

    var label: String {
        switch self {
        case .none:
            return "All Systems Operational"
        case .minor:
            return "Minor Issues"
        case .major:
            return "Major Issues"
        case .critical:
            return "Critical Issues"
        case .maintenance:
            return "Maintenance"
        }
    }

    var sfSymbol: String {
        switch self {
        case .none:
            return "checkmark.circle.fill"
        case .minor:
            return "exclamationmark.triangle.fill"
        case .major:
            return "exclamationmark.circle.fill"
        case .critical:
            return "xmark.circle.fill"
        case .maintenance:
            return "wrench.fill"
        }
    }
}

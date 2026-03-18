import SwiftUI

struct StatusSectionView: View {
    @ObservedObject var statusService: StatusService

    var body: some View {
        if let summary = statusService.statusSummary {
            VStack(alignment: .leading, spacing: 6) {
                // Header
                HStack(spacing: 6) {
                    Image(systemName: summary.status.indicator.sfSymbol)
                        .foregroundStyle(summary.status.indicator.color)
                        .font(.subheadline)
                    Text(summary.status.indicator.label)
                        .font(.subheadline)
                    Spacer()
                    statusPageLink
                }

                // Component rows
                ForEach(summary.components) { component in
                    StatusComponentRow(component: component)
                }

                // Incident banners
                ForEach(summary.incidents) { incident in
                    StatusIncidentBanner(incident: incident)
                }
            }
        } else if let error = statusService.lastError {
            HStack(spacing: 6) {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                statusPageLink
            }
        }
    }

    private var statusPageLink: some View {
        Button {
            if let url = URL(string: "https://status.claude.com") {
                NSWorkspace.shared.open(url)
            }
        } label: {
            Image(systemName: "arrow.up.right.square")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
    }
}

// MARK: - Component Row

private struct StatusComponentRow: View {
    let component: StatusComponent

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(component.status.color)
                .frame(width: 6, height: 6)
            Text(component.name)
                .font(.caption)
            Spacer()
            Text(component.status.label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Incident Banner

private struct StatusIncidentBanner: View {
    let incident: StatusIncident

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(incident.name)
                .font(.caption)
                .fontWeight(.medium)

            if let update = incident.latestUpdate {
                Text(update.body)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            if let shortlink = incident.shortlink, let url = URL(string: shortlink) {
                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    Text("More info")
                        .font(.caption2)
                        .foregroundStyle(incident.impact.color)
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(incident.impact.color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

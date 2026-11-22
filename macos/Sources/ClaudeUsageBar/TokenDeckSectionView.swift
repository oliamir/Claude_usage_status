import AppKit
import SwiftUI

struct TokenDeckSectionView: View {
    @ObservedObject var tokenDeck: TokenDeckService

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 7, height: 7)
                Text("Token Deck")
                    .font(.subheadline.weight(.medium))
                Text(statusBadgeText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                Button {
                    tokenDeck.showSimulatorInPopover.toggle()
                } label: {
                    Image(systemName: tokenDeck.showSimulatorInPopover ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                }
                .buttonStyle(.borderless)
                .help(tokenDeck.showSimulatorInPopover ? "Hide deck keys" : "Show deck keys")

                Button {
                    tokenDeck.openConsoleWindow()
                } label: {
                    Label("Configure…", systemImage: "slider.horizontal.3")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
            }

            if tokenDeck.isEnabled && tokenDeck.showSimulatorInPopover {
                Picker("Page", selection: Binding(
                    get: { tokenDeck.activePage },
                    set: { tokenDeck.selectPage($0) }
                )) {
                    ForEach(tokenDeck.pageOptions, id: \.id) { opt in
                        Text(opt.name).tag(opt.id)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .controlSize(.small)

                HStack(spacing: 10) {
                    // 3x2 LCD Key Grid
                    VStack(spacing: 5) {
                        ForEach(0..<2, id: \.self) { row in
                            HStack(spacing: 5) {
                                ForEach(0..<3, id: \.self) { col in
                                    let index = row * 3 + col
                                    DeckTileButton(
                                        image: tokenDeck.tileImages[index],
                                        keyNumber: index + 1
                                    ) {
                                        tokenDeck.pressKey(index + 1)
                                    }
                                }
                            }
                        }
                    }

                    // 3 Rotary Knob controls (Main, Left, Right)
                    VStack(spacing: 6) {
                        KnobControlRow(title: "Vol") { action in
                            tokenDeck.turnKnob(which: "main", action: action)
                        }
                        KnobControlRow(title: "Left") { action in
                            tokenDeck.turnKnob(which: "left", action: action)
                        }
                        KnobControlRow(title: "Right") { action in
                            tokenDeck.turnKnob(which: "right", action: action)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(8)
                .background(Color(nsColor: .windowBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var normalizedMode: String {
        switch tokenDeck.mode {
        case "sessions": return "sessions"
        case "models": return "models"
        default: return "agents"
        }
    }

    private var statusColor: Color {
        guard tokenDeck.isEnabled else { return .gray }
        switch tokenDeck.devicePhase {
        case "ready": return .green
        case "burning", "opening", "handshaking": return .orange
        case "vendor", "unresponsive": return .red
        default: return tokenDeck.isRunning ? .blue : .gray
        }
    }

    private var statusBadgeText: String {
        guard tokenDeck.isEnabled else { return "Off" }
        if tokenDeck.devicePhase == "ready" {
            if tokenDeck.deviceFirmware.contains("AKP03E") {
                return "AKP03E Connected"
            }
            if tokenDeck.deviceFirmware.contains("AKP03") {
                return "AKP03 Connected"
            }
            return "Deck Connected"
        }
        if tokenDeck.devicePhase == "vendor" {
            return "Close StreamDock app"
        }
        return tokenDeck.isRunning ? "Simulator / USB Ready" : "Starting…"
    }
}

private struct DeckTileButton: View {
    let image: NSImage?
    let keyNumber: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 5)
                    .fill(Color(red: 0.075, green: 0.082, blue: 0.071))
                if let image {
                    Image(nsImage: image)
                        .interpolation(.none)
                        .resizable()
                        .aspectRatio(1, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                } else {
                    Text("\(keyNumber)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 48, height: 48)
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(Color.primary.opacity(0.18), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help("Press Deck Key \(keyNumber)")
    }
}

private struct KnobControlRow: View {
    let title: String
    let onAction: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(width: 32, alignment: .leading)
            Button {
                onAction("ccw")
            } label: {
                Image(systemName: "rotate.left")
                    .font(.caption2)
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .help("Turn \(title) knob counter-clockwise")

            Button {
                onAction("click")
            } label: {
                Image(systemName: "circle.fill")
                    .font(.system(size: 6))
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .help("Press \(title) knob")

            Button {
                onAction("cw")
            } label: {
                Image(systemName: "rotate.right")
                    .font(.caption2)
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .help("Turn \(title) knob clockwise")
        }
    }
}

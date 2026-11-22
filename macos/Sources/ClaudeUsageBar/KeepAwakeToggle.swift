import SwiftUI

/// "Keep Mac Awake" (bag mode) control, shared by the popover and the Settings
/// window. Takes the app-level SleepService (unlike LaunchAtLoginToggle's private
/// model) because the service owns the quit fail-safe and the menu bar icon state.
struct KeepAwakeToggle: View {
    @ObservedObject private var sleepService: SleepService
    private let controlSize: ControlSize
    private let useSwitchStyle: Bool
    private let showsIcon: Bool

    @ViewState private var pendingValue: Bool? = nil

    init(
        sleepService: SleepService,
        controlSize: ControlSize = .regular,
        useSwitchStyle: Bool = false,
        showsIcon: Bool = false
    ) {
        _sleepService = ObservedObject(wrappedValue: sleepService)
        self.controlSize = controlSize
        self.useSwitchStyle = useSwitchStyle
        self.showsIcon = showsIcon
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch sleepService.setupStatus {
            case .installed:
                toggle
            case .notInstalled, .unknown:
                setupRow
            case .installing:
                installingRow
            }

            if let error = sleepService.lastError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .task {
            // The popover body is rebuilt on every open — self-heals if pmset
            // was changed externally (e.g. the toggle-sleep shell function).
            await sleepService.refreshSetupStatus()
            await sleepService.refreshState()
        }
    }

    @ViewBuilder
    private var toggle: some View {
        let baseToggle = Toggle(isOn: switchBinding) {
            HStack(spacing: 6) {
                if showsIcon { leadingIcon }
                Text("Keep Mac Awake")
            }
        }
        .disabled(pendingValue != nil)
        .controlSize(controlSize)
        .help("Prevents your Mac from sleeping, even with the lid closed. Sleep is re-enabled when the app quits.")
        .accessibilityHint("Prevents the Mac from sleeping while enabled.")

        if useSwitchStyle {
            baseToggle.toggleStyle(.switch)
        } else {
            baseToggle
        }
    }

    private var switchBinding: Binding<Bool> {
        Binding(
            get: { pendingValue ?? sleepService.isSleepDisabled },
            set: { newValue in
                pendingValue = newValue
                Task {
                    await sleepService.setSleepDisabled(newValue)
                    pendingValue = nil   // service state is authoritative; knob reverts on failure
                }
            }
        )
    }

    @ViewBuilder
    private var leadingIcon: some View {
        if pendingValue != nil {
            ProgressView()
                .controlSize(.mini)
                .frame(width: 16)
        } else {
            Image(systemName: sleepService.isSleepDisabled ? "cup.and.saucer.fill" : "cup.and.saucer")
                .foregroundStyle(sleepService.isSleepDisabled ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                .frame(width: 16)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var setupRow: some View {
        HStack(spacing: 6) {
            if showsIcon {
                Image(systemName: "cup.and.saucer")
                    .foregroundStyle(.secondary)
                    .frame(width: 16)
                    .accessibilityHidden(true)
            }
            Text("Keep Mac Awake")
                .foregroundStyle(.secondary)
            Spacer()
            Button("Set Up…") {
                Task { await sleepService.installSetup() }
            }
            .buttonStyle(.borderless)
            .controlSize(controlSize)
        }
        .help("Controlling sleep requires a one-time administrator authorization.")

        Text("Requires one-time admin authorization.")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var installingRow: some View {
        HStack(spacing: 6) {
            if showsIcon {
                Image(systemName: "cup.and.saucer")
                    .foregroundStyle(.secondary)
                    .frame(width: 16)
                    .accessibilityHidden(true)
            }
            Text("Keep Mac Awake")
                .foregroundStyle(.secondary)
            Spacer()
            ProgressView()
                .controlSize(.small)
        }
    }
}

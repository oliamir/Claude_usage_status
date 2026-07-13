import Foundation
import AppKit

enum SleepSetupStatus: Equatable {
    case unknown        // not yet probed
    case notInstalled   // sudoers rule missing — show "Set Up…" UI
    case installing
    case installed      // show the toggle
}

// MARK: - Pure logic (free functions, directly testable)

/// Parses `pmset -g` output. Returns nil if the SleepDisabled line is absent
/// (e.g. desktop Macs or future macOS output changes).
func parseSleepDisabled(pmsetOutput: String) -> Bool? {
    for line in pmsetOutput.split(separator: "\n") {
        let tokens = line.split(whereSeparator: { $0 == " " || $0 == "\t" })
        if tokens.first == "SleepDisabled", tokens.count >= 2 {
            return tokens[1] == "1"
        }
    }
    return nil
}

/// The exact sudoers rule granting passwordless access to ONLY the two pmset
/// command lines the toggle needs — sudoers matches arguments exactly.
func sudoersLine(for username: String) -> String {
    "\(username) ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1"
}

/// Shell script run as root (via osascript admin prompt) to install the sudoers
/// rule. Validates with visudo on a temp file BEFORE moving it into place — a
/// malformed file in /etc/sudoers.d would break all sudo on the machine.
func makeInstallScript(username: String) -> String {
    """
    set -e
    tmp="$(/usr/bin/mktemp /private/tmp/claude-usage-bar-sudoers.XXXXXX)"
    /usr/bin/printf '%s\\n' '\(sudoersLine(for: username))' > "$tmp"
    /bin/chmod 0440 "$tmp"
    /usr/sbin/chown root:wheel "$tmp"
    /usr/sbin/visudo -c -q -f "$tmp" || { /bin/rm -f "$tmp"; echo 'sudoers validation failed' >&2; exit 1; }
    /bin/mv -f "$tmp" '\(SleepService.sudoersFilePath)'
    """
}

// NOTE: this feature requires the app to be un-sandboxed (Process spawning).
@MainActor
final class SleepService: ObservableObject {
    @Published private(set) var isSleepDisabled = false
    @Published private(set) var setupStatus: SleepSetupStatus = .unknown
    @Published private(set) var isBusy = false
    @Published private(set) var lastError: String?

    private let runner: CommandRunning
    private let defaults: UserDefaults
    private var terminationObserver: Any?

    static let intentKey = "sleepDisabledByApp"   // true == THIS app turned sleep off
    static let sudoersFilePath = "/etc/sudoers.d/claude-usage-bar-sleep"   // no dots in filename or sudo ignores it
    private static let sudoPath = "/usr/bin/sudo"
    private static let pmsetPath = "/usr/bin/pmset"
    private static let osascriptPath = "/usr/bin/osascript"

    init(runner: CommandRunning = ProcessCommandRunner(), defaults: UserDefaults = .standard) {
        self.runner = runner
        self.defaults = defaults
        terminationObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            MainActor.assumeIsolated {
                self.reenableSleepOnQuit()
            }
        }
    }

    deinit {
        if let observer = terminationObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Lifecycle

    /// Called once from the app's .task alongside startPolling().
    func start() async {
        await refreshSetupStatus()
        await refreshState()
        reconcileAfterLaunch()
    }

    // MARK: - State read (no sudo needed)

    func refreshState() async {
        do {
            let result = try await runner.run(Self.pmsetPath, arguments: ["-g"])
            guard result.succeeded else {
                lastError = "pmset -g failed (\(result.exitCode))"
                return
            }
            isSleepDisabled = parseSleepDisabled(pmsetOutput: result.stdout) ?? false
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Setup probe

    /// `sudo -n -l <cmd>` exits 0 iff the exact command is runnable without a
    /// password. Read-only: changes nothing, never prompts (-n = never ask).
    func refreshSetupStatus() async {
        do {
            let result = try await runner.run(
                Self.sudoPath,
                arguments: ["-n", "-l", Self.pmsetPath, "-a", "disablesleep", "1"]
            )
            setupStatus = result.succeeded ? .installed : .notInstalled
        } catch {
            setupStatus = .notInstalled
        }
    }

    // MARK: - Toggle

    func setSleepDisabled(_ disabled: Bool) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        lastError = nil

        do {
            let result = try await runner.run(
                Self.sudoPath,
                arguments: ["-n", Self.pmsetPath, "-a", "disablesleep", disabled ? "1" : "0"]
            )
            guard result.succeeded else {
                if result.stderr.contains("password is required") {
                    // Rule was removed out from under us — flip UI back to setup mode.
                    setupStatus = .notInstalled
                } else {
                    lastError = "pmset failed: \(result.stderr.trimmingCharacters(in: .whitespacesAndNewlines))"
                }
                return
            }
            // Record intent BEFORE read-back so a crash between the two is covered.
            defaults.set(disabled, forKey: Self.intentKey)
            await refreshState()   // read-back verification — pmset is the source of truth
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - One-time setup

    func installSetup() async {
        guard setupStatus != .installing else { return }
        setupStatus = .installing
        lastError = nil
        let shellScript = makeInstallScript(username: NSUserName())
        let escaped = shellScript
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let appleScript = "do shell script \"\(escaped)\" with administrator privileges"
        do {
            let result = try await runner.run(Self.osascriptPath, arguments: ["-e", appleScript])
            if result.succeeded {
                await refreshSetupStatus()
                if setupStatus != .installed {
                    lastError = "Setup ran but the rule is not active. Check /etc/sudoers includedir."
                }
            } else if result.stderr.contains("-128") || result.stderr.contains("User canceled") {
                setupStatus = .notInstalled          // user cancelled — no error banner
            } else {
                setupStatus = .notInstalled
                lastError = "Setup failed: \(result.stderr.trimmingCharacters(in: .whitespacesAndNewlines))"
            }
        } catch {
            setupStatus = .notInstalled
            lastError = error.localizedDescription
        }
    }

    // MARK: - Fail-safe on quit

    private func reenableSleepOnQuit() {
        guard defaults.bool(forKey: Self.intentKey) else { return }   // only if WE disabled it
        // willTerminate: Tasks will never run again; synchronous spawn + wait is
        // the only option. pmset completes in tens of ms.
        if let result = try? runner.runSync(
            Self.sudoPath,
            arguments: ["-n", Self.pmsetPath, "-a", "disablesleep", "0"]
        ), result.succeeded {
            defaults.set(false, forKey: Self.intentKey)
        }
    }

    // MARK: - Launch reconciliation (covers crash / SIGKILL / force-quit gaps)

    private func reconcileAfterLaunch() {
        let intended = defaults.bool(forKey: Self.intentKey)
        switch (isSleepDisabled, intended) {
        case (true, true):
            // We disabled it and never cleanly re-enabled (crash — disablesleep
            // persists across reboots). Adopt: toggle shows ON, fail-safe re-armed.
            break
        case (true, false):
            // Externally set (e.g. the user's zsh toggle-sleep). Show ON, but the
            // intent flag stays false: quitting must NOT revert an external decision.
            break
        case (false, true):
            // Stale flag — someone re-enabled sleep externally. Clear it.
            defaults.set(false, forKey: Self.intentKey)
        case (false, false):
            break
        }
    }
}

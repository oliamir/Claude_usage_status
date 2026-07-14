import Foundation
import Testing
import AppKit
@testable import ClaudeUsageBar

// MARK: - Mock

private final class MockCommandRunner: CommandRunning, @unchecked Sendable {
    var scriptedResults: [CommandResult] = []   // FIFO
    private(set) var invocations: [(path: String, args: [String], sync: Bool)] = []

    func run(_ executablePath: String, arguments: [String]) async throws -> CommandResult {
        invocations.append((executablePath, arguments, false))
        guard !scriptedResults.isEmpty else {
            throw NSError(domain: "MockCommandRunner", code: 1, userInfo: [NSLocalizedDescriptionKey: "no scripted result"])
        }
        return scriptedResults.removeFirst()
    }

    func runSync(_ executablePath: String, arguments: [String]) throws -> CommandResult {
        invocations.append((executablePath, arguments, true))
        guard !scriptedResults.isEmpty else {
            throw NSError(domain: "MockCommandRunner", code: 1, userInfo: [NSLocalizedDescriptionKey: "no scripted result"])
        }
        return scriptedResults.removeFirst()
    }
}

private final class MockAssertionManager: PowerAssertionManaging, @unchecked Sendable {
    private(set) var createdNames: [String] = []
    private(set) var releasedIDs: [UInt32] = []
    var nextID: UInt32 = 42

    func createAssertion(named name: String) -> UInt32? {
        createdNames.append(name)
        return nextID
    }

    func releaseAssertion(_ id: UInt32) {
        releasedIDs.append(id)
    }
}

private func ok(stdout: String = "") -> CommandResult {
    CommandResult(exitCode: 0, stdout: stdout, stderr: "")
}

private func fail(exitCode: Int32 = 1, stderr: String = "") -> CommandResult {
    CommandResult(exitCode: exitCode, stdout: "", stderr: stderr)
}

/// Real `pmset -g` output shape (tab-separated value column).
private let pmsetOutputDisabled = """
System-wide power settings:
 SleepDisabled\t\t1
Currently in use:
 standby\t\t1
"""

private let pmsetOutputEnabled = """
System-wide power settings:
 SleepDisabled\t\t0
Currently in use:
 standby\t\t1
"""

@MainActor
private func makeService(
    runner: MockCommandRunner,
    intentFlag: Bool? = nil,
    assertions: MockAssertionManager = MockAssertionManager()
) -> (SleepService, UserDefaults) {
    let defaults = UserDefaults(suiteName: "SleepServiceTests-\(UUID().uuidString)")!
    if let intentFlag {
        defaults.set(intentFlag, forKey: SleepService.intentKey)
    }
    return (SleepService(runner: runner, defaults: defaults, assertions: assertions), defaults)
}

// MARK: - Pure functions

@Suite struct SleepParsingTests {
    @Test func parsesTabSeparatedDisabled() {
        #expect(parseSleepDisabled(pmsetOutput: pmsetOutputDisabled) == true)
    }

    @Test func parsesTabSeparatedEnabled() {
        #expect(parseSleepDisabled(pmsetOutput: pmsetOutputEnabled) == false)
    }

    @Test func parsesSpaceSeparated() {
        #expect(parseSleepDisabled(pmsetOutput: " SleepDisabled 1") == true)
    }

    @Test func absentKeyReturnsNil() {
        #expect(parseSleepDisabled(pmsetOutput: "System-wide power settings:\n standby 1") == nil)
    }

    @Test func emptyOutputReturnsNil() {
        #expect(parseSleepDisabled(pmsetOutput: "") == nil)
    }

    @Test func ignoresPartialTokenMatches() {
        // "SleepDisabledFoo" must not match the exact token "SleepDisabled"
        #expect(parseSleepDisabled(pmsetOutput: " SleepDisabledFoo 1") == nil)
    }

    @Test func sudoersLineExactFormat() {
        #expect(
            sudoersLine(for: "alice")
                == "alice ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1"
        )
    }

    @Test func installScriptValidatesBeforeMoving() {
        let script = makeInstallScript(username: "alice")
        // visudo validation must appear before the mv into sudoers.d
        let visudoRange = script.range(of: "visudo -c")
        let mvRange = script.range(of: "/bin/mv")
        #expect(visudoRange != nil && mvRange != nil)
        #expect(visudoRange!.lowerBound < mvRange!.lowerBound)
        #expect(script.contains(SleepService.sudoersFilePath))
    }
}

// MARK: - Service

@Suite(.serialized) @MainActor struct SleepServiceTests {
    @Test func refreshStateReadsDisabled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(stdout: pmsetOutputDisabled)]
        let (service, _) = makeService(runner: runner)

        await service.refreshState()

        #expect(service.isSleepDisabled == true)
        #expect(runner.invocations.count == 1)
        #expect(runner.invocations[0].path == "/usr/bin/pmset")
        #expect(runner.invocations[0].args == ["-g"])
    }

    @Test func refreshStateAbsentKeyMeansEnabled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(stdout: "no such key here")]
        let (service, _) = makeService(runner: runner)

        await service.refreshState()

        #expect(service.isSleepDisabled == false)
    }

    @Test func setupProbeInstalled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok()]
        let (service, _) = makeService(runner: runner)

        await service.refreshSetupStatus()

        #expect(service.setupStatus == .installed)
        #expect(runner.invocations[0].path == "/usr/bin/sudo")
        #expect(runner.invocations[0].args == ["-n", "-l", "/usr/bin/pmset", "-a", "disablesleep", "1"])
    }

    @Test func setupProbeNotInstalled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [fail()]
        let (service, _) = makeService(runner: runner)

        await service.refreshSetupStatus()

        #expect(service.setupStatus == .notInstalled)
    }

    @Test func setSleepDisabledRunsExactCommandAndReadsBack() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputDisabled)]
        let (service, defaults) = makeService(runner: runner)

        await service.setSleepDisabled(true)

        #expect(runner.invocations.count == 2)
        #expect(runner.invocations[0].path == "/usr/bin/sudo")
        #expect(runner.invocations[0].args == ["-n", "/usr/bin/pmset", "-a", "disablesleep", "1"])
        #expect(runner.invocations[1].args == ["-g"])   // read-back
        #expect(defaults.bool(forKey: SleepService.intentKey) == true)
        #expect(service.isSleepDisabled == true)
        #expect(service.lastError == nil)
    }

    @Test func setSleepEnabledClearsIntentFlag() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputEnabled)]
        let (service, defaults) = makeService(runner: runner, intentFlag: true)

        await service.setSleepDisabled(false)

        #expect(runner.invocations[0].args == ["-n", "/usr/bin/pmset", "-a", "disablesleep", "0"])
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    @Test func removedSudoersRuleFlipsBackToSetupMode() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [fail(stderr: "sudo: a password is required")]
        let (service, defaults) = makeService(runner: runner)

        await service.setSleepDisabled(true)

        #expect(service.setupStatus == .notInstalled)
        #expect(service.lastError == nil)   // setup UI takes over, no error banner
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)   // no flag write
    }

    @Test func pmsetFailureSurfacesError() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [fail(stderr: "pmset: something broke")]
        let (service, defaults) = makeService(runner: runner)

        await service.setSleepDisabled(true)

        #expect(service.lastError?.contains("something broke") == true)
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    // MARK: Launch reconciliation matrix

    @Test func reconcileAdoptsOwnCrashLeftover() async {
        // pmset=1, flag=true → adopt: show ON, fail-safe re-armed (flag stays true)
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputDisabled)]
        let (service, defaults) = makeService(runner: runner, intentFlag: true)

        await service.start()

        #expect(service.isSleepDisabled == true)
        #expect(defaults.bool(forKey: SleepService.intentKey) == true)
    }

    @Test func reconcileLeavesExternalDisableAlone() async {
        // pmset=1, flag=false → external (zsh toggle-sleep): show ON, flag stays false
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputDisabled)]
        let (service, defaults) = makeService(runner: runner, intentFlag: false)

        await service.start()

        #expect(service.isSleepDisabled == true)
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    @Test func reconcileClearsStaleFlag() async {
        // pmset=0, flag=true → someone re-enabled sleep externally: clear flag
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputEnabled)]
        let (service, defaults) = makeService(runner: runner, intentFlag: true)

        await service.start()

        #expect(service.isSleepDisabled == false)
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    @Test func reconcileNoOpWhenAllClear() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputEnabled)]
        let (service, defaults) = makeService(runner: runner, intentFlag: false)

        await service.start()

        #expect(service.isSleepDisabled == false)
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    // MARK: Quit fail-safe

    @Test func quitReenablesSleepWhenAppDisabledIt() {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok()]
        let (service, defaults) = makeService(runner: runner, intentFlag: true)
        _ = service   // keep alive for the observer

        NotificationCenter.default.post(name: NSApplication.willTerminateNotification, object: nil)

        #expect(runner.invocations.count == 1)
        #expect(runner.invocations[0].sync == true)
        #expect(runner.invocations[0].args == ["-n", "/usr/bin/pmset", "-a", "disablesleep", "0"])
        #expect(defaults.bool(forKey: SleepService.intentKey) == false)
    }

    @Test func quitDoesNotTouchExternalDisable() {
        let runner = MockCommandRunner()
        let (service, _) = makeService(runner: runner, intentFlag: false)
        _ = service

        NotificationCenter.default.post(name: NSApplication.willTerminateNotification, object: nil)

        #expect(runner.invocations.isEmpty)
    }

    // MARK: Idle-sleep assertion lifecycle

    @Test func assertionHeldWhileSleepDisabled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok(stdout: pmsetOutputDisabled)]
        let mock = MockAssertionManager()
        let (service, _) = makeService(runner: runner, assertions: mock)

        await service.setSleepDisabled(true)

        #expect(service.isSleepDisabled == true)
        #expect(mock.createdNames == ["Claude Usage Bar — Keep Mac Awake"])
        #expect(mock.releasedIDs.isEmpty)
    }

    @Test func assertionReleasedWhenSleepReenabled() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [
            ok(), ok(stdout: pmsetOutputDisabled),   // toggle on
            ok(), ok(stdout: pmsetOutputEnabled),    // toggle off
        ]
        let mock = MockAssertionManager()
        let (service, _) = makeService(runner: runner, assertions: mock)

        await service.setSleepDisabled(true)
        await service.setSleepDisabled(false)

        #expect(mock.createdNames.count == 1)
        #expect(mock.releasedIDs == [42])
    }

    @Test func assertionHeldForExternallyDetectedDisable() async {
        // The zsh toggle-sleep function sets pmset outside the app — the app
        // should still hold the idle-sleep assertion while it observes ON.
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(stdout: pmsetOutputDisabled)]
        let mock = MockAssertionManager()
        let (service, _) = makeService(runner: runner, assertions: mock)

        await service.refreshState()

        #expect(service.isSleepDisabled == true)
        #expect(mock.createdNames.count == 1)
    }

    @Test func noDuplicateAssertionOnRepeatedRefresh() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(stdout: pmsetOutputDisabled), ok(stdout: pmsetOutputDisabled)]
        let mock = MockAssertionManager()
        let (service, _) = makeService(runner: runner, assertions: mock)

        await service.refreshState()
        await service.refreshState()

        #expect(mock.createdNames.count == 1)
        #expect(mock.releasedIDs.isEmpty)
    }

    // MARK: Setup install

    @Test func installSetupSuccess() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), ok()]   // osascript, then sudo -l probe
        let (service, _) = makeService(runner: runner)

        await service.installSetup()

        #expect(service.setupStatus == .installed)
        #expect(service.lastError == nil)
        #expect(runner.invocations[0].path == "/usr/bin/osascript")
        #expect(runner.invocations[0].args[0] == "-e")
        #expect(runner.invocations[0].args[1].contains("with administrator privileges"))
    }

    @Test func installSetupUserCancelIsSilent() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [fail(stderr: "execution error: User canceled. (-128)")]
        let (service, _) = makeService(runner: runner)

        await service.installSetup()

        #expect(service.setupStatus == .notInstalled)
        #expect(service.lastError == nil)
    }

    @Test func installSetupFailureSurfacesError() async {
        let runner = MockCommandRunner()
        runner.scriptedResults = [fail(stderr: "sudoers validation failed")]
        let (service, _) = makeService(runner: runner)

        await service.installSetup()

        #expect(service.setupStatus == .notInstalled)
        #expect(service.lastError?.contains("sudoers validation failed") == true)
    }

    @Test func installSetupProbeMismatchSurfacesError() async {
        // osascript succeeds but the rule still isn't active (includedir missing)
        let runner = MockCommandRunner()
        runner.scriptedResults = [ok(), fail()]
        let (service, _) = makeService(runner: runner)

        await service.installSetup()

        #expect(service.setupStatus == .notInstalled)
        #expect(service.lastError != nil)
    }
}

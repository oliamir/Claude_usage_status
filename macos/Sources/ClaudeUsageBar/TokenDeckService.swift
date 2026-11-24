import AppKit
import Combine
import Foundation
import SwiftUI

@MainActor
final class TokenDeckService: ObservableObject {
    @Published var isEnabled: Bool {
        didSet {
            UserDefaults.standard.set(isEnabled, forKey: "tokenDeckEnabled")
            if isEnabled {
                start()
            } else {
                stop()
            }
        }
    }
    @Published private(set) var isRunning = false
    @Published private(set) var devicePhase = "idle"
    @Published private(set) var deviceMessage = "Starting Token Deck…"
    @Published private(set) var deviceProduct = ""
    @Published private(set) var deviceFirmware = ""
    @Published private(set) var mode = "agents"
    @Published private(set) var activePage = "custom:my-deck"
    @Published private(set) var pageOptions: [(id: String, name: String)] = [
        ("custom:my-deck", "My Deck"),
        ("sessions", "Sessions"),
        ("models", "Models")
    ]
    @Published var brightness: Int = 70
    @Published private(set) var claudeHooksInstalled = false
    @Published private(set) var tileImages: [NSImage?] = Array(repeating: nil, count: 6)
    @Published var showSimulatorInPopover: Bool {
        didSet {
            UserDefaults.standard.set(showSimulatorInPopover, forKey: "tokenDeckShowSimulator")
            if showSimulatorInPopover && popoverVisible && isEnabled {
                Task { await pollState(includeTiles: true) }
            }
        }
    }

    private var process: Process?
    private var pollTimer: Timer?
    private var terminateObserver: Any?
    private var sleepObserver: Any?
    private var wakeObserver: Any?
    private var popoverVisible = false
    private var settingsVisible = false
    private var isSystemAsleep = false
    private var latestUsage: UsageResponse?
    private var lastSyncedUsageAt: Date?
    private var cachedServerBaseURL: URL?
    private var cachedURLFileModDate: Date?
    private var lastTileDataUrls: [String] = Array(repeating: "", count: 6)
    private let session: URLSession = .shared
    private let inputBridge = NativeInputBridge()

    init() {
        if UserDefaults.standard.object(forKey: "tokenDeckEnabled") == nil {
            UserDefaults.standard.set(true, forKey: "tokenDeckEnabled")
        }
        if UserDefaults.standard.object(forKey: "tokenDeckShowSimulator") == nil {
            UserDefaults.standard.set(true, forKey: "tokenDeckShowSimulator")
        }
        self.isEnabled = UserDefaults.standard.bool(forKey: "tokenDeckEnabled")
        self.showSimulatorInPopover = UserDefaults.standard.bool(forKey: "tokenDeckShowSimulator")

        terminateObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.stopProcess()
            }
        }

        sleepObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.isSystemAsleep = true
                self.pollTimer?.invalidate()
                self.pollTimer = nil
            }
        }

        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.isSystemAsleep = false
                if self.isEnabled {
                    self.schedulePollTimer()
                    Task { await self.pollState(includeTiles: self.shouldFetchTiles) }
                }
            }
        }

        if self.isEnabled {
            start()
        }
    }

    deinit {
        if let obs = terminateObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        if let obs = sleepObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
        }
        if let obs = wakeObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
        }
    }

    private var isUIVisible: Bool {
        popoverVisible || settingsVisible
    }

    private var shouldFetchTiles: Bool {
        popoverVisible && showSimulatorInPopover
    }

    func setPopoverVisible(_ visible: Bool) {
        guard popoverVisible != visible else { return }
        popoverVisible = visible
        guard isEnabled, !isSystemAsleep else { return }
        schedulePollTimer()
        if visible {
            ensureProcessRunning()
            Task { await pollState(includeTiles: shouldFetchTiles) }
        }
    }

    func setSettingsVisible(_ visible: Bool) {
        guard settingsVisible != visible else { return }
        settingsVisible = visible
        guard isEnabled, !isSystemAsleep else { return }
        schedulePollTimer()
        if visible {
            ensureProcessRunning()
            Task { await pollState(includeTiles: shouldFetchTiles) }
        }
    }

    func start() {
        guard isEnabled else { return }
        ensureProcessRunning()
        schedulePollTimer()
        Task { await pollState(includeTiles: shouldFetchTiles) }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        stopProcess()
        if isRunning { isRunning = false }
        if devicePhase != "idle" { devicePhase = "idle" }
        if deviceMessage != "Token Deck disabled" { deviceMessage = "Token Deck disabled" }
    }

    private func schedulePollTimer() {
        pollTimer?.invalidate()
        guard isEnabled, !isSystemAsleep else {
            pollTimer = nil
            return
        }
        // Only poll frequently while the menu bar popover or settings window is open.
        // While closed (99.9% of the time), perform a lightweight health check once per minute.
        let interval: TimeInterval = isUIVisible ? 3.0 : 60.0
        let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.isEnabled, !self.isSystemAsleep else { return }
                self.ensureProcessRunning()
                let wantTiles = self.shouldFetchTiles
                Task { await self.pollState(includeTiles: wantTiles) }
            }
        }
        timer.tolerance = isUIVisible ? 0.5 : 10.0
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer
    }

    private func locateBinary() -> URL? {
        let embedded = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Helpers/Token Deck.app/Contents/MacOS/Token Deck")
        if FileManager.default.isExecutableFile(atPath: embedded.path) {
            return embedded
        }
        let candidates = [
            "/Applications/ClaudeUsageBar.app/Contents/Helpers/Token Deck.app/Contents/MacOS/Token Deck",
            "/Applications/Token Deck.app/Contents/MacOS/Token Deck"
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return URL(fileURLWithPath: path)
        }
        return nil
    }

    private func ensureProcessRunning() {
        if let proc = process, proc.isRunning {
            return
        }
        guard let binaryURL = locateBinary() else {
            deviceMessage = "Token Deck engine not found"
            isRunning = false
            return
        }

        inputBridge.start()

        let proc = Process()
        proc.executableURL = binaryURL
        let myPid = ProcessInfo.processInfo.processIdentifier
        proc.arguments = ["--embedded", "--parent-pid=\(myPid)"]
        var env = ProcessInfo.processInfo.environment
        if let bridgeURL = inputBridge.baseURLString {
            env["CLAUDE_USAGE_ACTION_URL"] = bridgeURL
            env["CLAUDE_USAGE_ACTION_TOKEN"] = inputBridge.token
        }
        proc.environment = env
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        proc.terminationHandler = { [weak self] terminated in
            Task { @MainActor [weak self] in
                guard let self, self.process === terminated else { return }
                self.process = nil
                self.cachedServerBaseURL = nil
                self.cachedURLFileModDate = nil
                if self.isRunning { self.isRunning = false }
                if self.isEnabled && self.devicePhase != "idle" {
                    self.devicePhase = "idle"
                    self.deviceMessage = "Token Deck restarting…"
                }
            }
        }
        do {
            try proc.run()
            self.process = proc
            self.cachedServerBaseURL = nil
            self.cachedURLFileModDate = nil
            self.lastSyncedUsageAt = nil
            if !self.isRunning { self.isRunning = true }
        } catch {
            if self.deviceMessage != "Failed to launch Token Deck" {
                self.deviceMessage = "Failed to launch Token Deck"
            }
            if self.isRunning { self.isRunning = false }
        }
    }

    private func stopProcess() {
        if let proc = process, proc.isRunning {
            proc.terminate()
        }
        process = nil
        cachedServerBaseURL = nil
        cachedURLFileModDate = nil
        inputBridge.stop()
    }

    private func serverBaseURL() -> URL? {
        let urlFile = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".tokendeck/url")
        let modDate = (try? FileManager.default.attributesOfItem(atPath: urlFile.path)[.modificationDate]) as? Date
        if let cached = cachedServerBaseURL, let modDate, cachedURLFileModDate == modDate {
            return cached
        }
        guard let raw = try? String(contentsOf: urlFile, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw) else {
            return nil
        }
        cachedServerBaseURL = url
        cachedURLFileModDate = modDate
        return url
    }

    func pollState(includeTiles: Bool = false) async {
        guard let baseURL = serverBaseURL() else { return }
        var stateURL = baseURL.appendingPathComponent("state")
        if !includeTiles, var comps = URLComponents(url: stateURL, resolvingAgainstBaseURL: false) {
            comps.queryItems = [URLQueryItem(name: "lite", value: "1")]
            if let liteURL = comps.url {
                stateURL = liteURL
            }
        }
        var request = URLRequest(url: stateURL)
        request.timeoutInterval = 1.5
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            applyStateJSON(data)
            if let usage = latestUsage, lastSyncedUsageAt == nil {
                await pushUsageToDeck(usage)
            }
        } catch {
            // Engine still starting up or restarted on a new port
            cachedServerBaseURL = nil
            cachedURLFileModDate = nil
        }
    }

    private func applyStateJSON(_ data: Data) {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if !isRunning { isRunning = true }
        if let device = root["device"] as? [String: Any] {
            let nextPhase = (device["phase"] as? String) ?? "idle"
            let nextMessage = (device["message"] as? String) ?? "No deck found"
            let nextProduct = (device["product"] as? String) ?? ""
            let nextFirmware = (device["firmware"] as? String) ?? ""
            if devicePhase != nextPhase { devicePhase = nextPhase }
            if deviceMessage != nextMessage { deviceMessage = nextMessage }
            if deviceProduct != nextProduct { deviceProduct = nextProduct }
            if deviceFirmware != nextFirmware { deviceFirmware = nextFirmware }
        }
        if let m = root["mode"] as? String, mode != m {
            mode = m
        }
        if let ap = root["activePage"] as? String, activePage != ap {
            activePage = ap
        }
        if let bindings = root["metalBindings"] as? [String: String] {
            let customModes = (root["customModes"] as? [[String: Any]]) ?? []
            func labelFor(_ target: String) -> String {
                if target == "sessions" { return "Sessions" }
                if target == "models" { return "Models" }
                if target == "agents" { return "Agents" }
                if target.hasPrefix("custom:") {
                    let id = String(target.dropFirst(7))
                    if let found = customModes.first(where: { ($0["id"] as? String) == id }),
                       let name = found["name"] as? String, !name.isEmpty {
                        return name
                    }
                    return id
                }
                return target
            }
            let targets = [
                bindings["left"] ?? "custom:my-deck",
                bindings["middle"] ?? "sessions",
                bindings["right"] ?? "models"
            ]
            var unique: [(id: String, name: String)] = []
            for t in targets where !unique.contains(where: { $0.id == t }) {
                unique.append((id: t, name: labelFor(t)))
            }
            if !activePage.isEmpty && !unique.contains(where: { $0.id == activePage }) {
                unique.insert((id: activePage, name: labelFor(activePage)), at: 0)
            }
            if !unique.isEmpty {
                let changed = unique.count != pageOptions.count ||
                    zip(unique, pageOptions).contains(where: { $0.id != $1.id || $0.name != $1.name })
                if changed {
                    pageOptions = unique
                }
            }
        }
        if let b = root["brightness"] as? Int, brightness != b {
            brightness = b
        }
        if let agents = root["agents"] as? [[String: Any]],
           let claude = agents.first(where: { ($0["id"] as? String) == "claude-code" }) {
            let nextHooks = (claude["hooks"] as? Bool) ?? false
            if claudeHooksInstalled != nextHooks { claudeHooksInstalled = nextHooks }
        }
        if let tiles = root["tiles"] as? [String] {
            var updated = tileImages
            var anyChanged = false
            for index in 0..<6 {
                let dataUrl = index < tiles.count ? tiles[index] : ""
                if dataUrl != lastTileDataUrls[index] {
                    lastTileDataUrls[index] = dataUrl
                    updated[index] = dataUrl.isEmpty ? nil : Self.decodeWireTile(dataUrl)
                    anyChanged = true
                }
            }
            if anyChanged {
                tileImages = updated
            }
        }
    }

    /// Decodes a 64x64 90°-CW-rotated wire JPEG data URL and rotates it 90° CCW so it displays upright.
    private static func decodeWireTile(_ dataUrl: String) -> NSImage? {
        guard let comma = dataUrl.firstIndex(of: ",") else { return nil }
        let base64 = String(dataUrl[dataUrl.index(after: comma)...])
        guard let data = Data(base64Encoded: base64),
              let sourceImage = NSImage(data: data),
              let cgSource = sourceImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }

        let w = cgSource.width
        let h = cgSource.height
        guard w == 64, h == 64 else {
            return sourceImage
        }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
        var srcPixels = [UInt8](repeating: 0, count: 64 * 64 * 4)
        guard let srcCtx = CGContext(
            data: &srcPixels,
            width: 64,
            height: 64,
            bitsPerComponent: 8,
            bytesPerRow: 64 * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else {
            return sourceImage
        }
        srcCtx.draw(cgSource, in: CGRect(x: 0, y: 0, width: 64, height: 64))

        var dstPixels = [UInt8](repeating: 0, count: 64 * 64 * 4)
        for y in 0..<64 {
            for x in 0..<64 {
                let si = (x * 64 + (63 - y)) * 4
                let di = (y * 64 + x) * 4
                dstPixels[di] = srcPixels[si]
                dstPixels[di + 1] = srcPixels[si + 1]
                dstPixels[di + 2] = srcPixels[si + 2]
                dstPixels[di + 3] = 255
            }
        }

        guard let dstCtx = CGContext(
            data: &dstPixels,
            width: 64,
            height: 64,
            bitsPerComponent: 8,
            bytesPerRow: 64 * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ), let cgOut = dstCtx.makeImage() else {
            return sourceImage
        }
        return NSImage(cgImage: cgOut, size: NSSize(width: 64, height: 64))
    }

    func syncUsage(_ usage: UsageResponse?) {
        latestUsage = usage
        guard let usage else { return }
        Task { await pushUsageToDeck(usage) }
    }

    private func pushUsageToDeck(_ usage: UsageResponse) async {
        guard let baseURL = serverBaseURL() else { return }
        let usageURL = baseURL.appendingPathComponent("usage")
        var payload: [String: Any] = [
            "fiveLabel": "FBL",
            "sevenLabel": "7D"
        ]
        if let fable = usage.fable?.utilization {
            payload["fiveHour"] = fable
        }
        if let seven = usage.sevenDay?.utilization {
            payload["sevenDay"] = seven
        }
        if let fableReset = usage.fable?.resetsAtDate?.timeIntervalSince1970 {
            payload["fiveResets"] = fableReset
        }
        if let sevenReset = usage.sevenDay?.resetsAtDate?.timeIntervalSince1970 {
            payload["sevenResets"] = sevenReset
        }

        var request = URLRequest(url: usageURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        request.timeoutInterval = 1.5
        if let (_, response) = try? await session.data(for: request),
           let http = response as? HTTPURLResponse,
           (200...299).contains(http.statusCode) {
            lastSyncedUsageAt = Date()
        }
    }

    func sendCommand(_ body: [String: Any]) async {
        guard let baseURL = serverBaseURL() else { return }
        let cmdURL = baseURL.appendingPathComponent("command")
        var request = URLRequest(url: cmdURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 2.0
        if let (data, response) = try? await session.data(for: request),
           let http = response as? HTTPURLResponse,
           http.statusCode == 200 {
            applyStateJSON(data)
        }
    }

    func selectPage(_ target: String) {
        activePage = target
        Task {
            await sendCommand([
                "method": "selectPage",
                "target": target
            ])
        }
    }

    func selectMode(_ target: String) {
        selectPage(target)
    }

    func pressKey(_ key: Int) {
        Task {
            await sendCommand([
                "method": "simulator",
                "event": ["type": "key", "key": key]
            ])
        }
    }

    func turnKnob(which: String, action: String) {
        Task {
            await sendCommand([
                "method": "simulator",
                "event": ["type": "knob", "which": which, "action": action]
            ])
        }
    }

    func updateBrightness(_ value: Int) {
        brightness = value
        Task {
            await sendCommand([
                "method": "brightness",
                "value": value
            ])
        }
    }

    func toggleClaudeHooks() {
        let method = claudeHooksInstalled ? "restore" : "connect"
        Task {
            await sendCommand([
                "method": method,
                "id": "claude-code"
            ])
        }
    }

    func clearDeviceBackground() {
        Task {
            await sendCommand(["method": "burn"])
        }
    }

    func openConsoleWindow() {
        ensureProcessRunning()
        Task {
            await sendCommand(["method": "openWindow"])
            if let pid = process?.processIdentifier,
               let runningApp = NSRunningApplication(processIdentifier: pid) {
                runningApp.activate(options: [.activateAllWindows])
            }
        }
    }
}

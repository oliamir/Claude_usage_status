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
        }
    }

    private var process: Process?
    private var pollTimer: Timer?
    private var terminateObserver: Any?
    private var latestUsage: UsageResponse?
    private var lastSyncedUsageAt: Date?
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

        if self.isEnabled {
            start()
        }
    }

    func start() {
        guard isEnabled else { return }
        ensureProcessRunning()
        schedulePollTimer()
        Task { await pollState() }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        stopProcess()
        isRunning = false
        devicePhase = "idle"
        deviceMessage = "Token Deck disabled"
    }

    private func schedulePollTimer() {
        pollTimer?.invalidate()
        let timer = Timer(timeInterval: 2.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.isEnabled else { return }
                self.ensureProcessRunning()
                Task { await self.pollState() }
            }
        }
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
        do {
            try proc.run()
            self.process = proc
            self.isRunning = true
        } catch {
            self.deviceMessage = "Failed to launch Token Deck"
            self.isRunning = false
        }
    }

    private func stopProcess() {
        if let proc = process, proc.isRunning {
            proc.terminate()
        }
        process = nil
        inputBridge.stop()
    }

    private func serverBaseURL() -> URL? {
        let urlFile = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".tokendeck/url")
        guard let raw = try? String(contentsOf: urlFile, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw) else {
            return nil
        }
        return url
    }

    func pollState() async {
        guard let baseURL = serverBaseURL() else { return }
        let stateURL = baseURL.appendingPathComponent("state")
        var request = URLRequest(url: stateURL)
        request.timeoutInterval = 1.5
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            applyStateJSON(data)
            if let usage = latestUsage,
               lastSyncedUsageAt == nil || Date().timeIntervalSince(lastSyncedUsageAt!) > 30 {
                await pushUsageToDeck(usage)
            }
        } catch {
            // Engine still starting up
        }
    }

    private func applyStateJSON(_ data: Data) {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        isRunning = true
        if let device = root["device"] as? [String: Any] {
            devicePhase = (device["phase"] as? String) ?? "idle"
            deviceMessage = (device["message"] as? String) ?? "No deck found"
            deviceProduct = (device["product"] as? String) ?? ""
            deviceFirmware = (device["firmware"] as? String) ?? ""
        }
        if let m = root["mode"] as? String {
            mode = m
        }
        if let ap = root["activePage"] as? String {
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
                pageOptions = unique
            }
        }
        if let b = root["brightness"] as? Int {
            brightness = b
        }
        if let agents = root["agents"] as? [[String: Any]],
           let claude = agents.first(where: { ($0["id"] as? String) == "claude-code" }) {
            claudeHooksInstalled = (claude["hooks"] as? Bool) ?? false
        }
        if let tiles = root["tiles"] as? [String] {
            var decoded: [NSImage?] = Array(repeating: nil, count: 6)
            for (index, dataUrl) in tiles.prefix(6).enumerated() {
                decoded[index] = Self.decodeWireTile(dataUrl)
            }
            tileImages = decoded
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

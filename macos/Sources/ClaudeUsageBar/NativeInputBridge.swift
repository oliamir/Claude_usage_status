import AppKit
import ApplicationServices
import AudioToolbox
import CoreAudio
import Foundation
import Network
import Security

/// Lightweight localhost-only HTTP bridge running inside ClaudeUsageBar.app so the embedded
/// Token Deck helper can execute native CoreGraphics keyboard shortcuts, media keys, screen lock,
/// and macOS Accessibility checks under ClaudeUsageBar.app's identity with <1ms latency.
final class NativeInputBridge: @unchecked Sendable {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.local.ClaudeUsageBar.nativeInputBridge")
    private(set) var port: UInt16 = 0
    let token: String

    init() {
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        self.token = bytes.map { String(format: "%02x", $0) }.joined()
    }

    var baseURLString: String? {
        port > 0 ? "http://127.0.0.1:\(port)" : nil
    }

    func start() {
        if listener != nil { return }
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)

        do {
            let listener = try NWListener(using: params)
            let ready = DispatchSemaphore(value: 0)
            var signaled = false
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    if let assigned = listener.port?.rawValue {
                        self.port = assigned
                    }
                    if !signaled {
                        signaled = true
                        ready.signal()
                    }
                case .failed, .cancelled:
                    if !signaled {
                        signaled = true
                        ready.signal()
                    }
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                self?.handle(connection)
            }
            self.listener = listener
            listener.start(queue: queue)
            _ = ready.wait(timeout: .now() + 2.0)
        } catch {
            // Bridge failed to bind; helper will fall back to local execution.
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        port = 0
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(connection, buffer: Data())
    }

    private func receiveRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else {
                connection.cancel()
                return
            }
            if error != nil {
                connection.cancel()
                return
            }
            var next = buffer
            if let data { next.append(data) }

            if let headerEnd = next.range(of: Data("\r\n\r\n".utf8)) {
                let headerData = next[..<headerEnd.lowerBound]
                let bodyStart = headerEnd.upperBound
                let headerText = String(data: headerData, encoding: .utf8) ?? ""
                let contentLength = Self.parseContentLength(headerText)
                if next.count >= bodyStart + contentLength || isComplete {
                    let bodyData = next.subdata(in: bodyStart..<min(next.count, bodyStart + contentLength))
                    let response = self.route(headerText: headerText, body: bodyData)
                    self.sendResponse(connection, status: response.status, payload: response.payload)
                    return
                }
            }
            if isComplete || next.count > 131072 {
                self.sendResponse(connection, status: 400, payload: ["ok": false, "error": "Bad request"])
                return
            }
            self.receiveRequest(connection, buffer: next)
        }
    }

    private static func parseContentLength(_ headerText: String) -> Int {
        for line in headerText.split(separator: "\r\n") {
            if line.lowercased().hasPrefix("content-length:") {
                let raw = line.dropFirst("content-length:".count).trimmingCharacters(in: .whitespaces)
                return max(0, Int(raw) ?? 0)
            }
        }
        return 0
    }

    private func route(headerText: String, body: Data) -> (status: Int, payload: [String: Any]) {
        let lines = headerText.split(separator: "\r\n")
        guard let requestLine = lines.first else {
            return (400, ["ok": false, "error": "Malformed HTTP request"])
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            return (400, ["ok": false, "error": "Malformed request line"])
        }
        let method = String(parts[0])
        let path = String(parts[1])

        var providedToken = ""
        for line in lines.dropFirst() {
            if line.lowercased().hasPrefix("x-action-token:") {
                providedToken = line.dropFirst("x-action-token:".count).trimmingCharacters(in: .whitespaces)
                break
            }
        }
        guard providedToken == token else {
            return (403, ["ok": false, "error": "Unauthorized"])
        }

        if method == "GET" && path == "/status" {
            return (200, [
                "ok": true,
                "accessibility": AXIsProcessTrusted()
            ])
        }

        if method == "POST" && path == "/request-accessibility" {
            DispatchQueue.main.async {
                let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
                _ = AXIsProcessTrustedWithOptions(options)
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
                    NSWorkspace.shared.open(url)
                }
            }
            return (200, [
                "ok": true,
                "accessibility": AXIsProcessTrusted()
            ])
        }

        let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]

        if method == "POST" && path == "/keys" {
            guard let keys = json["keys"] as? String, !keys.trimmingCharacters(in: .whitespaces).isEmpty else {
                return (400, ["ok": false, "error": "Missing keys"])
            }
            guard AXIsProcessTrusted() else {
                return (403, [
                    "ok": false,
                    "code": "NO_ACCESSIBILITY",
                    "error": "Grant Accessibility permission to ClaudeUsageBar in System Settings"
                ])
            }
            do {
                try Self.postShortcut(keys)
                return (200, ["ok": true])
            } catch {
                return (400, ["ok": false, "error": error.localizedDescription])
            }
        }

        if method == "POST" && path == "/media" {
            guard let key = json["key"] as? String else {
                return (400, ["ok": false, "error": "Missing media key"])
            }
            guard AXIsProcessTrusted() else {
                return (403, [
                    "ok": false,
                    "code": "NO_ACCESSIBILITY",
                    "error": "Grant Accessibility permission to ClaudeUsageBar in System Settings"
                ])
            }
            let code: Int32
            switch key {
            case "play": code = 16
            case "next": code = 17
            case "prev": code = 18
            default:
                return (400, ["ok": false, "error": "Unknown media key: \(key)"])
            }
            Self.postMediaKey(code)
            return (200, ["ok": true])
        }

        if method == "POST" && path == "/lock" {
            if Self.lockScreenImmediate() {
                return (200, ["ok": true])
            }
            return (500, ["ok": false, "error": "Unable to invoke lock screen"])
        }

        if method == "GET" && path == "/volume" {
            if let state = Self.readSystemVolume() {
                return (200, ["ok": true, "volume": state.volume, "muted": state.muted])
            }
            return (501, ["ok": false, "error": "CoreAudio volume unavailable"])
        }

        if method == "POST" && path == "/volume" {
            if let action = json["action"] as? String {
                if let next = Self.adjustSystemVolume(action: action) {
                    return (200, ["ok": true, "volume": next.volume, "muted": next.muted])
                }
                return (501, ["ok": false, "error": "CoreAudio volume unavailable"])
            }
            if let vol = json["volume"] as? Int {
                let muted = (json["muted"] as? Bool) ?? false
                if let next = Self.setSystemVolume(volume: vol, muted: muted) {
                    return (200, ["ok": true, "volume": next.volume, "muted": next.muted])
                }
                return (501, ["ok": false, "error": "CoreAudio volume unavailable"])
            }
            return (400, ["ok": false, "error": "Missing volume action or level"])
        }

        return (404, ["ok": false, "error": "Not found"])
    }

    private func sendResponse(_ connection: NWConnection, status: Int, payload: [String: Any]) {
        let body = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
        let reason: String
        switch status {
        case 200: reason = "OK"
        case 400: reason = "Bad Request"
        case 403: reason = "Forbidden"
        case 404: reason = "Not Found"
        default: reason = "Internal Server Error"
        }
        let header = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        var packet = Data(header.utf8)
        packet.append(body)
        connection.send(content: packet, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    // MARK: - Native CoreGraphics Key & Media Execution

    private static let virtualKeyCodes: [String: CGKeyCode] = [
        // Letters (ANSI layout-independent virtual key codes — work on English & Hebrew layouts)
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
        "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
        // Digits
        "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
        // Punctuation & symbols
        "=": 24, "equal": 24, "+": 24, "plus": 24,
        "-": 27, "minus": 27, "_": 27,
        "]": 30, "bracketright": 30,
        "[": 33, "bracketleft": 33,
        "'": 39, "quote": 39,
        ";": 41, "semicolon": 41,
        "\\": 42, "backslash": 42,
        ",": 43, "comma": 43,
        "/": 44, "slash": 44,
        ".": 47, "period": 47,
        "`": 50, "backquote": 50, "grave": 50,
        // Control & navigation
        "return": 36, "enter": 36,
        "tab": 48,
        "space": 49,
        "delete": 51, "backspace": 51,
        "escape": 53, "esc": 53,
        "forwarddelete": 117, "del": 117,
        "home": 115, "pageup": 116, "end": 119, "pagedown": 121,
        "left": 123, "right": 124, "down": 125, "up": 126,
        // Function keys
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97,
        "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111
    ]

    private static func postShortcut(_ rawKeys: String) throws {
        // Handle literal '+' key carefully (e.g. "cmd++" or "cmd+plus" -> key is "+")
        let trimmed = rawKeys.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let tokens: [String]
        if trimmed.hasSuffix("++") {
            let prefix = String(trimmed.dropLast(2))
            tokens = prefix.split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } + ["="]
        } else {
            tokens = trimmed.split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        guard let keyToken = tokens.last else {
            throw NSError(domain: "NativeInputBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "Empty shortcut"])
        }
        let modTokens = tokens.dropLast()
        var flags: CGEventFlags = []
        for mod in modTokens {
            switch mod {
            case "cmd", "command", "meta", "⌘":
                flags.insert(.maskCommand)
            case "shift", "⇧":
                flags.insert(.maskShift)
            case "opt", "option", "alt", "⌥":
                flags.insert(.maskAlternate)
            case "ctrl", "control", "⌃":
                flags.insert(.maskControl)
            default:
                break
            }
        }
        guard let keyCode = virtualKeyCodes[keyToken] else {
            throw NSError(domain: "NativeInputBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported key: \(keyToken)"])
        }

        let source = CGEventSource(stateID: .privateState)
        guard let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
              let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
            throw NSError(domain: "NativeInputBridge", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to construct CGEvent"])
        }
        keyDown.flags = flags
        keyUp.flags = flags
        keyDown.post(tap: .cghidEventTap)
        usleep(8_000)
        keyUp.post(tap: .cghidEventTap)
    }

    private static func postMediaKey(_ keyCode: Int32) {
        let down = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: 0xa00),
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: Int((keyCode << 16) | (0xa << 8)),
            data2: -1
        )
        let up = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: 0xb00),
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: Int((keyCode << 16) | (0xb << 8)),
            data2: -1
        )
        down?.cgEvent?.post(tap: .cghidEventTap)
        usleep(8_000)
        up?.cgEvent?.post(tap: .cghidEventTap)
    }

    private static func lockScreenImmediate() -> Bool {
        typealias LockFn = @convention(c) () -> Void
        guard let handle = dlopen("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login", RTLD_LAZY),
              let sym = dlsym(handle, "SACLockScreenImmediate") else {
            return false
        }
        let fn = unsafeBitCast(sym, to: LockFn.self)
        DispatchQueue.main.async {
            fn()
        }
        return true
    }

    // MARK: - Native CoreAudio System Volume (<0.2ms, zero subprocess spawns)

    private static func defaultOutputAudioDevice() -> AudioDeviceID? {
        var deviceID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        )
        guard status == noErr, deviceID != kAudioObjectUnknown else { return nil }
        return deviceID
    }

    private static func readSystemVolume() -> (volume: Int, muted: Bool)? {
        guard let deviceID = defaultOutputAudioDevice() else { return nil }
        var volAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(deviceID, &volAddr) else { return nil }

        var scalar: Float32 = 0
        var scalarSize = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectGetPropertyData(deviceID, &volAddr, 0, nil, &scalarSize, &scalar) == noErr else {
            return nil
        }

        var muted = false
        var muteAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        if AudioObjectHasProperty(deviceID, &muteAddr) {
            var muteVal: UInt32 = 0
            var muteSize = UInt32(MemoryLayout<UInt32>.size)
            if AudioObjectGetPropertyData(deviceID, &muteAddr, 0, nil, &muteSize, &muteVal) == noErr {
                muted = muteVal != 0
            }
        }
        let pct = max(0, min(100, Int(round(scalar * 100.0))))
        return (pct, muted)
    }

    private static func setSystemVolume(volume: Int, muted: Bool) -> (volume: Int, muted: Bool)? {
        guard let deviceID = defaultOutputAudioDevice() else { return nil }
        let clamped = max(0, min(100, volume))
        var volAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(deviceID, &volAddr) else { return nil }
        var isSettable: DarwinBoolean = false
        guard AudioObjectIsPropertySettable(deviceID, &volAddr, &isSettable) == noErr,
              isSettable.boolValue else { return nil }

        var scalar = Float32(clamped) / 100.0
        let scalarSize = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectSetPropertyData(deviceID, &volAddr, 0, nil, scalarSize, &scalar) == noErr else {
            return nil
        }

        var muteAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        if AudioObjectHasProperty(deviceID, &muteAddr) {
            var muteSettable: DarwinBoolean = false
            if AudioObjectIsPropertySettable(deviceID, &muteAddr, &muteSettable) == noErr,
               muteSettable.boolValue {
                var muteVal: UInt32 = muted ? 1 : 0
                let muteSize = UInt32(MemoryLayout<UInt32>.size)
                _ = AudioObjectSetPropertyData(deviceID, &muteAddr, 0, nil, muteSize, &muteVal)
            }
        }
        return (clamped, muted)
    }

    private static func adjustSystemVolume(action: String) -> (volume: Int, muted: Bool)? {
        guard let current = readSystemVolume() else { return nil }
        var volume = current.volume
        var muted = current.muted
        switch action {
        case "click":
            muted = !muted
            if !muted && volume == 0 { volume = 25 }
        case "cw":
            volume = min(100, (muted ? 0 : volume) + 5)
            muted = false
        case "ccw":
            volume = max(0, volume - 5)
            if volume == 0 { muted = true }
        default:
            return nil
        }
        return setSystemVolume(volume: volume, muted: muted)
    }
}

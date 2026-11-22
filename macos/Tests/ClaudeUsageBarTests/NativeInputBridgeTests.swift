import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct NativeInputBridgeTests {
    @Test
    func statusEndpointEnforcesTokenAndReportsAccessibility() async throws {
        let bridge = NativeInputBridge()
        bridge.start()
        defer { bridge.stop() }

        let base = try #require(bridge.baseURLString)
        let statusURL = try #require(URL(string: "\(base)/status"))

        // Reject missing/wrong token
        var badReq = URLRequest(url: statusURL)
        badReq.setValue("wrong-token", forHTTPHeaderField: "X-Action-Token")
        let (_, badResp) = try await URLSession.shared.data(for: badReq)
        #expect((badResp as? HTTPURLResponse)?.statusCode == 403)

        // Accept valid token
        var goodReq = URLRequest(url: statusURL)
        goodReq.setValue(bridge.token, forHTTPHeaderField: "X-Action-Token")
        let (data, goodResp) = try await URLSession.shared.data(for: goodReq)
        #expect((goodResp as? HTTPURLResponse)?.statusCode == 200)

        let json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(json["ok"] as? Bool == true)
        #expect(json["accessibility"] is Bool)
    }

    @Test
    func rejectsMalformedKeysAndUnknownMediaKeys() async throws {
        let bridge = NativeInputBridge()
        bridge.start()
        defer { bridge.stop() }

        let base = try #require(bridge.baseURLString)

        var emptyKeyReq = URLRequest(url: try #require(URL(string: "\(base)/keys")))
        emptyKeyReq.httpMethod = "POST"
        emptyKeyReq.setValue(bridge.token, forHTTPHeaderField: "X-Action-Token")
        emptyKeyReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        emptyKeyReq.httpBody = Data("{\"keys\":\"   \"}".utf8)
        let (_, emptyResp) = try await URLSession.shared.data(for: emptyKeyReq)
        #expect((emptyResp as? HTTPURLResponse)?.statusCode == 400)

        var badMediaReq = URLRequest(url: try #require(URL(string: "\(base)/media")))
        badMediaReq.httpMethod = "POST"
        badMediaReq.setValue(bridge.token, forHTTPHeaderField: "X-Action-Token")
        badMediaReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        badMediaReq.httpBody = Data("{\"key\":\"bogus\"}".utf8)
        let (_, badMediaResp) = try await URLSession.shared.data(for: badMediaReq)
        let code = (badMediaResp as? HTTPURLResponse)?.statusCode
        #expect(code == 400 || code == 403)
    }
}

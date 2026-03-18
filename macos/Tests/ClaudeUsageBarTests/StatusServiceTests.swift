import Testing
import Foundation
@testable import ClaudeUsageBar

@Suite(.serialized)
@MainActor
struct StatusServiceTests {

    // MARK: - Initial State

    @Test func initialStateDefaults() {
        let service = StatusService(session: makeSession())

        #expect(service.statusSummary == nil)
        #expect(service.lastError == nil)
        #expect(service.lastUpdated == nil)
        #expect(service.overallIndicator == .none)
        #expect(service.isAllOperational)
    }

    // MARK: - Successful Fetch

    @Test func fetchStatusDecodesAndSetsState() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 200,
                body: Self.allOperationalJSON
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary != nil)
        #expect(service.lastError == nil)
        #expect(service.lastUpdated != nil)
        #expect(service.overallIndicator == .none)
        #expect(service.isAllOperational)
        #expect(service.statusSummary?.components.count == 3)
        #expect(service.statusSummary?.page.name == "Claude")
        #expect(!(service.statusSummary?.hasActiveIncidents ?? true))
    }

    @Test func fetchStatusWithDegradedIndicator() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 200,
                body: Self.majorOutageJSON
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary != nil)
        #expect(service.lastError == nil)
        #expect(service.overallIndicator == .major)
        #expect(!service.isAllOperational)
        #expect(service.statusSummary?.hasActiveIncidents ?? false)
    }

    // MARK: - HTTP Error

    @Test func httpErrorSetsLastError() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 500
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary == nil)
        #expect(service.lastError == "HTTP 500")
        #expect(service.lastUpdated == nil)
    }

    @Test func http503SetsLastError() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 503
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.lastError == "HTTP 503")
    }

    // MARK: - Network Error

    @Test func networkErrorSetsLastError() async {
        StatusMockURLProtocol.handler = { _ in
            throw URLError(.notConnectedToInternet)
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary == nil)
        #expect(service.lastError != nil)
        #expect(service.lastUpdated == nil)
    }

    @Test func timeoutErrorSetsLastError() async {
        StatusMockURLProtocol.handler = { _ in
            throw URLError(.timedOut)
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary == nil)
        #expect(service.lastError != nil)
    }

    // MARK: - Malformed JSON

    @Test func malformedJSONSetsLastError() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 200,
                body: "{ this is not valid json }"
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary == nil)
        #expect(service.lastError != nil)
        #expect(service.lastUpdated == nil)
    }

    @Test func incompleteJSONSetsLastError() async {
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 200,
                body: #"{"page": {"id": "p", "name": "Claude", "url": "https://status.claude.com"}}"#
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()

        #expect(service.statusSummary == nil)
        #expect(service.lastError != nil)
    }

    // MARK: - Error Cleared on Success

    @Test func successfulFetchClearsPreviousError() async {
        // First: fail
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(url: request.url!, statusCode: 500)
        }

        let service = StatusService(session: makeSession())
        await service.fetchStatus()
        #expect(service.lastError == "HTTP 500")

        // Then: succeed
        StatusMockURLProtocol.handler = { request in
            return try Self.httpResponse(
                url: request.url!,
                statusCode: 200,
                body: Self.allOperationalJSON
            )
        }
        defer { StatusMockURLProtocol.handler = nil }

        await service.fetchStatus()
        #expect(service.lastError == nil)
        #expect(service.statusSummary != nil)
    }

    // MARK: - Helpers

    private func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StatusMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    private static func httpResponse(
        url: URL,
        statusCode: Int,
        headers: [String: String] = [:],
        body: String = ""
    ) throws -> (HTTPURLResponse, Data) {
        guard let response = HTTPURLResponse(
            url: url,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: headers
        ) else {
            throw TestError(message: "Failed to create HTTPURLResponse")
        }
        return (response, Data(body.utf8))
    }

    // MARK: - JSON Fixtures

    private static let allOperationalJSON = """
    {
      "page": {
        "id": "tymt9n04zgry",
        "name": "Claude",
        "url": "https://status.claude.com"
      },
      "status": {
        "indicator": "none",
        "description": "All Systems Operational"
      },
      "components": [
        {
          "id": "rwppv331jlwc",
          "name": "claude.ai",
          "status": "operational",
          "updated_at": "2026-03-18T07:29:09.766Z"
        },
        {
          "id": "k8w3r06qmzrp",
          "name": "Claude API (api.anthropic.com)",
          "status": "operational",
          "updated_at": "2026-03-18T07:29:09.802Z"
        },
        {
          "id": "yyzkbfz2thpt",
          "name": "Claude Code",
          "status": "operational",
          "updated_at": "2026-03-18T07:29:09.819Z"
        }
      ],
      "incidents": []
    }
    """

    private static let majorOutageJSON = """
    {
      "page": {
        "id": "tymt9n04zgry",
        "name": "Claude",
        "url": "https://status.claude.com"
      },
      "status": {
        "indicator": "major",
        "description": "Partial System Outage"
      },
      "components": [
        {
          "id": "rwppv331jlwc",
          "name": "claude.ai",
          "status": "operational",
          "updated_at": "2026-03-18T07:29:09.766Z"
        },
        {
          "id": "k8w3r06qmzrp",
          "name": "Claude API (api.anthropic.com)",
          "status": "major_outage",
          "updated_at": "2026-03-18T10:00:00.000Z"
        }
      ],
      "incidents": [
        {
          "id": "inc1",
          "name": "API Outage",
          "status": "investigating",
          "impact": "major",
          "shortlink": "https://stspg.io/abc",
          "created_at": "2026-03-18T10:00:00Z",
          "updated_at": "2026-03-18T10:30:00Z",
          "incident_updates": [
            {
              "id": "upd1",
              "status": "investigating",
              "body": "We are investigating elevated error rates on the API.",
              "created_at": "2026-03-18T10:30:00Z",
              "updated_at": "2026-03-18T10:30:00Z"
            }
          ]
        }
      ]
    }
    """
}

// MARK: - Test Error Helper

private struct TestError: Error {
    let message: String
}

// MARK: - Mock URL Protocol (separate from UsageServiceTests to avoid conflicts)

private final class StatusMockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

import Testing
import Foundation
@testable import ClaudeUsageBar

@Suite
struct StoredCredentialsTests {
    @Test func storeSavesAndLoadsCredentialBundle() throws {
        let store = try makeStore()
        let credentials = StoredCredentials(
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: Date(timeIntervalSince1970: 1_741_194_400),
            scopes: ["user:profile", "user:inference"]
        )

        try store.save(credentials)

        let loaded = try #require(store.load(defaultScopes: []))
        #expect(loaded == credentials)

        let filePermissions = try permissions(for: store.credentialsFileURL)
        let directoryPermissions = try permissions(for: store.directoryURL)
        #expect(filePermissions == 0o600)
        #expect(directoryPermissions == 0o700)
    }

    @Test func storeLoadsLegacyRawTokenFile() throws {
        let store = try makeStore()
        try "legacy-access-token".write(
            to: store.legacyTokenFileURL,
            atomically: true,
            encoding: .utf8
        )

        let loaded = try #require(
            store.load(defaultScopes: UsageService.defaultOAuthScopes)
        )

        #expect(loaded.accessToken == "legacy-access-token")
        #expect(loaded.refreshToken == nil)
        #expect(loaded.expiresAt == nil)
        #expect(loaded.scopes == UsageService.defaultOAuthScopes)
    }

    // MARK: - isExpired

    @Test func isExpiredReturnsFalseWhenExpiresAtIsNil() {
        let credentials = StoredCredentials(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: nil,
            scopes: ["user:profile"]
        )
        #expect(!credentials.isExpired())
    }

    @Test func isExpiredReturnsTrueWhenPastExpiry() {
        let credentials = StoredCredentials(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: Date().addingTimeInterval(-60),
            scopes: ["user:profile"]
        )
        #expect(credentials.isExpired())
    }

    @Test func isExpiredReturnsFalseWhenBeforeExpiry() {
        let credentials = StoredCredentials(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: Date().addingTimeInterval(3600),
            scopes: ["user:profile"]
        )
        #expect(!credentials.isExpired())
    }

    // MARK: - needsRefresh leeway

    @Test func needsRefreshUses300SecondLeewayByDefault() {
        let now = Date()
        let credentials = StoredCredentials(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: now.addingTimeInterval(200),
            scopes: ["user:profile"]
        )
        // 200s until expiry < 300s leeway -> needs refresh
        #expect(credentials.needsRefresh(at: now))

        let safeCredentials = StoredCredentials(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: now.addingTimeInterval(400),
            scopes: ["user:profile"]
        )
        // 400s until expiry > 300s leeway -> does not need refresh
        #expect(!safeCredentials.needsRefresh(at: now))
    }

    private func makeStore() throws -> StoredCredentialsStore {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return StoredCredentialsStore(directoryURL: directory)
    }

    private func permissions(for url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return attributes[.posixPermissions] as? Int ?? -1
    }
}

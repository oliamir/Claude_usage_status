import Foundation
import Security

struct StoredCredentials: Codable, Equatable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
    let scopes: [String]

    var hasRefreshToken: Bool {
        guard let refreshToken else { return false }
        return refreshToken.isEmpty == false
    }

    func needsRefresh(at now: Date = Date(), leeway: TimeInterval = 300) -> Bool {
        guard hasRefreshToken, let expiresAt else { return false }
        return expiresAt <= now.addingTimeInterval(leeway)
    }

    func isExpired(at now: Date = Date()) -> Bool {
        guard let expiresAt else { return false }
        return expiresAt <= now
    }
}

enum KeychainError: Error, LocalizedError {
    case unexpectedStatus(OSStatus)
    case dataConversionFailed

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus(let status):
            return "Keychain error: \(status)"
        case .dataConversionFailed:
            return "Failed to convert Keychain data"
        }
    }
}

struct StoredCredentialsStore {
    private let fileManager: FileManager
    private let serviceName: String
    private let accountName: String

    // Kept for migration from file-based storage
    let directoryURL: URL
    let credentialsFileURL: URL
    let legacyTokenFileURL: URL

    init(
        directoryURL: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/claude-usage-bar", isDirectory: true),
        fileManager: FileManager = .default,
        serviceName: String = "com.local.ClaudeUsageBar",
        accountName: String = "oauth-credentials"
    ) {
        self.fileManager = fileManager
        self.serviceName = serviceName
        self.accountName = accountName
        self.directoryURL = directoryURL
        self.credentialsFileURL = directoryURL.appendingPathComponent("credentials.json")
        self.legacyTokenFileURL = directoryURL.appendingPathComponent("token")
    }

    func save(_ credentials: StoredCredentials) throws {
        let data = try Self.encoder.encode(credentials)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            let update: [String: Any] = [kSecValueData as String: data]
            let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
            guard updateStatus == errSecSuccess else {
                throw KeychainError.unexpectedStatus(updateStatus)
            }
        } else if status == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.unexpectedStatus(addStatus)
            }
        } else {
            throw KeychainError.unexpectedStatus(status)
        }

        cleanupLegacyFiles()
    }

    func load(defaultScopes: [String]) -> StoredCredentials? {
        // Try Keychain first
        if let credentials = loadFromKeychain() {
            return credentials
        }

        // Migrate from file-based storage if present
        if let credentials = migrateFromFile(defaultScopes: defaultScopes) {
            return credentials
        }

        return nil
    }

    func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
        ]
        SecItemDelete(query as CFDictionary)
        cleanupLegacyFiles()
    }

    // MARK: - Keychain helpers

    private func loadFromKeychain() -> StoredCredentials? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return try? Self.decoder.decode(StoredCredentials.self, from: data)
    }

    private func migrateFromFile(defaultScopes: [String]) -> StoredCredentials? {
        // Try new JSON format
        if let data = try? Data(contentsOf: credentialsFileURL),
           let credentials = try? Self.decoder.decode(StoredCredentials.self, from: data) {
            try? save(credentials)
            return credentials
        }

        // Try legacy plaintext token
        guard let data = try? Data(contentsOf: legacyTokenFileURL),
              let token = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              token.isEmpty == false else {
            return nil
        }

        let credentials = StoredCredentials(
            accessToken: token,
            refreshToken: nil,
            expiresAt: Date().addingTimeInterval(24 * 3600),
            scopes: defaultScopes
        )
        try? save(credentials)
        return credentials
    }

    private func cleanupLegacyFiles() {
        try? fileManager.removeItem(at: credentialsFileURL)
        try? fileManager.removeItem(at: legacyTokenFileURL)
    }

    // MARK: - JSON coding

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

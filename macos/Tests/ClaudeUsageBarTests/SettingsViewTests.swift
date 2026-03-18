import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct SettingsViewTests {
    @Test func supportsLaunchAtLoginManagementForSystemApplications() {
        #expect(
            supportsLaunchAtLoginManagement(
                appURL: URL(fileURLWithPath: "/Applications/ClaudeUsageBar.app"),
                installDirectories: [
                    URL(fileURLWithPath: "/Applications", isDirectory: true),
                    URL(fileURLWithPath: "/Users/test/Applications", isDirectory: true)
                ]
            )
        )
    }

    @Test func supportsLaunchAtLoginManagementForUserApplications() {
        #expect(
            supportsLaunchAtLoginManagement(
                appURL: URL(fileURLWithPath: "/Users/test/Applications/ClaudeUsageBar.app"),
                installDirectories: [
                    URL(fileURLWithPath: "/Applications", isDirectory: true),
                    URL(fileURLWithPath: "/Users/test/Applications", isDirectory: true)
                ]
            )
        )
    }

    @Test func doesNotSupportLaunchAtLoginOutsideApplicationsFolders() {
        #expect(
            !supportsLaunchAtLoginManagement(
                appURL: URL(fileURLWithPath: "/Users/test/Downloads/ClaudeUsageBar.app"),
                installDirectories: [
                    URL(fileURLWithPath: "/Applications", isDirectory: true),
                    URL(fileURLWithPath: "/Users/test/Applications", isDirectory: true)
                ]
            )
        )
    }
}

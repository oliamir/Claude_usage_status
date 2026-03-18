import Foundation
import Testing
@testable import ClaudeUsageBar

@Suite
struct PollingOptionFormatterTests {
    @Test func localizedPollingIntervalUsesExpectedCompactLabels() {
        let locale = Locale(identifier: "en_US_POSIX")

        #expect(localizedPollingInterval(for: 5, locale: locale) == "5m")
        #expect(localizedPollingInterval(for: 15, locale: locale) == "15m")
        #expect(localizedPollingInterval(for: 30, locale: locale) == "30m")
        #expect(localizedPollingInterval(for: 60, locale: locale) == "1h")
    }

    @Test func recommendedPollingOptionsDoNotGetWarningSuffix() {
        let locale = Locale(identifier: "en_US_POSIX")

        #expect(pollingOptionLabel(for: 30, locale: locale) == "30m")
        #expect(pollingOptionLabel(for: 60, locale: locale) == "1h")
    }

    @Test func discouragedPollingOptionsUseLocalizedWarningSuffix() {
        let locale = Locale(identifier: "en_US_POSIX")

        #expect(pollingOptionLabel(for: 5, locale: locale) == "5m (not recommended)")
        #expect(pollingOptionLabel(for: 15, locale: locale) == "15m (not recommended)")
    }

    @Test func supportedPollingOptionsAllProduceNonEmptyLabels() {
        let locale = Locale(identifier: "en_US_POSIX")
        let pollingOptions = [5, 15, 30, 60]

        for minutes in pollingOptions {
            #expect(!pollingOptionLabel(for: minutes, locale: locale).isEmpty)
        }
    }

    @Test func discouragedPollingOptionsAreFlaggedSeparately() {
        #expect(isDiscouragedPollingOption(5))
        #expect(isDiscouragedPollingOption(15))
        #expect(!isDiscouragedPollingOption(30))
        #expect(!isDiscouragedPollingOption(60))
    }

    @Test func discouragedPollingOptionsFallBackWhenResourceBundleIsUnavailable() {
        let locale = Locale(identifier: "en_US_POSIX")

        #expect(
            pollingOptionLabel(for: 5, locale: locale, resourceBundle: nil) ==
            "5m (not recommended)"
        )
    }
}

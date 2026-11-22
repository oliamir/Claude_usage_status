import Foundation
import SwiftUI

private final class AppResourceBundleFinder {}

func claudeUsageBarResourceBundle(
    mainBundle: Bundle = .main,
    finderBundle: Bundle = Bundle(for: AppResourceBundleFinder.self)
) -> Bundle? {
    let bundleName = "ClaudeUsageBar_ClaudeUsageBar.bundle"
    let candidates: [URL?] = [
        mainBundle.resourceURL?.appendingPathComponent(bundleName),
        mainBundle.bundleURL.appendingPathComponent(bundleName),
        finderBundle.resourceURL?.appendingPathComponent(bundleName),
        mainBundle.executableURL?.deletingLastPathComponent().appendingPathComponent(bundleName),
    ]

    for case let candidate? in candidates {
        if let bundle = Bundle(url: candidate) {
            return bundle
        }
    }

    return nil
}

/// Bridges SwiftUI's `State` property wrapper without triggering the `SwiftUIMacros.StateMacro`
/// external macro plugin that is missing from CommandLineTools on newer macOS SDKs.
@propertyWrapper
struct ViewState<Value>: DynamicProperty {
    private var storage: SwiftUI.State<Value>

    init(wrappedValue: Value) {
        self.storage = SwiftUI.State(wrappedValue: wrappedValue)
    }

    init(initialValue: Value) {
        self.storage = SwiftUI.State(initialValue: initialValue)
    }

    init() where Value: ExpressibleByNilLiteral {
        self.storage = SwiftUI.State(wrappedValue: nil)
    }

    var wrappedValue: Value {
        get { storage.wrappedValue }
        nonmutating set { storage.wrappedValue = newValue }
    }

    var projectedValue: Binding<Value> {
        storage.projectedValue
    }
}

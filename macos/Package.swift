// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "ClaudeUsageBar",
    defaultLocalization: "en",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.8.1"),
        .package(url: "https://github.com/swiftlang/swift-testing.git", exact: "0.12.0")
    ],
    targets: [
        .executableTarget(
            name: "ClaudeUsageBar",
            dependencies: [
                .product(name: "Sparkle", package: "Sparkle")
            ],
            path: "Sources/ClaudeUsageBar",
            resources: [
                .process("Resources")
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ],
            linkerSettings: [
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])
            ]
        ),
        .testTarget(
            name: "ClaudeUsageBarTests",
            dependencies: [
                "ClaudeUsageBar",
                .product(name: "Testing", package: "swift-testing")
            ],
            path: "Tests/ClaudeUsageBarTests",
            swiftSettings: [
                .swiftLanguageMode(.v5),
                .unsafeFlags([
                    "-Xfrontend", "-disable-cross-import-overlays"
                ])
            ]
        )
    ]
)

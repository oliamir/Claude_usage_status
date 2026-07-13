import SwiftUI

@main
struct ClaudeUsageBarApp: App {
    @StateObject private var service = UsageService()
    @StateObject private var historyService = UsageHistoryService()
    @StateObject private var notificationService = NotificationService()
    @StateObject private var appUpdater = AppUpdater()
    @StateObject private var statusService = StatusService()
    @StateObject private var sleepService = SleepService()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(
                service: service,
                historyService: historyService,
                notificationService: notificationService,
                appUpdater: appUpdater,
                statusService: statusService,
                sleepService: sleepService
            )
        } label: {
            Image(nsImage: service.isAuthenticated
                ? renderIcon(pct5h: service.pct5h, pct7d: service.pct7d, statusIndicator: statusService.overallIndicator, sleepDisabled: sleepService.isSleepDisabled)
                : renderUnauthenticatedIcon(statusIndicator: statusService.overallIndicator, sleepDisabled: sleepService.isSleepDisabled)
            )
                .task {
                    // Auto-mark existing users as setup-complete
                    if service.isAuthenticated && !UserDefaults.standard.bool(forKey: "setupComplete") {
                        UserDefaults.standard.set(true, forKey: "setupComplete")
                    }
                    historyService.loadHistory()
                    service.historyService = historyService
                    service.notificationService = notificationService
                    service.startPolling()
                    statusService.startPolling()
                    await sleepService.start()
                }
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsWindowContent(
                service: service,
                notificationService: notificationService,
                sleepService: sleepService
            )
        }
        .windowResizability(.contentSize)
        .windowStyle(.titleBar)
    }
}

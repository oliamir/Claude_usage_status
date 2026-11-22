import Foundation
import AppKit

@MainActor
final class StatusService: ObservableObject {
    // MARK: - Published State

    @Published private(set) var statusSummary: StatusSummaryResponse?
    @Published private(set) var lastError: String?
    @Published private(set) var lastUpdated: Date?

    // MARK: - Computed

    var overallIndicator: StatusIndicator { statusSummary?.status.indicator ?? .none }
    var isAllOperational: Bool { overallIndicator == .none }

    // MARK: - Private

    private let session: URLSession
    private var timer: Timer?
    private var wakeObserver: Any?
    nonisolated private static let endpoint = URL(string: "https://status.claude.com/api/v2/summary.json")!
    private static let pollingInterval: TimeInterval = 300 // 5 minutes

    // MARK: - Init

    init(session: URLSession = .shared) {
        self.session = session
    }

    deinit {
        if let observer = wakeObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
    }

    // MARK: - Polling

    func startPolling() {
        Task { await fetchStatus() }
        scheduleTimer()
        if wakeObserver == nil {
            wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didWakeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.scheduleTimer()
                    Task { await self.fetchStatus() }
                }
            }
        }
    }

    private func scheduleTimer() {
        timer?.invalidate()
        let t = Timer(timeInterval: Self.pollingInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                Task { await self.fetchStatus() }
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
        if let observer = wakeObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
            wakeObserver = nil
        }
    }

    // MARK: - Fetch

    func fetchStatus() async {
        do {
            let request = URLRequest(url: Self.endpoint)
            let (data, response) = try await session.data(for: request)

            guard let http = response as? HTTPURLResponse else {
                lastError = "Invalid response"
                return
            }

            guard http.statusCode == 200 else {
                lastError = "HTTP \(http.statusCode)"
                return
            }

            let decoder = JSONDecoder()
            let decoded = try decoder.decode(StatusSummaryResponse.self, from: data)
            statusSummary = decoded
            lastError = nil
            lastUpdated = Date()
        } catch {
            lastError = error.localizedDescription
        }
    }
}

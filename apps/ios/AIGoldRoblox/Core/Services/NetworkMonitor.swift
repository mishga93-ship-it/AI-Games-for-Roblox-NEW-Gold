import Foundation
import Network
import Combine

/// Observes device connectivity via `NWPathMonitor` and publishes `isOnline` on the main actor.
/// Singleton — used by `MainTabView` to drive the offline alert + reconnect toast.
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnline: Bool = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor.queue", qos: .utility)
    private var hasReceivedFirstUpdate = false

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async {
                guard let self else { return }
                // Ignore the first update if it matches the default true value to avoid a spurious toast on launch.
                if !self.hasReceivedFirstUpdate {
                    self.hasReceivedFirstUpdate = true
                    if self.isOnline != online {
                        self.isOnline = online
                    }
                    return
                }
                if self.isOnline != online {
                    self.isOnline = online
                }
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}

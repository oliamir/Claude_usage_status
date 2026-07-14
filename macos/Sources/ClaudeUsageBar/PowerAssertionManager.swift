import Foundation
import IOKit.pwr_mgt

protocol PowerAssertionManaging: Sendable {
    /// Returns an assertion ID on success, nil on failure.
    func createAssertion(named name: String) -> UInt32?
    func releaseAssertion(_ id: UInt32)
}

/// Holds a kIOPMAssertionTypePreventUserIdleSystemSleep assertion — the same
/// mechanism caffeinate(8) uses. Blocks idle system sleep on both AC and
/// battery while held; released automatically by the OS if the process dies.
struct IOPMPowerAssertionManager: PowerAssertionManaging {
    func createAssertion(named name: String) -> UInt32? {
        var id: IOPMAssertionID = 0
        let result = IOPMAssertionCreateWithName(
            kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
            IOPMAssertionLevel(kIOPMAssertionLevelOn),
            name as CFString,
            &id
        )
        return result == kIOReturnSuccess ? id : nil
    }

    func releaseAssertion(_ id: UInt32) {
        IOPMAssertionRelease(IOPMAssertionID(id))
    }
}

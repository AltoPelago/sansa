//! Unpublished shell for the host-neutral Rust SANSA runtime.
//!
//! The crate currently supplies only capability and diagnostic contracts. It
//! deliberately makes no Address, Resolve, Query, or Value Semantics claim.

/// Stable CTS protocol consumed by this runtime's conformance harness.
pub const CTS_PROTOCOL: &str = "cts.protocol.v1";

/// Implementation identifier used by local capability reports.
pub const IMPLEMENTATION_ID: &str = "sansa-runtime-rust";

/// Implementation state for one conformance lane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CapabilityStatus {
    /// The lane is known, but no runtime implementation or conformance claim
    /// exists yet.
    NotImplemented,
}

/// One pinned stable CTS lane tracked by the implementation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CtsLane {
    /// Host-neutral capability identifier from the CTS manifest.
    pub capability: &'static str,
    /// Immutable CTS snapshot identifier targeted by the lane.
    pub snapshot_id: &'static str,
    /// Current implementation status.
    pub status: CapabilityStatus,
}

/// Stable CTS lanes required before the initial Rust Query runtime can be
/// exposed to hosts.
pub const STABLE_CTS_LANES: [CtsLane; 4] = [
    CtsLane {
        capability: "AEON.ValueSemantics",
        snapshot_id: "value-semantics-cts-v1-snapshot-0.1",
        status: CapabilityStatus::NotImplemented,
    },
    CtsLane {
        capability: "SANSA.Addressing",
        snapshot_id: "sansa-address-parser-cts-v1-snapshot-0.1",
        status: CapabilityStatus::NotImplemented,
    },
    CtsLane {
        capability: "SANSA.Resolve",
        snapshot_id: "sansa-resolve-cts-v1-snapshot-0.1",
        status: CapabilityStatus::NotImplemented,
    },
    CtsLane {
        capability: "SANSA.Query",
        snapshot_id: "sansa-query-parser-cts-v1-snapshot-0.2",
        status: CapabilityStatus::NotImplemented,
    },
];

/// Evaluation phase associated with a normalized SANSA diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DiagnosticPhase {
    /// Source parsing or canonicalization.
    Parse,
    /// Namespace resolution.
    Resolve,
    /// Trusted-consumer policy evaluation.
    Policy,
    /// Query `from` evaluation.
    From,
    /// Query `where` evaluation.
    Where,
    /// Query `order` evaluation.
    Order,
    /// Query `select` evaluation.
    Select,
}

/// Host-neutral diagnostic envelope shared by future runtime surfaces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// Stable SANSA or value-semantics diagnostic code.
    pub code: String,
    /// Human-readable diagnostic summary.
    pub message: String,
    /// Runtime phase, when the calling surface has phases.
    pub phase: Option<DiagnosticPhase>,
    /// Selector index associated with Address or Resolve failure.
    pub selector_index: Option<usize>,
    /// Candidate binding address associated with Query failure.
    pub candidate_address: Option<String>,
    /// Budget name associated with resource exhaustion.
    pub budget: Option<String>,
    /// Configured budget ceiling.
    pub limit: Option<usize>,
    /// Observed value that exceeded the ceiling.
    pub observed: Option<usize>,
}

impl Diagnostic {
    /// Create a diagnostic without optional context.
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            phase: None,
            selector_index: None,
            candidate_address: None,
            budget: None,
            limit: None,
            observed: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_claims_no_runtime_capabilities() {
        assert!(
            STABLE_CTS_LANES
                .iter()
                .all(|lane| lane.status == CapabilityStatus::NotImplemented)
        );
    }

    #[test]
    fn normalized_diagnostic_starts_without_invented_context() {
        let diagnostic = Diagnostic::new("SANSA_NOT_IMPLEMENTED", "runtime shell only");

        assert_eq!(diagnostic.phase, None);
        assert_eq!(diagnostic.selector_index, None);
        assert_eq!(diagnostic.candidate_address, None);
        assert_eq!(diagnostic.budget, None);
        assert_eq!(diagnostic.limit, None);
        assert_eq!(diagnostic.observed, None);
    }
}

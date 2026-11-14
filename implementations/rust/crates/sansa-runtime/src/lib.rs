//! Host-neutral Rust SANSA runtime.

pub mod address;
pub mod evaluate;
pub mod mutate;
pub mod mutate_target;
pub mod query;
pub mod resolve;
pub mod value_semantics;

/// Stable CTS protocol consumed by this runtime's conformance harness.
pub const CTS_PROTOCOL: &str = "cts.protocol.v1";

/// Implementation identifier used by local capability reports.
pub const IMPLEMENTATION_ID: &str = "sansa-runtime-rust";

/// Implementation state for one conformance lane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CapabilityStatus {
    /// The lane is implemented and exercised directly against its pinned CTS.
    Implemented,
    /// The lane is known, but no runtime implementation or conformance claim
    /// exists yet.
    NotImplemented,
}

/// Independently claimable surface inside the experimental SANSA.Mutate CTS
/// lane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MutateCtsSurface {
    /// Side-effect-free exact-target plan construction.
    Plan,
    /// Post-plan target-surface representability validation.
    TargetValidation,
    /// Host-adapter application and stale-target checks.
    Apply,
    /// Workbench-only trusted-consumer policy filtering.
    Policy,
}

/// One independently tracked surface in the pinned experimental Mutate CTS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ExperimentalMutateCtsSlice {
    /// Host-neutral capability identifier from the CTS manifest.
    pub capability: &'static str,
    /// Immutable experimental CTS snapshot identifier.
    pub snapshot_id: &'static str,
    /// Profile identifier from the CTS manifest.
    pub profile: &'static str,
    /// Independently claimable runtime surface.
    pub surface: MutateCtsSurface,
    /// Cases assigned to this surface in the pinned snapshot.
    pub case_count: usize,
    /// Current implementation status.
    pub status: CapabilityStatus,
}

/// Pinned proposal-stage SANSA.Mutate CTS snapshot.
pub const MUTATE_CTS_SNAPSHOT_ID: &str = "sansa-mutate-cts-v1-snapshot-0.1";

/// Experimental SANSA.Mutate surfaces tracked independently by the Rust
/// runtime.
///
/// The side-effect-free plan and target-validation surfaces are implemented
/// directly against all 64 assigned cases. Apply and policy remain
/// unimplemented.
pub const EXPERIMENTAL_MUTATE_CTS_SLICES: [ExperimentalMutateCtsSlice; 4] = [
    ExperimentalMutateCtsSlice {
        capability: "SANSA.Mutate",
        snapshot_id: MUTATE_CTS_SNAPSHOT_ID,
        profile: "mutate-plan-and-policy",
        surface: MutateCtsSurface::Plan,
        case_count: 28,
        status: CapabilityStatus::Implemented,
    },
    ExperimentalMutateCtsSlice {
        capability: "SANSA.Mutate",
        snapshot_id: MUTATE_CTS_SNAPSHOT_ID,
        profile: "mutate-plan-and-policy",
        surface: MutateCtsSurface::TargetValidation,
        case_count: 36,
        status: CapabilityStatus::Implemented,
    },
    ExperimentalMutateCtsSlice {
        capability: "SANSA.Mutate",
        snapshot_id: MUTATE_CTS_SNAPSHOT_ID,
        profile: "mutate-plan-and-policy",
        surface: MutateCtsSurface::Apply,
        case_count: 18,
        status: CapabilityStatus::NotImplemented,
    },
    ExperimentalMutateCtsSlice {
        capability: "SANSA.Mutate",
        snapshot_id: MUTATE_CTS_SNAPSHOT_ID,
        profile: "mutate-plan-and-policy",
        surface: MutateCtsSurface::Policy,
        case_count: 24,
        status: CapabilityStatus::NotImplemented,
    },
];

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
        status: CapabilityStatus::Implemented,
    },
    CtsLane {
        capability: "SANSA.Addressing",
        snapshot_id: "sansa-address-parser-cts-v1-snapshot-0.1",
        status: CapabilityStatus::Implemented,
    },
    CtsLane {
        capability: "SANSA.Resolve",
        snapshot_id: "sansa-resolve-cts-v1-snapshot-0.1",
        status: CapabilityStatus::Implemented,
    },
    CtsLane {
        capability: "SANSA.Query",
        snapshot_id: "sansa-query-parser-cts-v1-snapshot-0.2",
        status: CapabilityStatus::Implemented,
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
#[derive(Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// Stable SANSA or value-semantics diagnostic code.
    pub code: String,
    /// Human-readable diagnostic summary.
    pub message: String,
    /// Runtime phase, when the calling surface has phases.
    pub phase: Option<DiagnosticPhase>,
    /// Selector index associated with Address or Resolve failure.
    pub selector_index: Option<usize>,
    /// Selected structural identity for unsupported or ambiguous identity selection.
    pub identity: Option<String>,
    /// Candidate binding address associated with Query failure.
    pub candidate_address: Option<String>,
    /// Budget name associated with resource exhaustion.
    pub budget: Option<String>,
    /// Configured budget ceiling.
    pub limit: Option<usize>,
    /// Observed value that exceeded the ceiling.
    pub observed: Option<usize>,
}

// Keep ordinary diagnostic Debug observations stable when optional identity context is absent.
impl std::fmt::Debug for Diagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut out = f.debug_struct("Diagnostic");
        out.field("code", &self.code);
        out.field("message", &self.message);
        out.field("phase", &self.phase);
        out.field("selector_index", &self.selector_index);
        out.field("candidate_address", &self.candidate_address);
        out.field("budget", &self.budget);
        out.field("limit", &self.limit);
        out.field("observed", &self.observed);
        if self.identity.is_some() {
            out.field("identity", &self.identity);
        }
        out.finish()
    }
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
            identity: None,
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
    fn capability_claims_match_the_implemented_runtime_lanes() {
        assert_eq!(STABLE_CTS_LANES[0].status, CapabilityStatus::Implemented);
        assert_eq!(STABLE_CTS_LANES[1].status, CapabilityStatus::Implemented);
        assert_eq!(STABLE_CTS_LANES[2].status, CapabilityStatus::Implemented);
        assert_eq!(STABLE_CTS_LANES[3].status, CapabilityStatus::Implemented);
    }

    #[test]
    fn experimental_mutate_surfaces_are_claimed_independently() {
        assert_eq!(
            EXPERIMENTAL_MUTATE_CTS_SLICES[0].status,
            CapabilityStatus::Implemented
        );
        assert_eq!(
            EXPERIMENTAL_MUTATE_CTS_SLICES[1].status,
            CapabilityStatus::Implemented
        );
        assert!(
            EXPERIMENTAL_MUTATE_CTS_SLICES[2..]
                .iter()
                .all(|slice| slice.status == CapabilityStatus::NotImplemented)
        );
    }

    #[test]
    fn normalized_diagnostic_starts_without_invented_context() {
        let diagnostic = Diagnostic::new("SANSA_NOT_IMPLEMENTED", "runtime lane unavailable");

        assert_eq!(diagnostic.phase, None);
        assert_eq!(diagnostic.selector_index, None);
        assert_eq!(diagnostic.candidate_address, None);
        assert_eq!(diagnostic.budget, None);
        assert_eq!(diagnostic.limit, None);
        assert_eq!(diagnostic.observed, None);
    }
}

#[cfg(test)]
mod child_identity_tests;

#[cfg(test)]
mod unicode_hardening_regressions {
    use crate::evaluate::{EvaluateOptions, EvaluatedValue, evaluate_query};
    use crate::resolve::{Namespace, ResolveOptions, resolve_address};
    use crate::value_semantics::{Profile, Value};
    use serde_json::{Value as Json, json};

    struct Names(Vec<String>);
    impl Namespace for Names {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            Some(0)
        }
        fn children(&self, b: &usize) -> Vec<usize> {
            if *b == 0 {
                (1..=self.0.len()).collect()
            } else {
                vec![]
            }
        }
        fn name(&self, b: &usize) -> Option<String> {
            b.checked_sub(1).and_then(|i| self.0.get(i)).cloned()
        }
    }
    fn fixtures() -> Json {
        serde_json::from_str(include_str!("../tests/fixtures/unicode-hardening-v1.json"))
            .expect("unicode fixtures")
    }
    #[test]
    fn unicode_globs_cover_line_terminators_by_codepoint() {
        let names = Names(
            fixtures()["wildcard_names"]
                .as_array()
                .expect("names")
                .iter()
                .map(|v| v.as_str().expect("name").to_owned())
                .collect(),
        );
        for pattern in ["?", "*", "plain", "plain?", "*\n"] {
            let expected = names
                .0
                .iter()
                .enumerate()
                .filter(|(_, n)| match pattern {
                    "?" => n.chars().count() == 1,
                    "*" => true,
                    "plain" => n.as_str() == "plain",
                    "plain?" => n.as_str() == "plain\n",
                    _ => n.ends_with('\n'),
                })
                .map(|(i, _)| i + 1)
                .collect::<Vec<_>>();
            let address = format!("$.({})", json!(pattern));
            let result = resolve_address(&address, &names, &ResolveOptions::default());
            assert!(result.errors.is_empty(), "{:?}", result.errors);
            assert_eq!(result.bindings, expected, "{pattern}");
        }
    }
    #[test]
    fn unicode_default_casing_and_exact_identity_keep_native_profile_boundary() {
        let ns = Names(vec![]);
        for case in fixtures()["mapping_cases"]
            .as_array()
            .expect("mapping cases")
        {
            if case["locale"] != "default" {
                continue;
            }
            let query = format!(
                "from $\nselect {}({})",
                case["operation"].as_str().expect("op"),
                case["input"]
            );
            let result = evaluate_query(&query, &ns, &EvaluateOptions::default());
            assert!(result.is_ok(), "{:?}", result.errors);
            assert_eq!(
                result.results[0].value,
                EvaluatedValue::Scalar(Value::String(
                    case["expected"].as_str().expect("expected").to_owned()
                )),
                "{}",
                case["id"]
            );
        }
        for pair in fixtures()["identity_pairs"]
            .as_array()
            .expect("identity pairs")
        {
            assert!(
                !crate::value_semantics::equal(
                    &Value::String(pair["left"].as_str().expect("left").to_owned()),
                    &Value::String(pair["right"].as_str().expect("right").to_owned()),
                    Profile::Default
                )
                .expect("equality")
            );
        }
        for id in ["tr", "az", "aeon.value.string.intl.tr.v1"] {
            let error = Profile::from_id(id)
                .expect_err("native locale profiles must not silently fall back");
            assert_eq!(error.reason, "unsupported_profile");
        }
    }
}

//! Proposal-stage SANSA.Mutate structured request and plan types.
//!
//! This module intentionally contains no planner or apply implementation. It
//! establishes the immutable, host-neutral type boundary needed by the direct
//! experimental CTS harness without advertising SANSA.Mutate support.

use crate::Diagnostic;
use crate::address::Address;
use crate::value_semantics::Value;

/// Current in-process mutation-plan shape.
pub const MUTATION_PLAN_VERSION: &str = "sansa.mutate.plan.v1";

/// Recursive, order-preserving structured value carried by a mutation request.
///
/// Runtime strings remain data. Consumers must not reinterpret them as AEON,
/// SANSA Address, or SANSA Instruction source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationValue {
    /// Plain host null with no invented AEON null reason.
    Null,
    /// One validated host-neutral AEON/SANSA scalar family.
    Scalar(MutationScalar),
    /// Ordered positional values.
    Sequence(Vec<MutationValue>),
    /// Ordered named fields. Duplicate names remain visible to later
    /// validation rather than being overwritten during request construction.
    Object(Vec<(String, MutationValue)>),
}

impl MutationValue {
    /// Validate and wrap one scalar value family.
    pub fn try_scalar(value: Value) -> Result<Self, MutationScalarError> {
        MutationScalar::try_from(value).map(Self::Scalar)
    }
}

/// AEON/SANSA value known not to contain a structural container, a missing
/// sentinel, or a binding set.
///
/// The inner value is private so callers cannot bypass [`MutationValue`]'s
/// order- and duplicate-preserving structural variants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationScalar(Value);

impl MutationScalar {
    /// Borrow the validated scalar value.
    #[must_use]
    pub const fn as_value(&self) -> &Value {
        &self.0
    }

    /// Consume the wrapper and recover the scalar value.
    #[must_use]
    pub fn into_value(self) -> Value {
        self.0
    }
}

impl TryFrom<Value> for MutationScalar {
    type Error = MutationScalarError;

    fn try_from(value: Value) -> Result<Self, Self::Error> {
        let error = match &value {
            Value::Container { .. } => Some(MutationScalarError::Container),
            Value::Missing => Some(MutationScalarError::Missing),
            Value::BindingSet => Some(MutationScalarError::BindingSet),
            _ => None,
        };
        error.map_or_else(|| Ok(Self(value)), Err)
    }
}

impl From<MutationScalar> for Value {
    fn from(value: MutationScalar) -> Self {
        value.into_value()
    }
}

/// Reason a shared value cannot enter the mutation scalar branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MutationScalarError {
    /// Structural values must use the ordered mutation tree.
    Container,
    /// Missing is an evaluator sentinel, not supplied mutation data.
    Missing,
    /// Binding sets are evaluator results, not supplied mutation data.
    BindingSet,
}

impl std::fmt::Display for MutationScalarError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Container => {
                "structural values must use MutationValue::Sequence or MutationValue::Object"
            }
            Self::Missing => "Value::Missing is not supplied mutation data",
            Self::BindingSet => "Value::BindingSet is not supplied mutation data",
        })
    }
}

impl std::error::Error for MutationScalarError {}

/// Inert request or operation provenance.
///
/// Provenance is retained for inspection and diagnostics. It does not grant
/// authority and must not select policy, validation, or runtime behavior.
pub type MutationProvenance = MutationValue;

/// Address supplied to a structured mutation request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationAddressInput {
    /// Address source that the planner must parse.
    Source(String),
    /// Address already parsed by the shared SANSA Address implementation.
    Parsed(Address),
}

impl From<String> for MutationAddressInput {
    fn from(value: String) -> Self {
        Self::Source(value)
    }
}

impl From<&str> for MutationAddressInput {
    fn from(value: &str) -> Self {
        Self::Source(value.to_owned())
    }
}

impl From<Address> for MutationAddressInput {
    fn from(value: Address) -> Self {
        Self::Parsed(value)
    }
}

/// Closed structured mutation request envelope.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MutationRequest {
    /// Requested operations in deterministic plan order.
    pub operations: Vec<RequestedMutationOperation>,
    /// Read-only conditions that must hold during planning.
    pub preconditions: Vec<RequestedMutationPrecondition>,
    /// Optional inert request provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Read-only mutation precondition supplied by a caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedMutationPrecondition {
    /// SANSA.Query expression source evaluated as a predicate.
    pub expression: String,
    /// Optional exact binding against which the predicate is evaluated.
    pub target: Option<MutationAddressInput>,
}

/// Closed conservative SANSA.Mutate operation vocabulary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequestedMutationOperation {
    /// Add one named binding to an exact existing parent.
    Create(RequestedCreateOperation),
    /// Replace one exact existing binding value.
    Replace(RequestedReplaceOperation),
    /// Remove one exact existing binding.
    Remove(RequestedRemoveOperation),
    /// Insert one value into an exact ordered container.
    Insert(RequestedInsertOperation),
    /// Move one binding within its existing ordered container.
    Move(RequestedMoveOperation),
}

impl RequestedMutationOperation {
    /// Stable operation identifier used by plans and diagnostics.
    #[must_use]
    pub const fn kind(&self) -> MutationOperationKind {
        match self {
            Self::Create(_) => MutationOperationKind::Create,
            Self::Replace(_) => MutationOperationKind::Replace,
            Self::Remove(_) => MutationOperationKind::Remove,
            Self::Insert(_) => MutationOperationKind::Insert,
            Self::Move(_) => MutationOperationKind::Move,
        }
    }
}

/// Conservative mutation operation identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MutationOperationKind {
    /// Add a named binding to an existing parent.
    Create,
    /// Replace the value of an existing binding.
    Replace,
    /// Remove an existing binding.
    Remove,
    /// Insert a value into an ordered container.
    Insert,
    /// Move an existing binding within its ordered container.
    Move,
}

impl MutationOperationKind {
    /// Canonical lower-case operation spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Replace => "replace",
            Self::Remove => "remove",
            Self::Insert => "insert",
            Self::Move => "move",
        }
    }
}

/// Optional semantic and representation intent for a supplied value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationValueIntent {
    /// Structured semantic value; never executable source text.
    pub value: MutationValue,
    /// Optional semantic datatype intent.
    pub datatype: Option<String>,
    /// Optional representation or literal-family intent.
    pub kind: Option<String>,
}

/// Requested create operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedCreateOperation {
    /// Exact existing parent binding.
    pub parent: MutationAddressInput,
    /// New exposed member name.
    pub name: String,
    /// Supplied value and optional datatype/kind intent.
    pub value: MutationValueIntent,
    /// Optional inert operation provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Requested replace operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedReplaceOperation {
    /// Exact existing target binding.
    pub target: MutationAddressInput,
    /// Supplied value and optional datatype/kind intent.
    pub value: MutationValueIntent,
    /// Optional inert operation provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Requested remove operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedRemoveOperation {
    /// Exact existing target binding.
    pub target: MutationAddressInput,
    /// Optional inert operation provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Requested insert operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedInsertOperation {
    /// Exact existing ordered container.
    pub container: MutationAddressInput,
    /// Requested placement within the container.
    pub placement: RequestedMutationPlacement,
    /// Supplied value and optional datatype/kind intent.
    pub value: MutationValueIntent,
    /// Optional inert operation provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Requested same-container move operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedMoveOperation {
    /// Exact existing source binding.
    pub source: MutationAddressInput,
    /// Exact existing ordered container.
    pub container: MutationAddressInput,
    /// Requested placement within the container.
    pub placement: RequestedMutationPlacement,
    /// Optional inert operation provenance.
    pub provenance: Option<MutationProvenance>,
}

/// Placement supplied by a mutation request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequestedMutationPlacement {
    /// Place at the beginning of the ordered container.
    First,
    /// Place at the end of the ordered container.
    Last,
    /// Place immediately before an exact anchor.
    Before(MutationAddressInput),
    /// Place immediately after an exact anchor.
    After(MutationAddressInput),
}

/// Optional resource ceilings for planning or apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MutationBudget {
    /// Maximum requested operations.
    pub max_operations: Option<usize>,
    /// Maximum preconditions.
    pub max_preconditions: Option<usize>,
    /// Maximum nodes across supplied value trees.
    pub max_value_nodes: Option<usize>,
    /// Maximum supplied value-tree depth; scalar values have depth one.
    pub max_value_depth: Option<usize>,
    /// Maximum supplied string payload length.
    pub max_string_length: Option<usize>,
}

/// Exact binding reference captured during planning.
///
/// `Binding` is already an opaque host handle in the Rust namespace contract.
/// `State` optionally carries a host revision or equivalent continuity token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationTarget<Binding, State = ()> {
    /// Address spelling supplied by the caller.
    pub requested_address: String,
    /// Canonical address resolved at planning time.
    pub canonical_address: String,
    /// Parsed exact SANSA address.
    pub address: Address,
    /// Live host binding retained by this in-process plan.
    pub binding: Binding,
    /// Optional host continuity token observed during planning.
    pub observed_state: Option<State>,
    /// Non-portable-but-locally-accepted Address diagnostics.
    pub portability_warnings: Vec<Diagnostic>,
}

/// Placement after exact anchors have been resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationPlacement<Binding, State = ()> {
    /// Place at the beginning of the ordered container.
    First,
    /// Place at the end of the ordered container.
    Last,
    /// Place immediately before the retained exact anchor.
    Before(MutationTarget<Binding, State>),
    /// Place immediately after the retained exact anchor.
    After(MutationTarget<Binding, State>),
}

/// Exact mutation operation captured in a plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationOperation<Binding, State = ()> {
    /// Planned create intent.
    Create {
        /// Exact existing parent.
        parent: MutationTarget<Binding, State>,
        /// New exposed member name.
        name: String,
        /// Supplied value and optional datatype/kind intent.
        value: MutationValueIntent,
        /// Optional inert operation provenance.
        provenance: Option<MutationProvenance>,
    },
    /// Planned replace intent.
    Replace {
        /// Exact existing target.
        target: MutationTarget<Binding, State>,
        /// Supplied value and optional datatype/kind intent.
        value: MutationValueIntent,
        /// Optional inert operation provenance.
        provenance: Option<MutationProvenance>,
    },
    /// Planned remove intent.
    Remove {
        /// Exact existing target.
        target: MutationTarget<Binding, State>,
        /// Optional inert operation provenance.
        provenance: Option<MutationProvenance>,
    },
    /// Planned ordered insert intent.
    Insert {
        /// Exact existing ordered container.
        container: MutationTarget<Binding, State>,
        /// Resolved placement.
        placement: MutationPlacement<Binding, State>,
        /// Supplied value and optional datatype/kind intent.
        value: MutationValueIntent,
        /// Optional inert operation provenance.
        provenance: Option<MutationProvenance>,
    },
    /// Planned same-container move intent.
    Move {
        /// Exact existing source binding.
        source: MutationTarget<Binding, State>,
        /// Exact existing ordered container.
        container: MutationTarget<Binding, State>,
        /// Resolved placement.
        placement: MutationPlacement<Binding, State>,
        /// Optional inert operation provenance.
        provenance: Option<MutationProvenance>,
    },
}

impl<Binding, State> MutationOperation<Binding, State> {
    /// Stable operation identifier used by plans and diagnostics.
    #[must_use]
    pub const fn kind(&self) -> MutationOperationKind {
        match self {
            Self::Create { .. } => MutationOperationKind::Create,
            Self::Replace { .. } => MutationOperationKind::Replace,
            Self::Remove { .. } => MutationOperationKind::Remove,
            Self::Insert { .. } => MutationOperationKind::Insert,
            Self::Move { .. } => MutationOperationKind::Move,
        }
    }
}

/// Preconditions retained by a successful mutation plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationPrecondition<Binding, State = ()> {
    /// Expression spelling supplied by the caller.
    pub expression: String,
    /// Canonical Query expression.
    pub canonical: String,
    /// Optional exact target retained for candidate-scoped evaluation.
    pub target: Option<MutationTarget<Binding, State>>,
}

/// Immutable current-process SANSA mutation plan.
///
/// A plan retains live host bindings and is not a portable serialization or a
/// grant of mutation authority.
///
/// Planner-owned storage is private. Consumers can inspect it through
/// read-only accessors but cannot rewrite validated operations:
///
/// ```compile_fail
/// use sansa_runtime::mutate::MutationPlan;
///
/// fn rewrite<Binding>(plan: &mut MutationPlan<Binding>) {
///     plan.operations.clear();
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationPlan<Binding, State = (), NamespaceState = ()> {
    /// Stable current plan-shape identifier.
    plan_version: &'static str,
    /// Optional consumer-assigned plan identifier.
    plan_id: Option<String>,
    /// Optional host namespace state observed during planning.
    namespace_state: Option<NamespaceState>,
    /// Exact operations in deterministic plan order.
    operations: Vec<MutationOperation<Binding, State>>,
    /// Preconditions evaluated against the planning snapshot.
    preconditions: Vec<MutationPrecondition<Binding, State>>,
    /// Optional inert request provenance.
    source_provenance: Option<MutationProvenance>,
    /// Aggregated non-portability diagnostics.
    portability_warnings: Vec<Diagnostic>,
    /// Non-error diagnostics produced during planning.
    diagnostics: Vec<MutationDiagnostic>,
}

impl<Binding, State, NamespaceState> MutationPlan<Binding, State, NamespaceState> {
    /// Stable shape identifier for this plan.
    #[must_use]
    pub const fn plan_version(&self) -> &'static str {
        self.plan_version
    }

    /// Optional consumer-assigned plan identifier.
    #[must_use]
    pub fn plan_id(&self) -> Option<&str> {
        self.plan_id.as_deref()
    }

    /// Optional host namespace state observed during planning.
    #[must_use]
    pub const fn namespace_state(&self) -> Option<&NamespaceState> {
        self.namespace_state.as_ref()
    }

    /// Validated operations in deterministic plan order.
    #[must_use]
    pub fn operations(&self) -> &[MutationOperation<Binding, State>] {
        &self.operations
    }

    /// Preconditions evaluated against the planning snapshot.
    #[must_use]
    pub fn preconditions(&self) -> &[MutationPrecondition<Binding, State>] {
        &self.preconditions
    }

    /// Optional inert request provenance.
    #[must_use]
    pub const fn source_provenance(&self) -> Option<&MutationProvenance> {
        self.source_provenance.as_ref()
    }

    /// Aggregated non-portability diagnostics.
    #[must_use]
    pub fn portability_warnings(&self) -> &[Diagnostic] {
        &self.portability_warnings
    }

    /// Non-error diagnostics produced during planning.
    #[must_use]
    pub fn diagnostics(&self) -> &[MutationDiagnostic] {
        &self.diagnostics
    }
}

/// Mutate-specific phase retained on normalized diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MutationPhase {
    /// Side-effect-free request validation and plan construction.
    Plan,
    /// Trusted consumer policy or authorization evaluation.
    Policy,
    /// Target-surface representability validation.
    Target,
    /// Host-adapter application.
    Apply,
}

/// Normalized diagnostic context for proposal-stage SANSA.Mutate surfaces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MutationDiagnostic {
    /// Stable SANSA.Mutate diagnostic code.
    pub code: String,
    /// Human-readable diagnostic summary.
    pub message: String,
    /// Mutation phase producing the diagnostic.
    pub phase: MutationPhase,
    /// Operation index, when one operation caused the diagnostic.
    pub operation_index: Option<usize>,
    /// Budget name associated with resource exhaustion.
    pub budget: Option<String>,
    /// Configured budget ceiling.
    pub limit: Option<usize>,
    /// Observed value that exceeded the ceiling.
    pub observed: Option<usize>,
    /// Unsupported closed-envelope field, when applicable.
    pub request_field: Option<String>,
    /// Unsupported operation field, when applicable.
    pub operation_field: Option<String>,
    /// Selected target surface, when applicable.
    pub target_format: Option<String>,
    /// Datatype intent associated with a target failure.
    pub datatype: Option<String>,
    /// Path into a supplied structured value.
    pub value_path: Option<String>,
}

impl MutationDiagnostic {
    /// Create a mutation diagnostic without optional context.
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>, phase: MutationPhase) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            phase,
            operation_index: None,
            budget: None,
            limit: None,
            observed: None,
            request_field: None,
            operation_field: None,
            target_format: None,
            datatype: None,
            value_path: None,
        }
    }
}

/// Result envelope reserved for the future side-effect-free planner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlanMutationResult<Binding, State = (), NamespaceState = ()> {
    /// Complete immutable plan; no operations have been applied.
    Planned(MutationPlan<Binding, State, NamespaceState>),
    /// Planning failed atomically and produced no executable plan.
    Rejected(Vec<MutationDiagnostic>),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value_semantics::Value;

    #[test]
    fn operation_vocabulary_is_closed_and_canonical() {
        let value = MutationValueIntent {
            value: MutationValue::try_scalar(Value::String("B-200".into()))
                .expect("string is scalar"),
            datatype: Some("string".into()),
            kind: None,
        };
        let operation = RequestedMutationOperation::Replace(RequestedReplaceOperation {
            target: "$.inventory.sku".into(),
            value,
            provenance: None,
        });

        assert_eq!(operation.kind(), MutationOperationKind::Replace);
        assert_eq!(operation.kind().as_str(), "replace");
    }

    #[test]
    fn structured_values_preserve_field_order_and_duplicates() {
        let value = MutationValue::Object(vec![
            (
                "second".into(),
                MutationValue::try_scalar(Value::String("B".into())).expect("string is scalar"),
            ),
            (
                "first".into(),
                MutationValue::try_scalar(Value::String("A".into())).expect("string is scalar"),
            ),
            ("second".into(), MutationValue::Null),
        ]);

        let MutationValue::Object(fields) = value else {
            panic!("expected object value");
        };
        assert_eq!(fields[0].0, "second");
        assert_eq!(fields[1].0, "first");
        assert_eq!(fields[2].0, "second");
    }

    #[test]
    fn diagnostic_context_is_not_invented() {
        let diagnostic = MutationDiagnostic::new(
            "SANSA_MUTATE_INVALID_REQUEST",
            "Expected a structured request",
            MutationPhase::Plan,
        );

        assert_eq!(diagnostic.operation_index, None);
        assert_eq!(diagnostic.budget, None);
        assert_eq!(diagnostic.target_format, None);
        assert_eq!(diagnostic.value_path, None);
    }

    #[test]
    fn mutation_scalar_rejects_structural_and_evaluator_only_values() {
        assert_eq!(
            MutationScalar::try_from(Value::Container {
                kind: "object".into(),
                payload: crate::value_semantics::ContainerValue::Null,
            }),
            Err(MutationScalarError::Container)
        );
        assert_eq!(
            MutationScalar::try_from(Value::Missing),
            Err(MutationScalarError::Missing)
        );
        assert_eq!(
            MutationScalar::try_from(Value::BindingSet),
            Err(MutationScalarError::BindingSet)
        );
        assert!(MutationScalar::try_from(Value::Nan).is_ok());
        assert!(
            MutationScalar::try_from(Value::ExplicitAbsence {
                reason: "redacted".into(),
            })
            .is_ok()
        );
    }
}

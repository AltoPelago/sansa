//! Proposal-stage, side-effect-free SANSA.Mutate planning.
//!
//! The planner retains exact opaque host bindings in an immutable in-process
//! plan. It exposes no mutation hook and does not apply operations.

// Planning failures are immediately normalized into the public structured
// diagnostic. Keeping that envelope inline avoids a parallel internal error
// model and only crosses cold failure paths.
#![allow(clippy::result_large_err)]

use crate::address::{
    Address, MAX_POSITION_INDEX, ParseOptions as AddressParseOptions, parse_address_with_options,
    render_address,
};
use crate::evaluate::{EvaluateOptions, EvaluatedValue, evaluate_expression};
use crate::query::{ParseLimits, parse_expression_with_address_options, render_expression};
use crate::resolve::{Namespace, Navigation, ResolveOptions, resolve_parsed_address};
use crate::value_semantics::Value;
use crate::{Diagnostic, DiagnosticPhase};

/// Current in-process mutation-plan shape.
pub const MUTATION_PLAN_VERSION: &str = "sansa.mutate.plan.v1";

/// Fail-closed default for bindings materialized by one precondition
/// resolution when the caller does not provide a stricter Resolve ceiling.
pub const DEFAULT_PRECONDITION_MAX_BINDINGS: usize = 100_000;

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

/// Side-effect-free mutation planner settings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanMutationOptions<Binding> {
    /// Resolve settings shared with SANSA Resolve.
    pub resolve: ResolveOptions<Binding>,
    /// Value-semantics profile used by Query preconditions.
    pub value_semantics: crate::value_semantics::Profile,
    /// Resource ceilings applied before target resolution.
    pub budget: MutationBudget,
    /// Locally accepted positional index ceiling. Values above the portable
    /// Address ceiling remain visible as plan portability warnings.
    pub max_position_index: usize,
    /// Optional consumer-assigned in-process plan identifier.
    pub plan_id: Option<String>,
}

impl<Binding> Default for PlanMutationOptions<Binding> {
    fn default() -> Self {
        Self {
            resolve: ResolveOptions::default(),
            value_semantics: crate::value_semantics::Profile::Default,
            budget: MutationBudget::default(),
            max_position_index: MAX_POSITION_INDEX,
            plan_id: None,
        }
    }
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
    /// Non-portable-but-locally-accepted addresses embedded in the expression.
    pub portability_warnings: Vec<Diagnostic>,
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
    /// Precondition index, when one precondition caused the diagnostic.
    pub precondition_index: Option<usize>,
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
            precondition_index: None,
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

/// Result of side-effect-free mutation planning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlanMutationResult<Binding, State = (), NamespaceState = ()> {
    /// Complete immutable plan; no operations have been applied.
    Planned(MutationPlan<Binding, State, NamespaceState>),
    /// Planning failed atomically and produced no executable plan.
    Rejected(Vec<MutationDiagnostic>),
}

/// Build an immutable exact-target mutation plan without invoking any host
/// mutation capability.
#[must_use]
pub fn plan_mutation<N: Namespace>(
    request: &MutationRequest,
    namespace: &N,
    options: &PlanMutationOptions<N::Binding>,
) -> PlanMutationResult<N::Binding> {
    if let Some(error) = budget_error(
        "maxOperations",
        options.budget.max_operations,
        request.operations.len(),
        None,
    ) {
        return PlanMutationResult::Rejected(vec![error]);
    }
    if let Some(error) = budget_error(
        "maxPreconditions",
        options.budget.max_preconditions,
        request.preconditions.len(),
        None,
    ) {
        return PlanMutationResult::Rejected(vec![error]);
    }
    if let Some(error) = mutation_value_budget_error(&request.operations, options.budget) {
        return PlanMutationResult::Rejected(vec![error]);
    }

    let mut operations = Vec::with_capacity(request.operations.len());
    let mut destructive_targets: Vec<N::Binding> = Vec::new();
    let mut creates: Vec<(N::Binding, String)> = Vec::new();
    for (operation_index, requested) in request.operations.iter().enumerate() {
        let operation = match plan_operation(requested, operation_index, namespace, options) {
            Ok(operation) => operation,
            Err(error) => return PlanMutationResult::Rejected(vec![error]),
        };
        if let Err(error) = check_plan_conflict(
            &operation,
            operation_index,
            &mut destructive_targets,
            &mut creates,
        ) {
            return PlanMutationResult::Rejected(vec![error]);
        }
        operations.push(operation);
    }

    let mut preconditions = Vec::with_capacity(request.preconditions.len());
    for (precondition_index, requested) in request.preconditions.iter().enumerate() {
        match plan_precondition(requested, precondition_index, namespace, options) {
            Ok(precondition) => preconditions.push(precondition),
            Err(error) => return PlanMutationResult::Rejected(vec![error]),
        }
    }

    let portability_warnings = operations
        .iter()
        .flat_map(operation_targets)
        .flat_map(|target| target.portability_warnings.iter().cloned())
        .chain(preconditions.iter().flat_map(|precondition| {
            precondition
                .target
                .iter()
                .flat_map(|target| target.portability_warnings.iter())
                .chain(precondition.portability_warnings.iter())
                .cloned()
        }))
        .collect();

    PlanMutationResult::Planned(MutationPlan {
        plan_version: MUTATION_PLAN_VERSION,
        plan_id: options.plan_id.clone(),
        namespace_state: None,
        operations,
        preconditions,
        source_provenance: request.provenance.clone(),
        portability_warnings,
        diagnostics: Vec::new(),
    })
}

fn plan_operation<N: Namespace>(
    requested: &RequestedMutationOperation,
    operation_index: usize,
    namespace: &N,
    options: &PlanMutationOptions<N::Binding>,
) -> Result<MutationOperation<N::Binding>, MutationDiagnostic> {
    match requested {
        RequestedMutationOperation::Create(requested) => {
            let parent = resolve_exact_target(
                &requested.parent,
                "parent",
                operation_index,
                namespace,
                options,
            )?;
            if !is_container(namespace, &parent.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_PARENT_NOT_CONTAINER",
                    format!(
                        "Create parent {} is not a container binding",
                        parent.canonical_address
                    ),
                    operation_index,
                ));
            }
            if requested.name.is_empty() {
                return Err(operation_error(
                    "SANSA_MUTATE_INVALID_NAME",
                    "Create requires a non-empty string name",
                    operation_index,
                ));
            }
            if namespace
                .children(&parent.binding)
                .iter()
                .any(|child| namespace.name(child).as_deref() == Some(&requested.name))
            {
                return Err(operation_error(
                    "SANSA_MUTATE_TARGET_EXISTS",
                    format!(
                        "Create target '{}' already exists under {}",
                        requested.name, parent.canonical_address
                    ),
                    operation_index,
                ));
            }
            Ok(MutationOperation::Create {
                parent,
                name: requested.name.clone(),
                value: normalize_value_intent(&requested.value, operation_index)?,
                provenance: requested.provenance.clone(),
            })
        }
        RequestedMutationOperation::Replace(requested) => Ok(MutationOperation::Replace {
            target: resolve_exact_target(
                &requested.target,
                "target",
                operation_index,
                namespace,
                options,
            )?,
            value: normalize_value_intent(&requested.value, operation_index)?,
            provenance: requested.provenance.clone(),
        }),
        RequestedMutationOperation::Remove(requested) => {
            let target = resolve_exact_target(
                &requested.target,
                "target",
                operation_index,
                namespace,
                options,
            )?;
            if namespace.root().as_ref() == Some(&target.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN",
                    "The conservative mutation core does not remove the namespace root",
                    operation_index,
                ));
            }
            Ok(MutationOperation::Remove {
                target,
                provenance: requested.provenance.clone(),
            })
        }
        RequestedMutationOperation::Insert(requested) => {
            let container = resolve_exact_target(
                &requested.container,
                "container",
                operation_index,
                namespace,
                options,
            )?;
            if !is_ordered_container(namespace, &container.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_CONTAINER_NOT_ORDERED",
                    format!(
                        "Insert container {} is not an ordered container binding",
                        container.canonical_address
                    ),
                    operation_index,
                ));
            }
            let placement = resolve_placement(
                &requested.placement,
                &container,
                operation_index,
                namespace,
                options,
            )?;
            Ok(MutationOperation::Insert {
                container,
                placement,
                value: normalize_value_intent(&requested.value, operation_index)?,
                provenance: requested.provenance.clone(),
            })
        }
        RequestedMutationOperation::Move(requested) => {
            let source = resolve_exact_target(
                &requested.source,
                "source",
                operation_index,
                namespace,
                options,
            )?;
            let container = resolve_exact_target(
                &requested.container,
                "container",
                operation_index,
                namespace,
                options,
            )?;
            if !is_ordered_container(namespace, &container.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_CONTAINER_NOT_ORDERED",
                    format!(
                        "Move container {} is not an ordered container binding",
                        container.canonical_address
                    ),
                    operation_index,
                ));
            }
            if !is_direct_child(namespace, &source.binding, &container.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_INVALID_MOVE_CONTAINER",
                    "The conservative mutation core only moves bindings within their current ordered container",
                    operation_index,
                ));
            }
            let placement = resolve_placement(
                &requested.placement,
                &container,
                operation_index,
                namespace,
                options,
            )?;
            if placement_target(&placement).is_some_and(|anchor| anchor.binding == source.binding) {
                return Err(operation_error(
                    "SANSA_MUTATE_INVALID_MOVE_ANCHOR",
                    "Move placement anchor must not be the moved source binding",
                    operation_index,
                ));
            }
            Ok(MutationOperation::Move {
                source,
                container,
                placement,
                provenance: requested.provenance.clone(),
            })
        }
    }
}

fn normalize_value_intent(
    intent: &MutationValueIntent,
    operation_index: usize,
) -> Result<MutationValueIntent, MutationDiagnostic> {
    let datatype = normalize_intent_label(
        intent.datatype.as_deref(),
        "SANSA_MUTATE_INVALID_DATATYPE",
        "Mutation datatype",
        operation_index,
    )?;
    let kind = normalize_intent_label(
        intent.kind.as_deref(),
        "SANSA_MUTATE_INVALID_KIND",
        "Mutation kind",
        operation_index,
    )?;
    Ok(MutationValueIntent {
        value: intent.value.clone(),
        datatype,
        kind,
    })
}

fn normalize_intent_label(
    value: Option<&str>,
    code: &str,
    label: &str,
    operation_index: usize,
) -> Result<Option<String>, MutationDiagnostic> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Err(operation_error(
            code,
            format!("{label} must be a non-empty string when provided"),
            operation_index,
        ));
    }
    Ok(Some(value.to_owned()))
}

fn resolve_placement<N: Namespace>(
    requested: &RequestedMutationPlacement,
    container: &MutationTarget<N::Binding>,
    operation_index: usize,
    namespace: &N,
    options: &PlanMutationOptions<N::Binding>,
) -> Result<MutationPlacement<N::Binding>, MutationDiagnostic> {
    let (input, before) = match requested {
        RequestedMutationPlacement::First => return Ok(MutationPlacement::First),
        RequestedMutationPlacement::Last => return Ok(MutationPlacement::Last),
        RequestedMutationPlacement::Before(input) => (input, true),
        RequestedMutationPlacement::After(input) => (input, false),
    };
    let anchor = resolve_exact_target(input, "anchor", operation_index, namespace, options)?;
    if !is_direct_child(namespace, &anchor.binding, &container.binding) {
        return Err(operation_error(
            "SANSA_MUTATE_INVALID_ANCHOR",
            "Ordered insertion and movement anchors must be direct children of the target container",
            operation_index,
        ));
    }
    Ok(if before {
        MutationPlacement::Before(anchor)
    } else {
        MutationPlacement::After(anchor)
    })
}

fn resolve_exact_target<N: Namespace>(
    input: &MutationAddressInput,
    role: &str,
    operation_index: usize,
    namespace: &N,
    options: &PlanMutationOptions<N::Binding>,
) -> Result<MutationTarget<N::Binding>, MutationDiagnostic> {
    let parse_options = AddressParseOptions {
        max_position_index: options.max_position_index,
    };
    let (requested_address, address, warnings) = match input {
        MutationAddressInput::Source(source) => {
            let parsed = parse_address_with_options(source, parse_options).map_err(|error| {
                operation_error(
                    "SANSA_MUTATE_INVALID_TARGET",
                    format!(
                        "{role} address is not a valid SANSA address: {}",
                        error.message
                    ),
                    operation_index,
                )
            })?;
            let warnings = parsed
                .warnings
                .into_iter()
                .map(address_warning_diagnostic)
                .collect();
            (source.clone(), parsed.address, warnings)
        }
        MutationAddressInput::Parsed(address) => {
            let source = render_address(address);
            let parsed = parse_address_with_options(&source, parse_options).map_err(|error| {
                operation_error(
                    "SANSA_MUTATE_INVALID_TARGET",
                    format!(
                        "{role} address is not valid under the planner's Address limits: {}",
                        error.message
                    ),
                    operation_index,
                )
            })?;
            let warnings = parsed
                .warnings
                .into_iter()
                .map(address_warning_diagnostic)
                .collect();
            (source, parsed.address, warnings)
        }
    };
    if !address.is_exact {
        return Err(operation_error(
            "SANSA_MUTATE_NON_EXACT_TARGET",
            format!("{role} address must be exact"),
            operation_index,
        ));
    }
    let resolved = resolve_parsed_address(&address, namespace, &options.resolve);
    if !resolved.errors.is_empty() {
        return Err(operation_error(
            "SANSA_MUTATE_TARGET_RESOLUTION_FAILED",
            format!("{role} address failed to resolve"),
            operation_index,
        ));
    }
    let mut bindings = resolved.bindings.into_iter();
    let Some(binding) = bindings.next() else {
        return Err(operation_error(
            "SANSA_MUTATE_TARGET_MISS",
            format!("{role} address resolved no bindings"),
            operation_index,
        ));
    };
    if bindings.next().is_some() {
        return Err(operation_error(
            "SANSA_MUTATE_TARGET_MULTIPLICITY",
            format!("{role} address resolved multiple bindings"),
            operation_index,
        ));
    }
    let canonical_address = namespace
        .binding_address(&binding)
        .unwrap_or_else(|| address.canonical.clone());
    Ok(MutationTarget {
        requested_address,
        canonical_address,
        address,
        binding,
        observed_state: None,
        portability_warnings: warnings,
    })
}

fn address_warning_diagnostic(warning: crate::address::ParseWarning) -> Diagnostic {
    let mut diagnostic = Diagnostic::new(warning.code, warning.message);
    diagnostic.phase = Some(DiagnosticPhase::Parse);
    diagnostic
}

fn plan_precondition<N: Namespace>(
    requested: &RequestedMutationPrecondition,
    precondition_index: usize,
    namespace: &N,
    options: &PlanMutationOptions<N::Binding>,
) -> Result<MutationPrecondition<N::Binding>, MutationDiagnostic> {
    let (expression, portability_warnings) = parse_expression_with_address_options(
        &requested.expression,
        ParseLimits::default(),
        AddressParseOptions {
            max_position_index: options.max_position_index,
        },
    )
    .map_err(|error| {
        precondition_error(
            "SANSA_MUTATE_INVALID_PRECONDITION",
            format!(
                "Mutation precondition expression is not valid: {}",
                error.message
            ),
            precondition_index,
        )
    })?;
    let portability_warnings = portability_warnings
        .into_iter()
        .map(address_warning_diagnostic)
        .collect();
    let target = match requested.target.as_ref() {
        Some(input) => Some(
            resolve_exact_target(input, "precondition target", 0, namespace, options).map_err(
                |error| {
                    precondition_error(
                        "SANSA_MUTATE_INVALID_PRECONDITION",
                        error.message,
                        precondition_index,
                    )
                },
            )?,
        ),
        None => None,
    };
    let binding = match target.as_ref() {
        Some(target) => target.binding.clone(),
        None => namespace.root().ok_or_else(|| {
            precondition_error(
                "SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED",
                "Mutation namespace does not expose a root binding",
                precondition_index,
            )
        })?,
    };
    let mut precondition_resolve = options.resolve.clone();
    precondition_resolve.max_bindings = Some(
        precondition_resolve
            .max_bindings
            .unwrap_or(DEFAULT_PRECONDITION_MAX_BINDINGS),
    );
    let evaluate_options = EvaluateOptions {
        resolve: precondition_resolve,
        profile: options.value_semantics,
        ..EvaluateOptions::default()
    };
    let evaluated = evaluate_expression(&expression, &binding, namespace, &evaluate_options)
        .map_err(|error| precondition_evaluation_error(error, precondition_index))?;
    match evaluated {
        EvaluatedValue::Scalar(Value::Boolean(true)) => {}
        EvaluatedValue::Scalar(Value::Boolean(false)) => {
            return Err(precondition_error(
                "SANSA_MUTATE_PRECONDITION_FAILED",
                "Mutation precondition evaluated false",
                precondition_index,
            ));
        }
        _ => {
            return Err(precondition_error(
                "SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED",
                "Mutation precondition must evaluate to a Boolean",
                precondition_index,
            ));
        }
    }
    Ok(MutationPrecondition {
        expression: requested.expression.clone(),
        canonical: render_expression(&expression),
        target,
        portability_warnings,
    })
}

fn precondition_evaluation_error(
    error: Diagnostic,
    precondition_index: usize,
) -> MutationDiagnostic {
    if error.code == "SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED" {
        let mut diagnostic = precondition_error(
            "SANSA_MUTATE_BUDGET_EXCEEDED",
            error.message,
            precondition_index,
        );
        diagnostic.budget = error.budget;
        diagnostic.limit = error.limit;
        diagnostic.observed = error.observed;
        return diagnostic;
    }
    precondition_error(
        "SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED",
        error.message,
        precondition_index,
    )
}

fn check_plan_conflict<Binding: Clone + Eq>(
    operation: &MutationOperation<Binding>,
    operation_index: usize,
    destructive_targets: &mut Vec<Binding>,
    creates: &mut Vec<(Binding, String)>,
) -> Result<(), MutationDiagnostic> {
    match operation {
        MutationOperation::Create { parent, name, .. } => {
            if creates
                .iter()
                .any(|(binding, seen_name)| binding == &parent.binding && seen_name == name)
            {
                return Err(operation_error(
                    "SANSA_MUTATE_DUPLICATE_TARGET",
                    "Plan contains repeated create for the same parent/name",
                    operation_index,
                ));
            }
            creates.push((parent.binding.clone(), name.clone()));
        }
        MutationOperation::Replace { target, .. } | MutationOperation::Remove { target, .. } => {
            add_destructive_target(&target.binding, operation_index, destructive_targets)?;
        }
        MutationOperation::Move { source, .. } => {
            add_destructive_target(&source.binding, operation_index, destructive_targets)?;
        }
        MutationOperation::Insert { .. } => {}
    }
    Ok(())
}

fn add_destructive_target<Binding: Clone + Eq>(
    binding: &Binding,
    operation_index: usize,
    destructive_targets: &mut Vec<Binding>,
) -> Result<(), MutationDiagnostic> {
    if destructive_targets.contains(binding) {
        return Err(operation_error(
            "SANSA_MUTATE_DUPLICATE_TARGET",
            "Plan contains repeated destructive operation for the same binding",
            operation_index,
        ));
    }
    destructive_targets.push(binding.clone());
    Ok(())
}

fn operation_targets<Binding, State>(
    operation: &MutationOperation<Binding, State>,
) -> Vec<&MutationTarget<Binding, State>> {
    match operation {
        MutationOperation::Create { parent, .. } => vec![parent],
        MutationOperation::Replace { target, .. } | MutationOperation::Remove { target, .. } => {
            vec![target]
        }
        MutationOperation::Insert {
            container,
            placement,
            ..
        } => placement_target(placement)
            .map_or_else(|| vec![container], |anchor| vec![container, anchor]),
        MutationOperation::Move {
            source,
            container,
            placement,
            ..
        } => placement_target(placement).map_or_else(
            || vec![source, container],
            |anchor| vec![source, container, anchor],
        ),
    }
}

fn placement_target<Binding, State>(
    placement: &MutationPlacement<Binding, State>,
) -> Option<&MutationTarget<Binding, State>> {
    match placement {
        MutationPlacement::Before(target) | MutationPlacement::After(target) => Some(target),
        MutationPlacement::First | MutationPlacement::Last => None,
    }
}

fn is_direct_child<N: Namespace>(namespace: &N, child: &N::Binding, parent: &N::Binding) -> bool {
    matches!(namespace.parent(child), Navigation::Binding(binding) if binding == *parent)
        || namespace.children(parent).contains(child)
}

fn is_container<N: Namespace>(namespace: &N, binding: &N::Binding) -> bool {
    container_kind(namespace, binding).is_some()
}

fn is_ordered_container<N: Namespace>(namespace: &N, binding: &N::Binding) -> bool {
    matches!(
        container_kind(namespace, binding).as_deref(),
        Some("list" | "tuple" | "node")
    )
}

fn container_kind<N: Namespace>(namespace: &N, binding: &N::Binding) -> Option<String> {
    let representation = namespace
        .representation_kind(binding)
        .map(|kind| kind.to_ascii_lowercase());
    match representation.as_deref() {
        Some("object" | "obj" | "o" | "envelope" | "objectnode") => {
            return Some("object".into());
        }
        Some("list" | "listnode") => return Some("list".into()),
        Some("tuple" | "tupleliteral") => return Some("tuple".into()),
        Some("node" | "nodeliteral") => return Some("node".into()),
        Some("attributespace") => return Some("attributeSpace".into()),
        _ => {}
    }
    let semantic = namespace.semantic_type(binding)?;
    let base = semantic
        .split(['<', '['])
        .next()
        .unwrap_or(&semantic)
        .to_ascii_lowercase();
    match base.as_str() {
        "object" | "obj" | "o" | "envelope" => Some("object".into()),
        "list" | "tuple" | "node" => Some(base),
        _ => None,
    }
}

fn mutation_value_budget_error(
    operations: &[RequestedMutationOperation],
    budget: MutationBudget,
) -> Option<MutationDiagnostic> {
    if budget.max_value_nodes.is_none()
        && budget.max_value_depth.is_none()
        && budget.max_string_length.is_none()
    {
        return None;
    }
    let mut nodes = 0usize;
    let mut deepest = ValueStat::default();
    let mut longest = ValueStat::default();
    for (index, operation) in operations.iter().enumerate() {
        let Some(value) = requested_value(operation) else {
            continue;
        };
        let stats = mutation_value_stats(value, &format!("operations[{index}].value"));
        nodes = nodes.saturating_add(stats.nodes);
        if stats.depth > deepest.depth {
            deepest = stats.clone();
        }
        if stats.string_length > longest.string_length {
            longest = stats;
        }
    }
    budget_error("maxValueNodes", budget.max_value_nodes, nodes, None)
        .or_else(|| {
            budget_error(
                "maxValueDepth",
                budget.max_value_depth,
                deepest.depth,
                deepest.depth_path,
            )
        })
        .or_else(|| {
            budget_error(
                "maxStringLength",
                budget.max_string_length,
                longest.string_length,
                longest.string_path,
            )
        })
}

fn requested_value(operation: &RequestedMutationOperation) -> Option<&MutationValue> {
    match operation {
        RequestedMutationOperation::Create(operation) => Some(&operation.value.value),
        RequestedMutationOperation::Replace(operation) => Some(&operation.value.value),
        RequestedMutationOperation::Insert(operation) => Some(&operation.value.value),
        RequestedMutationOperation::Remove(_) | RequestedMutationOperation::Move(_) => None,
    }
}

#[derive(Debug, Clone, Default)]
struct ValueStat {
    nodes: usize,
    depth: usize,
    depth_path: Option<String>,
    string_length: usize,
    string_path: Option<String>,
}

fn mutation_value_stats(value: &MutationValue, path: &str) -> ValueStat {
    match value {
        MutationValue::Null => ValueStat {
            nodes: 1,
            depth: 1,
            depth_path: Some(path.into()),
            ..ValueStat::default()
        },
        MutationValue::Scalar(value) => {
            let string_length = scalar_string_length(value.as_value());
            ValueStat {
                nodes: 1,
                depth: 1,
                depth_path: Some(path.into()),
                string_length,
                string_path: (string_length > 0).then(|| path.into()),
            }
        }
        MutationValue::Sequence(values) => aggregate_value_stats(
            values
                .iter()
                .enumerate()
                .map(|(index, value)| mutation_value_stats(value, &format!("{path}[{index}]"))),
            path,
        ),
        MutationValue::Object(fields) => aggregate_value_stats(
            fields.iter().map(|(name, value)| {
                mutation_value_stats(value, &format!("{path}{}", value_path_segment(name)))
            }),
            path,
        ),
    }
}

fn aggregate_value_stats(stats: impl Iterator<Item = ValueStat>, path: &str) -> ValueStat {
    let mut output = ValueStat {
        nodes: 1,
        depth: 1,
        depth_path: Some(path.into()),
        ..ValueStat::default()
    };
    let mut child_depth = 0usize;
    for stat in stats {
        output.nodes = output.nodes.saturating_add(stat.nodes);
        if stat.depth > child_depth {
            child_depth = stat.depth;
            output.depth_path = stat.depth_path.clone();
        }
        if stat.string_length > output.string_length {
            output.string_length = stat.string_length;
            output.string_path = stat.string_path;
        }
    }
    output.depth = child_depth.saturating_add(1);
    output
}

fn scalar_string_length(value: &Value) -> usize {
    match value {
        Value::String(value) => value.chars().count(),
        _ => 0,
    }
}

fn value_path_segment(name: &str) -> String {
    let mut chars = name.chars();
    if chars
        .next()
        .is_some_and(|ch| ch.is_ascii_alphabetic() || ch == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        format!(".{name}")
    } else {
        let escaped = name.replace('\\', "\\\\").replace('"', "\\\"");
        format!("[\"{escaped}\"]")
    }
}

fn budget_error(
    budget: &str,
    limit: Option<usize>,
    observed: usize,
    value_path: Option<String>,
) -> Option<MutationDiagnostic> {
    let limit = limit?;
    if observed <= limit {
        return None;
    }
    let mut error = MutationDiagnostic::new(
        "SANSA_MUTATE_BUDGET_EXCEEDED",
        format!("Mutation budget '{budget}' exceeded: limit {limit}, observed {observed}"),
        MutationPhase::Plan,
    );
    error.budget = Some(budget.into());
    error.limit = Some(limit);
    error.observed = Some(observed);
    error.value_path = value_path;
    Some(error)
}

fn operation_error(
    code: impl Into<String>,
    message: impl Into<String>,
    operation_index: usize,
) -> MutationDiagnostic {
    let mut error = MutationDiagnostic::new(code, message, MutationPhase::Plan);
    error.operation_index = Some(operation_index);
    error
}

fn precondition_error(
    code: impl Into<String>,
    message: impl Into<String>,
    precondition_index: usize,
) -> MutationDiagnostic {
    let mut error = MutationDiagnostic::new(code, message, MutationPhase::Plan);
    error.precondition_index = Some(precondition_index);
    error
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value_semantics::Value;

    struct TestNamespace {
        positions: Vec<usize>,
    }

    impl Namespace for TestNamespace {
        type Binding = usize;

        fn root(&self) -> Option<Self::Binding> {
            Some(0)
        }

        fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding> {
            if *binding == 0 {
                (1..=self.positions.len()).collect()
            } else {
                Vec::new()
            }
        }

        fn parent(&self, binding: &Self::Binding) -> Navigation<Self::Binding> {
            if *binding == 0 {
                Navigation::Missing
            } else {
                Navigation::Binding(0)
            }
        }

        fn position(&self, binding: &Self::Binding) -> Option<usize> {
            binding
                .checked_sub(1)
                .and_then(|index| self.positions.get(index).copied())
        }

        fn representation_kind(&self, binding: &Self::Binding) -> Option<String> {
            Some(if *binding == 0 { "sequence" } else { "string" }.into())
        }

        fn value(&self, binding: &Self::Binding) -> Option<Value> {
            (*binding != 0).then(|| Value::String(format!("value-{binding}")))
        }

        fn binding_address(&self, binding: &Self::Binding) -> Option<String> {
            if *binding == 0 {
                Some("$".into())
            } else {
                self.position(binding)
                    .map(|position| format!("$[{position}]"))
            }
        }
    }

    fn remove_request(target: MutationAddressInput) -> MutationRequest {
        MutationRequest {
            operations: vec![RequestedMutationOperation::Remove(
                RequestedRemoveOperation {
                    target,
                    provenance: None,
                },
            )],
            ..MutationRequest::default()
        }
    }

    fn replace_request(target: MutationAddressInput) -> MutationRequest {
        MutationRequest {
            operations: vec![RequestedMutationOperation::Replace(
                RequestedReplaceOperation {
                    target,
                    value: MutationValueIntent {
                        value: MutationValue::try_scalar(Value::String("updated".into()))
                            .expect("string is scalar"),
                        datatype: None,
                        kind: None,
                    },
                    provenance: None,
                },
            )],
            ..MutationRequest::default()
        }
    }

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
        assert_eq!(diagnostic.precondition_index, None);
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

    #[test]
    fn root_remove_guard_uses_the_resolved_binding() {
        let namespace = TestNamespace { positions: vec![] };
        let mut options = PlanMutationOptions::default();
        options.resolve.contextual_root = Some(0);

        let PlanMutationResult::Rejected(errors) =
            plan_mutation(&remove_request("?".into()), &namespace, &options)
        else {
            panic!("contextual alias of root must be rejected");
        };
        assert_eq!(errors[0].code, "SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN");
    }

    #[test]
    fn parsed_targets_are_revalidated_under_planner_address_limits() {
        let namespace = TestNamespace {
            positions: vec![1_000_000],
        };
        let parsed = parse_address_with_options(
            "$[1000000]",
            AddressParseOptions {
                max_position_index: 1_000_000,
            },
        )
        .expect("relaxed parse")
        .address;
        let request = replace_request(parsed.into());

        let PlanMutationResult::Rejected(errors) =
            plan_mutation(&request, &namespace, &PlanMutationOptions::default())
        else {
            panic!("default planner ceiling must reject the parsed target");
        };
        assert_eq!(errors[0].code, "SANSA_MUTATE_INVALID_TARGET");

        let relaxed = PlanMutationOptions {
            max_position_index: 1_000_000,
            ..PlanMutationOptions::default()
        };
        let PlanMutationResult::Planned(plan) = plan_mutation(&request, &namespace, &relaxed)
        else {
            panic!("raised planner ceiling should accept the parsed target");
        };
        assert_eq!(
            plan.portability_warnings()[0].code,
            "SANSA_NON_PORTABLE_POSITION_INDEX"
        );
    }

    #[test]
    fn precondition_addresses_share_the_planner_ceiling_and_warnings() {
        let namespace = TestNamespace {
            positions: vec![1_000_000],
        };
        let request = MutationRequest {
            preconditions: vec![RequestedMutationPrecondition {
                expression: "exists($[1000000])".into(),
                target: None,
            }],
            ..MutationRequest::default()
        };
        let options = PlanMutationOptions {
            max_position_index: 1_000_000,
            ..PlanMutationOptions::default()
        };

        let PlanMutationResult::Planned(plan) = plan_mutation(&request, &namespace, &options)
        else {
            panic!("relaxed precondition address should plan");
        };
        assert_eq!(
            plan.portability_warnings()[0].code,
            "SANSA_NON_PORTABLE_POSITION_INDEX"
        );
        assert_eq!(plan.preconditions()[0].portability_warnings.len(), 1);
    }

    #[test]
    fn precondition_resolution_is_bounded_and_normalized() {
        let namespace = TestNamespace {
            positions: vec![0, 1],
        };
        let request = MutationRequest {
            preconditions: vec![RequestedMutationPrecondition {
                expression: "exists($.*)".into(),
                target: None,
            }],
            ..MutationRequest::default()
        };
        let mut options = PlanMutationOptions::default();
        options.resolve.max_bindings = Some(1);

        let PlanMutationResult::Rejected(errors) = plan_mutation(&request, &namespace, &options)
        else {
            panic!("precondition resolution over its ceiling must reject");
        };
        assert_eq!(errors[0].code, "SANSA_MUTATE_BUDGET_EXCEEDED");
        assert_eq!(errors[0].budget.as_deref(), Some("maxBindings"));
        assert_eq!(errors[0].limit, Some(1));
        assert_eq!(errors[0].observed, Some(2));
        assert_eq!(errors[0].precondition_index, Some(0));
    }
}

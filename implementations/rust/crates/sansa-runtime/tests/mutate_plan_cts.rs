#![allow(clippy::result_large_err)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::mutate::{
    MutationAddressInput, MutationBudget, MutationDiagnostic, MutationOperation, MutationPhase,
    MutationPlan, MutationProvenance, MutationRequest, MutationValue, MutationValueIntent,
    PlanMutationOptions, PlanMutationResult, RequestedCreateOperation, RequestedInsertOperation,
    RequestedMoveOperation, RequestedMutationOperation, RequestedMutationPlacement,
    RequestedMutationPrecondition, RequestedRemoveOperation, RequestedReplaceOperation,
    plan_mutation,
};
use sansa_runtime::resolve::{Namespace, Navigation};
use sansa_runtime::value_semantics::{FiniteNumber, Value};
use serde_json::Value as JsonValue;

const SUITE_PATH: &str = "sansa/v1/suites/07-mutate-plan.json";

#[derive(Clone)]
struct Node {
    parent: Option<usize>,
    name: Option<String>,
    position: Option<usize>,
    address: String,
    semantic_type: Option<String>,
    representation_kind: Option<String>,
    raw_value: Option<JsonValue>,
    children: Vec<usize>,
}

struct FixtureNamespace {
    nodes: Vec<Node>,
}

impl FixtureNamespace {
    fn from_root(root: &JsonValue) -> Self {
        let mut namespace = Self { nodes: Vec::new() };
        namespace.push_node(root, None);
        namespace
    }

    fn push_node(&mut self, source: &JsonValue, parent: Option<usize>) -> usize {
        let index = self.nodes.len();
        self.nodes.push(Node {
            parent,
            name: source["name"].as_str().map(str::to_owned),
            position: source["index"].as_u64().map(|value| value as usize),
            address: source["address"].as_str().expect("fixture address").into(),
            semantic_type: source["semanticType"].as_str().map(str::to_owned),
            representation_kind: source["representationKind"].as_str().map(str::to_owned),
            raw_value: source.get("value").cloned(),
            children: Vec::new(),
        });
        if let Some(children) = source["children"].as_array() {
            for child in children {
                let child = self.push_node(child, Some(index));
                self.nodes[index].children.push(child);
            }
        }
        index
    }
}

impl Namespace for FixtureNamespace {
    type Binding = usize;

    fn root(&self) -> Option<Self::Binding> {
        Some(0)
    }

    fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding> {
        self.nodes[*binding].children.clone()
    }

    fn parent(&self, binding: &Self::Binding) -> Navigation<Self::Binding> {
        self.nodes[*binding]
            .parent
            .map_or(Navigation::Missing, Navigation::Binding)
    }

    fn name(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].name.clone()
    }

    fn position(&self, binding: &Self::Binding) -> Option<usize> {
        self.nodes[*binding].position
    }

    fn semantic_type(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].semantic_type.clone()
    }

    fn representation_kind(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].representation_kind.clone()
    }

    fn value(&self, binding: &Self::Binding) -> Option<Value> {
        json_scalar(self.nodes[*binding].raw_value.as_ref()?)
    }

    fn binding_address(&self, binding: &Self::Binding) -> Option<String> {
        Some(self.nodes[*binding].address.clone())
    }
}

#[test]
fn passes_every_experimental_core_mutation_planner_case() {
    let path = cts_root().join(SUITE_PATH);
    let suite: JsonValue =
        serde_json::from_str(&fs::read_to_string(&path).expect("read CTS")).expect("parse CTS");
    let namespaces = suite["fixtures"]["namespaces"]
        .as_array()
        .expect("namespace fixtures")
        .iter()
        .map(|fixture| {
            (
                fixture["id"].as_str().expect("fixture id"),
                FixtureNamespace::from_root(&fixture["root"]),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let cases = suite["tests"]
        .as_array()
        .expect("tests")
        .iter()
        .filter(|test| test["input"]["mode"] == "plan" && test["input"].get("target").is_none())
        .collect::<Vec<_>>();
    assert_eq!(cases.len(), 28, "{path:?}");

    let mut failures = Vec::new();
    for test in cases {
        let id = test["id"].as_str().expect("test id");
        let input = &test["input"];
        let expected = &test["expected"];
        let namespace = &namespaces[input["namespace"].as_str().expect("namespace id")];
        let result = match request_from_input(input) {
            Ok(request) => plan_mutation(&request, namespace, &options_from_input(input)),
            Err(error) => PlanMutationResult::Rejected(vec![error]),
        };
        compare_result(id, expected, &result, &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn request_from_input(input: &JsonValue) -> Result<MutationRequest, MutationDiagnostic> {
    if let Some(request) = input.get("request") {
        let object = request.as_object().ok_or_else(|| {
            diagnostic(
                "SANSA_MUTATE_INVALID_REQUEST",
                "Expected mutation request object",
            )
        })?;
        for field in object.keys() {
            if !matches!(
                field.as_str(),
                "operations" | "preconditions" | "provenance"
            ) {
                let mut error = diagnostic(
                    "SANSA_MUTATE_UNSUPPORTED_REQUEST_FIELD",
                    format!("Mutation request field '{field}' is not supported"),
                );
                error.request_field = Some(field.clone());
                return Err(error);
            }
        }
        return request_from_parts(
            &request["operations"],
            request.get("preconditions"),
            request.get("provenance"),
        );
    }
    let operations = input
        .get("operations")
        .cloned()
        .unwrap_or_else(|| JsonValue::Array(vec![input["operation"].clone()]));
    request_from_parts(
        &operations,
        input.get("preconditions"),
        input.get("provenance"),
    )
}

fn request_from_parts(
    operations: &JsonValue,
    preconditions: Option<&JsonValue>,
    provenance: Option<&JsonValue>,
) -> Result<MutationRequest, MutationDiagnostic> {
    let operations = operations.as_array().ok_or_else(|| {
        diagnostic(
            "SANSA_MUTATE_INVALID_REQUEST",
            "Mutation request operations must be a list",
        )
    })?;
    let operations = operations
        .iter()
        .enumerate()
        .map(|(index, operation)| operation_from_json(operation, index))
        .collect::<Result<Vec<_>, _>>()?;
    let preconditions = match preconditions {
        None => Vec::new(),
        Some(value) => value
            .as_array()
            .ok_or_else(|| {
                diagnostic(
                    "SANSA_MUTATE_INVALID_PRECONDITION",
                    "Mutation request preconditions must be a list",
                )
            })?
            .iter()
            .map(precondition_from_json)
            .collect::<Result<Vec<_>, _>>()?,
    };
    Ok(MutationRequest {
        operations,
        preconditions,
        provenance: provenance.map(mutation_value),
    })
}

fn operation_from_json(
    source: &JsonValue,
    operation_index: usize,
) -> Result<RequestedMutationOperation, MutationDiagnostic> {
    let object = source.as_object().ok_or_else(|| {
        operation_diagnostic(
            "SANSA_MUTATE_INVALID_OPERATION",
            "Expected mutation operation object",
            operation_index,
        )
    })?;
    let op = source["op"].as_str().unwrap_or_default();
    let allowed: &[&str] = match op {
        "create" => &[
            "op",
            "parent",
            "name",
            "value",
            "datatype",
            "kind",
            "provenance",
        ],
        "replace" => &["op", "target", "value", "datatype", "kind", "provenance"],
        "remove" => &["op", "target", "provenance"],
        "insert" => &[
            "op",
            "container",
            "placement",
            "value",
            "datatype",
            "kind",
            "provenance",
        ],
        "move" => &["op", "source", "container", "placement", "provenance"],
        _ => {
            return Err(operation_diagnostic(
                "SANSA_MUTATE_UNSUPPORTED_OPERATION",
                format!("Unsupported mutation operation: {op}"),
                operation_index,
            ));
        }
    };
    if let Some(field) = object
        .keys()
        .find(|field| !allowed.contains(&field.as_str()))
    {
        let mut error = operation_diagnostic(
            "SANSA_MUTATE_UNSUPPORTED_OPERATION_FIELD",
            format!("Mutation operation field '{field}' is not supported by {op}"),
            operation_index,
        );
        error.operation_field = Some(field.clone());
        return Err(error);
    }

    let provenance = source.get("provenance").map(mutation_value);
    Ok(match op {
        "create" => RequestedMutationOperation::Create(RequestedCreateOperation {
            parent: address_field(source, "parent", operation_index)?,
            name: source["name"].as_str().unwrap_or_default().into(),
            value: value_intent(source),
            provenance,
        }),
        "replace" => RequestedMutationOperation::Replace(RequestedReplaceOperation {
            target: address_field(source, "target", operation_index)?,
            value: value_intent(source),
            provenance,
        }),
        "remove" => RequestedMutationOperation::Remove(RequestedRemoveOperation {
            target: address_field(source, "target", operation_index)?,
            provenance,
        }),
        "insert" => RequestedMutationOperation::Insert(RequestedInsertOperation {
            container: address_field(source, "container", operation_index)?,
            placement: placement_from_json(&source["placement"], operation_index)?,
            value: value_intent(source),
            provenance,
        }),
        "move" => RequestedMutationOperation::Move(RequestedMoveOperation {
            source: address_field(source, "source", operation_index)?,
            container: address_field(source, "container", operation_index)?,
            placement: placement_from_json(&source["placement"], operation_index)?,
            provenance,
        }),
        _ => unreachable!("operation checked above"),
    })
}

fn value_intent(source: &JsonValue) -> MutationValueIntent {
    MutationValueIntent {
        value: mutation_value(&source["value"]),
        datatype: source["datatype"].as_str().map(str::to_owned),
        kind: source["kind"].as_str().map(str::to_owned),
    }
}

fn address_field(
    source: &JsonValue,
    field: &str,
    operation_index: usize,
) -> Result<MutationAddressInput, MutationDiagnostic> {
    source[field]
        .as_str()
        .map(MutationAddressInput::from)
        .ok_or_else(|| {
            operation_diagnostic(
                "SANSA_MUTATE_INVALID_TARGET",
                format!("{field} must be a SANSA address"),
                operation_index,
            )
        })
}

fn placement_from_json(
    source: &JsonValue,
    operation_index: usize,
) -> Result<RequestedMutationPlacement, MutationDiagnostic> {
    match source.as_str().or_else(|| source["kind"].as_str()) {
        Some("first") => Ok(RequestedMutationPlacement::First),
        Some("last") => Ok(RequestedMutationPlacement::Last),
        Some("before") => Ok(RequestedMutationPlacement::Before(address_field(
            source,
            if source.get("anchor").is_some() {
                "anchor"
            } else {
                "target"
            },
            operation_index,
        )?)),
        Some("after") => Ok(RequestedMutationPlacement::After(address_field(
            source,
            if source.get("anchor").is_some() {
                "anchor"
            } else {
                "target"
            },
            operation_index,
        )?)),
        _ => Err(operation_diagnostic(
            "SANSA_MUTATE_UNSUPPORTED_PLACEMENT",
            "Placement must be first, last, before, or after",
            operation_index,
        )),
    }
}

fn precondition_from_json(
    source: &JsonValue,
) -> Result<RequestedMutationPrecondition, MutationDiagnostic> {
    let expression = source["expression"].as_str().ok_or_else(|| {
        diagnostic(
            "SANSA_MUTATE_INVALID_PRECONDITION",
            "Mutation preconditions must provide an expression string",
        )
    })?;
    Ok(RequestedMutationPrecondition {
        expression: expression.into(),
        target: source["target"].as_str().map(MutationAddressInput::from),
    })
}

fn mutation_value(source: &JsonValue) -> MutationValue {
    match source {
        JsonValue::Null => MutationValue::Null,
        JsonValue::Bool(value) => MutationValue::try_scalar(Value::Boolean(*value))
            .expect("JSON Boolean is a mutation scalar"),
        JsonValue::Number(value) => MutationValue::try_scalar(Value::FiniteNumber(
            FiniteNumber::parse(value.to_string()).expect("JSON finite number"),
        ))
        .expect("JSON number is a mutation scalar"),
        JsonValue::String(value) => MutationValue::try_scalar(Value::String(value.clone()))
            .expect("JSON string is a mutation scalar"),
        JsonValue::Array(values) => {
            MutationValue::Sequence(values.iter().map(mutation_value).collect())
        }
        JsonValue::Object(fields) => MutationValue::Object(
            fields
                .iter()
                .map(|(name, value)| (name.clone(), mutation_value(value)))
                .collect(),
        ),
    }
}

fn options_from_input(input: &JsonValue) -> PlanMutationOptions<usize> {
    let source = input
        .get("planOptions")
        .or_else(|| input.get("options"))
        .unwrap_or(&JsonValue::Null);
    let budget = &source["budget"];
    PlanMutationOptions {
        budget: MutationBudget {
            max_operations: usize_field(budget, "maxOperations"),
            max_preconditions: usize_field(budget, "maxPreconditions"),
            max_value_nodes: usize_field(budget, "maxValueNodes"),
            max_value_depth: usize_field(budget, "maxValueDepth"),
            max_string_length: usize_field(budget, "maxStringLength"),
        },
        max_position_index: usize_field(&source["parse"], "maxPositionIndex")
            .unwrap_or(sansa_runtime::address::MAX_POSITION_INDEX),
        ..PlanMutationOptions::default()
    }
}

fn compare_result(
    id: &str,
    expected: &JsonValue,
    result: &PlanMutationResult<usize>,
    failures: &mut Vec<String>,
) {
    match (expected["ok"].as_bool().unwrap_or(false), result) {
        (false, PlanMutationResult::Rejected(errors)) => {
            let error = &errors[0];
            compare_field(
                id,
                "error",
                expected["error"].as_str(),
                Some(&error.code),
                failures,
            );
            compare_usize(
                id,
                "operationIndex",
                expected.get("operationIndex"),
                error.operation_index,
                failures,
            );
            compare_field(
                id,
                "errorBudget",
                expected["errorBudget"].as_str(),
                error.budget.as_deref(),
                failures,
            );
            compare_usize(
                id,
                "errorLimit",
                expected.get("errorLimit"),
                error.limit,
                failures,
            );
            compare_usize(
                id,
                "errorObserved",
                expected.get("errorObserved"),
                error.observed,
                failures,
            );
            compare_field(
                id,
                "errorValuePath",
                expected["errorValuePath"].as_str(),
                error.value_path.as_deref(),
                failures,
            );
            compare_field(
                id,
                "errorRequestField",
                expected["errorRequestField"].as_str(),
                error.request_field.as_deref(),
                failures,
            );
            compare_field(
                id,
                "errorOperationField",
                expected["errorOperationField"].as_str(),
                error.operation_field.as_deref(),
                failures,
            );
        }
        (true, PlanMutationResult::Planned(plan)) => compare_plan(id, expected, plan, failures),
        (true, PlanMutationResult::Rejected(errors)) => {
            failures.push(format!("{id}: unexpectedly rejected with {errors:?}"));
        }
        (false, PlanMutationResult::Planned(_)) => {
            failures.push(format!("{id}: unexpectedly planned"))
        }
    }
}

fn compare_plan(
    id: &str,
    expected: &JsonValue,
    plan: &MutationPlan<usize>,
    failures: &mut Vec<String>,
) {
    if let Some(operations) = expected["operations"].as_array() {
        if operations.len() != plan.operations().len() {
            failures.push(format!("{id}: operations length mismatch"));
        }
        for (index, expected) in operations.iter().enumerate() {
            let Some(actual) = plan.operations().get(index) else {
                continue;
            };
            compare_field(
                id,
                "op",
                expected["op"].as_str(),
                Some(actual.kind().as_str()),
                failures,
            );
            if let Some(target) = expected["target"].as_str() {
                let actual_target = operation_target(actual);
                if actual_target != target {
                    failures.push(format!(
                        "{id}: operations[{index}].target {actual_target:?} != {target}"
                    ));
                }
            }
            let intent = operation_intent(actual);
            compare_field(
                id,
                "datatype",
                expected["datatype"].as_str(),
                intent.and_then(|value| value.datatype.as_deref()),
                failures,
            );
            compare_field(
                id,
                "kind",
                expected["kind"].as_str(),
                intent.and_then(|value| value.kind.as_deref()),
                failures,
            );
            if let Some(provenance) = expected.get("provenance")
                && mutation_provenance(actual)
                    .map(mutation_value_json)
                    .as_ref()
                    != Some(provenance)
            {
                failures.push(format!("{id}: operations[{index}].provenance mismatch"));
            }
        }
    }
    if let Some(expected) = expected.get("sourceProvenance")
        && plan.source_provenance().map(mutation_value_json).as_ref() != Some(expected)
    {
        failures.push(format!("{id}: sourceProvenance mismatch"));
    }
    if let Some(expected) = expected["preconditions"].as_array() {
        let actual = plan
            .preconditions()
            .iter()
            .map(|entry| JsonValue::String(entry.canonical.clone()))
            .collect::<Vec<_>>();
        if actual != *expected {
            failures.push(format!("{id}: preconditions {actual:?} != {expected:?}"));
        }
    }
    if let Some(expected) = expected["portabilityWarnings"].as_array() {
        let actual = plan
            .portability_warnings()
            .iter()
            .map(|warning| JsonValue::String(warning.code.clone()))
            .collect::<Vec<_>>();
        if actual != *expected {
            failures.push(format!(
                "{id}: portabilityWarnings {actual:?} != {expected:?}"
            ));
        }
    }
}

fn operation_target(operation: &MutationOperation<usize>) -> &str {
    match operation {
        MutationOperation::Create { parent, .. } => &parent.canonical_address,
        MutationOperation::Replace { target, .. } | MutationOperation::Remove { target, .. } => {
            &target.canonical_address
        }
        MutationOperation::Insert { container, .. } | MutationOperation::Move { container, .. } => {
            &container.canonical_address
        }
    }
}

fn operation_intent(operation: &MutationOperation<usize>) -> Option<&MutationValueIntent> {
    match operation {
        MutationOperation::Create { value, .. }
        | MutationOperation::Replace { value, .. }
        | MutationOperation::Insert { value, .. } => Some(value),
        MutationOperation::Remove { .. } | MutationOperation::Move { .. } => None,
    }
}

fn mutation_provenance(operation: &MutationOperation<usize>) -> Option<&MutationProvenance> {
    match operation {
        MutationOperation::Create { provenance, .. }
        | MutationOperation::Replace { provenance, .. }
        | MutationOperation::Remove { provenance, .. }
        | MutationOperation::Insert { provenance, .. }
        | MutationOperation::Move { provenance, .. } => provenance.as_ref(),
    }
}

fn mutation_value_json(value: &MutationValue) -> JsonValue {
    match value {
        MutationValue::Null => JsonValue::Null,
        MutationValue::Scalar(value) => match value.as_value() {
            Value::String(value) => JsonValue::String(value.clone()),
            Value::Boolean(value) => JsonValue::Bool(*value),
            Value::FiniteNumber(value) => {
                serde_json::from_str(value.as_str()).expect("finite number")
            }
            _ => JsonValue::Null,
        },
        MutationValue::Sequence(values) => {
            JsonValue::Array(values.iter().map(mutation_value_json).collect())
        }
        MutationValue::Object(fields) => JsonValue::Object(
            fields
                .iter()
                .map(|(name, value)| (name.clone(), mutation_value_json(value)))
                .collect(),
        ),
    }
}

fn json_scalar(value: &JsonValue) -> Option<Value> {
    match value {
        JsonValue::String(value) => Some(Value::String(value.clone())),
        JsonValue::Bool(value) => Some(Value::Boolean(*value)),
        JsonValue::Number(value) => FiniteNumber::parse(value.to_string())
            .ok()
            .map(Value::FiniteNumber),
        _ => None,
    }
}

fn compare_field(
    id: &str,
    label: &str,
    expected: Option<&str>,
    actual: Option<&str>,
    failures: &mut Vec<String>,
) {
    if let Some(expected) = expected
        && actual != Some(expected)
    {
        failures.push(format!("{id}: {label} {actual:?} != {expected}"));
    }
}

fn compare_usize(
    id: &str,
    label: &str,
    expected: Option<&JsonValue>,
    actual: Option<usize>,
    failures: &mut Vec<String>,
) {
    if let Some(expected) = expected.and_then(JsonValue::as_u64)
        && actual != Some(expected as usize)
    {
        failures.push(format!("{id}: {label} {actual:?} != {expected}"));
    }
}

fn diagnostic(code: impl Into<String>, message: impl Into<String>) -> MutationDiagnostic {
    MutationDiagnostic::new(code, message, MutationPhase::Plan)
}

fn operation_diagnostic(
    code: impl Into<String>,
    message: impl Into<String>,
    operation_index: usize,
) -> MutationDiagnostic {
    let mut error = diagnostic(code, message);
    error.operation_index = Some(operation_index);
    error
}

fn usize_field(value: &JsonValue, name: &str) -> Option<usize> {
    value[name].as_u64().map(|value| value as usize)
}

fn cts_root() -> PathBuf {
    if let Some(path) = std::env::var_os("AEONITE_CTS_ROOT") {
        return PathBuf::from(path);
    }
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(4)
        .expect("SANSA repository root")
        .join("..")
        .join("..")
        .join("aeonite-org")
        .join("aeonite-cts")
        .join("cts")
}

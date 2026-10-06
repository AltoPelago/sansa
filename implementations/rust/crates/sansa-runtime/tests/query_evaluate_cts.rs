use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::address::parse_address;
use sansa_runtime::evaluate::{
    ActivationSelector, AddressActivation, AddressActivationPolicy, EvaluateOptions,
    EvaluatedValue, QueryBudget, QueryPolicy, evaluate_query,
};
use sansa_runtime::resolve::{Namespace, Navigation};
use sansa_runtime::value_semantics::{ContainerValue, FiniteNumber, Profile, Value};
use serde_json::{Map, Value as JsonValue, json};

#[derive(Clone)]
struct Node {
    parent: Option<usize>,
    name: Option<String>,
    position: Option<usize>,
    address: String,
    semantic_type: Option<String>,
    representation_kind: Option<String>,
    scalar_kind: Option<String>,
    null_reason: Option<String>,
    raw_value: Option<JsonValue>,
    children: Vec<usize>,
    local_spaces: BTreeMap<String, usize>,
}

#[derive(Clone)]
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
            scalar_kind: source["scalarKind"].as_str().map(str::to_owned),
            null_reason: source["nullReason"].as_str().map(str::to_owned),
            raw_value: source.get("value").cloned(),
            children: Vec::new(),
            local_spaces: BTreeMap::new(),
        });
        if let Some(children) = source["children"].as_array() {
            for child in children {
                let child = self.push_node(child, Some(index));
                self.nodes[index].children.push(child);
            }
        }
        if let Some(spaces) = source["localSpaces"].as_object() {
            for (name, child) in spaces {
                let child = self.push_node(child, Some(index));
                self.nodes[index].local_spaces.insert(name.clone(), child);
            }
        }
        index
    }

    fn value_for(&self, binding: usize) -> Option<Value> {
        let node = &self.nodes[binding];
        if !node.children.is_empty() {
            return Some(Value::Container {
                kind: node
                    .representation_kind
                    .clone()
                    .unwrap_or_else(|| "container".into()),
                payload: self.container_payload(binding),
            });
        }
        let raw = node.raw_value.as_ref()?;
        let kind = node
            .scalar_kind
            .as_deref()
            .or(node.representation_kind.as_deref())
            .unwrap_or_default();
        Some(match kind {
            "number" => Value::FiniteNumber(FiniteNumber::parse(json_number(raw)?).ok()?),
            "boolean" => Value::Boolean(raw.as_bool()?),
            "toggle" => Value::Toggle(raw.as_str()?.into()),
            "hex" => Value::Hex(raw.as_str()?.into()),
            "radix" => Value::Radix {
                payload: raw.as_str()?.into(),
                semantic_type: node.semantic_type.clone().unwrap_or_else(|| "radix".into()),
            },
            "encoding" => Value::Encoding(raw.as_str()?.into()),
            "separator" => Value::Separator(raw.as_str()?.into()),
            "symbol" => Value::Symbol(raw.as_str()?.into()),
            "sansa" | "sansaAddress" => Value::SansaAddress(
                raw["canonical"]
                    .as_str()
                    .or_else(|| raw["address"].as_str())?
                    .into(),
            ),
            "date" | "time" | "datetime" | "wtc" => Value::Temporal {
                payload: raw.as_str()?.into(),
                semantic_type: kind.into(),
            },
            "null" => Value::ExplicitNull {
                reason: node.null_reason.clone().unwrap_or_default(),
            },
            "nan" => Value::Nan,
            "infinity" => match raw.as_str() {
                Some("-Infinity") => Value::NegativeInfinity,
                _ => Value::PositiveInfinity,
            },
            "referenceForm" | "cloneReference" | "pointerReference" => {
                let target = if let Some(path) = raw["path"].as_str() {
                    path.to_owned()
                } else {
                    format!(
                        "$.{}",
                        raw["path"]
                            .as_array()?
                            .iter()
                            .map(|item| item.as_str())
                            .collect::<Option<Vec<_>>>()?
                            .join(".")
                    )
                };
                Value::ReferenceForm {
                    kind: raw["type"].as_str().unwrap_or(kind).into(),
                    target,
                }
            }
            _ if raw.is_string() => Value::String(raw.as_str()?.into()),
            _ if raw.is_boolean() => Value::Boolean(raw.as_bool()?),
            _ if raw.is_number() => {
                Value::FiniteNumber(FiniteNumber::parse(json_number(raw)?).ok()?)
            }
            _ => return None,
        })
    }

    fn container_payload(&self, binding: usize) -> ContainerValue {
        let node = &self.nodes[binding];
        let sequence = matches!(
            node.representation_kind.as_deref(),
            Some("list" | "tuple" | "node")
        );
        if sequence {
            ContainerValue::Sequence(
                node.children
                    .iter()
                    .map(|child| self.container_entry(*child))
                    .collect(),
            )
        } else {
            ContainerValue::Object(
                node.children
                    .iter()
                    .filter_map(|child| {
                        Some((
                            self.nodes[*child].name.clone()?,
                            self.container_entry(*child),
                        ))
                    })
                    .collect(),
            )
        }
    }

    fn container_entry(&self, binding: usize) -> ContainerValue {
        let node = &self.nodes[binding];
        if !node.children.is_empty() {
            self.container_payload(binding)
        } else {
            self.value_for(binding)
                .map(|value| ContainerValue::Scalar(Box::new(value)))
                .unwrap_or(ContainerValue::Null)
        }
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

    fn local_space(&self, binding: &Self::Binding, name: &str) -> Navigation<Self::Binding> {
        self.nodes[*binding]
            .local_spaces
            .get(name)
            .copied()
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
        self.value_for(*binding)
    }

    fn binding_address(&self, binding: &Self::Binding) -> Option<String> {
        Some(self.nodes[*binding].address.clone())
    }
}

#[test]
fn passes_every_stable_query_evaluation_case() {
    let path = cts_root().join("sansa/v1/suites/06-query-evaluate.json");
    let suite: JsonValue =
        serde_json::from_str(&fs::read_to_string(&path).expect("read CTS")).expect("parse CTS");
    let fixtures = suite["fixtures"]["namespaces"]
        .as_array()
        .expect("namespace fixtures");
    let namespaces = fixtures
        .iter()
        .map(|fixture| {
            (
                fixture["id"].as_str().expect("fixture id"),
                FixtureNamespace::from_root(&fixture["root"]),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let tests = suite["tests"].as_array().expect("tests");
    let stable = tests
        .iter()
        .filter(|test| {
            !test["tags"]
                .as_array()
                .is_some_and(|tags| tags.iter().any(|tag| tag == "experimental"))
        })
        .collect::<Vec<_>>();
    assert_eq!(stable.len(), 169, "{path:?}");

    let mut failures = Vec::new();
    for test in stable {
        let id = test["id"].as_str().expect("test id");
        let input = &test["input"];
        let expected = &test["expected"];
        let namespace = &namespaces[input["namespace"].as_str().expect("namespace id")];
        let options = options_from_json(input.get("options"));
        let output = evaluate_query(
            input["source"].as_str().expect("query source"),
            namespace,
            &options,
        );
        if expected["ok"] == true {
            if !output.is_ok() {
                failures.push(format!("{id}: unexpected errors {:?}", output.errors));
                continue;
            }
            if let Some(addresses) = expected["resultAddresses"].as_array() {
                let actual = output
                    .results
                    .iter()
                    .map(|record| {
                        JsonValue::String(namespace.nodes[record.candidate].address.clone())
                    })
                    .collect::<Vec<_>>();
                if actual != *addresses {
                    failures.push(format!(
                        "{id}: result addresses {actual:?} != {addresses:?}"
                    ));
                }
            }
            if let Some(addresses) = expected["selectedAddresses"].as_array() {
                let actual = output
                    .results
                    .iter()
                    .map(|record| selected_addresses(&record.value, namespace))
                    .collect::<Vec<_>>();
                if actual != *addresses {
                    failures.push(format!(
                        "{id}: selected addresses {actual:?} != {addresses:?}"
                    ));
                }
            }
            if let Some(values) = expected["values"].as_array() {
                let actual = output
                    .results
                    .iter()
                    .map(|record| materialized_value(&record.value, namespace))
                    .collect::<Vec<_>>();
                if actual != *values {
                    failures.push(format!("{id}: values {actual:?} != {values:?}"));
                }
            }
        } else if output.is_ok() {
            failures.push(format!("{id}: unexpectedly succeeded"));
        } else {
            let error = &output.errors[0];
            if expected["error"].as_str() != Some(&error.code) {
                failures.push(format!("{id}: error {:?} != {}", error, expected["error"]));
            }
            for (field, actual) in [
                ("errorPhase", error.phase.map(phase_name).map(str::to_owned)),
                ("errorBudget", error.budget.clone()),
                ("errorCandidateAddress", error.candidate_address.clone()),
            ] {
                if let Some(expected) = expected[field].as_str()
                    && actual.as_deref() != Some(expected)
                {
                    failures.push(format!("{id}: {field} {actual:?} != {expected}"));
                }
            }
            if let Some(expected_limit) = expected["errorLimit"].as_u64()
                && error.limit != Some(expected_limit as usize)
            {
                failures.push(format!(
                    "{id}: error limit {:?} != {expected_limit}",
                    error.limit
                ));
            }
            if let Some(expected_observed) = expected["errorObserved"].as_u64()
                && error.observed != Some(expected_observed as usize)
            {
                failures.push(format!(
                    "{id}: error observed {:?} != {expected_observed}",
                    error.observed
                ));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn options_from_json(source: Option<&JsonValue>) -> EvaluateOptions<usize> {
    let mut options = EvaluateOptions::default();
    let Some(source) = source else { return options };
    if source["policy"] == "validation" {
        options.policy = QueryPolicy::Validation;
    }
    if let Some(profile) = source["valueSemantics"].as_str() {
        options.profile = Profile::from_id(profile).expect("CTS profile");
    }
    let budget = &source["budget"];
    options.budget = QueryBudget {
        max_from_bindings: usize_field(budget, "maxFromBindings"),
        max_where_candidates: usize_field(budget, "maxWhereCandidates"),
        max_order_candidates: usize_field(budget, "maxOrderCandidates"),
        max_result_records: usize_field(budget, "maxResultRecords"),
    };
    let activation = &source["addressActivation"];
    if activation == "trusted" {
        options.address_activation = AddressActivation::Trusted;
    } else if let Some(policy) = activation.as_object() {
        let mut selectors = Vec::new();
        for selector in policy
            .get("allowedSelectors")
            .unwrap_or(&JsonValue::Null)
            .as_array()
            .into_iter()
            .flatten()
        {
            match selector.as_str().expect("selector") {
                "member" => selectors.push(ActivationSelector::Member),
                "position" => selectors.push(ActivationSelector::Position),
                "range" => selectors.push(ActivationSelector::Range),
                "parent" => selectors.push(ActivationSelector::Parent),
                "attribute" => selectors.push(ActivationSelector::Attribute),
                "localSpace" => selectors.push(ActivationSelector::LocalSpace),
                "wildcard" => {
                    selectors.push(ActivationSelector::DirectExpansion);
                    selectors.push(ActivationSelector::DescendantExpansion);
                    selectors.push(ActivationSelector::NamePattern);
                }
                other => panic!("unknown selector {other}"),
            }
        }
        options.address_activation = AddressActivation::Constrained(AddressActivationPolicy {
            allowed_roots: policy
                .get("allowedRoots")
                .unwrap_or(&JsonValue::Null)
                .as_array()
                .expect("roots")
                .iter()
                .map(|root| parse_address(root.as_str().expect("root")).expect("valid root"))
                .collect(),
            allowed_selectors: selectors,
            allow_contextual_root: policy
                .get("allowContextualRoot")
                .and_then(JsonValue::as_bool)
                .unwrap_or(false),
            max_address_depth: usize_field(activation, "maxAddressDepth"),
            max_bindings: usize_field(activation, "maxBindings"),
        });
    }
    options
}

fn selected_addresses(value: &EvaluatedValue<usize>, namespace: &FixtureNamespace) -> JsonValue {
    match value {
        EvaluatedValue::Bindings(bindings) => JsonValue::Array(
            bindings
                .iter()
                .map(|binding| JsonValue::String(namespace.nodes[*binding].address.clone()))
                .collect(),
        ),
        _ => JsonValue::Array(Vec::new()),
    }
}

fn materialized_value(value: &EvaluatedValue<usize>, namespace: &FixtureNamespace) -> JsonValue {
    match value {
        EvaluatedValue::Object(fields) => json!({
            "type": "object",
            "value": fields.iter().map(|(name, value)| {
                (name.clone(), materialize_payload(value, namespace))
            }).collect::<Map<_, _>>(),
        }),
        _ => json!({ "type": "scalar", "value": materialize_payload(value, namespace) }),
    }
}

fn materialize_payload(value: &EvaluatedValue<usize>, namespace: &FixtureNamespace) -> JsonValue {
    match value {
        EvaluatedValue::Scalar(value) => value_json(value),
        EvaluatedValue::Bindings(bindings) if bindings.len() == 1 => namespace
            .value_for(bindings[0])
            .as_ref()
            .map(value_json)
            .unwrap_or(JsonValue::Null),
        EvaluatedValue::Bindings(bindings) if bindings.is_empty() => JsonValue::Null,
        EvaluatedValue::Bindings(_) => panic!("cannot materialize multiple bindings"),
        EvaluatedValue::Object(fields) => JsonValue::Object(
            fields
                .iter()
                .map(|(name, value)| (name.clone(), materialize_payload(value, namespace)))
                .collect(),
        ),
    }
}

fn value_json(value: &Value) -> JsonValue {
    match value {
        Value::FiniteNumber(number) => serde_json::from_str(number.as_str()).expect("number"),
        Value::String(value)
        | Value::Toggle(value)
        | Value::Hex(value)
        | Value::Encoding(value)
        | Value::Separator(value)
        | Value::Symbol(value)
        | Value::SansaAddress(value) => JsonValue::String(value.clone()),
        Value::Radix { payload, .. } | Value::Temporal { payload, .. } => {
            JsonValue::String(payload.clone())
        }
        Value::Boolean(value) => JsonValue::Bool(*value),
        Value::ExplicitNull { .. } | Value::ExplicitAbsence { .. } | Value::Missing => {
            JsonValue::Null
        }
        Value::PositiveInfinity => JsonValue::String("Infinity".into()),
        Value::NegativeInfinity => JsonValue::String("-Infinity".into()),
        Value::Nan => JsonValue::String("NaN".into()),
        Value::ReferenceForm { target, .. } => JsonValue::String(target.clone()),
        Value::Container { .. } | Value::BindingSet => JsonValue::Null,
    }
}

fn json_number(value: &JsonValue) -> Option<String> {
    value.as_number().map(ToString::to_string)
}

fn usize_field(value: &JsonValue, name: &str) -> Option<usize> {
    value[name].as_u64().map(|value| value as usize)
}

fn phase_name(phase: sansa_runtime::DiagnosticPhase) -> &'static str {
    match phase {
        sansa_runtime::DiagnosticPhase::Parse => "parse",
        sansa_runtime::DiagnosticPhase::Resolve => "resolve",
        sansa_runtime::DiagnosticPhase::Policy => "policy",
        sansa_runtime::DiagnosticPhase::From => "from",
        sansa_runtime::DiagnosticPhase::Where => "where",
        sansa_runtime::DiagnosticPhase::Order => "order",
        sansa_runtime::DiagnosticPhase::Select => "select",
    }
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

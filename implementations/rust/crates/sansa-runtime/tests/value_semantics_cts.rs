use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::value_semantics::{
    ContainerValue, FiniteNumber, Profile, Value, compare, equal, is_value, not_equal,
};
use serde::Deserialize;
use serde_json::Value as JsonValue;

#[derive(Deserialize)]
struct Suite {
    tests: Vec<TestCase>,
}

#[derive(Deserialize)]
struct TestCase {
    id: String,
    operation: String,
    input: Input,
    expected: Expected,
}

#[derive(Deserialize)]
struct Input {
    profile: Option<String>,
    left: Option<Descriptor>,
    right: Option<Descriptor>,
    value: Option<Descriptor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Descriptor {
    category: String,
    value: Option<JsonValue>,
    semantic_type: Option<String>,
    container_kind: Option<String>,
    reason: Option<String>,
}

#[derive(Deserialize)]
struct Expected {
    outcome: String,
    value: Option<bool>,
    relation: Option<String>,
    reason: Option<String>,
}

#[test]
fn passes_every_stable_minimum_consumer_case() {
    let path = cts_root().join("value-semantics/v1/suites/01-minimum-consumer-contract.json");
    let suite: Suite = read_json(&path);
    assert_eq!(suite.tests.len(), 51, "{path:?}");

    for test in suite.tests {
        let profile = test
            .input
            .profile
            .as_deref()
            .map(Profile::from_id)
            .transpose()
            .unwrap_or_else(|error| panic!("{}: {error:?}", test.id))
            .unwrap_or(Profile::Default);
        let actual = match test.operation.as_str() {
            "isValue" => {
                Actual::Boolean(is_value(&descriptor(test.input.value.as_ref(), &test.id)))
            }
            "equal" => equality_result(equal(
                &descriptor(test.input.left.as_ref(), &test.id),
                &descriptor(test.input.right.as_ref(), &test.id),
                profile,
            )),
            "notEqual" => equality_result(not_equal(
                &descriptor(test.input.left.as_ref(), &test.id),
                &descriptor(test.input.right.as_ref(), &test.id),
                profile,
            )),
            "compare" => ordering_result(compare(
                &descriptor(test.input.left.as_ref(), &test.id),
                &descriptor(test.input.right.as_ref(), &test.id),
                profile,
            )),
            operation => panic!("{}: unsupported operation {operation}", test.id),
        };
        match actual {
            Actual::Boolean(value) => {
                assert_eq!(test.expected.outcome, "value", "{}", test.id);
                assert_eq!(Some(value), test.expected.value, "{}", test.id);
            }
            Actual::Relation(relation) => {
                assert_eq!(test.expected.outcome, "value", "{}", test.id);
                assert_eq!(
                    Some(relation),
                    test.expected.relation.as_deref(),
                    "{}",
                    test.id
                );
            }
            Actual::Diagnostic(reason) => {
                assert_eq!(test.expected.outcome, "diagnostic", "{}", test.id);
                assert_eq!(Some(reason), test.expected.reason.as_deref(), "{}", test.id);
            }
        }
    }
}

enum Actual {
    Boolean(bool),
    Relation(&'static str),
    Diagnostic(&'static str),
}
fn equality_result(result: Result<bool, sansa_runtime::value_semantics::ValueError>) -> Actual {
    result.map_or_else(|error| Actual::Diagnostic(error.reason), Actual::Boolean)
}
fn ordering_result(result: Result<Ordering, sansa_runtime::value_semantics::ValueError>) -> Actual {
    result.map_or_else(
        |error| Actual::Diagnostic(error.reason),
        |ordering| {
            Actual::Relation(match ordering {
                Ordering::Less => "less",
                Ordering::Equal => "equal",
                Ordering::Greater => "greater",
            })
        },
    )
}

fn descriptor(value: Option<&Descriptor>, id: &str) -> Value {
    let value = value.unwrap_or_else(|| panic!("{id}: missing descriptor"));
    let text = || {
        value
            .value
            .as_ref()
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    match value.category.as_str() {
        "finiteNumber" => Value::FiniteNumber(
            FiniteNumber::parse(text())
                .unwrap_or_else(|error| panic!("{id}: invalid finite number: {error:?}")),
        ),
        "positiveInfinity" => Value::PositiveInfinity,
        "negativeInfinity" => Value::NegativeInfinity,
        "nan" => Value::Nan,
        "string" => Value::String(text()),
        "boolean" => Value::Boolean(
            value
                .value
                .as_ref()
                .and_then(JsonValue::as_bool)
                .unwrap_or(false),
        ),
        "toggle" => Value::Toggle(text()),
        "hex" => Value::Hex(text()),
        "radix" => Value::Radix {
            payload: text(),
            semantic_type: value
                .semantic_type
                .clone()
                .unwrap_or_else(|| "radix".into()),
        },
        "encoding" => Value::Encoding(text()),
        "separator" => Value::Separator(text()),
        "symbol" => Value::Symbol(text()),
        "sansaAddress" => Value::SansaAddress(text()),
        "referenceForm" => {
            let object = value
                .value
                .as_ref()
                .and_then(JsonValue::as_object)
                .unwrap_or_else(|| panic!("{id}: invalid referenceForm"));
            Value::ReferenceForm {
                kind: object
                    .get("kind")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default()
                    .into(),
                target: object
                    .get("target")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default()
                    .into(),
            }
        }
        "temporal" => Value::Temporal {
            payload: text(),
            semantic_type: value
                .semantic_type
                .clone()
                .unwrap_or_else(|| "temporal".into()),
        },
        "explicitNull" => Value::ExplicitNull {
            reason: value.reason.clone().unwrap_or_default(),
        },
        "explicitAbsence" => Value::ExplicitAbsence {
            reason: value.reason.clone().unwrap_or_default(),
        },
        "missing" => Value::Missing,
        "container" => Value::Container {
            kind: value
                .container_kind
                .clone()
                .unwrap_or_else(|| "container".into()),
            payload: value
                .value
                .as_ref()
                .map(|value| container_value(value, id))
                .unwrap_or_else(|| ContainerValue::Object(BTreeMap::new())),
        },
        "bindingSet" => Value::BindingSet,
        category => panic!("{id}: unsupported category {category}"),
    }
}

fn container_value(value: &JsonValue, id: &str) -> ContainerValue {
    match value {
        JsonValue::Null => ContainerValue::Null,
        JsonValue::Bool(value) => ContainerValue::Scalar(Box::new(Value::Boolean(*value))),
        JsonValue::Number(value) => ContainerValue::Scalar(Box::new(Value::FiniteNumber(
            FiniteNumber::parse(value.to_string())
                .unwrap_or_else(|error| panic!("{id}: invalid nested finite number: {error:?}")),
        ))),
        JsonValue::String(value) => ContainerValue::Scalar(Box::new(Value::String(value.clone()))),
        JsonValue::Array(values) => ContainerValue::Sequence(
            values
                .iter()
                .map(|value| container_value(value, id))
                .collect(),
        ),
        JsonValue::Object(values) => ContainerValue::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), container_value(value, id)))
                .collect(),
        ),
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> T {
    let source =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("failed to read {path:?}: {error}"));
    serde_json::from_str(&source)
        .unwrap_or_else(|error| panic!("failed to parse {path:?}: {error}"))
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

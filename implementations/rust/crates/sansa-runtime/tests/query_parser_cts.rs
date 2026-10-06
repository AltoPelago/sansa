use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::query::{
    BinaryOperator, CardinalityOperator, ExistenceOperator, Expression, FromClause, LiteralValue,
    UnaryOperator, parse_expression, parse_query, render_expression,
};
use serde::Deserialize;
use serde_json::{Map, Number, Value, json};

#[derive(Deserialize)]
struct Suite {
    tests: Vec<TestCase>,
}

#[derive(Deserialize)]
struct TestCase {
    id: String,
    input: Input,
    expected: Value,
}

#[derive(Deserialize)]
struct Input {
    source: Option<String>,
    expression: Option<String>,
}

#[test]
fn passes_every_stable_query_clause_parser_case() {
    let path = cts_root().join("sansa/v1/suites/04-query-parser.json");
    let suite: Suite = read_json(&path);
    assert_eq!(suite.tests.len(), 14, "{path:?}");

    for test in suite.tests {
        let source = test.input.source.expect("query source");
        let expected_ok = test.expected["ok"].as_bool().expect("expected ok");
        let result = parse_query(&source);
        if expected_ok {
            let query = result.unwrap_or_else(|error| panic!("{}: {error:?}", test.id));
            let mut actual = Map::new();
            actual.insert("ok".into(), Value::Bool(true));
            actual.insert("canonical".into(), Value::String(query.canonical));
            actual.insert(
                "from".into(),
                Value::String(match &query.from {
                    FromClause::Address(address) => address.canonical.clone(),
                    FromClause::Path(expression) => render_expression(expression),
                }),
            );
            if let Some(clause) = query.where_clause {
                actual.insert("where".into(), Value::String(clause.expression));
            }
            if let Some(order) = query.order_by {
                actual.insert(
                    "order".into(),
                    Value::Array(
                        order
                            .keys
                            .into_iter()
                            .map(|key| {
                                json!({
                                    "expression": key.expression,
                                    "direction": key.direction.as_str(),
                                })
                            })
                            .collect(),
                    ),
                );
            }
            if let Some(offset) = query.offset {
                actual.insert("offset".into(), Value::Number(offset.into()));
            }
            if let Some(limit) = query.limit {
                actual.insert("limit".into(), Value::Number(limit.into()));
            }
            actual.insert("select".into(), Value::String(query.select.expression));
            actual.insert(
                "clauses".into(),
                Value::Array(
                    query
                        .clauses
                        .into_iter()
                        .map(|clause| Value::String(clause.as_str().into()))
                        .collect(),
                ),
            );
            assert_partial(&test.expected, &Value::Object(actual), &test.id);
        } else {
            let error = result.expect_err(&test.id);
            assert_eq!(
                Some(error.code.as_str()),
                test.expected["error"].as_str(),
                "{}",
                test.id
            );
        }
    }
}

#[test]
fn passes_every_stable_query_expression_parser_case() {
    let path = cts_root().join("sansa/v1/suites/05-query-expression-parser.json");
    let suite: Suite = read_json(&path);
    assert_eq!(suite.tests.len(), 43, "{path:?}");

    for test in suite.tests {
        let source = test.input.expression.expect("query expression");
        let expected_ok = test.expected["ok"].as_bool().expect("expected ok");
        let result = parse_expression(&source);
        if expected_ok {
            let expression = result.unwrap_or_else(|error| panic!("{}: {error:?}", test.id));
            let actual = json!({
                "ok": true,
                "canonical": render_expression(&expression),
                "ast": expression_json(&expression),
            });
            assert_partial(&test.expected, &actual, &test.id);
        } else {
            let error = result.expect_err(&test.id);
            assert_eq!(
                Some(error.code.as_str()),
                test.expected["error"].as_str(),
                "{}",
                test.id
            );
        }
    }
}

fn expression_json(expression: &Expression) -> Value {
    match expression {
        Expression::Literal(literal) => {
            let mut value = Map::from_iter([
                ("type".into(), Value::String(expression.kind().into())),
                ("kind".into(), Value::String(literal.kind.as_str().into())),
                ("canonical".into(), Value::String(literal.canonical.clone())),
            ]);
            match &literal.value {
                LiteralValue::Text(text) => {
                    value.insert("value".into(), Value::String(text.clone()));
                }
                LiteralValue::Number(number) => {
                    let json_number = number
                        .parse::<Number>()
                        .unwrap_or_else(|error| panic!("invalid JSON number {number}: {error}"));
                    value.insert("value".into(), Value::Number(json_number));
                }
                LiteralValue::Boolean(boolean) => {
                    value.insert("value".into(), Value::Bool(*boolean));
                }
                LiteralValue::Null { reason } => {
                    value.insert("value".into(), Value::Null);
                    value.insert("nullReason".into(), Value::String(reason.clone()));
                }
            }
            Value::Object(value)
        }
        Expression::CurrentBinding => json!({
            "type": expression.kind(),
            "canonical": render_expression(expression),
        }),
        Expression::Resolution {
            scope, canonical, ..
        } => json!({
            "type": expression.kind(),
            "scope": scope.as_str(),
            "canonical": canonical,
        }),
        Expression::Group(inner) => json!({
            "type": expression.kind(),
            "expression": expression_json(inner),
            "canonical": render_expression(expression),
        }),
        Expression::Unary { operator, argument } => json!({
            "type": expression.kind(),
            "operator": match operator { UnaryOperator::Not => "not" },
            "argument": expression_json(argument),
            "canonical": render_expression(expression),
        }),
        Expression::Binary {
            operator,
            left,
            right,
        } => json!({
            "type": expression.kind(),
            "operator": binary_operator(*operator),
            "left": expression_json(left),
            "right": expression_json(right),
            "canonical": render_expression(expression),
        }),
        Expression::FunctionCall { name, arguments } => json!({
            "type": expression.kind(),
            "name": name,
            "arguments": arguments.iter().map(expression_json).collect::<Vec<_>>(),
            "canonical": render_expression(expression),
        }),
        Expression::Existence { operator, argument } => json!({
            "type": expression.kind(),
            "operator": match operator {
                ExistenceOperator::Exists => "exists",
                ExistenceOperator::Absent => "absent",
            },
            "argument": expression_json(argument),
            "canonical": render_expression(expression),
        }),
        Expression::Cardinality { operator, argument } => json!({
            "type": expression.kind(),
            "operator": match operator {
                CardinalityOperator::Any => "any",
                CardinalityOperator::All => "all",
                CardinalityOperator::None => "none",
            },
            "argument": expression_json(argument),
            "canonical": render_expression(expression),
        }),
        Expression::Projection { fields } => json!({
            "type": expression.kind(),
            "fields": fields.iter().map(|field| json!({
                "type": "projectionField",
                "name": field.name,
                "expression": expression_json(&field.expression),
            })).collect::<Vec<_>>(),
            "canonical": render_expression(expression),
        }),
    }
}

fn binary_operator(operator: BinaryOperator) -> &'static str {
    operator.as_str()
}

fn assert_partial(expected: &Value, actual: &Value, context: &str) {
    match expected {
        Value::Object(expected) => {
            let actual = actual
                .as_object()
                .unwrap_or_else(|| panic!("{context}: expected object, got {actual}"));
            for (key, value) in expected {
                let observed = actual
                    .get(key)
                    .unwrap_or_else(|| panic!("{context}: missing key {key} in {actual:?}"));
                assert_partial(value, observed, &format!("{context}.{key}"));
            }
        }
        Value::Array(expected) => {
            let actual = actual
                .as_array()
                .unwrap_or_else(|| panic!("{context}: expected array, got {actual}"));
            assert_eq!(actual.len(), expected.len(), "{context}");
            for (index, value) in expected.iter().enumerate() {
                assert_partial(value, &actual[index], &format!("{context}[{index}]"));
            }
        }
        _ => assert_eq!(actual, expected, "{context}"),
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

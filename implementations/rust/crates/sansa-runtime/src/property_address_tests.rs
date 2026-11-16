use crate::address::{ParseOptions, parse_address, parse_address_with_options, render_address};
use crate::evaluate::{EvaluateOptions, evaluate_query};
use crate::resolve::{Namespace, ResolveOptions, resolve_address};
use serde_json::Value as J;
use std::cell::Cell;

#[test]
fn prepared_parser_expectations() {
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/property-parser-candidate-v1.json"
    ))
    .expect("fixture");
    let tests = suite["tests"].as_array().expect("tests");
    assert_eq!(tests.len(), 34);
    for vector in tests {
        let id = vector["id"].as_str().expect("id");
        let input = &vector["input"];
        let expected = &vector["expected"];
        let source = if let Some(source) = input["source"].as_str() {
            source.to_owned()
        } else {
            let generated = &input["generate"];
            let count = generated["count"].as_u64().expect("count") as usize;
            match generated["kind"].as_str().expect("kind") {
                "payload" => {
                    let scalar = generated["scalar"].as_str().unwrap_or("x");
                    let payload = if generated["encoding"] == "escaped" {
                        format!(
                            "\"{}\"",
                            format!("\\u{{{:X}}}", scalar.chars().next().expect("scalar") as u32)
                                .repeat(count)
                        )
                    } else {
                        serde_json::to_string(&scalar.repeat(count)).expect("payload")
                    };
                    format!("$&key({payload})")
                }
                "selectors" => format!("${}", "&key(\"x\")".repeat(count)),
                "canonical" => format!("$.[\"@{}\"]&key(\"x\")", "x".repeat(count - 16)),
                _ => panic!("unknown generator"),
            }
        };
        let options = ParseOptions {
            max_position_index: input["options"]["parse"]["maxPositionIndex"]
                .as_u64()
                .map_or(999999, |x| x as usize),
        };
        let result = parse_address_with_options(&source, options);
        assert_eq!(
            result.is_ok(),
            expected["ok"].as_bool().expect("ok"),
            "{id}"
        );
        match result {
            Ok(parsed) => {
                let address = parsed.address;
                assert_eq!(
                    Some(address.is_exact),
                    expected["isExact"].as_bool(),
                    "{id}"
                );
                if let Some(canonical) = expected["canonical"].as_str() {
                    assert_eq!(address.canonical, canonical, "{id}");
                }
                assert_eq!(render_address(&address), address.canonical, "{id}");
                assert_eq!(
                    parse_address_with_options(&address.canonical, options)
                        .expect("reparse")
                        .address
                        .canonical,
                    address.canonical,
                    "{id}"
                );
            }
            Err(error) => {
                assert_eq!(
                    Some(error.code.as_str()),
                    expected["error"].as_str(),
                    "{id}"
                );
                if let Some(kind) = expected["limitKind"].as_str() {
                    assert_eq!(error.limit_kind, Some(kind), "{id}");
                    assert_eq!(error.limit.map(|x| x as u64), expected["limit"].as_u64());
                    assert_eq!(
                        error.observed.map(|x| x as u64),
                        expected["observed"].as_u64()
                    );
                }
            }
        }
    }
}
struct Host {
    reads: Cell<usize>,
}

#[test]
fn property_denial_precedes_absolute_and_contextual_root_acquisition() {
    struct RootHost {
        calls: Cell<usize>,
        missing: bool,
    }
    impl Namespace for RootHost {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            self.calls.set(self.calls.get() + 1);
            (!self.missing).then_some(0)
        }
        fn contextual_root(&self) -> Option<usize> {
            self.calls.set(self.calls.get() + 1);
            (!self.missing).then_some(0)
        }
        fn children(&self, _: &usize) -> Vec<usize> {
            panic!("denied property must not navigate")
        }
    }
    for missing in [false, true] {
        let host = RootHost {
            calls: Cell::new(0),
            missing,
        };
        for source in [
            "$&key(\"x\")",
            "$.missing&tag(\"x\")",
            "?&key(\"x\")",
            "?.missing&tag(\"x\")",
        ] {
            let address = parse_address(source).expect("address");
            let options = ResolveOptions::default();
            for result in [
                resolve_address(source, &host, &options),
                crate::resolve::resolve_parsed_address(&address, &host, &options),
            ] {
                assert_eq!(result.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
            }
            assert_eq!(host.calls.get(), 0);
        }
        let result = resolve_address("$", &host, &ResolveOptions::default());
        assert_eq!(host.calls.get(), 1);
        assert_eq!(result.is_ok(), !missing);
        let result = resolve_address("?", &host, &ResolveOptions::default());
        assert_eq!(host.calls.get(), 2);
        assert_eq!(result.is_ok(), !missing);
    }
}
impl Namespace for Host {
    type Binding = usize;
    fn root(&self) -> Option<usize> {
        Some(0)
    }
    fn children(&self, _: &usize) -> Vec<usize> {
        self.reads.set(self.reads.get() + 1);
        vec![]
    }
}
#[test]
fn parser_support_does_not_admit_execution_or_empty_branch_bypass() {
    let host = Host {
        reads: Cell::new(0),
    };
    for source in ["$.missing&key(\"x\")", "$&tag(\"x\")"] {
        let result = resolve_address(source, &host, &ResolveOptions::default());
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
    }
    // Query cursor integration follows in its own slice. Text fails during parsing;
    // caller Query ASTs must also be denied before evaluating an empty source.
    for source in [
        "from $.missing\nselect $&key(\"x\")",
        "from $\nwhere false and exists($&tag(\"x\"))\nselect .",
        "from $.missing\norder by $&tag(\"x\")\nselect .",
    ] {
        let result = evaluate_query(source, &host, &EvaluateOptions::default());
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].phase, Some(crate::DiagnosticPhase::Parse));
    }
    let mut query = crate::query::parse_query("from $.missing\nselect .").expect("legacy Query");
    query.select.ast = crate::query::Expression::Resolution {
        scope: crate::query::ResolutionScope::Absolute,
        address: parse_address("$&key(\"x\")").expect("address"),
        canonical: "$&key(\"x\")".into(),
    };
    let result = crate::evaluate::evaluate_parsed_query(&query, &host, &EvaluateOptions::default());
    assert_eq!(result.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
    assert_eq!(result.errors[0].phase, Some(crate::DiagnosticPhase::Policy));
    assert_eq!(host.reads.get(), 0);
}
#[test]
fn deep_property_qualifier_parsing_rendering_and_drop_are_iterative() {
    let source = format!("$&key(\"x\"):{}b{}", "a<".repeat(6000), ">".repeat(6000));
    let address = parse_address(&source).expect("deep valid input");
    assert_eq!(render_address(&address), source);
    drop(address);
    assert!(parse_address(&format!("${}", ".x".repeat(257))).is_ok());
}

#[test]
fn native_property_ast_bounds_precede_namespace_access_and_preserve_native_indexes() {
    let host = Host {
        reads: Cell::new(0),
    };
    let mut address = parse_address("$&key(\"x\")").expect("address");
    address.selectors[0] = crate::address::Selector::PropertyFilter {
        property: crate::address::PropertyName::Key,
        value: "x".repeat(4097),
    };
    let result =
        crate::resolve::resolve_parsed_address(&address, &host, &ResolveOptions::default());
    assert_eq!(result.errors[0].code, "SANSA_RESOLVE_INVALID_ADDRESS");
    address.selectors = vec![
        crate::address::Selector::Position { index: 1_000_001 },
        crate::address::Selector::PropertyFilter {
            property: crate::address::PropertyName::Key,
            value: "x".into(),
        },
    ];
    address.is_exact = true;
    address.canonical = "$".into();
    let result =
        crate::resolve::resolve_parsed_address(&address, &host, &ResolveOptions::default());
    assert_eq!(result.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
    assert_eq!(host.reads.get(), 0);
}

#[test]
fn standalone_expression_preflight_cannot_short_circuit_a_property() {
    use crate::query::{BinaryOperator, ExistenceOperator, Expression, ResolutionScope};
    let host = Host {
        reads: Cell::new(0),
    };
    let literal = crate::query::parse_query("from $\nselect true")
        .expect("query")
        .select
        .ast;
    let address = parse_address("$&key(\"x\")").expect("address");
    let expression = Expression::Binary {
        operator: BinaryOperator::Or,
        left: Box::new(literal),
        right: Box::new(Expression::Existence {
            operator: ExistenceOperator::Exists,
            argument: Box::new(Expression::Resolution {
                scope: ResolutionScope::Absolute,
                canonical: address.canonical.clone(),
                address,
            }),
        }),
    };
    let result =
        crate::evaluate::evaluate_expression(&expression, &0, &host, &EvaluateOptions::default());
    assert_eq!(
        result.expect_err("property must be denied").code,
        "SANSA_RESOLVE_UNSUPPORTED_SELECTOR"
    );
    assert_eq!(host.reads.get(), 0);
}

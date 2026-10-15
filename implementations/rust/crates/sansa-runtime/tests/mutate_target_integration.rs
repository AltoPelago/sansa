use sansa_runtime::mutate::{
    MutationPhase, MutationRequest, MutationValue, MutationValueIntent, PlanMutationOptions,
    PlanMutationResult, RequestedCreateOperation, RequestedInsertOperation, RequestedMoveOperation,
    RequestedMutationOperation, RequestedMutationPlacement, RequestedRemoveOperation,
    RequestedReplaceOperation, plan_mutation,
};
use sansa_runtime::mutate_target::{
    ValidateMutationPlanTargetResult, validate_mutation_plan_target,
};
use sansa_runtime::query::{Expression, parse_expression, parse_query};
use sansa_runtime::resolve::{Namespace, Navigation};
use sansa_runtime::value_semantics::Value;

#[test]
fn aeon_014_calendar_clock_matrix_aligns_parser_and_native_target_values() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/aeon-014-values.json"))
            .expect("valid value fixture");
    let strings = |field: &str| -> Vec<&str> {
        fixture[field]
            .as_array()
            .expect("fixture string array")
            .iter()
            .map(|value| value.as_str().expect("fixture string"))
            .collect()
    };
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "string",
    };
    let target = |payload: &str, kind: &str, native: bool| {
        let value = if native {
            Value::Temporal {
                payload: payload.into(),
                semantic_type: kind.into(),
            }
        } else {
            Value::String(payload.into())
        };
        let request = MutationRequest {
            operations: vec![RequestedMutationOperation::Replace(
                RequestedReplaceOperation {
                    target: "$.items[0]".into(),
                    value: MutationValueIntent {
                        value: MutationValue::try_scalar(value).expect("scalar fixture"),
                        datatype: (!native).then(|| kind.into()),
                        kind: None,
                    },
                    provenance: None,
                },
            )],
            ..Default::default()
        };
        let PlanMutationResult::Planned(plan) =
            plan_mutation(&request, &namespace, &PlanMutationOptions::default())
        else {
            panic!("plan {payload}");
        };
        matches!(
            validate_mutation_plan_target(&plan, "aeon"),
            ValidateMutationPlanTargetResult::Validated { .. }
        )
    };
    let check = |source: &str, kind: &str| {
        let Expression::Literal(literal) =
            parse_expression(source).unwrap_or_else(|error| panic!("{source}: {error:?}"))
        else {
            panic!("literal {source}");
        };
        assert_eq!(literal.kind.as_str(), kind, "{source}");
        assert_eq!(literal.canonical, source);
        assert!(
            parse_query(&format!("from $.items[0]\nselect {source}")).is_ok(),
            "{source}"
        );
        for native in [true, false] {
            assert!(target(source, kind, native), "{source} native={native}");
        }
    };
    for date in strings("dates") {
        check(date, "date");
    }
    for clock in strings("clocks")
        .into_iter()
        .filter(|clock| clock.contains(':'))
    {
        for anchor in strings("anchors") {
            check(&format!("{clock}{anchor}"), "time");
        }
    }
    for date in strings("dates") {
        for clock in strings("clocks") {
            for anchor in strings("anchors") {
                for context in strings("contexts") {
                    check(
                        &format!("{date}T{clock}{anchor}{context}"),
                        if context.is_empty() {
                            "datetime"
                        } else {
                            "wtc"
                        },
                    );
                }
            }
        }
    }
    for source in strings("invalid") {
        assert!(parse_expression(source).is_err(), "{source}");
        assert!(
            parse_expression(&format!("temporalRelation({source}, {source})")).is_err(),
            "nested {source}"
        );
        let kind = if source.contains('T') {
            if source.contains('&') {
                "wtc"
            } else {
                "datetime"
            }
        } else if source.contains(':') {
            "time"
        } else {
            "date"
        };
        for native in [true, false] {
            assert!(!target(source, kind, native), "{source} native={native}");
        }
    }
    for (source, kind) in [
        ("2024-\n", "date"),
        ("10: //comment", "time"),
        ("2024-T10: ", "datetime"),
        ("2024-T10:&local\r", "wtc"),
    ] {
        for native in [true, false] {
            assert!(!target(source, kind, native), "{source:?} native={native}");
        }
    }
}

#[test]
fn reserved_base64_requires_decodability_without_narrowing_other_encoding_aliases() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/aeon-014-values.json"))
            .expect("valid value fixture");
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "string",
    };
    for (field, expected) in [
        ("base64_valid", true),
        ("base64_opaque_only", false),
        ("encoding_invalid", false),
    ] {
        for payload in fixture[field].as_array().expect("encoding fixture array") {
            let payload = payload.as_str().expect("encoding fixture string");
            for datatype in ["base64", "encoding", "embed", "inline"] {
                for native in [true, false] {
                    let value = if native {
                        Value::Encoding(payload.into())
                    } else {
                        Value::String(payload.into())
                    };
                    let request = MutationRequest {
                        operations: vec![RequestedMutationOperation::Replace(
                            RequestedReplaceOperation {
                                target: "$.items[0]".into(),
                                value: MutationValueIntent {
                                    value: MutationValue::try_scalar(value)
                                        .expect("scalar fixture"),
                                    datatype: Some(datatype.into()),
                                    kind: None,
                                },
                                provenance: None,
                            },
                        )],
                        ..Default::default()
                    };
                    let PlanMutationResult::Planned(plan) =
                        plan_mutation(&request, &namespace, &PlanMutationOptions::default())
                    else {
                        panic!("plan");
                    };
                    let accepted = matches!(
                        validate_mutation_plan_target(&plan, "aeon"),
                        ValidateMutationPlanTargetResult::Validated { .. }
                    );
                    let encoding_lexical = field != "encoding_invalid";
                    assert_eq!(
                        accepted,
                        if datatype == "base64" {
                            expected
                        } else {
                            encoding_lexical
                        },
                        "{datatype}:{payload} native={native}"
                    );
                }
            }
        }
    }
}

#[test]
fn base64_reference_values_are_addresses_not_encoding_payloads() {
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "string",
    };
    for kind in ["cloneReference", "pointerReference", "referenceForm"] {
        for (address, expected) in [
            ("target", true),
            ("path.to", true),
            ("$.target", true),
            ("$.[\"literal.key\"]", true),
            ("", false),
            ("target.*", false),
            ("target..child", false),
            ("target child", false),
        ] {
            // Native descriptors work with and without a redundant explicit
            // kind hint; plain strings require the explicit reference kind.
            for (native, hinted) in [(false, true), (true, true), (true, false)] {
                let value = if native {
                    Value::ReferenceForm {
                        kind: kind.into(),
                        target: address.into(),
                    }
                } else {
                    Value::String(address.into())
                };
                let request = MutationRequest {
                    operations: vec![RequestedMutationOperation::Replace(
                        RequestedReplaceOperation {
                            target: "$.items[0]".into(),
                            value: MutationValueIntent {
                                value: MutationValue::try_scalar(value)
                                    .expect("reference fixture scalar"),
                                datatype: Some("base64".into()),
                                kind: hinted.then(|| kind.into()),
                            },
                            provenance: None,
                        },
                    )],
                    ..Default::default()
                };
                let PlanMutationResult::Planned(plan) =
                    plan_mutation(&request, &namespace, &PlanMutationOptions::default())
                else {
                    panic!("reference fixture plan");
                };
                let accepted = matches!(
                    validate_mutation_plan_target(&plan, "aeon"),
                    ValidateMutationPlanTargetResult::Validated { .. }
                );
                assert_eq!(
                    accepted, expected,
                    "{kind}:{address} native={native} hinted={hinted}"
                );
            }
        }
    }
}

#[test]
fn symbols_and_trimtick_intent_preserve_their_distinct_native_boundaries() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/aeon-014-values.json"))
            .expect("valid value fixture");
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "string",
    };
    for source in fixture["symbols"].as_array().expect("symbol fixture array") {
        let source = source.as_str().expect("symbol fixture string");
        let Expression::Literal(literal) = parse_expression(source).expect("valid symbol") else {
            panic!("symbol literal");
        };
        assert_eq!(literal.kind.as_str(), "symbol");
        assert!(parse_expression(&literal.canonical).is_ok());
    }
    for source in fixture["invalid_symbols"]
        .as_array()
        .expect("invalid symbol fixture array")
    {
        assert!(parse_expression(source.as_str().expect("invalid symbol string")).is_err());
    }
    for (datatype, payload, expected) in [
        ("symbol", "approved", true),
        ("symbol", "", false),
        ("prose", "\nfirst\n\t second", true),
        ("trimtick", "  first\n second", true),
        ("prose", "\t ", true),
        ("trimtick", "", true),
        ("prose", "first\n", false),
        ("trimtick", "\n\n", false),
        ("prose", "first\n \t\nlast", false),
        ("string", "first\n \t\nlast\n", true),
    ] {
        let value = if datatype == "symbol" {
            Value::Symbol(payload.into())
        } else {
            Value::String(payload.into())
        };
        let request = MutationRequest {
            operations: vec![RequestedMutationOperation::Replace(
                RequestedReplaceOperation {
                    target: "$.items[0]".into(),
                    value: MutationValueIntent {
                        value: MutationValue::try_scalar(value).expect("scalar fixture"),
                        datatype: Some(datatype.into()),
                        kind: None,
                    },
                    provenance: None,
                },
            )],
            ..Default::default()
        };
        let PlanMutationResult::Planned(plan) =
            plan_mutation(&request, &namespace, &PlanMutationOptions::default())
        else {
            panic!("plan");
        };
        assert_eq!(
            matches!(
                validate_mutation_plan_target(&plan, "aeon"),
                ValidateMutationPlanTargetResult::Validated { .. }
            ),
            expected,
            "{datatype}: {payload:?}"
        );
    }
}

// Use the real planner and public target-validation entry point: helper-only
// tests cannot detect a guard attached to the wrong built-in validator.
struct TestNamespace {
    container_kind: &'static str,
    first_child_kind: &'static str,
}

impl Namespace for TestNamespace {
    type Binding = usize;

    fn root(&self) -> Option<usize> {
        Some(0)
    }

    fn children(&self, binding: &usize) -> Vec<usize> {
        match binding {
            0 => vec![1],
            1 => vec![2, 3],
            4 => vec![5],
            _ => vec![],
        }
    }

    fn parent(&self, binding: &usize) -> Navigation<usize> {
        match binding {
            1 => Navigation::Binding(0),
            2..=4 => Navigation::Binding(1),
            5 => Navigation::Binding(4),
            _ => Navigation::Missing,
        }
    }

    fn attribute_space(&self, binding: &usize) -> Navigation<usize> {
        if *binding == 1 {
            Navigation::Binding(4)
        } else {
            Navigation::Missing
        }
    }

    fn name(&self, binding: &usize) -> Option<String> {
        match binding {
            1 => Some("items".into()),
            5 => Some("note".into()),
            _ => None,
        }
    }

    fn position(&self, binding: &usize) -> Option<usize> {
        match binding {
            2 => Some(0),
            3 => Some(1),
            _ => None,
        }
    }

    fn representation_kind(&self, binding: &usize) -> Option<String> {
        Some(
            match binding {
                0 => "object",
                1 => self.container_kind,
                2 => self.first_child_kind,
                4 => "attributeSpace",
                _ => "string",
            }
            .into(),
        )
    }

    fn binding_address(&self, binding: &usize) -> Option<String> {
        Some(
            match binding {
                0 => "$",
                1 => "$.items",
                2 => "$.items[0]",
                3 => "$.items[1]",
                4 => "$.items.@",
                5 => "$.items.@.note",
                _ => return None,
            }
            .into(),
        )
    }
}

fn value() -> MutationValueIntent {
    MutationValueIntent {
        value: MutationValue::try_scalar(Value::String("updated".into())).expect("string scalar"),
        datatype: None,
        kind: None,
    }
}

fn operations() -> Vec<RequestedMutationOperation> {
    vec![
        RequestedMutationOperation::Create(RequestedCreateOperation {
            parent: "$.items".into(),
            name: "new".into(),
            value: value(),
            provenance: None,
        }),
        RequestedMutationOperation::Replace(RequestedReplaceOperation {
            target: "$.items".into(),
            value: value(),
            provenance: None,
        }),
        RequestedMutationOperation::Remove(RequestedRemoveOperation {
            target: "$.items".into(),
            provenance: None,
        }),
        RequestedMutationOperation::Insert(RequestedInsertOperation {
            container: "$.items".into(),
            placement: RequestedMutationPlacement::Last,
            value: value(),
            provenance: None,
        }),
        RequestedMutationOperation::Move(RequestedMoveOperation {
            source: "$.items[0]".into(),
            container: "$.items".into(),
            placement: RequestedMutationPlacement::After("$.items[1]".into()),
            provenance: None,
        }),
    ]
}

fn check_formats(
    namespace: &impl Namespace<Binding = usize>,
    operation: RequestedMutationOperation,
    json_accepts: bool,
) {
    check_formats_with_options(
        namespace,
        operation,
        json_accepts,
        &PlanMutationOptions::default(),
    );
}

fn check_formats_with_options(
    namespace: &impl Namespace<Binding = usize>,
    operation: RequestedMutationOperation,
    json_accepts: bool,
    options: &PlanMutationOptions<usize>,
) {
    let operation_kind = operation.kind();
    let request = MutationRequest {
        operations: vec![operation],
        ..MutationRequest::default()
    };
    let PlanMutationResult::Planned(plan) = plan_mutation(&request, namespace, options) else {
        panic!("{operation_kind:?} did not produce a plan");
    };
    for format in ["aeon", "", "json", "json-compatible"] {
        let result = validate_mutation_plan_target(&plan, format);
        if json_accepts || matches!(format, "aeon" | "") {
            assert!(
                matches!(result, ValidateMutationPlanTargetResult::Validated { .. }),
                "{operation_kind:?}, {format:?}: {result:?}"
            );
        } else {
            let ValidateMutationPlanTargetResult::Rejected(errors) = result else {
                panic!("{operation_kind:?}, {format:?} must reject AEON-only targets");
            };
            assert_eq!(errors.len(), 1);
            assert_eq!(errors[0].code, "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE");
            assert_eq!(errors[0].phase, MutationPhase::Target);
            assert_eq!(errors[0].operation_index, Some(0));
            assert_eq!(errors[0].target_format.as_deref(), Some("json"));
        }
    }
}

#[test]
fn public_validators_keep_container_rules_on_the_correct_format() {
    for kind in ["list", "tuple", "node"] {
        let namespace = TestNamespace {
            container_kind: kind,
            first_child_kind: "string",
        };
        for operation in operations() {
            check_formats(&namespace, operation, kind == "list");
        }
    }
}

#[test]
fn public_json_validator_checks_attribute_parents_and_value_free_removals() {
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "string",
    };
    for operation in [
        RequestedMutationOperation::Create(RequestedCreateOperation {
            parent: "$.items.@".into(),
            name: "new".into(),
            value: value(),
            provenance: None,
        }),
        RequestedMutationOperation::Replace(RequestedReplaceOperation {
            target: "$.items.@.note".into(),
            value: value(),
            provenance: None,
        }),
        RequestedMutationOperation::Remove(RequestedRemoveOperation {
            target: "$.items.@.note".into(),
            provenance: None,
        }),
    ] {
        check_formats(&namespace, operation, false);
    }
}

#[test]
fn public_json_validator_checks_move_sources_as_well_as_containers() {
    let namespace = TestNamespace {
        container_kind: "list",
        first_child_kind: "node",
    };
    let operation = operations().pop().expect("move operation");
    check_formats(&namespace, operation, false);
}

struct QuotedNamespace {
    inner: TestNamespace,
    name: &'static str,
}

impl Namespace for QuotedNamespace {
    type Binding = usize;

    fn root(&self) -> Option<usize> {
        self.inner.root()
    }

    fn children(&self, binding: &usize) -> Vec<usize> {
        self.inner.children(binding)
    }

    fn parent(&self, binding: &usize) -> Navigation<usize> {
        self.inner.parent(binding)
    }

    fn attribute_space(&self, binding: &usize) -> Navigation<usize> {
        self.inner.attribute_space(binding)
    }

    fn name(&self, binding: &usize) -> Option<String> {
        if *binding == 1 {
            Some(self.name.into())
        } else {
            self.inner.name(binding)
        }
    }

    fn position(&self, binding: &usize) -> Option<usize> {
        self.inner.position(binding)
    }

    fn representation_kind(&self, binding: &usize) -> Option<String> {
        self.inner.representation_kind(binding)
    }

    fn binding_address(&self, binding: &usize) -> Option<String> {
        self.inner.binding_address(binding).map(|address| {
            address.replace(
                "$.items",
                &format!(
                    "$.[{}]",
                    serde_json::to_string(self.name).expect("quoted name")
                ),
            )
        })
    }
}

#[test]
fn quoted_member_text_is_distinct_from_attribute_selectors() {
    for name in ["literal.@key", "quote\".@key", "slash\\.@key"] {
        let namespace = QuotedNamespace {
            inner: TestNamespace {
                container_kind: "list",
                first_child_kind: "string",
            },
            name,
        };
        let path = namespace.binding_address(&1).expect("quoted path");
        for mut operation in operations() {
            match &mut operation {
                RequestedMutationOperation::Create(op) => op.parent = path.as_str().into(),
                RequestedMutationOperation::Replace(op) => op.target = path.as_str().into(),
                RequestedMutationOperation::Remove(op) => op.target = path.as_str().into(),
                RequestedMutationOperation::Insert(op) => op.container = path.as_str().into(),
                RequestedMutationOperation::Move(op) => {
                    op.source = format!("{path}[0]").into();
                    op.container = path.as_str().into();
                    op.placement = RequestedMutationPlacement::After(format!("{path}[1]").into());
                }
            }
            check_formats(&namespace, operation, true);
        }
        for target in [path.clone(), format!("{path}.@.note")] {
            let json_accepts = target == path;
            for operation in [
                RequestedMutationOperation::Replace(RequestedReplaceOperation {
                    target: target.as_str().into(),
                    value: value(),
                    provenance: None,
                }),
                RequestedMutationOperation::Remove(RequestedRemoveOperation {
                    target: target.as_str().into(),
                    provenance: None,
                }),
            ] {
                check_formats(&namespace, operation, json_accepts);
            }
        }
        // The requested contextual address has no attribute selector, so the
        // validator must also inspect the host's canonical address.
        let options = PlanMutationOptions {
            resolve: sansa_runtime::resolve::ResolveOptions {
                contextual_root: Some(5),
                ..Default::default()
            },
            ..Default::default()
        };
        let mut member_options = options.clone();
        member_options.resolve.contextual_root = Some(1);
        check_formats_with_options(
            &namespace,
            RequestedMutationOperation::Remove(RequestedRemoveOperation {
                target: "?".into(),
                provenance: None,
            }),
            true,
            &member_options,
        );
        check_formats_with_options(
            &namespace,
            RequestedMutationOperation::Remove(RequestedRemoveOperation {
                target: "?".into(),
                provenance: None,
            }),
            false,
            &options,
        );
    }
}

use sansa_runtime::mutate::{
    MutationPhase, MutationRequest, MutationValue, MutationValueIntent, PlanMutationOptions,
    PlanMutationResult, RequestedCreateOperation, RequestedInsertOperation, RequestedMoveOperation,
    RequestedMutationOperation, RequestedMutationPlacement, RequestedRemoveOperation,
    RequestedReplaceOperation, plan_mutation,
};
use sansa_runtime::mutate_target::{
    ValidateMutationPlanTargetResult, validate_mutation_plan_target,
};
use sansa_runtime::resolve::{Namespace, Navigation};
use sansa_runtime::value_semantics::Value;

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

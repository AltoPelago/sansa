//! Runtime-owned regression mirrors, not an advertised CTS protocol adapter.
use crate::property::*;
use crate::resolve::{
    Namespace, Navigation, ResolveOptions, resolve_address, resolve_parsed_address,
};
use serde_json::{Value as J, json};
use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashMap, HashSet};

struct Host {
    rows: Vec<J>,
    ids: HashMap<String, usize>,
    parents: Vec<Option<usize>>,
    input: J,
    calls: RefCell<BTreeMap<String, usize>>,
    reentered: Cell<bool>,
    nested_result: RefCell<Option<crate::evaluate::QueryOutput<usize>>>,
}
impl Host {
    fn new(input: &J) -> Self {
        Self::from_fixture(input, false)
    }
    fn tagged(input: &J) -> Self {
        Self::from_fixture(input, true)
    }
    fn from_fixture(input: &J, tagged: bool) -> Self {
        let fixture: J = serde_json::from_str(include_str!(
            "../tests/fixtures/property-namespace-candidate-v1.json"
        ))
        .expect("fixture");
        let mut rows = fixture["namespace"]["bindings"]
            .as_array()
            .expect("bindings")
            .clone();
        let ids: HashMap<_, _> = rows
            .iter()
            .enumerate()
            .map(|(i, r)| (r["id"].as_str().expect("id").to_owned(), i))
            .collect();
        if tagged {
            rows[ids["doc"]]["tag"] = json!("document");
            rows[ids["doc"]]["children"] = json!(["apple", "note", "orange"]);
            for (index, id, tag) in [
                (0, "apple", "product"),
                (1, "note", "note"),
                (2, "orange", "product"),
            ] {
                let row = &mut rows[ids[id]];
                row["address"] = json!(format!("$.document[{index}]"));
                row["index"] = json!(index);
                row["tag"] = json!(tag);
                row["children"] = json!([]);
            }
        }
        let mut h = Self {
            parents: vec![None; rows.len()],
            rows,
            ids,
            input: input.clone(),
            calls: RefCell::new(BTreeMap::new()),
            reentered: Cell::new(false),
            nested_result: RefCell::new(None),
        };
        for i in 0..h.rows.len() {
            for child in h.links(i) {
                h.parents[child] = Some(i);
            }
        }
        h
    }
    fn id(&self, id: &str) -> usize {
        *self.ids.get(id).expect("known id")
    }
    fn bump(&self, name: &str) {
        *self.calls.borrow_mut().entry(name.into()).or_default() += 1;
    }
    fn omitted(&self, name: &str) -> bool {
        self.input["omit"]
            .as_array()
            .is_some_and(|a| a.iter().any(|v| v == name))
    }
    fn scripted(
        &self,
        name: &str,
        binding: usize,
        at: Option<usize>,
    ) -> Result<Option<&J>, PropertyAccessError> {
        self.bump(name);
        let fault = self.input["faults"].as_array().and_then(|a| {
            a.iter().find(|f| {
                f["callback"] == name
                    && f["binding"] == self.rows[binding]["id"]
                    && (f["at"].is_null() || f["at"].as_u64().map(|v| v as usize) == at)
            })
        });
        let Some(fault) = fault else { return Ok(None) };
        if fault["action"] == "throw" {
            return Err(PropertyAccessError::AdapterFailure);
        }
        if fault["action"] == "absent" {
            return Ok(Some(&J::Null));
        }
        Ok(Some(&fault["value"]))
    }
    fn links(&self, binding: usize) -> Vec<usize> {
        let row = &self.rows[binding];
        let mut result = Vec::new();
        if let Some(children) = row["children"].as_array() {
            for id in children {
                result.push(self.id(id.as_str().expect("child")));
            }
        }
        if let Some(id) = row["attributeSpace"].as_str() {
            result.push(self.id(id));
        }
        if let Some(spaces) = row["localSpaces"].as_object() {
            for id in spaces.values() {
                result.push(self.id(id.as_str().expect("space")));
            }
        }
        result
    }
    fn contains(&self, root: usize, binding: usize) -> bool {
        let mut stack = vec![root];
        let mut seen = HashSet::new();
        while let Some(i) = stack.pop() {
            if i == binding {
                return true;
            }
            if seen.insert(i) {
                stack.extend(self.links(i));
            }
        }
        false
    }
    fn text(
        &self,
        name: &str,
        binding: usize,
        field: &str,
    ) -> Result<Option<String>, PropertyAccessError> {
        let value = self
            .scripted(name, binding, None)?
            .unwrap_or(&self.rows[binding][field]);
        match value {
            J::Null => Ok(None),
            J::String(value) => Ok(Some(value.clone())),
            _ => Err(PropertyAccessError::InvalidMetadata),
        }
    }
}
impl Namespace for Host {
    type Binding = usize;
    fn root(&self) -> Option<usize> {
        self.bump("root");
        if self.input["invalidRoot"] == true {
            None
        } else {
            Some(self.id(self.input["rebasedRoot"].as_str().unwrap_or("r")))
        }
    }
    fn children(&self, binding: &usize) -> Vec<usize> {
        self.bump("children");
        self.rows[*binding]["children"]
            .as_array()
            .expect("children")
            .iter()
            .map(|id| self.id(id.as_str().expect("child")))
            .collect()
    }
    fn name(&self, binding: &usize) -> Option<String> {
        self.rows[*binding]["key"]
            .as_str()
            .or_else(|| self.rows[*binding]["legacyName"].as_str())
            .map(str::to_owned)
    }
    fn position(&self, binding: &usize) -> Option<usize> {
        self.rows[*binding]["index"].as_u64().map(|v| v as usize)
    }
    fn parent(&self, binding: &usize) -> Navigation<usize> {
        self.parents[*binding].map_or(Navigation::Missing, Navigation::Binding)
    }
    fn attribute_space(&self, binding: &usize) -> Navigation<usize> {
        self.rows[*binding]["attributeSpace"]
            .as_str()
            .map_or(Navigation::Missing, |id| Navigation::Binding(self.id(id)))
    }
    fn local_space(&self, binding: &usize, name: &str) -> Navigation<usize> {
        self.rows[*binding]["localSpaces"][name]
            .as_str()
            .map_or(Navigation::Missing, |id| Navigation::Binding(self.id(id)))
    }
    fn supports_structural_identity(&self) -> bool {
        true
    }
    fn structural_identity(&self, binding: &usize) -> Option<String> {
        self.rows[*binding]["identity"].as_str().map(str::to_owned)
    }
    fn properties(&self) -> Option<&dyn PropertyAccess<Binding = usize>> {
        if self.omitted("scope") {
            None
        } else {
            Some(self)
        }
    }
}
impl PropertyAccess for Host {
    type Binding = usize;
    fn supports_key(&self) -> bool {
        !self.omitted("key")
    }
    fn supports_nodes(&self) -> bool {
        !["nodeKind", "nodeTag"]
            .iter()
            .any(|name| self.omitted(name))
    }
    fn scope(
        &self,
        binding: &usize,
        context: &PropertyAccessContext<'_, usize>,
    ) -> Result<PropertyScopeRole, PropertyAccessError> {
        if let Some(value) = self.scripted("scope", *binding, None)? {
            return match value.as_str() {
                Some("root") => Ok(PropertyScopeRole::Root),
                Some("inside") => Ok(PropertyScopeRole::Inside),
                Some("outside") => Ok(PropertyScopeRole::Outside),
                _ => Err(PropertyAccessError::InvalidMetadata),
            };
        }
        Ok(if !self.contains(*context.scope_root, *binding) {
            PropertyScopeRole::Outside
        } else if binding == context.scope_root {
            PropertyScopeRole::Root
        } else {
            PropertyScopeRole::Inside
        })
    }
    fn key(
        &self,
        binding: &usize,
        _: &PropertyAccessContext<'_, usize>,
    ) -> Result<Option<String>, PropertyAccessError> {
        if self.input["reenter"].is_object() && !self.reentered.replace(true) {
            let options = crate::evaluate::EvaluateOptions {
                resolve: ResolveOptions {
                    max_property_inspections: self.input["reenter"]["maxPropertyInspections"]
                        .as_u64()
                        .expect("limit") as u32,
                    ..ResolveOptions::default()
                },
                ..crate::evaluate::EvaluateOptions::default()
            };
            let result = crate::evaluate::evaluate_query(
                self.input["reenter"]["source"].as_str().expect("source"),
                self,
                &options,
            );
            *self.nested_result.borrow_mut() = Some(result);
        }
        self.text("key", *binding, "key")
    }
    fn node_kind(
        &self,
        binding: &usize,
        _: &PropertyAccessContext<'_, usize>,
    ) -> Result<PropertyNodeKind, PropertyAccessError> {
        let value = self
            .scripted("nodeKind", *binding, None)?
            .unwrap_or(&self.rows[*binding]["nodeKind"]);
        match value.as_str() {
            Some("Other") => Ok(PropertyNodeKind::Other),
            Some("NodeLiteral") => Ok(PropertyNodeKind::NodeLiteral),
            _ => Err(PropertyAccessError::InvalidMetadata),
        }
    }
    fn node_tag(
        &self,
        binding: &usize,
        _: &PropertyAccessContext<'_, usize>,
    ) -> Result<Option<String>, PropertyAccessError> {
        self.text("nodeTag", *binding, "tag")
    }
}

// These named fixtures use the retired head topology or account for its callbacks.
const HISTORICAL_RESOLVE_TAG_CASES: &[&str] = &[
    "sansa-properties-tag-not-key",
    "sansa-properties-container-tag",
    "sansa-properties-head-tag",
    "sansa-properties-ordinary-tag",
    "sansa-properties-multiple-matching-heads",
    "sansa-properties-cached-tag",
    "sansa-properties-not-retargeted",
    "sansa-properties-empty-heads",
    "sansa-properties-empty-tag-does-not-invent-tag",
    "sansa-properties-scope-root-tag",
    "sansa-properties-context-tag",
    "sansa-properties-wrong-owner",
    "sansa-properties-foreign-head",
    "sansa-properties-bad-tag",
    "sansa-properties-wrong-head-kind",
    "sansa-properties-iterator-throw",
    "sansa-properties-partial-tag",
    "sansa-properties-capability-after-empty-filter",
    "sansa-properties-zero-before-metadata",
    "sansa-properties-head-budget",
    "sansa-properties-exact-budget",
    "sansa-properties-terminal-probe",
    "sansa-properties-absent-node-tag",
    "sansa-properties-noniterable-heads",
    "sansa-properties-repeated-container-tag",
    "sansa-properties-unvisited-suffix",
    "sansa-properties-wide-miss-64",
    "sansa-properties-wide-last-64",
    "sansa-properties-wide-budget-64",
    "sansa-properties-wide-miss-128",
    "sansa-properties-wide-last-128",
    "sansa-properties-wide-budget-128",
    "sansa-properties-tag-rejects-head",
    "sansa-properties-head-tag-rejects-container",
    "sansa-properties-head-tag-rejects-ordinary",
    "sansa-properties-head-tag-root",
    "sansa-properties-head-tag-one-inspection",
    "sansa-properties-recursive-tag-containers",
    "sansa-properties-recursive-head-tag-heads",
    "sansa-properties-head-tag-navigation",
    "sansa-properties-tag-then-head-tag-misses",
    "sansa-properties-head-tag-then-tag-misses",
    "sansa-properties-partial-head-tag",
    "sansa-properties-head-tag-zero-budget",
];

const HISTORICAL_QUERY_TAG_CASES: &[&str] = &[
    "sansa-properties-query-current-tag",
    "sansa-properties-query-unsupported-empty",
    "sansa-properties-query-shared-exact",
    "sansa-properties-query-shared-overflow",
];

#[test]
fn intrinsic_tag_resolves_the_same_binding_at_named_indexed_and_scoped_paths() {
    let host = Host::tagged(&json!({}));
    let options = ResolveOptions {
        contextual_root: Some(host.id("doc")),
        ..ResolveOptions::default()
    };
    for (source, ids) in [
        ("$.document&tag(\"document\")", vec!["doc"]),
        ("$.document.*&tag(\"product\")", vec!["apple", "orange"]),
        ("$.document[0]&tag(\"product\")", vec!["apple"]),
        ("$.document.*&key(\"product\")", vec![]),
        ("$.document.*&tag(\"document\")", vec![]),
        ("$.ordinary&tag(\"product\")", vec![]),
        ("?&tag(\"document\")", vec!["doc"]),
        ("?&key(\"document\")", vec![]),
    ] {
        let parsed = crate::address::parse_address(source).expect(source);
        let expected: Vec<_> = ids.into_iter().map(|id| host.id(id)).collect();
        for output in [
            resolve_address(source, &host, &options),
            resolve_parsed_address(&parsed, &host, &options),
        ] {
            assert!(output.is_ok(), "{source}: {:?}", output.errors);
            assert_eq!(output.bindings, expected, "{source}");
        }
    }
}

#[test]
fn intrinsic_tag_requires_metadata_and_charges_once_per_inspected_binding() {
    let source = "$.document&tag(\"document\")";
    let host = Host::tagged(&json!({}));
    let options = ResolveOptions {
        max_property_inspections: 1,
        ..ResolveOptions::default()
    };
    assert_eq!(
        resolve_address(source, &host, &options).bindings,
        vec![host.id("doc")]
    );
    assert_eq!(*host.calls.borrow().get("nodeTag").expect("tag read"), 1);
    for value in [J::Null, json!(""), json!(17)] {
        let host =
            Host::tagged(&json!({"faults":[{"callback":"nodeTag","binding":"doc","value":value}]}));
        let output = resolve_address(source, &host, &options);
        assert_eq!(
            output.errors[0].code,
            "SANSA_RESOLVE_INVALID_PROPERTY_METADATA"
        );
    }
    let incapable = Host::tagged(&json!({"omit":["nodeTag"]}));
    let output = resolve_address("$.missing&tag(\"document\")", &incapable, &options);
    assert_eq!(output.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_TAG");
    assert!(!incapable.calls.borrow().contains_key("children"));
    let bad = resolve_address("$&headTag(\"document\")", &incapable, &options);
    assert!(!bad.is_ok());
    assert!(!incapable.calls.borrow().contains_key("children"));
}

#[test]
fn query_shares_the_intrinsic_tag_allowance_across_clauses() {
    use crate::evaluate::{EvaluateOptions, EvaluatedValue, evaluate_query};
    let query = "from $.document&tag(\"document\")\nwhere exists(.&tag(\"document\"))\nselect .&tag(\"document\")";
    for limit in [2, 3] {
        let host = Host::tagged(&json!({}));
        let options = EvaluateOptions {
            resolve: ResolveOptions {
                max_property_inspections: limit,
                ..ResolveOptions::default()
            },
            ..EvaluateOptions::default()
        };
        let output = evaluate_query(query, &host, &options);
        if limit == 3 {
            assert!(output.is_ok(), "{:?}", output.errors);
            assert_eq!(output.results.len(), 1);
            assert_eq!(
                output.results[0].value,
                EvaluatedValue::Bindings(vec![host.id("doc")])
            );
        } else {
            assert_eq!(
                output.errors[0].code,
                "SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED"
            );
            assert!(output.results.is_empty());
        }
        assert_eq!(
            *host.calls.borrow().get("nodeTag").expect("tag reads"),
            limit as usize
        );
    }
}

#[test]
fn selected_text_expectations_cover_actual_rust_resolve_and_all_present_observations() {
    // Rust's checked String API cannot return invalid UTF-16. Represent this one
    // scripted host fault as non-string data in this test adapter, which must
    // produce checked InvalidMetadata. The immutable fixture bytes stay intact.
    let raw = include_str!("../tests/fixtures/property-resolve-candidate-v1.json")
        .replace("\"\\ud800\"", "{\"rustCheckedInvalidScalar\":true}");
    let suite: J = serde_json::from_str(&raw).expect("suite");
    let mut executed = 0;
    for vector in suite["tests"].as_array().expect("tests") {
        let input = &vector["input"];
        let id = vector["id"].as_str().expect("id");
        // Native Rust Address/options cannot encode JS accessor/cycle ASTs or
        // booleans/negative/fractional u32 allowances. They are not claimed here;
        // JS runs all95, and native AST/typed boundary controls are separate.
        let limit = input["options"]["maxPropertyInspections"]
            .as_f64()
            .unwrap_or(10_000.0);
        if input["source"].is_null()
            || input["options"]["maxPropertyInspections"].is_boolean()
            || limit < 0.0
            || limit.fract() != 0.0
            || HISTORICAL_RESOLVE_TAG_CASES.contains(&id)
        {
            continue;
        }
        executed += 1;
        let host = Host::new(input);
        let options = ResolveOptions {
            max_property_inspections: limit as u32,
            max_bindings: input["options"]["maxBindings"].as_u64().map(|v| v as usize),
            allow_parent_from_effective_root: input["options"]["allowParentFromEffectiveRoot"]
                == true,
            contextual_root: input["contextualRoot"].as_str().map(|id| host.id(id)),
            ..ResolveOptions::default()
        };
        let result = resolve_address(input["source"].as_str().expect("source"), &host, &options);
        let observed = json!({"ok":result.is_ok(),"bindings":result.bindings.iter().map(|i|host.rows[*i]["id"].clone()).collect::<Vec<_>>(),"addresses":result.bindings.iter().map(|i|host.rows[*i]["address"].clone()).collect::<Vec<_>>(),"error":result.errors.first().map(|e|&e.code),"limit":result.errors.first().and_then(|e|e.limit),"observed":result.errors.first().and_then(|e|e.observed),"budget":result.errors.first().and_then(|e|e.budget.as_ref()),"selectorIndex":result.errors.first().and_then(|e|e.selector_index)});
        for (field, expected) in vector["expected"].as_object().expect("expected") {
            if field == "calls" {
                for (name, count) in expected.as_object().expect("calls") {
                    assert_eq!(
                        *host.calls.borrow().get(name).unwrap_or(&0),
                        count.as_u64().expect("count") as usize,
                        "{id} calls.{name}"
                    );
                }
            } else {
                assert!(observed.get(field).is_some(), "unasserted {id} {field}");
                assert_eq!(&observed[field], expected, "{id} {field}");
            }
        }
    }
    assert_eq!(executed, 35, "selection must not change silently");
}

#[test]
fn native_ast_flags_bounds_and_independent_public_allowances() {
    let host = Host::new(&json!({}));
    let mut address =
        crate::address::parse_address("$.document&key(\"document\")").expect("address");
    address.is_exact = true;
    address.canonical = "$.ordinary".into();
    let options = ResolveOptions {
        max_property_inspections: 1,
        ..ResolveOptions::default()
    };
    for _ in 0..2 {
        let result = resolve_parsed_address(&address, &host, &options);
        assert!(result.is_ok());
        assert_eq!(result.bindings, vec![host.id("doc")]);
    }
    assert!(address.is_exact);
    assert_eq!(address.canonical, "$.ordinary");
    address
        .selectors
        .push(crate::address::Selector::PropertyFilter {
            property: crate::address::PropertyName::Key,
            value: "document".into(),
        });
    let result = resolve_parsed_address(&address, &host, &options);
    assert_eq!(
        result.errors[0].code,
        "SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED"
    );
    assert_eq!(result.errors[0].property.as_deref(), Some("key"));
    assert!(result.bindings.is_empty());
    let invalid = ResolveOptions {
        max_property_inspections: 1_000_001,
        ..ResolveOptions::default()
    };
    let before = host.calls.borrow().clone();
    assert_eq!(
        resolve_address("$", &host, &invalid).errors[0].code,
        "SANSA_RESOLVE_INVALID_PROPERTY_LIMIT"
    );
    assert_eq!(*host.calls.borrow(), before);
    let mut bounded = crate::address::parse_address("$&key(\"x\")").expect("address");
    bounded.selectors[0] = crate::address::Selector::PropertyFilter {
        property: crate::address::PropertyName::Key,
        value: "x".repeat(4097),
    };
    assert_eq!(
        resolve_parsed_address(&bounded, &host, &ResolveOptions::default()).errors[0].code,
        "SANSA_RESOLVE_INVALID_ADDRESS"
    );
    assert_eq!(*host.calls.borrow(), before);
    let host = Host::tagged(&json!({}));
    let mut multiple =
        crate::address::parse_address("$.document.*&tag(\"product\")").expect("address");
    multiple.is_exact = true;
    multiple.canonical = "$.wrong".into();
    assert_eq!(
        resolve_parsed_address(&multiple, &host, &ResolveOptions::default()).bindings,
        vec![host.id("apple"), host.id("orange")]
    );
}

#[test]
fn independent_occurrence_frames_survive_space_transitions() {
    struct Frames {
        seen: RefCell<Vec<(usize, usize)>>,
    }
    impl Namespace for Frames {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            Some(0)
        }
        fn children(&self, binding: &usize) -> Vec<usize> {
            match binding {
                0 => vec![1, 2],
                1 | 2 => vec![3],
                _ => vec![],
            }
        }
        fn attribute_space(&self, binding: &usize) -> Navigation<usize> {
            Navigation::Binding(*binding)
        }
        fn value(&self, _: &usize) -> Option<crate::value_semantics::Value> {
            Some(crate::value_semantics::Value::FiniteNumber(
                crate::value_semantics::FiniteNumber::parse("1").expect("number"),
            ))
        }
        fn properties(&self) -> Option<&dyn PropertyAccess<Binding = usize>> {
            Some(self)
        }
    }
    impl PropertyAccess for Frames {
        type Binding = usize;
        fn supports_key(&self) -> bool {
            true
        }
        fn scope(
            &self,
            binding: &usize,
            context: &PropertyAccessContext<'_, usize>,
        ) -> Result<PropertyScopeRole, PropertyAccessError> {
            self.seen
                .borrow_mut()
                .push((*context.scope_root, *context.evaluation_root));
            Ok(if binding == context.scope_root {
                PropertyScopeRole::Root
            } else if [1, 2].contains(context.scope_root) && *binding == 3 {
                PropertyScopeRole::Inside
            } else {
                PropertyScopeRole::Outside
            })
        }
        fn key(
            &self,
            _: &usize,
            context: &PropertyAccessContext<'_, usize>,
        ) -> Result<Option<String>, PropertyAccessError> {
            Ok(Some(
                if *context.scope_root == 1 { "a" } else { "b" }.into(),
            ))
        }
    }
    let host = Frames {
        seen: RefCell::new(vec![]),
    };
    assert_eq!(
        resolve_address("$.*.@.*&key(\"a\")", &host, &ResolveOptions::default()).bindings,
        vec![3]
    );
    assert_eq!(*host.seen.borrow(), vec![(1, 1), (2, 2)]);
    let limited = ResolveOptions {
        max_property_inspections: 1,
        ..ResolveOptions::default()
    };
    let result = resolve_address("$.*.@.*&key(\"a\")", &host, &limited);
    assert_eq!(
        result.errors[0].code,
        "SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED"
    );
    assert!(result.bindings.is_empty());
    host.seen.borrow_mut().clear();
    let output = crate::evaluate::evaluate_query(
        "from $.*.@.*\nwhere exists(.&key(\"a\")) or exists(.&key(\"b\"))\norder by . asc\noffset 1\nselect .&key(\"b\")",
        &host,
        &crate::evaluate::EvaluateOptions::default(),
    );
    assert!(output.errors.is_empty(), "{:?}", output.errors);
    assert_eq!(output.results.len(), 1);
    assert_eq!(output.results[0].candidate, 3);
    assert_eq!(
        output.results[0].value,
        crate::evaluate::EvaluatedValue::Bindings(vec![3])
    );
    assert!(host.seen.borrow().contains(&(1, 3)));
    assert!(host.seen.borrow().contains(&(2, 3)));
}

#[test]
fn capable_host_admits_read_only_query_but_not_mutation() {
    use crate::query::{Expression, ResolutionScope};
    let host = Host::new(&json!({}));
    let mut query = crate::query::parse_query("from $.missing\nselect .").expect("query");
    let address = crate::address::parse_address("$&key(\"x\")").expect("address");
    query.select.ast = Expression::Resolution {
        scope: ResolutionScope::Absolute,
        canonical: address.canonical.clone(),
        address,
    };
    let result = crate::evaluate::evaluate_parsed_query(
        &query,
        &host,
        &crate::evaluate::EvaluateOptions::default(),
    );
    assert!(result.errors.is_empty());
    assert!(result.results.is_empty());
    host.calls.borrow_mut().clear();
    use crate::mutate::{
        MutationAddressInput, MutationRequest, PlanMutationOptions, PlanMutationResult,
        RequestedMutationOperation, RequestedRemoveOperation, plan_mutation,
    };
    let mut target = crate::address::parse_address("$.document&key(\"document\")").expect("target");
    target.is_exact = true;
    target.canonical = "$.document".into();
    let request = MutationRequest {
        operations: vec![RequestedMutationOperation::Remove(
            RequestedRemoveOperation {
                target: MutationAddressInput::Parsed(target),
                provenance: None,
            },
        )],
        ..MutationRequest::default()
    };
    let result = plan_mutation(&request, &host, &PlanMutationOptions::default());
    let PlanMutationResult::Rejected(errors) = result else {
        panic!("property mutation admitted")
    };
    assert_eq!(errors[0].code, "SANSA_MUTATE_NON_EXACT_TARGET");
    assert!(host.calls.borrow().is_empty());
}

#[test]
fn property_query_prepared_mirrors_assert_all_present_fields_and_counters() {
    use crate::evaluate::{EvaluateOptions, evaluate_parsed_query, evaluate_query};
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/property-query-candidate-v1.json"
    ))
    .expect("fixture");
    let mut executed = 0;
    for vector in suite["tests"].as_array().expect("tests") {
        let input = &vector["input"];
        let id = vector["id"].as_str().expect("id");
        if HISTORICAL_QUERY_TAG_CASES.contains(&id) {
            continue;
        }
        let source = input["source"].as_str().expect("source");
        let parsed = crate::query::parse_query(source).expect(id);
        if input["operation"] == "parse-query" {
            let crate::query::Expression::Resolution { scope, address, .. } = &parsed.select.ast
            else {
                panic!("current property");
            };
            let observed = json!({"ok":true,"canonical":parsed.canonical,"currentPropertyScope":if *scope==crate::query::ResolutionScope::Current {"current"} else {"other"},"currentAddressRoot":if address.root==crate::address::Root::Contextual {"contextual"}else{"absolute"}});
            for (field, expected) in vector["expected"].as_object().expect("expected") {
                assert_eq!(&observed[field], expected, "{id} {field}");
            }
            executed += 1;
            continue;
        }
        for native in [false, true] {
            let host = Host::new(input);
            let options = EvaluateOptions {
                resolve: ResolveOptions {
                    contextual_root: input["contextualRoot"].as_str().map(|id| host.id(id)),
                    max_property_inspections: input["options"]["resolve"]["maxPropertyInspections"]
                        .as_u64()
                        .unwrap_or(10000) as u32,
                    ..ResolveOptions::default()
                },
                ..EvaluateOptions::default()
            };
            let mut results = Vec::new();
            for _ in 0..input["repeat"].as_u64().unwrap_or(1) {
                results.push(if native {
                    evaluate_parsed_query(&parsed, &host, &options)
                } else {
                    evaluate_query(source, &host, &options)
                });
            }
            assert_property_query_results(&host, &results, &vector["expected"]);
        }
        executed += 1;
    }
    assert_eq!(executed, 11);
}

fn assert_property_query_results(
    host: &Host,
    results: &[crate::evaluate::QueryOutput<usize>],
    expected: &J,
) {
    use crate::evaluate::EvaluatedValue;
    assert!(!results.is_empty(), "public invocations");
    let nested_ok = host.nested_result.borrow().as_ref().map(|result| {
        result.is_ok()
            && result.results.len() == 1
            && result.results[0].candidate == host.id("doc")
            && result.results[0].value == EvaluatedValue::Bindings(vec![host.id("doc")])
    });
    for (invocation, result) in results.iter().enumerate() {
        let records:Vec<J>=result.results.iter().map(|row| {
            let EvaluatedValue::Bindings(values)=&row.value else {panic!("records Binding Set");};
            json!({"candidate":host.rows[row.candidate]["id"],"valueBindings":values.iter().map(|b|host.rows[*b]["id"].clone()).collect::<Vec<_>>()})
        }).collect();
        let error = result.errors.first();
        let observed = json!({"ok":error.is_none(),"records":records,"error":error.map(|e|&e.code),"phase":error.and_then(|e|e.phase).map(|p|format!("{p:?}").to_lowercase()),"limit":error.and_then(|e|e.limit),"observed":error.and_then(|e|e.observed),"budget":error.and_then(|e|e.budget.as_ref()),"nestedResultsOk":nested_ok});
        for (field, value) in expected.as_object().expect("expected") {
            if field == "calls" {
                continue;
            }
            assert!(observed.get(field).is_some(), "unasserted {field}");
            assert_eq!(&observed[field], value, "invocation {invocation} {field}");
        }
    }
    if let Some(calls) = expected.get("calls") {
        for (name, count) in calls.as_object().expect("calls") {
            assert_eq!(
                *host.calls.borrow().get(name).unwrap_or(&0),
                count.as_u64().expect("count") as usize,
                "aggregate calls.{name}"
            );
        }
    }
}

#[test]
fn query_oracle_rejects_wrong_first_last_nested_and_outer_bindings() {
    use crate::evaluate::{EvaluateOptions, EvaluatedValue, evaluate_parsed_query, evaluate_query};
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/property-query-candidate-v1.json"
    ))
    .expect("fixture");
    for native in [false, true] {
        for mode in ["first", "last", "nested", "outer"] {
            let vector = suite["tests"]
                .as_array()
                .expect("tests")
                .iter()
                .find(|v| {
                    if ["first", "last"].contains(&mode) {
                        v["input"]["repeat"] == 2
                    } else {
                        v["input"]["reenter"].is_object()
                    }
                })
                .expect("vector");
            let input = &vector["input"];
            let host = Host::new(input);
            let options = EvaluateOptions {
                resolve: ResolveOptions {
                    max_property_inspections: input["options"]["resolve"]["maxPropertyInspections"]
                        .as_u64()
                        .expect("limit") as u32,
                    ..ResolveOptions::default()
                },
                ..EvaluateOptions::default()
            };
            let source = input["source"].as_str().expect("source");
            let parsed = crate::query::parse_query(source).expect("query");
            let mut results: Vec<_> = (0..input["repeat"].as_u64().unwrap_or(1))
                .map(|_| {
                    if native {
                        evaluate_parsed_query(&parsed, &host, &options)
                    } else {
                        evaluate_query(source, &host, &options)
                    }
                })
                .collect();
            assert_property_query_results(&host, &results, &vector["expected"]);
            if mode == "nested" {
                host.nested_result
                    .borrow_mut()
                    .as_mut()
                    .expect("nested")
                    .results[0]
                    .value = EvaluatedValue::Bindings(vec![]);
            } else {
                let index = usize::from(mode == "last");
                results[index].results[0].value = EvaluatedValue::Bindings(vec![]);
            }
            let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                assert_property_query_results(&host, &results, &vector["expected"])
            }));
            let error = failure.expect_err("wrong bindings must fail the actual vector oracle");
            let message = error
                .downcast_ref::<String>()
                .map(String::as_str)
                .or_else(|| error.downcast_ref::<&str>().copied())
                .expect("assertion message");
            assert!(
                message.contains("records") || message.contains("nestedResultsOk"),
                "{mode}: {message}"
            );
        }
    }
}

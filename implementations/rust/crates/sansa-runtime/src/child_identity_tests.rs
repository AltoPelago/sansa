use crate::address::{Selector, parse_address, render_address};
use crate::resolve::{
    Namespace, Navigation, ResolveOptions, resolve_address, resolve_parsed_address,
};
use serde_json::{Value as J, json};
use std::cell::Cell;
struct Fixture {
    rows: Vec<J>,
    parents: Vec<Option<usize>>,
    supported: bool,
    calls: Cell<usize>,
}
impl Fixture {
    fn build(f: &J) -> Self {
        let mut n = Self {
            rows: Vec::new(),
            parents: Vec::new(),
            supported: f["supportsIdentity"]
                .as_bool()
                .expect("valid child identity fixture"),
            calls: Cell::new(0),
        };
        n.add(&f["root"], None);
        n
    }
    fn add(&mut self, v: &J, parent: Option<usize>) {
        let id = self.rows.len();
        self.rows.push(v.clone());
        self.parents.push(parent);
        if let Some(children) = v["children"].as_array() {
            for ch in children {
                self.add(ch, Some(id));
            }
        }
        if v["attributeSpace"].is_object() {
            self.add(&v["attributeSpace"], None);
        }
        if let Some(spaces) = v["localSpaces"].as_object() {
            for ch in spaces.values() {
                self.add(ch, None);
            }
        }
    }
    fn id(&self, v: &J) -> usize {
        self.rows
            .iter()
            .position(|r| r["address"] == v["address"])
            .expect("valid child identity fixture")
    }
}
impl Namespace for Fixture {
    type Binding = usize;
    fn root(&self) -> Option<usize> {
        Some(0)
    }
    fn children(&self, b: &usize) -> Vec<usize> {
        self.rows[*b]["children"]
            .as_array()
            .map(|cs| cs.iter().map(|c| self.id(c)).collect())
            .unwrap_or_default()
    }
    fn name(&self, b: &usize) -> Option<String> {
        self.rows[*b]["name"].as_str().map(str::to_owned)
    }
    fn position(&self, b: &usize) -> Option<usize> {
        self.rows[*b]["index"].as_u64().map(|n| n as usize)
    }
    fn parent(&self, b: &usize) -> Navigation<usize> {
        self.parents[*b].map_or(Navigation::Missing, Navigation::Binding)
    }
    fn attribute_space(&self, b: &usize) -> Navigation<usize> {
        let v = &self.rows[*b]["attributeSpace"];
        if v.is_object() {
            Navigation::Binding(self.id(v))
        } else {
            Navigation::Missing
        }
    }
    fn local_space(&self, b: &usize, name: &str) -> Navigation<usize> {
        let v = &self.rows[*b]["localSpaces"][name];
        if v.is_object() {
            Navigation::Binding(self.id(v))
        } else {
            Navigation::Missing
        }
    }
    fn binding_address(&self, b: &usize) -> Option<String> {
        self.rows[*b]["address"].as_str().map(str::to_owned)
    }
    fn value(&self, b: &usize) -> Option<crate::value_semantics::Value> {
        if self.rows[*b]["value"]["type"] == "SansaAddressLiteral" {
            return self.rows[*b]["value"]["address"]
                .as_str()
                .map(|s| crate::value_semantics::Value::SansaAddress(s.into()));
        }
        self.rows[*b]["value"]
            .as_str()
            .map(|s| crate::value_semantics::Value::String(s.into()))
    }
    fn supports_structural_identity(&self) -> bool {
        self.supported
    }
    fn structural_identity(&self, b: &usize) -> Option<String> {
        self.calls.set(self.calls.get() + 1);
        self.rows[*b]["identity"].as_str().map(str::to_owned)
    }
}
fn suite() -> J {
    serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/13-child-identity-resolve.json"
    ))
    .expect("valid child identity fixture")
}
#[test]
fn parser_candidate_vectors() {
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/12-child-identity-parser.json"
    ))
    .expect("valid child identity fixture");
    assert_eq!(
        suite["tests"]
            .as_array()
            .expect("valid child identity fixture")
            .len(),
        20
    );
    for case in suite["tests"]
        .as_array()
        .expect("valid child identity fixture")
    {
        let got = parse_address(
            case["input"]["source"]
                .as_str()
                .expect("valid child identity fixture"),
        );
        assert_eq!(
            got.is_ok(),
            case["expected"]["ok"]
                .as_bool()
                .expect("valid child identity fixture"),
            "{}: {got:?}",
            case["id"]
        );
        if let Err(error) = &got {
            if let Some(code) = case["expected"]["error"].as_str() {
                assert_eq!(error.code, code, "{}", case["id"]);
            }
            if let Some(index) = case["expected"]["index"].as_u64() {
                assert_eq!(error.index, index as usize, "{}", case["id"]);
            }
        }
        if let Ok(got) = got {
            assert_eq!(
                got.is_exact,
                case["expected"]["exact"]
                    .as_bool()
                    .expect("valid child identity fixture")
            );
            assert_eq!(render_address(&got), case["expected"]["canonical"]);
            assert_eq!(
                parse_address(&got.canonical).expect("valid child identity fixture"),
                got
            );
        }
    }
}
#[test]
fn resolve_candidate_vectors() {
    let suite = suite();
    let mut count = 0;
    for case in suite["tests"]
        .as_array()
        .expect("valid child identity fixture")
    {
        let input = &case["input"];
        if input
            .get("maxIdentityInspections")
            .is_some_and(|v| v.as_u64().is_none())
        {
            continue;
        }
        if case["id"] == "sansa-child-resolve-invalid-metadata" {
            continue;
        } // numeric metadata is not representable by Option<String>
        count += 1;
        let f = suite["fixtures"]["namespaces"]
            .as_array()
            .expect("valid child identity fixture")
            .iter()
            .find(|f| f["id"] == input["namespace"])
            .expect("valid child identity fixture");
        let ns = Fixture::build(f);
        let mut options = ResolveOptions::default();
        if let Some(n) = input["maxIdentityInspections"].as_u64() {
            options.max_identity_inspections = n as usize;
        }
        options.max_bindings = input["maxBindings"].as_u64().map(|n| n as usize);
        options.contextual_root = input["contextualRoot"].as_str().map(|s| {
            ns.rows
                .iter()
                .position(|r| r["address"] == s)
                .expect("valid child identity fixture")
        });
        let got = resolve_address(
            input["source"]
                .as_str()
                .expect("valid child identity fixture"),
            &ns,
            &options,
        );
        assert_eq!(
            got.is_ok(),
            case["expected"]["ok"]
                .as_bool()
                .expect("valid child identity fixture"),
            "{}: {got:?}",
            case["id"]
        );
        if got.is_ok() {
            assert_eq!(
                json!(
                    got.bindings
                        .iter()
                        .map(|b| ns.rows[*b]["address"].clone())
                        .collect::<Vec<_>>()
                ),
                case["expected"]["addresses"],
                "{}",
                case["id"]
            );
        } else {
            assert!(got.bindings.is_empty());
            let error = &got.errors[0];
            let context = json!({"selectorIndex":error.selector_index,"identity":error.identity,"limit":error.limit,"observed":error.observed});
            for field in ["selectorIndex", "identity", "limit", "observed"] {
                if let Some(expected) = case["expected"].get(field) {
                    assert_eq!(&context[field], expected, "{}: {}", case["id"], field);
                }
            }
            assert_eq!(
                got.errors[0].code, case["expected"]["error"],
                "{}",
                case["id"]
            );
        }
        assert_eq!(
            ns.calls.get(),
            case["expected"]["identityCalls"]
                .as_u64()
                .expect("valid child identity fixture") as usize,
            "{}",
            case["id"]
        );
    }
    assert_eq!(count, 35);
}
#[test]
fn forged_ast_and_consumer_denial() {
    let s = suite();
    let ns = Fixture::build(&s["fixtures"]["namespaces"][0]);
    let mut a = parse_address("$.\\group1\\").expect("valid child identity fixture");
    a.is_exact = true;
    a.canonical = "$.other".into();
    assert_eq!(
        resolve_parsed_address(&a, &ns, &ResolveOptions::default()).bindings,
        vec![1]
    );
    a.selectors = vec![Selector::ChildIdentity {
        identity: "x\\.other".into(),
    }];
    let calls = ns.calls.get();
    assert_eq!(
        resolve_parsed_address(&a, &ns, &ResolveOptions::default()).errors[0].code,
        "SANSA_RESOLVE_INVALID_ADDRESS"
    );
    assert_eq!(ns.calls.get(), calls);
    let expression =
        crate::query::parse_expression("$.\\group1\\").expect("valid child identity fixture");
    let out = crate::evaluate::evaluate_expression(
        &expression,
        &0,
        &ns,
        &crate::evaluate::EvaluateOptions::default(),
    );
    assert_eq!(
        out.expect_err("identity guard rejects the expression").code,
        "SANSA_RESOLVE_UNSUPPORTED_SELECTOR"
    );
    assert_eq!(ns.calls.get(), calls);
}
#[test]
fn lazy_scan_stops_and_drops_iterator() {
    struct Lazy {
        calls: Cell<usize>,
        pulls: Cell<usize>,
        drops: Cell<usize>,
    }
    struct Iter<'a>(&'a Lazy);
    impl Iterator for Iter<'_> {
        type Item = usize;
        fn next(&mut self) -> Option<usize> {
            self.0.pulls.set(self.0.pulls.get() + 1);
            assert!(self.0.pulls.get() <= 3);
            Some(1)
        }
    }
    impl Drop for Iter<'_> {
        fn drop(&mut self) {
            self.0.drops.set(self.0.drops.get() + 1);
        }
    }
    impl Namespace for Lazy {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            Some(0)
        }
        fn children(&self, _: &usize) -> Vec<usize> {
            panic!("eager enumeration")
        }
        fn supports_structural_identity(&self) -> bool {
            true
        }
        fn structural_identity(&self, _: &usize) -> Option<String> {
            self.calls.set(self.calls.get() + 1);
            None
        }
        fn identity_children<'a>(&'a self, _: &'a usize) -> Box<dyn Iterator<Item = usize> + 'a> {
            Box::new(Iter(self))
        }
    }
    let ns = Lazy {
        calls: Cell::new(0),
        pulls: Cell::new(0),
        drops: Cell::new(0),
    };
    let got = resolve_address(
        "$.\\missing\\",
        &ns,
        &ResolveOptions {
            max_identity_inspections: 2,
            ..ResolveOptions::default()
        },
    );
    assert_eq!(got.errors[0].code, "SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED");
    assert_eq!(got.errors[0].observed, Some(3));
    assert_eq!((ns.calls.get(), ns.pulls.get(), ns.drops.get()), (2, 3, 1));
}

#[test]
fn invalid_structural_metadata_is_not_silently_ignored() {
    let ns = Fixture::build(
        &json!({"supportsIdentity":true,"root":{"address":"$","children":[{"address":"$.a","identity":"bad!"}]}}),
    );
    let got = resolve_address("$.\\x\\", &ns, &ResolveOptions::default());
    assert_eq!(got.errors[0].code, "SANSA_RESOLVE_INVALID_IDENTITY");
    assert_eq!(ns.calls.get(), 1);
}

#[test]
fn default_inspection_limit_and_mutation_ast_denial() {
    use crate::mutate::*;
    for size in [10000, 10001] {
        struct Wide {
            size: usize,
            calls: Cell<usize>,
        }
        impl Namespace for Wide {
            type Binding = usize;
            fn root(&self) -> Option<usize> {
                Some(0)
            }
            fn children(&self, _: &usize) -> Vec<usize> {
                (1..=self.size).collect()
            }
            fn supports_structural_identity(&self) -> bool {
                true
            }
            fn structural_identity(&self, _: &usize) -> Option<String> {
                self.calls.set(self.calls.get() + 1);
                None
            }
        }
        let ns = Wide {
            size,
            calls: Cell::new(0),
        };
        let got = resolve_address("$.\\missing\\", &ns, &ResolveOptions::default());
        assert_eq!(got.is_ok(), size == 10000);
        assert_eq!(ns.calls.get(), 10000);
    }
    let suite = suite();
    let ns = Fixture::build(&suite["fixtures"]["namespaces"][0]);
    for payload in ["group1", "x\\.other"] {
        let mut ast = parse_address("$.\\group1\\").expect("valid child identity fixture");
        ast.is_exact = true;
        ast.canonical = "$.other".into();
        ast.selectors = vec![Selector::ChildIdentity {
            identity: payload.into(),
        }];
        let req = MutationRequest {
            operations: vec![RequestedMutationOperation::Remove(
                RequestedRemoveOperation {
                    target: MutationAddressInput::Parsed(ast),
                    provenance: None,
                },
            )],
            ..MutationRequest::default()
        };
        match plan_mutation(&req, &ns, &PlanMutationOptions::default()) {
            PlanMutationResult::Rejected(errors) => {
                assert_eq!(errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR")
            }
            _ => panic!("identity mutation admitted"),
        }
        assert_eq!(ns.calls.get(), 0);
    }
}

#[test]
fn caller_ast_bounds_fail_before_metadata_or_recursive_rendering() {
    let s = suite();
    let ns = Fixture::build(&s["fixtures"]["namespaces"][0]);
    let mut a = parse_address("$.\\group1\\").expect("valid child identity fixture");
    a.selectors.resize(
        1025,
        Selector::ChildIdentity {
            identity: "group1".into(),
        },
    );
    assert_eq!(
        resolve_parsed_address(&a, &ns, &ResolveOptions::default()).errors[0].code,
        "SANSA_RESOLVE_INVALID_ADDRESS"
    );
    let mut a = parse_address("$.\\group1\\").expect("valid child identity fixture");
    let mut t = crate::address::QualifierTerm {
        name: "x".into(),
        parameter_groups: vec![],
        arguments: vec![],
    };
    for _ in 0..66 {
        t = crate::address::QualifierTerm {
            name: "x".into(),
            parameter_groups: vec![vec![t]],
            arguments: vec![],
        };
    }
    a.qualifier_expression = Some(crate::address::QualifierExpression { terms: vec![t] });
    assert_eq!(
        resolve_parsed_address(&a, &ns, &ResolveOptions::default()).errors[0].code,
        "SANSA_RESOLVE_INVALID_ADDRESS"
    );
    assert_eq!(ns.calls.get(), 0);
}

#[test]
fn query_identity_shared_vectors() {
    use crate::evaluate::{EvaluateOptions, EvaluatedValue, QueryPolicy, evaluate_query};
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/query-admission.json"
    ))
    .expect("valid child identity fixture");
    assert_eq!(
        suite["tests"]
            .as_array()
            .expect("valid child identity fixture")
            .len(),
        23
    );
    for case in suite["tests"]
        .as_array()
        .expect("valid child identity fixture")
    {
        let mut fixture = suite["namespace"].clone();
        match case["change"].as_str() {
            Some("unsupported") => fixture["supportsIdentity"] = json!(false),
            Some("tie") => {
                fixture["root"]["children"][0]["children"][0]["children"][0]["value"] = json!("A")
            }
            Some("duplicate") => {
                fixture["root"]["children"][0]["children"][1]["identity"] = json!("first")
            }
            Some("invalid") => {
                fixture["root"]["children"][0]["children"][1]["identity"] = json!("bad!")
            }
            _ => {}
        }
        let ns = Fixture::build(&fixture);
        let mut options = EvaluateOptions::default();
        let input = &case["options"];
        if let Some(n) = input["resolve"]["maxIdentityInspections"].as_u64() {
            options.resolve.max_identity_inspections = n as usize;
        }
        options.resolve.max_bindings = input["resolve"]["maxBindings"].as_u64().map(|n| n as usize);
        options.budget.max_result_records = input["budget"]["maxResultRecords"]
            .as_u64()
            .map(|n| n as usize);
        if input["policy"] == "validation" {
            options.policy = QueryPolicy::Validation;
        }
        let original = options.clone();
        let out = evaluate_query(
            case["query"]
                .as_str()
                .expect("valid child identity fixture"),
            &ns,
            &options,
        );
        let expected = &case["expected"];
        assert_eq!(
            out.is_ok(),
            expected["ok"]
                .as_bool()
                .expect("valid child identity fixture"),
            "{}: {out:?}",
            case["id"]
        );
        assert_eq!(
            ns.calls.get(),
            expected["identityCalls"]
                .as_u64()
                .expect("valid child identity fixture") as usize,
            "{}",
            case["id"]
        );
        assert_eq!(options, original);
        if out.is_ok() {
            let candidates: Vec<_> = out
                .results
                .iter()
                .map(|r| ns.rows[r.candidate]["address"].clone())
                .collect();
            assert_eq!(json!(candidates), expected["candidates"], "{}", case["id"]);
            let selected: Vec<Vec<_>> = out
                .results
                .iter()
                .map(|r| match &r.value {
                    EvaluatedValue::Bindings(bs) => {
                        bs.iter().map(|b| ns.rows[*b]["address"].clone()).collect()
                    }
                    _ => panic!("expected original binding handles"),
                })
                .collect();
            assert_eq!(json!(selected), expected["selected"], "{}", case["id"]);
        } else {
            assert!(out.results.is_empty());
            let e = &out.errors[0];
            let got = json!({"error":e.code,"phase":e.phase.map(|p| format!("{p:?}").to_lowercase()),"candidateAddress":e.candidate_address,"limit":e.limit,"observed":e.observed,"selectorIndex":e.selector_index,"identity":e.identity});
            for field in [
                "error",
                "phase",
                "candidateAddress",
                "limit",
                "observed",
                "selectorIndex",
                "identity",
            ] {
                if let Some(v) = expected.get(field) {
                    assert_eq!(&got[field], v, "{}: {field}", case["id"]);
                }
            }
        }
    }
}
#[test]
fn query_identity_budget_is_per_invocation_and_activation_stays_denied() {
    use crate::evaluate::{AddressActivation, EvaluateOptions, evaluate_query};
    let s = suite();
    let ns = Fixture::build(&s["fixtures"]["namespaces"][0]);
    let mut options = EvaluateOptions::default();
    options.resolve.max_identity_inspections = 2;
    let q = crate::query::parse_query("from $.\\group1\\\nselect .")
        .expect("valid child identity fixture");
    for _ in 0..2 {
        assert!(crate::evaluate::evaluate_parsed_query(&q, &ns, &options).is_ok());
    }
    // Even trusted activation cannot acquire the new capability.
    struct Activation<'a>(&'a Fixture);
    impl Namespace for Activation<'_> {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            Some(0)
        }
        fn children(&self, b: &usize) -> Vec<usize> {
            self.0.children(b)
        }
        fn name(&self, b: &usize) -> Option<String> {
            self.0.name(b)
        }
        fn supports_structural_identity(&self) -> bool {
            true
        }
        fn structural_identity(&self, b: &usize) -> Option<String> {
            self.0.structural_identity(b)
        }
        fn value(&self, _: &usize) -> Option<crate::value_semantics::Value> {
            Some(crate::value_semantics::Value::SansaAddress(
                "$.\\group1\\".into(),
            ))
        }
    }
    let before = ns.calls.get();
    options.address_activation = AddressActivation::Trusted;
    let out = evaluate_query("from $\nselect path(.)", &Activation(&ns), &options);
    assert_eq!(out.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
    assert_eq!(ns.calls.get(), before);
}

#[test]
fn constrained_identity_activation_shared_vectors() {
    use crate::evaluate::{
        ActivationSelector, AddressActivation, AddressActivationPolicy, EvaluateOptions,
        EvaluatedValue, evaluate_query,
    };
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/activation-admission.json"
    ))
    .expect("valid activation fixture");
    assert_eq!(suite["tests"].as_array().expect("test roster").len(), 39);
    for case in suite["tests"].as_array().expect("test roster") {
        let mut fixture = suite["namespace"].clone();
        fixture["root"]["children"][1]["value"] =
            json!({"type":"SansaAddressLiteral","address":case["path"]});
        match case["change"].as_str() {
            Some("duplicate") => {
                fixture["root"]["children"][0]["children"][1]["identity"] = json!("first")
            }
            Some("invalid") => {
                fixture["root"]["children"][0]["children"][1]["identity"] = json!("bad!")
            }
            Some("unsupported") => fixture["supportsIdentity"] = json!(false),
            Some("current-no-address") => {
                fixture["root"]["children"][0]
                    .as_object_mut()
                    .expect("object")
                    .remove("address");
            }
            Some("parent-outside") => {
                fixture["root"]["children"][0]["address"] = json!("$.outside")
            }
            Some("child-outside") => {
                fixture["root"]["children"][0]["children"][0]["address"] = json!("$.outside[0]")
            }
            Some("value-outside") => {
                fixture["root"]["children"][0]["children"][0]["children"][0]["address"] =
                    json!("$.outside.name")
            }
            Some("value-selector") => {
                fixture["root"]["children"][0]["children"][0]["children"][0]["address"] =
                    json!("$.items.*.name")
            }
            Some("root-no-address") => {
                fixture["root"]
                    .as_object_mut()
                    .expect("root")
                    .remove("address");
            }
            Some("rebase-items") => {
                let mut items = fixture["root"]["children"][0].clone();
                let mut param = fixture["root"]["children"][1].clone();
                param["address"] = json!("$.items.selector");
                items["children"]
                    .as_array_mut()
                    .expect("children")
                    .push(param);
                fixture["root"] = items;
            }
            _ => {}
        }
        let ns = Fixture::build(&fixture);
        let mut options = EvaluateOptions::default();
        let p = &case["options"]["addressActivation"];
        if p == "trusted" {
            options.address_activation = AddressActivation::Trusted;
        } else if p.is_object() {
            let roots = p["allowedRoots"]
                .as_array()
                .expect("roots")
                .iter()
                .map(|r| parse_address(r.as_str().expect("root string")).expect("root parses"))
                .collect();
            let selectors = p["allowedSelectors"]
                .as_array()
                .expect("features")
                .iter()
                .map(|s| match s.as_str().expect("feature") {
                    "member" => ActivationSelector::Member,
                    "position" => ActivationSelector::Position,
                    "parent" => ActivationSelector::Parent,
                    "childIdentity" => ActivationSelector::ChildIdentity,
                    "wildcard" => ActivationSelector::DirectExpansion,
                    "range" => ActivationSelector::Range,
                    _ => panic!("unexpected feature"),
                })
                .collect();
            options.address_activation = AddressActivation::Constrained(AddressActivationPolicy {
                allowed_roots: roots,
                allowed_selectors: selectors,
                allow_contextual_root: p["allowContextualRoot"].as_bool().unwrap_or(false),
                max_address_depth: p["maxAddressDepth"].as_u64().map(|n| n as usize),
                max_bindings: p["maxBindings"].as_u64().map(|n| n as usize),
            });
        }
        let r = &case["options"]["resolve"];
        if let Some(n) = r["maxIdentityInspections"].as_u64() {
            options.resolve.max_identity_inspections = n as usize;
        }
        options.resolve.max_bindings = r["maxBindings"].as_u64().map(|n| n as usize);
        let source = case["query"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| {
                format!(
                    "from {}\nselect path($.selector)",
                    case["source"].as_str().unwrap_or("$")
                )
            });
        let before = options.clone();
        let out = evaluate_query(&source, &ns, &options);
        let e = &case["expected"];
        assert_eq!(
            out.is_ok(),
            e["ok"].as_bool().expect("expected status"),
            "{}: {out:?}",
            case["id"]
        );
        assert_eq!(
            ns.calls.get(),
            e["identityCalls"].as_u64().expect("calls") as usize,
            "{}: {out:?}",
            case["id"]
        );
        assert_eq!(options, before);
        if out.is_ok() {
            let selected: Vec<Vec<_>> = out
                .results
                .iter()
                .map(|r| match &r.value {
                    EvaluatedValue::Bindings(bs) => {
                        bs.iter().map(|b| ns.rows[*b]["address"].clone()).collect()
                    }
                    _ => panic!("expected bindings"),
                })
                .collect();
            assert_eq!(json!(selected), e["selected"], "{}", case["id"]);
        } else {
            assert!(out.results.is_empty());
            let d = &out.errors[0];
            assert_eq!(
                d.code,
                e.get("rustError")
                    .unwrap_or(&e["error"])
                    .as_str()
                    .expect("expected code"),
                "{}",
                case["id"]
            );
            let actual = json!({"phase":d.phase.map(|p|format!("{p:?}").to_lowercase()),"candidateAddress":d.candidate_address,"limit":d.limit,"observed":d.observed,"selectorIndex":d.selector_index});
            for field in [
                "phase",
                "candidateAddress",
                "limit",
                "observed",
                "selectorIndex",
            ] {
                if let Some(v) = e.get(field) {
                    assert_eq!(&actual[field], v, "{}: {field}", case["id"]);
                }
            }
        }
    }
}

#[test]
fn identity_activation_keeps_forged_roots_and_standalone_expression_closed() {
    use crate::evaluate::{
        ActivationSelector, AddressActivation, AddressActivationPolicy, EvaluateOptions,
        evaluate_expression, evaluate_query,
    };
    let s: J = serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/activation-admission.json"
    ))
    .expect("fixture");
    let mut f = s["namespace"].clone();
    f["root"]["children"][1]["value"] =
        json!({"type":"SansaAddressLiteral","address":"$.items.\\first\\"});
    let ns = Fixture::build(&f);
    let mut root = parse_address("$.items.\\first\\").expect("root");
    root.is_exact = true;
    root.canonical = "$.items".into();
    let mut options = EvaluateOptions {
        address_activation: AddressActivation::Constrained(AddressActivationPolicy {
            allowed_roots: vec![root],
            allowed_selectors: vec![
                ActivationSelector::Member,
                ActivationSelector::ChildIdentity,
            ],
            allow_contextual_root: false,
            max_address_depth: None,
            max_bindings: None,
        }),
        ..EvaluateOptions::default()
    };
    let r = evaluate_query("from $\nselect path($.selector)", &ns, &options);
    assert_eq!(
        r.errors[0].code,
        "SANSA_QUERY_PATH_ACTIVATION_INVALID_POLICY"
    );
    assert_eq!(ns.calls.get(), 0);
    if let AddressActivation::Constrained(p) = &mut options.address_activation {
        p.allowed_roots = vec![parse_address("$.items").expect("root")];
    }
    let expression = crate::query::parse_expression("path($.selector)").expect("expression");
    let r =
        evaluate_expression(&expression, &0, &ns, &options).expect_err("standalone stays closed");
    assert_eq!(r.code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
    assert_eq!(ns.calls.get(), 0);
    options.resolve.max_identity_inspections = 2;
    for _ in 0..2 {
        assert!(evaluate_query("from $\nselect path($.selector)", &ns, &options).is_ok());
    }
}

#[test]
fn malformed_identity_ast_filter_and_qualifier_payloads_fail_before_namespace_access() {
    struct Unread;
    impl Namespace for Unread {
        type Binding = usize;
        fn root(&self) -> Option<usize> {
            panic!("namespace accessed")
        }
        fn children(&self, _: &usize) -> Vec<usize> {
            panic!("namespace accessed")
        }
    }
    for selector in [
        Selector::SemanticTypeFilter { name: "T.*".into() },
        Selector::RepresentationKindFilter {
            name: "ObjectLiteral.*".into(),
        },
    ] {
        let mut address = parse_address("$.\\target\\").unwrap();
        address.selectors.push(selector);
        let result = resolve_parsed_address(&address, &Unread, &ResolveOptions::default());
        assert_eq!(result.errors[0].code, "SANSA_RESOLVE_INVALID_ADDRESS");
    }
    let mut address = parse_address("$.\\target\\:Q[1]").unwrap();
    address.qualifier_expression.as_mut().unwrap().terms[0].name = "Q|Other".into();
    let result = resolve_parsed_address(&address, &Unread, &ResolveOptions::default());
    assert_eq!(result.errors[0].code, "SANSA_RESOLVE_INVALID_ADDRESS");
}

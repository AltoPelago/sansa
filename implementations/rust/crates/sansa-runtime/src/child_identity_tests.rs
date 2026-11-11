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
            supported: f["supportsIdentity"].as_bool().unwrap(),
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
            .unwrap()
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
    .unwrap()
}
#[test]
fn parser_candidate_vectors() {
    let suite: J = serde_json::from_str(include_str!(
        "../tests/fixtures/child-identity/12-child-identity-parser.json"
    ))
    .unwrap();
    assert_eq!(suite["tests"].as_array().unwrap().len(), 20);
    for case in suite["tests"].as_array().unwrap() {
        let got = parse_address(case["input"]["source"].as_str().unwrap());
        assert_eq!(
            got.is_ok(),
            case["expected"]["ok"].as_bool().unwrap(),
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
            assert_eq!(got.is_exact, case["expected"]["exact"].as_bool().unwrap());
            assert_eq!(render_address(&got), case["expected"]["canonical"]);
            assert_eq!(parse_address(&got.canonical).unwrap(), got);
        }
    }
}
#[test]
fn resolve_candidate_vectors() {
    let suite = suite();
    let mut count = 0;
    for case in suite["tests"].as_array().unwrap() {
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
            .unwrap()
            .iter()
            .find(|f| f["id"] == input["namespace"])
            .unwrap();
        let ns = Fixture::build(f);
        let mut options = ResolveOptions::default();
        if let Some(n) = input["maxIdentityInspections"].as_u64() {
            options.max_identity_inspections = n as usize;
        }
        options.max_bindings = input["maxBindings"].as_u64().map(|n| n as usize);
        options.contextual_root = input["contextualRoot"]
            .as_str()
            .map(|s| ns.rows.iter().position(|r| r["address"] == s).unwrap());
        let got = resolve_address(input["source"].as_str().unwrap(), &ns, &options);
        assert_eq!(
            got.is_ok(),
            case["expected"]["ok"].as_bool().unwrap(),
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
            case["expected"]["identityCalls"].as_u64().unwrap() as usize,
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
    let mut a = parse_address("$.\\group1\\").unwrap();
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
    let out = crate::evaluate::evaluate_query(
        "from $.\\group1\\\nselect .",
        &ns,
        &crate::evaluate::EvaluateOptions::default(),
    );
    assert!(!out.errors.is_empty());
    assert_eq!(out.errors[0].code, "SANSA_RESOLVE_UNSUPPORTED_SELECTOR");
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
        let mut ast = parse_address("$.\\group1\\").unwrap();
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
    let mut a = parse_address("$.\\group1\\").unwrap();
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
    let mut a = parse_address("$.\\group1\\").unwrap();
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

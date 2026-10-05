use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::resolve::{
    Namespace, Navigation, ParentTraversal, ResolveOptions, resolve_address,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Suite {
    fixtures: Fixtures,
    tests: Vec<TestCase>,
}

#[derive(Deserialize)]
struct Fixtures {
    namespaces: Vec<NamespaceFixture>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NamespaceFixture {
    id: String,
    #[serde(default)]
    supports_parent_traversal: bool,
    #[serde(default)]
    supports_local_spaces: bool,
    root: RawNode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawNode {
    address: String,
    name: Option<String>,
    index: Option<usize>,
    semantic_type: Option<String>,
    representation_kind: Option<String>,
    #[serde(default)]
    children: Vec<RawNode>,
    attribute_space: Option<Box<RawNode>>,
    #[serde(default)]
    local_spaces: BTreeMap<String, RawNode>,
}

#[derive(Deserialize)]
struct TestCase {
    id: String,
    input: Input,
    expected: Expected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    namespace: String,
    source: String,
    contextual_root: Option<String>,
    parent_traversal: Option<String>,
    #[serde(default)]
    fail_on_parent_from_effective_root: bool,
    max_bindings: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    ok: bool,
    addresses: Option<Vec<String>>,
    error: Option<String>,
    selector_index: Option<usize>,
    limit: Option<usize>,
    observed: Option<usize>,
}

#[derive(Debug)]
struct Node {
    address: String,
    name: Option<String>,
    index: Option<usize>,
    semantic_type: Option<String>,
    representation_kind: Option<String>,
    children: Vec<usize>,
    parent: Option<usize>,
    attribute_space: Option<usize>,
    local_spaces: BTreeMap<String, usize>,
}

struct FixtureNamespace {
    nodes: Vec<Node>,
    by_address: HashMap<String, usize>,
    supports_parent: bool,
    supports_local_spaces: bool,
}

impl FixtureNamespace {
    fn from_fixture(fixture: NamespaceFixture) -> Self {
        let mut namespace = Self {
            nodes: Vec::new(),
            by_address: HashMap::new(),
            supports_parent: fixture.supports_parent_traversal,
            supports_local_spaces: fixture.supports_local_spaces,
        };
        namespace.push_node(fixture.root, None);
        namespace
    }

    fn push_node(&mut self, raw: RawNode, parent: Option<usize>) -> usize {
        let index = self.nodes.len();
        self.by_address.insert(raw.address.clone(), index);
        self.nodes.push(Node {
            address: raw.address,
            name: raw.name,
            index: raw.index,
            semantic_type: raw.semantic_type,
            representation_kind: raw.representation_kind,
            children: Vec::new(),
            parent,
            attribute_space: None,
            local_spaces: BTreeMap::new(),
        });
        let children = raw
            .children
            .into_iter()
            .map(|child| self.push_node(child, Some(index)))
            .collect();
        let attribute_space = raw
            .attribute_space
            .map(|attributes| self.push_node(*attributes, Some(index)));
        let local_spaces = raw
            .local_spaces
            .into_iter()
            .map(|(name, local)| (name, self.push_node(local, Some(index))))
            .collect();
        self.nodes[index].children = children;
        self.nodes[index].attribute_space = attribute_space;
        self.nodes[index].local_spaces = local_spaces;
        index
    }
}

impl Namespace for FixtureNamespace {
    type Binding = usize;

    fn root(&self) -> Option<Self::Binding> {
        (!self.nodes.is_empty()).then_some(0)
    }

    fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding> {
        self.nodes[*binding].children.clone()
    }

    fn parent(&self, binding: &Self::Binding) -> Navigation<Self::Binding> {
        if !self.supports_parent {
            Navigation::Unsupported
        } else {
            self.nodes[*binding]
                .parent
                .map_or(Navigation::Missing, Navigation::Binding)
        }
    }

    fn attribute_space(&self, binding: &Self::Binding) -> Navigation<Self::Binding> {
        self.nodes[*binding]
            .attribute_space
            .map_or(Navigation::Missing, Navigation::Binding)
    }

    fn local_space(&self, binding: &Self::Binding, name: &str) -> Navigation<Self::Binding> {
        if !self.supports_local_spaces {
            Navigation::Unsupported
        } else {
            self.nodes[*binding]
                .local_spaces
                .get(name)
                .copied()
                .map_or(Navigation::Missing, Navigation::Binding)
        }
    }

    fn name(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].name.clone()
    }

    fn position(&self, binding: &Self::Binding) -> Option<usize> {
        self.nodes[*binding].index
    }

    fn semantic_type(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].semantic_type.clone()
    }

    fn representation_kind(&self, binding: &Self::Binding) -> Option<String> {
        self.nodes[*binding].representation_kind.clone()
    }
}

#[test]
fn passes_every_stable_resolve_case() {
    let path = cts_root().join("sansa/v1/suites/03-address-resolve.json");
    let suite: Suite = read_json(&path);
    assert_eq!(suite.tests.len(), 37, "{path:?}");
    let namespaces = suite
        .fixtures
        .namespaces
        .into_iter()
        .map(|fixture| (fixture.id.clone(), FixtureNamespace::from_fixture(fixture)))
        .collect::<HashMap<_, _>>();

    for test in suite.tests {
        let namespace = namespaces
            .get(&test.input.namespace)
            .unwrap_or_else(|| panic!("{}: missing namespace", test.id));
        let contextual_root = test.input.contextual_root.as_ref().map(|address| {
            *namespace
                .by_address
                .get(address)
                .unwrap_or_else(|| panic!("{}: missing contextual root", test.id))
        });
        let options = ResolveOptions {
            contextual_root,
            parent_traversal: if test.input.parent_traversal.as_deref() == Some("forbid") {
                ParentTraversal::Forbid
            } else {
                ParentTraversal::Allow
            },
            fail_on_parent_from_effective_root: test.input.fail_on_parent_from_effective_root,
            max_bindings: test.input.max_bindings,
            ..ResolveOptions::default()
        };
        let result = resolve_address(&test.input.source, namespace, &options);
        assert_eq!(
            result.is_ok(),
            test.expected.ok,
            "{}: {:?}",
            test.id,
            result.errors
        );
        if test.expected.ok {
            let addresses = result
                .bindings
                .iter()
                .map(|binding| namespace.nodes[*binding].address.clone())
                .collect::<Vec<_>>();
            assert_eq!(Some(addresses), test.expected.addresses, "{}", test.id);
        } else {
            let error = result
                .errors
                .first()
                .unwrap_or_else(|| panic!("{}: missing error", test.id));
            assert_eq!(
                Some(error.code.as_str()),
                test.expected.error.as_deref(),
                "{}",
                test.id
            );
            assert_eq!(
                error.selector_index, test.expected.selector_index,
                "{}",
                test.id
            );
            assert_eq!(error.limit, test.expected.limit, "{}", test.id);
            assert_eq!(error.observed, test.expected.observed, "{}", test.id);
        }
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

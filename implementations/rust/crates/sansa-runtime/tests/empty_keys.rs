use sansa_runtime::address::{parse_address, render_address};
use sansa_runtime::resolve::{Namespace, ResolveOptions, resolve_address};

struct EmptyNamespace;
impl Namespace for EmptyNamespace {
    type Binding = usize;
    fn root(&self) -> Option<usize> {
        Some(0)
    }
    fn children(&self, binding: &usize) -> Vec<usize> {
        match binding {
            0 => vec![1],
            1 => vec![2],
            _ => vec![],
        }
    }
    fn name(&self, binding: &usize) -> Option<String> {
        (*binding != 0).then(String::new)
    }
}

#[test]
fn empty_members_parse_render_and_resolve_without_becoming_root() {
    for (source, expected) in [("$.[\"\"]", 1), ("$.[\"\"].[\"\"]", 2)] {
        let address = parse_address(source).expect("empty member");
        assert_eq!(render_address(&address), source);
        let result = resolve_address(source, &EmptyNamespace, &ResolveOptions::default());
        assert_eq!(result.bindings, vec![expected]);
    }
    assert!(parse_address("$.[\"\"").is_err());
    assert!(parse_address("$.<\"\">").is_err());
}

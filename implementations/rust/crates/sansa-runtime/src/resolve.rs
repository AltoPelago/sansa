//! Host-neutral SANSA Address resolution over opaque binding handles.

use crate::address::{Address, Root, Selector, parse_address};
use crate::value_semantics::Value;
use crate::{Diagnostic, DiagnosticPhase};

/// Result of a namespace navigation capability.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Navigation<Binding> {
    /// The namespace does not expose this navigation capability.
    Unsupported,
    /// The capability is supported, but this binding has no matching target.
    Missing,
    /// Navigation produced a binding.
    Binding(Binding),
}

/// Host namespace consumed by Resolve.
///
/// Bindings are opaque handles. The runtime never requires recursive owned
/// binding values or a SANSA-specific document representation.
pub trait Namespace {
    type Binding: Clone + Eq;

    fn root(&self) -> Option<Self::Binding>;
    fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding>;

    fn contextual_root(&self) -> Option<Self::Binding> {
        None
    }

    fn parent(&self, _binding: &Self::Binding) -> Navigation<Self::Binding> {
        Navigation::Unsupported
    }

    fn attribute_space(&self, _binding: &Self::Binding) -> Navigation<Self::Binding> {
        Navigation::Unsupported
    }

    fn local_space(&self, _binding: &Self::Binding, _name: &str) -> Navigation<Self::Binding> {
        Navigation::Unsupported
    }

    fn name(&self, _binding: &Self::Binding) -> Option<String> {
        None
    }

    fn position(&self, _binding: &Self::Binding) -> Option<usize> {
        None
    }

    fn semantic_type(&self, _binding: &Self::Binding) -> Option<String> {
        None
    }

    fn semantic_type_matches(&self, binding: &Self::Binding, expected: &str) -> bool {
        semantic_type_matches(self.semantic_type(binding).as_deref(), expected)
    }

    fn representation_kind(&self, _binding: &Self::Binding) -> Option<String> {
        None
    }

    fn representation_kind_matches(&self, binding: &Self::Binding, expected: &str) -> bool {
        representation_kind_matches(self.representation_kind(binding).as_deref(), expected)
    }

    /// Return the host-neutral value exposed by a binding.
    ///
    /// Containers may return a structural [`Value::Container`] when the host
    /// can expose a stable snapshot. Returning `None` means the binding does
    /// not expose a scalar or structural value to Query.
    fn value(&self, _binding: &Self::Binding) -> Option<Value> {
        None
    }

    /// Return the canonical absolute address of a binding when available.
    fn binding_address(&self, _binding: &Self::Binding) -> Option<String> {
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ParentTraversal {
    #[default]
    Allow,
    Forbid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolveOptions<Binding> {
    pub contextual_root: Option<Binding>,
    pub parent_traversal: ParentTraversal,
    pub fail_on_parent_from_effective_root: bool,
    pub allow_parent_from_effective_root: bool,
    pub max_bindings: Option<usize>,
}

impl<Binding> Default for ResolveOptions<Binding> {
    fn default() -> Self {
        Self {
            contextual_root: None,
            parent_traversal: ParentTraversal::Allow,
            fail_on_parent_from_effective_root: false,
            allow_parent_from_effective_root: false,
            max_bindings: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolveOutput<Binding> {
    pub bindings: Vec<Binding>,
    pub errors: Vec<Diagnostic>,
    pub diagnostics: Vec<Diagnostic>,
}

impl<Binding> ResolveOutput<Binding> {
    #[must_use]
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }

    fn success(bindings: Vec<Binding>) -> Self {
        Self {
            bindings,
            errors: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn failure(error: Diagnostic) -> Self {
        Self {
            bindings: Vec::new(),
            errors: vec![error],
            diagnostics: Vec::new(),
        }
    }
}

#[must_use]
pub fn resolve_address<N: Namespace>(
    input: &str,
    namespace: &N,
    options: &ResolveOptions<N::Binding>,
) -> ResolveOutput<N::Binding> {
    match parse_address(input) {
        Ok(address) => resolve_parsed_address(&address, namespace, options),
        Err(error) => {
            let mut diagnostic = Diagnostic::new(error.code, error.message);
            diagnostic.phase = Some(DiagnosticPhase::Parse);
            ResolveOutput::failure(diagnostic)
        }
    }
}

#[must_use]
pub fn resolve_parsed_address<N: Namespace>(
    address: &Address,
    namespace: &N,
    options: &ResolveOptions<N::Binding>,
) -> ResolveOutput<N::Binding> {
    let root = match address.root {
        Root::Absolute => namespace.root().ok_or_else(|| {
            resolve_error(
                "SANSA_RESOLVE_MISSING_ROOT",
                "SANSA resolve namespace does not expose a root binding",
                None,
            )
        }),
        Root::Contextual => options
            .contextual_root
            .clone()
            .or_else(|| namespace.contextual_root())
            .ok_or_else(|| {
                resolve_error(
                    "SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT",
                    "Contextual root requires a contextualRoot binding",
                    None,
                )
            }),
    };
    let root = match root {
        Ok(root) => root,
        Err(error) => return ResolveOutput::failure(error),
    };

    if options.max_bindings == Some(0) && address.selectors.is_empty() {
        return ResolveOutput::failure(binding_limit_error(0, 1, None));
    }

    let mut current = vec![root.clone()];
    for (selector_index, selector) in address.selectors.iter().enumerate() {
        current = match apply_selector(
            selector,
            &current,
            namespace,
            selector_index,
            &root,
            options,
        ) {
            Ok(bindings) => bindings,
            Err(error) => return ResolveOutput::failure(*error),
        };
        if let Some(limit) = options.max_bindings
            && current.len() > limit
        {
            return ResolveOutput::failure(binding_limit_error(
                limit,
                current.len(),
                Some(selector_index),
            ));
        }
        if current.is_empty() {
            break;
        }
    }

    if address.is_exact && current.len() > 1 {
        return ResolveOutput::failure(resolve_error(
            "SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION",
            "Exact SANSA resolution produced more than one binding",
            None,
        ));
    }
    ResolveOutput::success(current)
}

fn apply_selector<N: Namespace>(
    selector: &Selector,
    bindings: &[N::Binding],
    namespace: &N,
    selector_index: usize,
    effective_root: &N::Binding,
    options: &ResolveOptions<N::Binding>,
) -> Result<Vec<N::Binding>, Box<Diagnostic>> {
    match selector {
        Selector::Member { name, .. } => {
            Ok(collect_bounded(bindings, options.max_bindings, |binding| {
                namespace
                    .children(binding)
                    .into_iter()
                    .filter(|child| namespace.name(child).as_deref() == Some(name))
                    .collect()
            }))
        }
        Selector::Position { index } => Ok(bindings
            .iter()
            .filter_map(|binding| select_position(namespace, binding, *index))
            .collect()),
        Selector::PositionRange { start, end } => {
            Ok(collect_bounded(bindings, options.max_bindings, |binding| {
                select_position_range(namespace, binding, *start, *end)
            }))
        }
        Selector::Parent => {
            select_parents(bindings, namespace, selector_index, effective_root, options)
        }
        Selector::AttributeSpace => select_attribute_spaces(bindings, namespace, selector_index),
        Selector::LocalSpace { name } => {
            select_local_spaces(bindings, namespace, name, selector_index)
        }
        Selector::DirectExpansion => {
            Ok(collect_bounded(bindings, options.max_bindings, |binding| {
                namespace.children(binding)
            }))
        }
        Selector::DescendantExpansion => {
            Ok(collect_bounded(bindings, options.max_bindings, |binding| {
                descendants(namespace, binding, options.max_bindings)
            }))
        }
        Selector::NamePattern { pattern } => {
            Ok(collect_bounded(bindings, options.max_bindings, |binding| {
                namespace
                    .children(binding)
                    .into_iter()
                    .filter(|child| {
                        namespace
                            .name(child)
                            .is_some_and(|name| glob_matches(pattern, &name))
                    })
                    .collect()
            }))
        }
        Selector::SemanticTypeFilter { name } => Ok(bindings
            .iter()
            .filter(|binding| namespace.semantic_type_matches(binding, name))
            .cloned()
            .collect()),
        Selector::RepresentationKindFilter { name } => Ok(bindings
            .iter()
            .filter(|binding| namespace.representation_kind_matches(binding, name))
            .cloned()
            .collect()),
    }
}

fn select_position<N: Namespace>(
    namespace: &N,
    binding: &N::Binding,
    index: usize,
) -> Option<N::Binding> {
    let children = namespace.children(binding);
    children
        .iter()
        .find(|child| namespace.position(child) == Some(index))
        .cloned()
        .or_else(|| children.get(index).cloned())
}

fn select_position_range<N: Namespace>(
    namespace: &N,
    binding: &N::Binding,
    start: Option<usize>,
    end: Option<usize>,
) -> Vec<N::Binding> {
    let lower = start.unwrap_or(0);
    if end.is_some_and(|upper| lower > upper) {
        return Vec::new();
    }
    namespace
        .children(binding)
        .into_iter()
        .enumerate()
        .filter(|(ordinal, child)| {
            let position = namespace.position(child).unwrap_or(*ordinal);
            position >= lower && end.is_none_or(|upper| position <= upper)
        })
        .map(|(_, child)| child)
        .collect()
}

fn select_parents<N: Namespace>(
    bindings: &[N::Binding],
    namespace: &N,
    selector_index: usize,
    effective_root: &N::Binding,
    options: &ResolveOptions<N::Binding>,
) -> Result<Vec<N::Binding>, Box<Diagnostic>> {
    if options.parent_traversal == ParentTraversal::Forbid {
        return Err(Box::new(resolve_error(
            "SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN",
            "Parent traversal is forbidden by resolver policy",
            Some(selector_index),
        )));
    }
    let root_is_selected = !options.allow_parent_from_effective_root
        && bindings.iter().any(|binding| binding == effective_root);
    if root_is_selected && options.fail_on_parent_from_effective_root {
        return Err(Box::new(resolve_error(
            "SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN",
            "Parent traversal would escape the effective resolution root",
            Some(selector_index),
        )));
    }

    let traversable = bindings
        .iter()
        .filter(|binding| options.allow_parent_from_effective_root || *binding != effective_root)
        .collect::<Vec<_>>();
    if traversable.is_empty() {
        return Ok(Vec::new());
    }
    let mut output = Vec::new();
    for binding in traversable {
        match namespace.parent(binding) {
            Navigation::Binding(parent) => output.push(parent),
            Navigation::Missing => {}
            Navigation::Unsupported => {
                return Err(Box::new(resolve_error(
                    "SANSA_RESOLVE_UNSUPPORTED_PARENT",
                    "The namespace does not expose parent traversal",
                    Some(selector_index),
                )));
            }
        }
    }
    Ok(output)
}

fn select_attribute_spaces<N: Namespace>(
    bindings: &[N::Binding],
    namespace: &N,
    selector_index: usize,
) -> Result<Vec<N::Binding>, Box<Diagnostic>> {
    let mut output = Vec::new();
    for binding in bindings {
        match namespace.attribute_space(binding) {
            Navigation::Binding(attributes) => output.push(attributes),
            Navigation::Missing => {}
            Navigation::Unsupported => {
                return Err(Box::new(resolve_error(
                    "SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE",
                    "The namespace does not expose attribute address-space traversal",
                    Some(selector_index),
                )));
            }
        }
    }
    Ok(output)
}

fn select_local_spaces<N: Namespace>(
    bindings: &[N::Binding],
    namespace: &N,
    name: &str,
    selector_index: usize,
) -> Result<Vec<N::Binding>, Box<Diagnostic>> {
    let mut output = Vec::new();
    for binding in bindings {
        match namespace.local_space(binding, name) {
            Navigation::Binding(local) => output.push(local),
            Navigation::Missing => {}
            Navigation::Unsupported => {
                return Err(Box::new(resolve_error(
                    "SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE",
                    format!("The namespace does not expose local address space '{name}'"),
                    Some(selector_index),
                )));
            }
        }
    }
    Ok(output)
}

fn descendants<N: Namespace>(
    namespace: &N,
    binding: &N::Binding,
    max_bindings: Option<usize>,
) -> Vec<N::Binding> {
    let mut stack = namespace.children(binding);
    stack.reverse();
    let mut output = Vec::new();
    while let Some(child) = stack.pop() {
        output.push(child.clone());
        if exceeded(&output, max_bindings) {
            break;
        }
        let children = namespace.children(&child);
        for descendant in children.into_iter().rev() {
            stack.push(descendant);
        }
    }
    output
}

fn collect_bounded<Binding: Clone>(
    bindings: &[Binding],
    limit: Option<usize>,
    mut select: impl FnMut(&Binding) -> Vec<Binding>,
) -> Vec<Binding> {
    let mut output = Vec::new();
    for binding in bindings {
        for selected in select(binding) {
            push_bounded(&mut output, selected, limit);
            if exceeded(&output, limit) {
                return output;
            }
        }
    }
    output
}

fn push_bounded<Binding>(output: &mut Vec<Binding>, binding: Binding, limit: Option<usize>) {
    if limit.is_none_or(|limit| output.len() <= limit) {
        output.push(binding);
    }
}

fn exceeded<Binding>(output: &[Binding], limit: Option<usize>) -> bool {
    limit.is_some_and(|limit| output.len() > limit)
}

fn semantic_type_matches(actual: Option<&str>, expected: &str) -> bool {
    actual.is_some_and(|actual| {
        actual == expected
            || actual[..actual.find(['<', '[']).unwrap_or(actual.len())].trim() == expected
    })
}

fn representation_kind_matches(actual: Option<&str>, expected: &str) -> bool {
    actual.is_some_and(|actual| actual == expected || lower_first(actual) == expected)
}

fn lower_first(value: &str) -> String {
    let mut chars = value.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_lowercase().chain(chars).collect()
    })
}

#[derive(Clone, Copy)]
enum PatternToken {
    Star,
    One,
    Literal(char),
}

fn glob_matches(pattern: &str, value: &str) -> bool {
    let mut tokens = Vec::new();
    let chars = pattern.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if ch == '\\'
            && chars
                .get(index + 1)
                .is_some_and(|next| matches!(next, '*' | '?' | '\\'))
        {
            tokens.push(PatternToken::Literal(chars[index + 1]));
            index += 2;
            continue;
        }
        tokens.push(match ch {
            '*' => PatternToken::Star,
            '?' => PatternToken::One,
            literal => PatternToken::Literal(literal),
        });
        index += 1;
    }
    let value = value.chars().collect::<Vec<_>>();
    let (mut token, mut item) = (0, 0);
    let (mut star, mut retry) = (None, 0);
    while item < value.len() {
        match tokens.get(token) {
            Some(PatternToken::Literal(expected)) if *expected == value[item] => {
                token += 1;
                item += 1;
            }
            Some(PatternToken::One) => {
                token += 1;
                item += 1;
            }
            Some(PatternToken::Star) => {
                star = Some(token);
                token += 1;
                retry = item;
            }
            _ => {
                let Some(star_index) = star else {
                    return false;
                };
                retry += 1;
                item = retry;
                token = star_index + 1;
            }
        }
    }
    while matches!(tokens.get(token), Some(PatternToken::Star)) {
        token += 1;
    }
    token == tokens.len()
}

fn resolve_error(
    code: impl Into<String>,
    message: impl Into<String>,
    selector_index: Option<usize>,
) -> Diagnostic {
    let mut diagnostic = Diagnostic::new(code, message);
    diagnostic.phase = Some(DiagnosticPhase::Resolve);
    diagnostic.selector_index = selector_index;
    diagnostic
}

fn binding_limit_error(limit: usize, observed: usize, selector_index: Option<usize>) -> Diagnostic {
    let mut diagnostic = resolve_error(
        "SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED",
        format!("Resolve produced more than {limit} bindings"),
        selector_index,
    );
    diagnostic.budget = Some("maxBindings".into());
    diagnostic.limit = Some(limit);
    diagnostic.observed = Some(observed);
    diagnostic
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestNamespace {
        root: Option<usize>,
        contextual_root: Option<usize>,
    }

    impl Namespace for TestNamespace {
        type Binding = usize;

        fn root(&self) -> Option<Self::Binding> {
            self.root
        }

        fn contextual_root(&self) -> Option<Self::Binding> {
            self.contextual_root
        }

        fn children(&self, _binding: &Self::Binding) -> Vec<Self::Binding> {
            Vec::new()
        }

        fn attribute_space(&self, binding: &Self::Binding) -> Navigation<Self::Binding> {
            Navigation::Binding(binding + 10)
        }

        fn local_space(&self, binding: &Self::Binding, _name: &str) -> Navigation<Self::Binding> {
            Navigation::Binding(binding + 20)
        }
    }

    #[test]
    fn absolute_and_contextual_missing_roots_have_distinct_diagnostics() {
        let namespace = TestNamespace {
            root: None,
            contextual_root: None,
        };

        let absolute = resolve_address("$", &namespace, &ResolveOptions::default());
        let contextual = resolve_address("?", &namespace, &ResolveOptions::default());

        assert_eq!(absolute.errors[0].code, "SANSA_RESOLVE_MISSING_ROOT");
        assert_eq!(
            contextual.errors[0].code,
            "SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT"
        );
    }

    #[test]
    fn namespace_contextual_root_is_used_when_options_do_not_override_it() {
        let namespace = TestNamespace {
            root: Some(0),
            contextual_root: Some(7),
        };

        let result = resolve_address("?", &namespace, &ResolveOptions::default());

        assert_eq!(result.bindings, vec![7]);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn one_to_one_navigation_does_not_truncate_the_observed_binding_count() {
        let namespace = TestNamespace {
            root: Some(0),
            contextual_root: None,
        };

        let attributes = select_attribute_spaces(&[0, 1, 2], &namespace, 0)
            .expect("attribute navigation is supported");
        let locals = select_local_spaces(&[0, 1, 2], &namespace, "scope", 0)
            .expect("local navigation is supported");

        assert_eq!(attributes.len(), 3);
        assert_eq!(locals.len(), 3);
    }

    #[test]
    fn glob_escaping_only_consumes_supported_escape_sequences() {
        assert!(glob_matches(r"a\b", r"a\b"));
        assert!(glob_matches("a\\", "a\\"));
        assert!(glob_matches(r"a\*b", "a*b"));
        assert!(glob_matches(r"a\?b", "a?b"));
        assert!(glob_matches(r"a\\b", r"a\b"));
        assert!(!glob_matches(r"a\*b", "axxb"));
    }
}

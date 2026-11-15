//! Proposed standalone ABI shapes, not part of sansa-runtime exports.
//! The properties signature/default below is to be added to the existing
//! Namespace trait during implementation; this sketch adds no runtime feature.

pub const DEFAULT_PROPERTY_INSPECTIONS: u32 = 10_000;
pub const MAX_PROPERTY_INSPECTIONS: u32 = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyScopeRole { Root, Inside, Outside }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyNodeKind { NodeLiteral, NodeHead, Other }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyAccessError { InvalidMetadata, ScopeViolation, AdapterFailure }

pub struct PropertyAccessContext<'a, B> {
    pub scope_root: &'a B,
    pub evaluation_root: &'a B,
    pub direct_head_of: Option<&'a B>,
}

pub type PropertyHeads<'a, B> =
    Box<dyn Iterator<Item = Result<B, PropertyAccessError>> + 'a>;

pub trait PropertyAccess {
    type Binding: Clone + Eq;
    fn supports_key(&self) -> bool { false }
    fn supports_nodes(&self) -> bool { false }
    fn scope(&self, binding: &Self::Binding, context: &PropertyAccessContext<'_, Self::Binding>)
        -> Result<PropertyScopeRole, PropertyAccessError>;
    fn key(&self, _binding: &Self::Binding, _context: &PropertyAccessContext<'_, Self::Binding>)
        -> Result<Option<String>, PropertyAccessError> { Ok(None) }
    fn node_kind(&self, _binding: &Self::Binding, _context: &PropertyAccessContext<'_, Self::Binding>)
        -> Result<PropertyNodeKind, PropertyAccessError> { Ok(PropertyNodeKind::Other) }
    fn node_tag(&self, _binding: &Self::Binding, _context: &PropertyAccessContext<'_, Self::Binding>)
        -> Result<Option<String>, PropertyAccessError> { Ok(None) }
    fn node_heads<'a>(&'a self, _binding: &'a Self::Binding,
        _context: &'a PropertyAccessContext<'a, Self::Binding>)
        -> Result<PropertyHeads<'a, Self::Binding>, PropertyAccessError> {
        Ok(Box::new(std::iter::empty()))
    }
}

/// Shape of the additive contribution to the existing Namespace, not a new
/// required trait bound on existing Resolve callers. Default remains unsupported.
pub trait NamespacePropertyContract {
    type Binding: Clone + Eq;
    fn properties(&self) -> Option<&dyn PropertyAccess<Binding = Self::Binding>> { None }
}

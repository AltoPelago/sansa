//! Optional authoritative property access for standalone read-only Resolve.
use crate::Diagnostic;
use crate::address::{PropertyName, Selector};

pub const DEFAULT_PROPERTY_INSPECTIONS: u32 = 10_000;
pub const MAX_PROPERTY_INSPECTIONS: u32 = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyScopeRole {
    Root,
    Inside,
    Outside,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyNodeKind {
    NodeLiteral,
    NodeHead,
    Other,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyAccessError {
    InvalidMetadata,
    ScopeViolation,
    AdapterFailure,
}

/// Engine-created context, borrowed read-only during access. No Resolve option
/// accepts these roots, and no context is attached to returned binding handles.
pub struct PropertyAccessContext<'a, B> {
    pub scope_root: &'a B,
    pub evaluation_root: &'a B,
    pub direct_head_of: Option<&'a B>,
}
pub type PropertyHeads<'a, B> = Box<dyn Iterator<Item = Result<B, PropertyAccessError>> + 'a>;

pub trait PropertyAccess {
    type Binding: Clone + Eq;
    fn supports_key(&self) -> bool {
        false
    }
    fn supports_nodes(&self) -> bool {
        false
    }
    fn scope(
        &self,
        binding: &Self::Binding,
        context: &PropertyAccessContext<'_, Self::Binding>,
    ) -> Result<PropertyScopeRole, PropertyAccessError>;
    fn key(
        &self,
        _binding: &Self::Binding,
        _context: &PropertyAccessContext<'_, Self::Binding>,
    ) -> Result<Option<String>, PropertyAccessError> {
        Ok(None)
    }
    fn node_kind(
        &self,
        _binding: &Self::Binding,
        _context: &PropertyAccessContext<'_, Self::Binding>,
    ) -> Result<PropertyNodeKind, PropertyAccessError> {
        Ok(PropertyNodeKind::Other)
    }
    fn node_tag(
        &self,
        _binding: &Self::Binding,
        _context: &PropertyAccessContext<'_, Self::Binding>,
    ) -> Result<Option<String>, PropertyAccessError> {
        Ok(None)
    }
    fn node_heads<'a>(
        &'a self,
        _binding: &'a Self::Binding,
        _context: &'a PropertyAccessContext<'a, Self::Binding>,
    ) -> Result<PropertyHeads<'a, Self::Binding>, PropertyAccessError> {
        Ok(Box::new(std::iter::empty()))
    }
}

pub(crate) struct PropertyInspection<'a, B> {
    facet: &'a dyn PropertyAccess<Binding = B>,
    inspected: u32,
    limit: u32,
}
fn diagnostic(code: &str, property: PropertyName, index: usize) -> Box<Diagnostic> {
    let mut error = Diagnostic::new(code, "Property resolution failed");
    error.property = Some(property.as_str().into());
    error.selector_index = Some(index);
    Box::new(error)
}
fn fault(error: PropertyAccessError, property: PropertyName, index: usize) -> Box<Diagnostic> {
    diagnostic(
        match error {
            PropertyAccessError::InvalidMetadata => "SANSA_RESOLVE_INVALID_PROPERTY_METADATA",
            PropertyAccessError::ScopeViolation => "SANSA_RESOLVE_PROPERTY_SCOPE_VIOLATION",
            PropertyAccessError::AdapterFailure => "SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR",
        },
        property,
        index,
    )
}
impl<'a, B: Clone + Eq> PropertyInspection<'a, B> {
    pub(crate) fn prepare(
        facet: Option<&'a dyn PropertyAccess<Binding = B>>,
        selectors: &[Selector],
        limit: u32,
    ) -> Result<Self, Box<Diagnostic>> {
        for (index, selector) in selectors.iter().enumerate() {
            if let Selector::PropertyFilter { property, .. } = selector {
                let Some(access) = facet else {
                    return Err(diagnostic(
                        "SANSA_RESOLVE_UNSUPPORTED_PROPERTY_SCOPE",
                        *property,
                        index,
                    ));
                };
                let supported = match property {
                    PropertyName::Key => access.supports_key(),
                    PropertyName::Tag | PropertyName::HeadTag => access.supports_nodes(),
                };
                if !supported {
                    return Err(diagnostic(
                        match property {
                            PropertyName::Key => "SANSA_RESOLVE_UNSUPPORTED_KEY",
                            PropertyName::Tag | PropertyName::HeadTag => {
                                "SANSA_RESOLVE_UNSUPPORTED_TAG"
                            }
                        },
                        *property,
                        index,
                    ));
                }
            }
        }
        Ok(Self {
            facet: facet.expect("property selectors require a facet"),
            inspected: 0,
            limit,
        })
    }
    fn charge(&mut self, property: PropertyName, index: usize) -> Result<(), Box<Diagnostic>> {
        if self.inspected >= self.limit {
            let mut error = diagnostic("SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED", property, index);
            error.budget = Some("maxPropertyInspections".into());
            error.limit = Some(self.limit as usize);
            error.observed = Some(self.limit as usize + 1);
            return Err(error);
        }
        self.inspected += 1;
        Ok(())
    }
    fn authorize(
        &self,
        binding: &B,
        context: &PropertyAccessContext<'_, B>,
        property: PropertyName,
        index: usize,
    ) -> Result<PropertyScopeRole, Box<Diagnostic>> {
        let role = self
            .facet
            .scope(binding, context)
            .map_err(|e| fault(e, property, index))?;
        if role == PropertyScopeRole::Outside {
            return Err(fault(PropertyAccessError::ScopeViolation, property, index));
        }
        if (role == PropertyScopeRole::Root) != (binding == context.scope_root) {
            return Err(fault(PropertyAccessError::InvalidMetadata, property, index));
        }
        Ok(role)
    }
    pub(crate) fn matches(
        &mut self,
        binding: &B,
        context: &PropertyAccessContext<'_, B>,
        property: PropertyName,
        value: &str,
        index: usize,
    ) -> Result<bool, Box<Diagnostic>> {
        self.charge(property, index)?;
        let role = self.authorize(binding, context, property, index)?;
        let facet = self.facet;
        if property == PropertyName::Key {
            if role == PropertyScopeRole::Root {
                return Ok(false);
            }
            return facet
                .key(binding, context)
                .map(|v| v.as_deref() == Some(value))
                .map_err(|e| fault(e, property, index));
        }
        match facet
            .node_kind(binding, context)
            .map_err(|e| fault(e, property, index))?
        {
            PropertyNodeKind::Other => Ok(false),
            PropertyNodeKind::NodeHead if property == PropertyName::HeadTag => facet
                .node_tag(binding, context)
                .map(|v| v.as_deref() == Some(value))
                .map_err(|e| fault(e, property, index)),
            PropertyNodeKind::NodeLiteral if property == PropertyName::Tag => {
                let heads = facet
                    .node_heads(binding, context)
                    .map_err(|e| fault(e, property, index))?;
                for result in heads {
                    // Iterator failure is not another yielded candidate; charge
                    // only successful yields, before any head metadata access.
                    let head = result.map_err(|e| fault(e, property, index))?;
                    self.charge(property, index)?;
                    let head_context = PropertyAccessContext {
                        scope_root: context.scope_root,
                        evaluation_root: context.evaluation_root,
                        direct_head_of: Some(binding),
                    };
                    self.authorize(&head, &head_context, property, index)?;
                    if facet
                        .node_kind(&head, &head_context)
                        .map_err(|e| fault(e, property, index))?
                        != PropertyNodeKind::NodeHead
                    {
                        return Err(fault(PropertyAccessError::InvalidMetadata, property, index));
                    }
                    if facet
                        .node_tag(&head, &head_context)
                        .map_err(|e| fault(e, property, index))?
                        .as_deref()
                        == Some(value)
                    {
                        return Ok(true);
                    }
                }
                Ok(false)
            }
            _ => Ok(false),
        }
    }
}

"""Candidate declarations only; not an installed Python runtime module.

Namespace['properties'] is optional. Existing pure Python mapping spellings are
retained; the context passed by the engine is an immutable mapping.
"""
from collections.abc import Callable, Iterable, Mapping
from typing import Generic, Literal, NotRequired, TypeVar, TypedDict

B = TypeVar('B')
PropertyScopeRole = Literal['root', 'inside', 'outside']
PropertyNodeKind = Literal['NodeLiteral', 'NodeHead', 'Other']
PropertyAccessContext = Mapping[Literal['scopeRoot', 'evaluationRoot', 'directHeadOf'], B]

class SansaPropertyAccessError(Exception):
    kind: Literal['invalidMetadata', 'scopeViolation', 'adapterFailure']

class PropertyAccess(TypedDict, Generic[B]):
    scope: Callable[[B, PropertyAccessContext[B]], PropertyScopeRole]
    key: NotRequired[Callable[[B, PropertyAccessContext[B]], str | None]]
    nodeKind: NotRequired[Callable[[B, PropertyAccessContext[B]], PropertyNodeKind]]
    nodeTag: NotRequired[Callable[[B, PropertyAccessContext[B]], str | None]]
    nodeHeads: NotRequired[Callable[[B, PropertyAccessContext[B]], Iterable[B]]]

class PropertyResolveOptions(TypedDict):
    # Merge with the existing Resolve option map at implementation time.
    # Default 10000; runtime rejects bool and integers outside 0..1000000.
    maxPropertyInspections: NotRequired[int | float]

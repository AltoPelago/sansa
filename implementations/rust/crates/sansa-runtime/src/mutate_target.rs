//! Post-plan SANSA.Mutate target-surface representability validation.
//!
//! Target validation answers whether an already planned value can be expressed
//! by a declared output surface. It does not grant authority, enforce schema,
//! or apply any operation.

// Target-validation failures are immediately normalized into the public
// diagnostic envelope and only cross cold failure paths.
#![allow(clippy::result_large_err)]

use crate::address::{Root, Selector, parse_address};
use crate::mutate::{
    MutationDiagnostic, MutationOperation, MutationPhase, MutationPlan, MutationTarget,
    MutationValue, MutationValueIntent,
};
use crate::query::{Expression, LiteralKind, parse_expression};
use crate::value_semantics::Value;

/// Context supplied to one host-neutral target-surface validator invocation.
#[derive(Debug, Clone, Copy)]
pub struct MutationTargetValidationContext<'a, Binding, State = (), NamespaceState = ()> {
    /// Immutable current-process plan being inspected.
    pub plan: &'a MutationPlan<Binding, State, NamespaceState>,
    /// Operation index within the plan.
    pub operation_index: usize,
    /// Canonical target-surface identifier.
    pub target_format: &'a str,
}

/// Host-neutral post-plan representability validator.
///
/// Custom validators inspect immutable operations only. Their diagnostics are
/// normalized to the target phase and current operation context by the shared
/// validation driver.
pub trait MutationTargetValidator<Binding, State = (), NamespaceState = ()> {
    /// Stable target-surface identifier used in diagnostics.
    fn id(&self) -> &str;

    /// Return zero or more representability failures for one operation.
    fn validate_operation(
        &self,
        operation: &MutationOperation<Binding, State>,
        context: MutationTargetValidationContext<'_, Binding, State, NamespaceState>,
    ) -> Vec<MutationDiagnostic>;
}

/// Built-in AEON target-surface validator.
#[derive(Debug, Clone, Copy, Default)]
pub struct AeonMutationTargetValidator;

/// Built-in JSON-compatible target-surface validator.
#[derive(Debug, Clone, Copy, Default)]
pub struct JsonMutationTargetValidator;

/// Result of validating an immutable plan against one target surface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidateMutationPlanTargetResult {
    /// Every planned operation is representable on the selected surface.
    Validated {
        /// Non-error target diagnostics. The current built-in surfaces emit
        /// none, but the envelope remains explicit for later profiles.
        diagnostics: Vec<MutationDiagnostic>,
    },
    /// One or more operations are not representable.
    Rejected(Vec<MutationDiagnostic>),
}

/// Validate a plan against the built-in AEON or JSON target surface.
///
/// `json-compatible` is accepted as an alias and normalized to `json` in
/// diagnostics. Unknown identifiers fail closed without inspecting operations.
#[must_use]
pub fn validate_mutation_plan_target<Binding, State, NamespaceState>(
    plan: &MutationPlan<Binding, State, NamespaceState>,
    target_format: &str,
) -> ValidateMutationPlanTargetResult {
    match target_format {
        "" | "aeon" => validate_mutation_plan_with(plan, &AeonMutationTargetValidator),
        "json" | "json-compatible" => {
            validate_mutation_plan_with(plan, &JsonMutationTargetValidator)
        }
        unsupported => ValidateMutationPlanTargetResult::Rejected(vec![target_error(
            "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE",
            format!("Mutation target surface '{unsupported}' is not supported"),
            None,
            unsupported,
        )]),
    }
}

/// Validate a plan through a caller-supplied host-neutral surface.
#[must_use]
pub fn validate_mutation_plan_with<Binding, State, NamespaceState, Validator>(
    plan: &MutationPlan<Binding, State, NamespaceState>,
    validator: &Validator,
) -> ValidateMutationPlanTargetResult
where
    Validator: MutationTargetValidator<Binding, State, NamespaceState> + ?Sized,
{
    let target_format = match validator.id() {
        "" => "custom",
        id => id,
    };
    let mut errors = Vec::new();
    for (operation_index, operation) in plan.operations().iter().enumerate() {
        let context = MutationTargetValidationContext {
            plan,
            operation_index,
            target_format,
        };
        errors.extend(
            validator
                .validate_operation(operation, context)
                .into_iter()
                .map(|error| normalize_target_error(error, operation_index, target_format)),
        );
    }
    if errors.is_empty() {
        ValidateMutationPlanTargetResult::Validated {
            diagnostics: Vec::new(),
        }
    } else {
        ValidateMutationPlanTargetResult::Rejected(errors)
    }
}

impl<Binding, State, NamespaceState> MutationTargetValidator<Binding, State, NamespaceState>
    for AeonMutationTargetValidator
{
    fn id(&self) -> &str {
        "aeon"
    }

    fn validate_operation(
        &self,
        operation: &MutationOperation<Binding, State>,
        context: MutationTargetValidationContext<'_, Binding, State, NamespaceState>,
    ) -> Vec<MutationDiagnostic> {
        if let Err(error) = validate_json_operation_targets(operation, context.operation_index) {
            return vec![error];
        }
        let Some(intent) = operation_value_intent(operation) else {
            return Vec::new();
        };
        if let Some(datatype) = intent.datatype.as_deref()
            && let Err(error) = validate_aeon_datatype(datatype, context.operation_index)
        {
            return vec![error];
        }
        match validate_aeon_value(
            &intent.value,
            intent.datatype.as_deref(),
            intent.kind.as_deref(),
            &format!("operations[{}].value", context.operation_index),
            context.operation_index,
        ) {
            Ok(()) => Vec::new(),
            Err(error) => vec![error],
        }
    }
}

impl<Binding, State, NamespaceState> MutationTargetValidator<Binding, State, NamespaceState>
    for JsonMutationTargetValidator
{
    fn id(&self) -> &str {
        "json"
    }

    fn validate_operation(
        &self,
        operation: &MutationOperation<Binding, State>,
        context: MutationTargetValidationContext<'_, Binding, State, NamespaceState>,
    ) -> Vec<MutationDiagnostic> {
        let Some(intent) = operation_value_intent(operation) else {
            return Vec::new();
        };
        if let Some(datatype) = intent.datatype.as_deref()
            && let Err(error) =
                validate_json_datatype(datatype, "datatype", context.operation_index)
        {
            return vec![error];
        }
        if let Some(kind) = intent.kind.as_deref()
            && let Err(error) = validate_json_datatype(kind, "kind", context.operation_index)
        {
            return vec![error];
        }
        match validate_json_value(&intent.value, "value", context.operation_index) {
            Ok(()) => Vec::new(),
            Err(error) => vec![error],
        }
    }
}

fn operation_value_intent<Binding, State>(
    operation: &MutationOperation<Binding, State>,
) -> Option<&MutationValueIntent> {
    match operation {
        MutationOperation::Create { value, .. }
        | MutationOperation::Replace { value, .. }
        | MutationOperation::Insert { value, .. } => Some(value),
        MutationOperation::Remove { .. } | MutationOperation::Move { .. } => None,
    }
}

fn validate_json_operation_targets<Binding, State>(
    operation: &MutationOperation<Binding, State>,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    match operation {
        MutationOperation::Create { parent, .. } => validate_json_target(parent, operation_index),
        MutationOperation::Replace { target, .. } | MutationOperation::Remove { target, .. } => {
            validate_json_target(target, operation_index)
        }
        MutationOperation::Insert { container, .. } => {
            validate_json_target(container, operation_index)
        }
        MutationOperation::Move {
            source, container, ..
        } => {
            validate_json_target(source, operation_index)?;
            validate_json_target(container, operation_index)
        }
    }
}

fn validate_json_target<Binding, State>(
    target: &MutationTarget<Binding, State>,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let representation = target
        .representation_kind
        .as_deref()
        .map(str::to_ascii_lowercase);
    if representation.as_deref() == Some("attributespace")
        || target.canonical_address.contains(".@")
    {
        return Err(target_error(
            "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE",
            format!(
                "Target 'json' cannot represent AEON attribute-space mutations at {}",
                target.canonical_address
            ),
            Some(operation_index),
            "json",
        ));
    }
    let container = match representation.as_deref() {
        Some("node" | "nodeliteral") => Some("node"),
        Some("tuple" | "tupleliteral") => Some("tuple"),
        _ => None,
    };
    if let Some(container) = container {
        return Err(target_error(
            "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE",
            format!(
                "Target 'json' cannot represent {container} container mutations at {}",
                target.canonical_address
            ),
            Some(operation_index),
            "json",
        ));
    }
    Ok(())
}

fn validate_aeon_datatype(
    datatype: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let parsed = parse_address(&format!("$:{datatype}")).map_err(|_| {
        invalid_aeon_datatype(
            format!("Target 'aeon' cannot represent malformed datatype intent '{datatype}'"),
            operation_index,
            datatype,
        )
    })?;
    let expression = parsed.qualifier_expression.as_ref().ok_or_else(|| {
        invalid_aeon_datatype(
            "Target 'aeon' requires datatype intent to be one datatype expression",
            operation_index,
            datatype,
        )
    })?;
    if expression.terms.len() != 1 {
        return Err(invalid_aeon_datatype(
            "Target 'aeon' requires datatype intent to be one datatype expression",
            operation_index,
            datatype,
        ));
    }
    let term = &expression.terms[0];
    let base = term.name.as_str();
    let lowered = base.to_ascii_lowercase();
    if !term.parameter_groups.is_empty() && !aeon_datatype_allows_generic(&lowered) {
        return Err(invalid_aeon_datatype(
            format!("Target 'aeon' does not allow generic parameters on datatype '{base}'"),
            operation_index,
            datatype,
        ));
    }
    if !term.arguments.is_empty() && !aeon_datatype_allows_arguments(&lowered) {
        return Err(invalid_aeon_datatype(
            format!("Target 'aeon' does not allow square-bracket arguments on datatype '{base}'"),
            operation_index,
            datatype,
        ));
    }
    validate_reserved_aeon_datatype(datatype, term, operation_index)?;
    if lowered == "node" {
        for parameter in term.parameter_groups.iter().flatten() {
            let parameter_base = parameter.name.to_ascii_lowercase();
            if parameter_base != "node" && is_reserved_aeon_datatype_base(&parameter_base) {
                return Err(invalid_aeon_datatype(
                    "Target 'aeon' allows binding-side node<T> claims only for node<node> or custom node profile claims",
                    operation_index,
                    datatype,
                ));
            }
        }
    }
    Ok(())
}

fn validate_reserved_aeon_datatype(
    datatype: &str,
    term: &crate::address::QualifierTerm,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let lowered = datatype.to_ascii_lowercase();
    let base = term.name.to_ascii_lowercase();
    if let Some(alias) = lowered.strip_prefix("radix")
        && !alias.is_empty()
        && alias.bytes().all(|byte| byte.is_ascii_digit())
        && !matches!(alias, "2" | "6" | "8" | "12")
    {
        return Err(invalid_aeon_datatype(
            format!("Target 'aeon' does not define reserved radix alias '{datatype}'"),
            operation_index,
            datatype,
        ));
    }
    if base == "radix" && !term.arguments.is_empty() {
        let valid = matches!(term.arguments.as_slice(), [crate::address::QualifierArgument::Number(value)] if value.parse::<u8>().is_ok_and(|value| (2..=64).contains(&value)));
        if !valid {
            return Err(invalid_aeon_datatype(
                "Target 'aeon' requires radix bracket metadata to be an integer from 2 to 64",
                operation_index,
                datatype,
            ));
        }
    }
    if matches!(base.as_str(), "sep" | "separator" | "kadot")
        && !term.arguments.is_empty()
        && (base == "kadot"
            || term.arguments.iter().any(|argument| {
                !matches!(argument, crate::address::QualifierArgument::Quoted(value) if value.chars().count() == 1 && value.chars().all(is_aeon_separator_raw_char))
            }))
    {
        return Err(invalid_aeon_datatype(
            format!("Target 'aeon' does not support separator metadata '{datatype}'"),
            operation_index,
            datatype,
        ));
    }
    Ok(())
}

fn validate_aeon_value(
    value: &MutationValue,
    datatype: Option<&str>,
    kind: Option<&str>,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    validate_aeon_datatype_kind_compatibility(datatype, kind, path, operation_index)?;
    let representation = kind
        .and_then(|value| representation_kind(value, true))
        .or_else(|| datatype.and_then(|value| representation_kind(value, false)));
    if representation.as_deref() == Some("node") {
        return validate_aeon_node_value(value, path, operation_index);
    }
    validate_aeon_scalar_value(value, representation.as_deref(), path, operation_index)?;
    match value {
        MutationValue::Sequence(values) => {
            for (index, value) in values.iter().enumerate() {
                validate_aeon_value(
                    value,
                    None,
                    None,
                    &format!("{path}[{index}]"),
                    operation_index,
                )?;
            }
        }
        MutationValue::Object(fields) => {
            for (name, value) in fields {
                let path = format!("{path}{}", value_path_segment(name));
                if name.is_empty() {
                    return Err(invalid_aeon_value(
                        "Keys must not be empty",
                        &path,
                        operation_index,
                        None,
                    ));
                }
                validate_aeon_value(value, None, None, &path, operation_index)?;
            }
        }
        MutationValue::Null | MutationValue::Scalar(_) => {}
    }
    Ok(())
}

fn validate_aeon_node_value(
    value: &MutationValue,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    match value {
        MutationValue::Null => Ok(()),
        MutationValue::Sequence(children) => {
            for (index, child) in children.iter().enumerate() {
                validate_aeon_value(
                    child,
                    None,
                    None,
                    &format!("{path}.children[{index}]"),
                    operation_index,
                )?;
            }
            Ok(())
        }
        MutationValue::Object(fields) => {
            if let Some(tag) = object_field(fields, "tag")
                && scalar_text(tag).is_none_or(|tag| !valid_aeon_identifier(tag))
            {
                return Err(invalid_aeon_value(
                    "Node tags must be non-empty AEON identifiers",
                    &format!("{path}.tag"),
                    operation_index,
                    None,
                ));
            }
            if let Some(children) = object_field(fields, "children") {
                let MutationValue::Sequence(children) = children else {
                    return Err(invalid_aeon_value(
                        "Node children must be a list when provided",
                        &format!("{path}.children"),
                        operation_index,
                        None,
                    ));
                };
                for (index, child) in children.iter().enumerate() {
                    validate_aeon_value(
                        child,
                        None,
                        None,
                        &format!("{path}.children[{index}]"),
                        operation_index,
                    )?;
                }
            }
            if let Some(attributes) = object_field(fields, "attributes") {
                let MutationValue::Object(attributes) = attributes else {
                    return Err(invalid_aeon_value(
                        "Node attributes must be an object when provided",
                        &format!("{path}.attributes"),
                        operation_index,
                        None,
                    ));
                };
                for (name, value) in attributes {
                    let path = format!("{path}.attributes{}", value_path_segment(name));
                    if name.is_empty() {
                        return Err(invalid_aeon_value(
                            "Keys must not be empty",
                            &path,
                            operation_index,
                            None,
                        ));
                    }
                    validate_aeon_value(value, None, None, &path, operation_index)?;
                }
            }
            Ok(())
        }
        MutationValue::Scalar(_) => Err(invalid_aeon_value(
            "Node values must be an object with tag/children or an array of children",
            path,
            operation_index,
            None,
        )),
    }
}

fn validate_aeon_scalar_value(
    value: &MutationValue,
    representation: Option<&str>,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    if let MutationValue::Scalar(value) = value {
        validate_aeon_intrinsic_scalar(value.as_value(), path, operation_index)?;
    }
    let Some(representation) = representation else {
        return Ok(());
    };
    if matches!(representation, "object" | "list" | "tuple" | "node") {
        return Ok(());
    }
    let valid = match representation {
        "string" => scalar_text(value).is_some(),
        "symbol" => scalar_text(value).is_some_and(|value| !value.is_empty()),
        "number" => matches!(scalar(value), Some(Value::FiniteNumber(_))),
        "boolean" => matches!(scalar(value), Some(Value::Boolean(_))),
        "hex" => scalar_text(value).is_some_and(valid_hex_payload),
        "radix" => scalar_text(value).is_some_and(valid_radix_payload),
        "encoding" => scalar_text(value).is_some_and(valid_encoding_payload),
        "separator" => scalar_text(value).is_some_and(valid_separator_payload),
        "sansa" => scalar_text(value).is_some_and(|value| parse_address(value).is_ok()),
        "toggle" => {
            scalar_text(value).is_some_and(|value| matches!(value, "yes" | "no" | "on" | "off"))
        }
        "null" => {
            matches!(value, MutationValue::Null)
                || scalar_text(value).is_some_and(valid_aeon_identifier)
                || matches!(scalar(value), Some(Value::ExplicitNull { .. }))
        }
        "nan" => {
            matches!(value, MutationValue::Null)
                || scalar_text(value) == Some("NaN")
                || matches!(scalar(value), Some(Value::Nan))
        }
        "infinity" => {
            scalar_text(value)
                .is_some_and(|value| matches!(value, "Infinity" | "+Infinity" | "-Infinity"))
                || matches!(
                    scalar(value),
                    Some(Value::PositiveInfinity | Value::NegativeInfinity)
                )
        }
        "date" | "time" | "datetime" | "wtc" => {
            scalar_text(value).is_some_and(|value| valid_temporal_payload(value, representation))
        }
        "cloneReference" | "pointerReference" | "referenceForm" => {
            scalar_text(value).is_some_and(valid_reference_target)
        }
        _ => true,
    };
    if valid {
        Ok(())
    } else {
        Err(invalid_aeon_value(
            format!("{representation} literal payload is not representable"),
            path,
            operation_index,
            None,
        ))
    }
}

fn validate_aeon_intrinsic_scalar(
    value: &Value,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let valid = match value {
        Value::FiniteNumber(_)
        | Value::PositiveInfinity
        | Value::NegativeInfinity
        | Value::Nan
        | Value::String(_)
        | Value::Boolean(_) => true,
        Value::Toggle(value) => matches!(value.as_str(), "yes" | "no" | "on" | "off"),
        Value::Hex(value) => valid_hex_payload(value),
        Value::Radix {
            payload,
            semantic_type,
        } => {
            valid_radix_payload(payload)
                && intrinsic_metadata_matches(semantic_type, "radix", operation_index)
        }
        Value::Encoding(value) => valid_encoding_payload(value),
        Value::Separator(value) => valid_separator_payload(value),
        Value::Symbol(value) => !value.is_empty(),
        Value::SansaAddress(value) => parse_address(value).is_ok(),
        Value::ReferenceForm { kind, target } => {
            matches!(
                representation_kind(kind, false).as_deref(),
                Some("cloneReference" | "pointerReference" | "referenceForm")
            ) && valid_reference_target(target)
        }
        Value::Temporal {
            payload,
            semantic_type,
        } => representation_kind(semantic_type, false)
            .is_some_and(|kind| valid_temporal_payload(payload, &kind)),
        Value::ExplicitNull { reason } => !reason.is_empty(),
        Value::ExplicitAbsence { .. }
        | Value::Missing
        | Value::Container { .. }
        | Value::BindingSet => false,
    };
    if valid {
        Ok(())
    } else {
        Err(invalid_aeon_value(
            "intrinsic scalar family or metadata is not representable",
            path,
            operation_index,
            None,
        ))
    }
}

fn intrinsic_metadata_matches(semantic_type: &str, expected: &str, operation_index: usize) -> bool {
    representation_kind(semantic_type, false).as_deref() == Some(expected)
        && validate_aeon_datatype(semantic_type, operation_index).is_ok()
}

fn validate_aeon_datatype_kind_compatibility(
    datatype: Option<&str>,
    kind: Option<&str>,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let (Some(datatype), Some(kind)) = (datatype, kind) else {
        return Ok(());
    };
    let Some(datatype_representation) = representation_kind(datatype, false) else {
        return Ok(());
    };
    let Some(kind_representation) = representation_kind(kind, false) else {
        return Ok(());
    };
    if matches!(
        kind_representation.as_str(),
        "cloneReference" | "pointerReference" | "referenceForm"
    ) || datatype_representation == kind_representation
    {
        return Ok(());
    }
    Err(invalid_aeon_value(
        format!(
            "Datatype '{datatype}' is not compatible with {kind_representation} literal representation"
        ),
        path,
        operation_index,
        Some(datatype),
    ))
}

fn validate_json_datatype(
    datatype: &str,
    label: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    let base = datatype_base_name(datatype);
    if datatype.contains(['<', '['])
        || !matches!(
            base.to_ascii_lowercase().as_str(),
            "object" | "list" | "array" | "string" | "number" | "boolean" | "bool" | "null"
        )
    {
        let mut error = target_error(
            "SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE",
            format!("Target 'json' does not support {label} '{datatype}'"),
            Some(operation_index),
            "json",
        );
        error.datatype = Some(datatype.into());
        return Err(error);
    }
    Ok(())
}

fn validate_json_value(
    value: &MutationValue,
    path: &str,
    operation_index: usize,
) -> Result<(), MutationDiagnostic> {
    match value {
        MutationValue::Null => Ok(()),
        MutationValue::Scalar(value) => match value.as_value() {
            Value::String(_) | Value::Boolean(_) | Value::FiniteNumber(_) => Ok(()),
            _ => Err(invalid_json_value(path, operation_index)),
        },
        MutationValue::Sequence(values) => {
            for (index, value) in values.iter().enumerate() {
                validate_json_value(value, &format!("{path}[{index}]"), operation_index)?;
            }
            Ok(())
        }
        MutationValue::Object(fields) => {
            let reference_type = object_field(fields, "type").and_then(plain_string);
            let has_reference_marker =
                matches!(reference_type, Some("CloneReference" | "PointerReference"))
                    || object_field(fields, "canonical")
                        .and_then(plain_string)
                        .is_some();
            if has_reference_marker {
                return Err(invalid_json_value(path, operation_index));
            }
            if fields
                .iter()
                .any(|(name, _)| matches!(name.as_str(), "tag" | "children" | "attributes"))
            {
                return Err(invalid_json_value(path, operation_index));
            }
            for (name, value) in fields {
                validate_json_value(
                    value,
                    &format!("{path}{}", value_path_segment(name)),
                    operation_index,
                )?;
            }
            Ok(())
        }
    }
}

fn invalid_json_value(path: &str, operation_index: usize) -> MutationDiagnostic {
    let mut error = target_error(
        "SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE",
        format!("Target 'json' cannot represent mutation value at {path}"),
        Some(operation_index),
        "json",
    );
    error.value_path = Some(path.into());
    error
}

fn invalid_aeon_datatype(
    message: impl Into<String>,
    operation_index: usize,
    datatype: &str,
) -> MutationDiagnostic {
    let mut error = target_error(
        "SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE",
        message,
        Some(operation_index),
        "aeon",
    );
    error.datatype = Some(datatype.into());
    error
}

fn invalid_aeon_value(
    message: impl Into<String>,
    path: &str,
    operation_index: usize,
    datatype: Option<&str>,
) -> MutationDiagnostic {
    let mut error = target_error(
        "SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE",
        format!(
            "Target 'aeon' cannot represent mutation value: {} at {path}",
            message.into()
        ),
        Some(operation_index),
        "aeon",
    );
    error.value_path = Some(path.into());
    error.datatype = datatype.map(str::to_owned);
    error
}

fn target_error(
    code: impl Into<String>,
    message: impl Into<String>,
    operation_index: Option<usize>,
    target_format: &str,
) -> MutationDiagnostic {
    let mut error = MutationDiagnostic::new(code, message, MutationPhase::Target);
    error.operation_index = operation_index;
    error.target_format = Some(target_format.into());
    error
}

fn normalize_target_error(
    mut error: MutationDiagnostic,
    operation_index: usize,
    target_format: &str,
) -> MutationDiagnostic {
    error.phase = MutationPhase::Target;
    error.operation_index.get_or_insert(operation_index);
    if error.target_format.as_deref().is_none_or(str::is_empty) {
        error.target_format = Some(target_format.into());
    }
    error
}

fn scalar(value: &MutationValue) -> Option<&Value> {
    match value {
        MutationValue::Scalar(value) => Some(value.as_value()),
        _ => None,
    }
}

fn scalar_text(value: &MutationValue) -> Option<&str> {
    match scalar(value)? {
        Value::String(value)
        | Value::Toggle(value)
        | Value::Hex(value)
        | Value::Encoding(value)
        | Value::Separator(value)
        | Value::Symbol(value)
        | Value::SansaAddress(value) => Some(value),
        Value::Radix { payload, .. } | Value::Temporal { payload, .. } => Some(payload),
        Value::ReferenceForm { target, .. } => Some(target),
        Value::ExplicitNull { reason } | Value::ExplicitAbsence { reason } => Some(reason),
        _ => None,
    }
}

fn plain_string(value: &MutationValue) -> Option<&str> {
    match scalar(value)? {
        Value::String(value) => Some(value),
        _ => None,
    }
}

fn object_field<'a>(
    fields: &'a [(String, MutationValue)],
    name: &str,
) -> Option<&'a MutationValue> {
    fields
        .iter()
        .find_map(|(field, value)| (field == name).then_some(value))
}

fn representation_kind(name: &str, allow_unknown: bool) -> Option<String> {
    let base = datatype_base_name(name);
    let lowered = base.to_ascii_lowercase();
    let representation = match lowered.as_str() {
        "object" | "obj" | "o" | "envelope" => "object",
        "list" => "list",
        "tuple" => "tuple",
        "node" => "node",
        "string" | "trimtick" | "prose" => "string",
        "number" | "int" | "uint" | "float" | "n" => "number",
        "bool" | "boolean" => "boolean",
        "toggle" => "toggle",
        "hex" => "hex",
        "radix" => "radix",
        "nan" => "nan",
        "infinity" => "infinity",
        "null" => "null",
        "sep" | "separator" | "kadot" => "separator",
        "symbol" | "symbolicliteral" => "symbol",
        "sansa" | "sansaaddress" => "sansa",
        "encoding" | "base64" | "embed" | "inline" => "encoding",
        "date" => "date",
        "time" => "time",
        "datetime" => "datetime",
        "wtc" => "wtc",
        "clonereference" => "cloneReference",
        "pointerreference" => "pointerReference",
        "referenceform" => "referenceForm",
        value
            if value.starts_with("radix")
                && value[5..].bytes().all(|byte| byte.is_ascii_digit()) =>
        {
            "radix"
        }
        _ if allow_unknown => return Some(base.into()),
        _ => return None,
    };
    Some(representation.into())
}

fn datatype_base_name(datatype: &str) -> &str {
    let end = datatype
        .char_indices()
        .find_map(|(index, ch)| matches!(ch, '<' | '[').then_some(index))
        .unwrap_or(datatype.len());
    datatype[..end].trim()
}

fn aeon_datatype_allows_generic(base: &str) -> bool {
    matches!(
        base,
        "object"
            | "obj"
            | "o"
            | "envelope"
            | "list"
            | "tuple"
            | "node"
            | "null"
            | "nan"
            | "infinity"
    )
}

fn aeon_datatype_allows_arguments(base: &str) -> bool {
    matches!(base, "sep" | "separator" | "kadot" | "radix")
}

fn is_reserved_aeon_datatype_base(base: &str) -> bool {
    matches!(
        base,
        "string"
            | "trimtick"
            | "prose"
            | "number"
            | "n"
            | "int"
            | "uint"
            | "float"
            | "infinity"
            | "nan"
            | "boolean"
            | "bool"
            | "toggle"
            | "hex"
            | "radix"
            | "encoding"
            | "base64"
            | "embed"
            | "inline"
            | "date"
            | "time"
            | "datetime"
            | "wtc"
            | "sep"
            | "separator"
            | "kadot"
            | "symbol"
            | "sansa"
            | "object"
            | "obj"
            | "o"
            | "envelope"
            | "list"
            | "tuple"
            | "node"
            | "null"
    ) || numeric_reserved_alias(base, "int")
        || numeric_reserved_alias(base, "uint")
        || numeric_reserved_alias(base, "float")
        || numeric_reserved_alias(base, "radix")
}

fn numeric_reserved_alias(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
    })
}

fn valid_hex_payload(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_radix_payload(value: &str) -> bool {
    let value = value.strip_prefix(['+', '-']).unwrap_or(value);
    let mut parts = value.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if parts.next().is_some() {
        return false;
    }
    let valid_digits = |part: &str| {
        !part.is_empty()
            && !part.starts_with('_')
            && !part.ends_with('_')
            && !part.contains("__")
            && part
                .bytes()
                .filter(|byte| *byte != b'_')
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'&' | b'!'))
    };
    match fraction {
        None => valid_digits(integer),
        Some(fraction) => (integer.is_empty() || valid_digits(integer)) && valid_digits(fraction),
    }
}

fn valid_encoding_payload(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let padding = value.bytes().rev().take_while(|byte| *byte == b'=').count();
    let body = &value[..value.len() - padding];
    !body.is_empty()
        && padding <= 2
        && body
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn valid_separator_payload(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if matches!(ch, '"' | '\'') {
            let quote = ch;
            let mut terminated = false;
            while let Some(inner) = chars.next() {
                if matches!(inner, '\n' | '\r') {
                    return false;
                }
                if inner == '\\' {
                    if chars
                        .next()
                        .is_none_or(|escaped| matches!(escaped, '\n' | '\r'))
                    {
                        return false;
                    }
                } else if inner == quote {
                    terminated = true;
                    break;
                }
            }
            if !terminated {
                return false;
            }
        } else if !is_aeon_separator_raw_char(ch) {
            return false;
        }
    }
    true
}

fn is_aeon_separator_raw_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || "!#$%&*+-.:;=?@^_|~<>".contains(ch)
}

fn valid_temporal_payload(value: &str, representation: &str) -> bool {
    let expected = match representation {
        "date" => LiteralKind::Date,
        "time" => LiteralKind::Time,
        "datetime" => LiteralKind::Datetime,
        "wtc" => LiteralKind::Wtc,
        _ => return false,
    };
    matches!(parse_expression(value), Ok(Expression::Literal(literal)) if literal.kind == expected)
}

fn valid_reference_target(value: &str) -> bool {
    let Some(source) = normalize_reference_target(value) else {
        return false;
    };
    let Ok(address) = parse_address(&source) else {
        return false;
    };
    address.root == Root::Absolute
        && address.qualifier_expression.is_none()
        && address.is_exact
        && address
            .selectors
            .iter()
            .all(|selector| !matches!(selector, Selector::LocalSpace { .. }))
}

fn normalize_reference_target(value: &str) -> Option<String> {
    if value.is_empty() || value.trim() != value || value.chars().any(char::is_whitespace) {
        return None;
    }
    if value.starts_with('$') {
        return Some(value.into());
    }
    if value.starts_with(['?', '.']) {
        return None;
    }
    if value.starts_with('[') {
        return value.starts_with("[\"").then(|| format!("$.{value}"));
    }
    if value.starts_with('"') {
        let end = quoted_prefix_end(value)?;
        let rest = &value[end..];
        if !rest.is_empty() && !rest.starts_with(['.', '[']) {
            return None;
        }
        return Some(format!("$.[{}]{rest}", &value[..end]));
    }
    let first = value.chars().next()?;
    if !is_identifier_start(first) {
        return None;
    }
    Some(format!("$.{value}"))
}

fn quoted_prefix_end(value: &str) -> Option<usize> {
    let mut chars = value[1..].char_indices();
    while let Some((offset, ch)) = chars.next() {
        let index = offset + 1;
        if matches!(ch, '\n' | '\r') {
            return None;
        }
        if ch == '\\' {
            let (_, escaped) = chars.next()?;
            if matches!(escaped, '\n' | '\r') {
                return None;
            }
        } else if ch == '"' {
            return Some(index + ch.len_utf8());
        }
    }
    None
}

fn valid_aeon_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().is_some_and(is_identifier_start)
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn is_identifier_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}

fn value_path_segment(name: &str) -> String {
    let mut chars = name.chars();
    if chars.next().is_some_and(is_identifier_start)
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        format!(".{name}")
    } else {
        let escaped = name.replace('\\', "\\\\").replace('"', "\\\"");
        format!("[\"{escaped}\"]")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scalar(value: Value) -> MutationValue {
        MutationValue::try_scalar(value).expect("test value is a mutation scalar")
    }

    fn target(address: &str, representation_kind: Option<&str>) -> MutationTarget<usize> {
        MutationTarget {
            requested_address: address.into(),
            canonical_address: address.into(),
            address: parse_address(address).expect("valid test address"),
            binding: 0,
            representation_kind: representation_kind.map(str::to_owned),
            observed_state: None,
            portability_warnings: Vec::new(),
        }
    }

    #[test]
    fn payload_helpers_cover_reviewed_edges() {
        assert!(valid_radix_payload("1A"));
        assert!(!valid_radix_payload("1__0"));
        assert!(valid_encoding_payload("abc_-=="));
        assert!(!valid_encoding_payload("abc+/=="));
        assert!(!valid_encoding_payload("="));
        assert!(!valid_encoding_payload("=="));
        assert!(valid_separator_payload(
            "\"hello world\"|\"this, [is] fine\""
        ));
        assert!(!valid_separator_payload("root/main"));
        assert!(!valid_separator_payload("\"escaped\\\nnewline\""));
        assert!(!valid_separator_payload("\"escaped\\\rnewline\""));
        assert!(valid_reference_target("[\"target.key\"]"));
        assert!(valid_reference_target("\"target.key\".child"));
        assert!(!valid_reference_target("target.*"));
    }

    #[test]
    fn intrinsic_scalar_families_are_validated_without_operation_hints() {
        let invalid = [
            Value::Hex("GG".into()),
            Value::Radix {
                payload: "10".into(),
                semantic_type: "radix65".into(),
            },
            Value::Temporal {
                payload: "2025-02-29".into(),
                semantic_type: "date".into(),
            },
            Value::ReferenceForm {
                kind: "cloneReference".into(),
                target: "target.*".into(),
            },
            Value::ExplicitNull {
                reason: String::new(),
            },
            Value::ExplicitAbsence {
                reason: "redacted".into(),
            },
        ];
        for value in invalid {
            let error = validate_aeon_value(&scalar(value), None, None, "value", 0)
                .expect_err("invalid intrinsic scalar must be rejected");
            assert_eq!(error.code, "SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE");
            assert_eq!(error.value_path.as_deref(), Some("value"));
        }

        validate_aeon_value(
            &scalar(Value::ReferenceForm {
                kind: "pointerReference".into(),
                target: "\"target.key\".child".into(),
            }),
            None,
            None,
            "value",
            0,
        )
        .expect("quoted reference head is representable");
    }

    #[test]
    fn json_rejects_reference_objects_and_aeon_only_operation_targets() {
        let reference = MutationValue::Object(vec![
            (
                "type".into(),
                scalar(Value::String("CloneReference".into())),
            ),
            ("target".into(), scalar(Value::String("$.target".into()))),
        ]);
        let error = validate_json_value(&reference, "value.nested", 0)
            .expect_err("structured reference objects are not JSON target values");
        assert_eq!(error.code, "SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE");
        assert_eq!(error.value_path.as_deref(), Some("value.nested"));

        let remove_attribute = MutationOperation::Remove {
            target: target("$.item.@", Some("attributeSpace")),
            provenance: None,
        };
        let error = validate_json_operation_targets(&remove_attribute, 0)
            .expect_err("attribute removal is not representable in JSON");
        assert_eq!(error.code, "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE");

        let move_from_tuple = MutationOperation::Move {
            source: target("$.pair[0]", Some("tuple")),
            container: target("$.items", Some("list")),
            placement: crate::mutate::MutationPlacement::Last,
            provenance: None,
        };
        let error = validate_json_operation_targets(&move_from_tuple, 1)
            .expect_err("tuple mutation is not representable in JSON");
        assert_eq!(error.code, "SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE");
        assert_eq!(error.operation_index, Some(1));
    }
}

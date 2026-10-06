//! Bounded, host-neutral SANSA Query evaluation.

// Evaluation failures are immediately normalized into the public diagnostic
// envelope. Keeping that envelope inline avoids a second internal error model
// and allocation on every propagated failure path.
#![allow(clippy::result_large_err)]

use std::cmp::Ordering;

use crate::address::{Address, Root, Selector, parse_address};
use crate::query::{
    BinaryOperator, CardinalityOperator, ExistenceOperator, Expression, FromClause, Literal,
    LiteralKind, LiteralValue, OrderDirection, Query, UnaryOperator, parse_query,
};
use crate::resolve::{Namespace, ResolveOptions, resolve_parsed_address};
use crate::value_semantics::{FiniteNumber, Profile, Value, compare, equal, is_value, not_equal};
use crate::{Diagnostic, DiagnosticPhase};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryPolicy {
    General,
    Validation,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct QueryBudget {
    pub max_from_bindings: Option<usize>,
    pub max_where_candidates: Option<usize>,
    pub max_order_candidates: Option<usize>,
    pub max_result_records: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActivationSelector {
    Member,
    Position,
    Range,
    Parent,
    Attribute,
    LocalSpace,
    DirectExpansion,
    DescendantExpansion,
    NamePattern,
    SemanticType,
    RepresentationKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddressActivationPolicy {
    pub allowed_roots: Vec<Address>,
    pub allowed_selectors: Vec<ActivationSelector>,
    pub allow_contextual_root: bool,
    pub max_address_depth: Option<usize>,
    pub max_bindings: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum AddressActivation {
    #[default]
    Disabled,
    Trusted,
    Constrained(AddressActivationPolicy),
}

type EvaluationResult<T> = Result<T, Diagnostic>;

#[derive(Debug, Clone, Copy)]
struct ActivationGrant {
    max_bindings: Option<usize>,
    allow_parent_from_effective_root: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvaluateOptions<Binding> {
    pub resolve: ResolveOptions<Binding>,
    pub profile: Profile,
    pub budget: QueryBudget,
    pub policy: QueryPolicy,
    pub address_activation: AddressActivation,
}

impl<Binding> Default for EvaluateOptions<Binding> {
    fn default() -> Self {
        Self {
            resolve: ResolveOptions::default(),
            profile: Profile::Default,
            budget: QueryBudget::default(),
            policy: QueryPolicy::General,
            address_activation: AddressActivation::Disabled,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvaluatedValue<Binding> {
    Scalar(Value),
    Bindings(Vec<Binding>),
    Object(Vec<(String, EvaluatedValue<Binding>)>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryRecord<Binding> {
    pub candidate: Binding,
    pub value: EvaluatedValue<Binding>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryOutput<Binding> {
    pub results: Vec<QueryRecord<Binding>>,
    pub errors: Vec<Diagnostic>,
}

impl<Binding> QueryOutput<Binding> {
    #[must_use]
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }

    fn success(results: Vec<QueryRecord<Binding>>) -> Self {
        Self {
            results,
            errors: Vec::new(),
        }
    }

    fn failure(error: Diagnostic) -> Self {
        Self {
            results: Vec::new(),
            errors: vec![error],
        }
    }
}

#[must_use]
pub fn evaluate_query<N: Namespace>(
    source: &str,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> QueryOutput<N::Binding> {
    match parse_query(source) {
        Ok(query) => evaluate_parsed_query(&query, namespace, options),
        Err(error) => QueryOutput::failure(diagnostic(
            error.code,
            error.message,
            DiagnosticPhase::Parse,
        )),
    }
}

#[must_use]
pub fn evaluate_parsed_query<N: Namespace>(
    query: &Query,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> QueryOutput<N::Binding> {
    if let Err(error) = enforce_policy(query, options.policy) {
        return QueryOutput::failure(error);
    }

    let mut bindings = match evaluate_from(&query.from, namespace, options) {
        Ok(bindings) => bindings,
        Err(mut error) => {
            error.phase = Some(DiagnosticPhase::From);
            return QueryOutput::failure(error);
        }
    };
    if let Err(error) = check_budget(
        "maxFromBindings",
        options.budget.max_from_bindings,
        bindings.len(),
        DiagnosticPhase::From,
    ) {
        return QueryOutput::failure(error);
    }

    if let Some(clause) = &query.where_clause {
        if let Err(error) = check_budget(
            "maxWhereCandidates",
            options.budget.max_where_candidates,
            bindings.len(),
            DiagnosticPhase::Where,
        ) {
            return QueryOutput::failure(error);
        }
        let mut filtered = Vec::new();
        for binding in bindings {
            match evaluate_expression(&clause.ast, &binding, namespace, options)
                .and_then(|value| expect_boolean(value, namespace))
            {
                Ok(true) => filtered.push(binding),
                Ok(false) => {}
                Err(error) => {
                    return QueryOutput::failure(with_candidate(
                        error,
                        DiagnosticPhase::Where,
                        &binding,
                        namespace,
                    ));
                }
            }
        }
        bindings = filtered;
    }

    if let Some(order) = &query.order_by {
        if let Err(error) = check_budget(
            "maxOrderCandidates",
            options.budget.max_order_candidates,
            bindings.len(),
            DiagnosticPhase::Order,
        ) {
            return QueryOutput::failure(error);
        }
        let mut keyed = Vec::with_capacity(bindings.len());
        for (ordinal, binding) in bindings.into_iter().enumerate() {
            let mut keys = Vec::with_capacity(order.keys.len());
            for key in &order.keys {
                let value = match evaluate_expression(&key.ast, &binding, namespace, options)
                    .and_then(|value| expect_scalar(value, namespace))
                {
                    Ok(value) => value,
                    Err(error) => {
                        return QueryOutput::failure(with_candidate(
                            error,
                            DiagnosticPhase::Order,
                            &binding,
                            namespace,
                        ));
                    }
                };
                keys.push((value, key.direction));
            }
            keyed.push((binding, keys, ordinal));
        }
        for index in 0..keyed.len() {
            for key_index in 0..order.keys.len() {
                let value = &keyed[index].1[key_index].0;
                if let Err(error) = compare(value, value, options.profile) {
                    return QueryOutput::failure(with_candidate(
                        invalid_comparison(error.message),
                        DiagnosticPhase::Order,
                        &keyed[index].0,
                        namespace,
                    ));
                }
                if index > 0
                    && let Err(error) = compare(&keyed[0].1[key_index].0, value, options.profile)
                {
                    return QueryOutput::failure(with_candidate(
                        invalid_comparison(error.message),
                        DiagnosticPhase::Order,
                        &keyed[index].0,
                        namespace,
                    ));
                }
            }
        }
        keyed.sort_by(|left, right| {
            for ((left, direction), (right, _)) in left.1.iter().zip(&right.1) {
                match compare(left, right, options.profile) {
                    Ok(Ordering::Equal) => {}
                    Ok(ordering) => {
                        return if *direction == OrderDirection::Desc {
                            ordering.reverse()
                        } else {
                            ordering
                        };
                    }
                    Err(_) => unreachable!("order keys were prevalidated"),
                }
            }
            left.2.cmp(&right.2)
        });
        bindings = keyed.into_iter().map(|entry| entry.0).collect();
    }

    if let Some(offset) = query.offset {
        bindings = bindings
            .into_iter()
            .skip(usize::try_from(offset).unwrap_or(usize::MAX))
            .collect();
    }
    if let Some(limit) = query.limit {
        bindings.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
    }
    if let Err(error) = check_budget(
        "maxResultRecords",
        options.budget.max_result_records,
        bindings.len(),
        DiagnosticPhase::Select,
    ) {
        return QueryOutput::failure(error);
    }

    let mut results = Vec::with_capacity(bindings.len());
    for binding in bindings {
        match evaluate_expression(&query.select.ast, &binding, namespace, options) {
            Ok(value) => results.push(QueryRecord {
                candidate: binding,
                value,
            }),
            Err(error) => {
                return QueryOutput::failure(with_candidate(
                    error,
                    DiagnosticPhase::Select,
                    &binding,
                    namespace,
                ));
            }
        }
    }
    QueryOutput::success(results)
}

fn evaluate_from<N: Namespace>(
    from: &FromClause,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<Vec<N::Binding>> {
    match from {
        FromClause::Address(address) => resolve(address, namespace, &options.resolve),
        FromClause::Path(expression) => {
            let root = namespace.root().ok_or_else(|| {
                diagnostic(
                    "SANSA_RESOLVE_MISSING_ROOT",
                    "SANSA resolve namespace does not expose a root binding",
                    DiagnosticPhase::From,
                )
            })?;
            match evaluate_expression(expression, &root, namespace, options)? {
                EvaluatedValue::Bindings(bindings) => Ok(bindings),
                _ => Err(evaluate_error(
                    "SANSA_QUERY_EVALUATE_INVALID_FROM_SOURCE",
                    "Dynamic 'from' source expression must evaluate to a Binding Set",
                )),
            }
        }
    }
}

fn evaluate_expression<N: Namespace>(
    expression: &Expression,
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    match expression {
        Expression::Literal(literal) => Ok(EvaluatedValue::Scalar(literal_value(literal)?)),
        Expression::CurrentBinding => Ok(EvaluatedValue::Bindings(vec![current.clone()])),
        Expression::Resolution { address, scope, .. } => {
            let mut resolve_options = options.resolve.clone();
            if !matches!(scope, crate::query::ResolutionScope::Absolute) {
                resolve_options.contextual_root = Some(current.clone());
            }
            if matches!(scope, crate::query::ResolutionScope::Current) {
                resolve_options.allow_parent_from_effective_root = true;
            }
            resolve(address, namespace, &resolve_options).map(EvaluatedValue::Bindings)
        }
        Expression::Group(inner) => evaluate_expression(inner, current, namespace, options),
        Expression::Unary {
            operator: UnaryOperator::Not,
            argument,
        } => {
            let value = evaluate_expression(argument, current, namespace, options)?;
            Ok(EvaluatedValue::Scalar(Value::Boolean(!expect_boolean(
                value, namespace,
            )?)))
        }
        Expression::Binary {
            operator: BinaryOperator::And | BinaryOperator::Or,
            ..
        } => evaluate_logical(expression, current, namespace, options),
        Expression::Binary {
            operator,
            left,
            right,
        } => evaluate_binary(*operator, left, right, current, namespace, options),
        Expression::FunctionCall { name, arguments } => {
            evaluate_function(name, arguments, current, namespace, options)
        }
        Expression::Existence { operator, argument } => {
            let bindings = evaluate_resolution_argument(argument, current, namespace, options)?;
            let present = !bindings.is_empty();
            Ok(EvaluatedValue::Scalar(Value::Boolean(match operator {
                ExistenceOperator::Exists => present,
                ExistenceOperator::Absent => !present,
            })))
        }
        Expression::Cardinality { operator, argument } => {
            let values = evaluate_cardinality(argument, current, namespace, options)?;
            let value = match operator {
                CardinalityOperator::Any => values.iter().any(|value| *value),
                CardinalityOperator::All => values.iter().all(|value| *value),
                CardinalityOperator::None => values.iter().all(|value| !*value),
            };
            Ok(EvaluatedValue::Scalar(Value::Boolean(value)))
        }
        Expression::Projection { fields } => {
            let mut output = Vec::with_capacity(fields.len());
            for field in fields {
                output.push((
                    field.name.clone(),
                    evaluate_expression(&field.expression, current, namespace, options)?,
                ));
            }
            Ok(EvaluatedValue::Object(output))
        }
    }
}

fn evaluate_binary<N: Namespace>(
    operator: BinaryOperator,
    left: &Expression,
    right: &Expression,
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    let left = evaluate_expression(left, current, namespace, options)?;
    let right = evaluate_expression(right, current, namespace, options)?;
    if operator == BinaryOperator::In {
        let left = expect_scalar(left, namespace)?;
        let EvaluatedValue::Bindings(bindings) = right else {
            return Err(invalid_comparison(
                "Membership right operand must evaluate to a Binding Set",
            ));
        };
        for binding in bindings {
            let right = binding_value(namespace, &binding)?;
            match equal(&left, &right, options.profile) {
                Ok(true) => return Ok(EvaluatedValue::Scalar(Value::Boolean(true))),
                Ok(false) => {}
                Err(error) => return Err(invalid_comparison(error.message)),
            }
        }
        return Ok(EvaluatedValue::Scalar(Value::Boolean(false)));
    }
    let left = expect_scalar(left, namespace)?;
    let right = expect_scalar(right, namespace)?;
    let value = match operator {
        BinaryOperator::Equal => equal(&left, &right, options.profile),
        BinaryOperator::NotEqual => not_equal(&left, &right, options.profile),
        BinaryOperator::Less => {
            compare(&left, &right, options.profile).map(|v| v == Ordering::Less)
        }
        BinaryOperator::LessEqual => compare(&left, &right, options.profile)
            .map(|v| matches!(v, Ordering::Less | Ordering::Equal)),
        BinaryOperator::Greater => {
            compare(&left, &right, options.profile).map(|v| v == Ordering::Greater)
        }
        BinaryOperator::GreaterEqual => compare(&left, &right, options.profile)
            .map(|v| matches!(v, Ordering::Greater | Ordering::Equal)),
        _ => unreachable!(),
    }
    .map_err(|error| invalid_comparison(error.message))?;
    Ok(EvaluatedValue::Scalar(Value::Boolean(value)))
}

fn evaluate_logical<N: Namespace>(
    expression: &Expression,
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    enum Task<'a> {
        Evaluate(&'a Expression),
        Left(BinaryOperator, &'a Expression),
        Right,
    }

    let mut tasks = vec![Task::Evaluate(expression)];
    let mut values = Vec::new();
    while let Some(task) = tasks.pop() {
        match task {
            Task::Evaluate(Expression::Binary {
                operator,
                left,
                right,
            }) if matches!(operator, BinaryOperator::And | BinaryOperator::Or) => {
                tasks.push(Task::Left(*operator, right));
                tasks.push(Task::Evaluate(left));
            }
            Task::Evaluate(expression) => values.push(expect_boolean(
                evaluate_expression(expression, current, namespace, options)?,
                namespace,
            )?),
            Task::Left(operator, right) => {
                let left = values.pop().expect("logical left value");
                if operator == BinaryOperator::And && !left
                    || operator == BinaryOperator::Or && left
                {
                    values.push(left);
                } else {
                    tasks.push(Task::Right);
                    tasks.push(Task::Evaluate(right));
                }
            }
            Task::Right => {
                let right = values.pop().expect("logical right value");
                values.push(right);
            }
        }
    }
    Ok(EvaluatedValue::Scalar(Value::Boolean(
        values.pop().expect("logical result"),
    )))
}

fn evaluate_cardinality<N: Namespace>(
    expression: &Expression,
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<Vec<bool>> {
    if let Expression::Group(inner) = expression {
        return evaluate_cardinality(inner, current, namespace, options);
    }
    if let Expression::Resolution { .. } | Expression::CurrentBinding = expression {
        let bindings = evaluate_resolution_argument(expression, current, namespace, options)?;
        return bindings
            .iter()
            .map(|binding| match binding_value(namespace, binding)? {
                Value::Boolean(value) => Ok(value),
                _ => Err(evaluate_error(
                    "SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN",
                    "Cardinality resolution operands must expose Boolean scalar values",
                )),
            })
            .collect();
    }
    if let Expression::Binary {
        operator,
        left,
        right,
    } = expression
        && !matches!(operator, BinaryOperator::And | BinaryOperator::Or)
    {
        let left_value = evaluate_expression(left, current, namespace, options)?;
        let right_value = evaluate_expression(right, current, namespace, options)?;
        return map_cardinality_binary(
            *operator,
            left_value,
            right_value,
            namespace,
            options.profile,
        );
    }
    if let Expression::FunctionCall { name, arguments } = expression {
        let evaluated = arguments
            .iter()
            .map(|argument| evaluate_expression(argument, current, namespace, options))
            .collect::<Result<Vec<_>, _>>()?;
        let binding_sets = evaluated
            .iter()
            .enumerate()
            .filter_map(|(index, value)| {
                matches!(value, EvaluatedValue::Bindings(_)).then_some(index)
            })
            .collect::<Vec<_>>();
        if binding_sets.len() == 1 {
            let set_index = binding_sets[0];
            let EvaluatedValue::Bindings(bindings) = &evaluated[set_index] else {
                unreachable!()
            };
            let mut values = Vec::with_capacity(bindings.len());
            for binding in bindings {
                let mut scalar_arguments = Vec::with_capacity(evaluated.len());
                for (index, value) in evaluated.iter().enumerate() {
                    scalar_arguments.push(if index == set_index {
                        binding_value(namespace, binding)?
                    } else {
                        expect_scalar(value.clone(), namespace)?
                    });
                }
                values.push(expect_boolean(
                    evaluate_scalar_function(name, &scalar_arguments)?,
                    namespace,
                )?);
            }
            return Ok(values);
        }
    }
    Err(evaluate_error(
        "SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT",
        "Cardinality operators require a resolution predicate",
    ))
}

fn map_cardinality_binary<N: Namespace>(
    operator: BinaryOperator,
    left: EvaluatedValue<N::Binding>,
    right: EvaluatedValue<N::Binding>,
    namespace: &N,
    profile: Profile,
) -> EvaluationResult<Vec<bool>> {
    let left_is_set = matches!(left, EvaluatedValue::Bindings(_));
    let right_is_set = matches!(right, EvaluatedValue::Bindings(_));
    if left_is_set == right_is_set {
        return Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT",
            "Cardinality predicate must compare one binding set with one scalar",
        ));
    }
    let (bindings, scalar, set_on_left) = if let EvaluatedValue::Bindings(bindings) = left {
        (bindings, expect_scalar(right, namespace)?, true)
    } else if let EvaluatedValue::Bindings(bindings) = right {
        (bindings, expect_scalar(left, namespace)?, false)
    } else {
        unreachable!()
    };
    bindings
        .iter()
        .map(|binding| {
            let bound = binding_value(namespace, binding)?;
            let (left, right) = if set_on_left {
                (&bound, &scalar)
            } else {
                (&scalar, &bound)
            };
            compare_values(operator, left, right, profile)
        })
        .collect()
}

fn evaluate_function<N: Namespace>(
    name: &str,
    arguments: &[Expression],
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    match name {
        "path" => evaluate_path(arguments, current, namespace, options),
        "fallback" => evaluate_fallback(arguments, current, namespace, options),
        "resolveChild" => evaluate_resolve_child(arguments, current, namespace, options),
        "follow" => evaluate_follow(arguments, current, namespace, options),
        "isValue" if arguments.len() == 1 => {
            let evaluated = evaluate_expression(&arguments[0], current, namespace, options)?;
            let value = match evaluated {
                EvaluatedValue::Bindings(bindings) if bindings.is_empty() => false,
                EvaluatedValue::Bindings(bindings) if bindings.len() > 1 => {
                    return Err(cardinality(
                        "Function 'isValue' expected at most one binding",
                    ));
                }
                EvaluatedValue::Bindings(bindings) => {
                    namespace.value(&bindings[0]).as_ref().is_some_and(is_value)
                }
                EvaluatedValue::Scalar(value) => is_value(&value),
                EvaluatedValue::Object(_) => true,
            };
            Ok(EvaluatedValue::Scalar(Value::Boolean(value)))
        }
        "isValue" => Err(invalid_function("isValue", 1)),
        "only" | "lookup" | "matches" | "objectfrom" => Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION",
            format!("Unsupported SANSA Query function '{name}'"),
        )),
        _ => {
            let values = arguments
                .iter()
                .map(|argument| {
                    evaluate_expression(argument, current, namespace, options)
                        .and_then(|value| expect_scalar(value, namespace))
                })
                .collect::<Result<Vec<_>, _>>()?;
            evaluate_scalar_function(name, &values)
        }
    }
}

fn evaluate_scalar_function<Binding>(
    name: &str,
    values: &[Value],
) -> EvaluationResult<EvaluatedValue<Binding>> {
    let invalid = || {
        evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL",
            format!("Invalid arguments for function '{name}'"),
        )
    };
    let boolean = |value| Ok(EvaluatedValue::Scalar(Value::Boolean(value)));
    match name {
        "isValue" if values.len() == 1 => boolean(is_value(&values[0])),
        "isNull" if values.len() == 1 => boolean(matches!(values[0], Value::ExplicitNull { .. })),
        "isNaN" if values.len() == 1 => boolean(matches!(values[0], Value::Nan)),
        "isInfinity" if values.len() == 1 => boolean(matches!(
            values[0],
            Value::PositiveInfinity | Value::NegativeInfinity
        )),
        "isNullReason" if values.len() == 2 => match (&values[0], &values[1]) {
            (Value::ExplicitNull { reason }, Value::String(expected)) => {
                boolean(reason == expected)
            }
            (_, Value::String(_)) => boolean(false),
            _ => Err(invalid()),
        },
        "lower" if values.len() == 1 => match &values[0] {
            Value::String(value) => Ok(EvaluatedValue::Scalar(Value::String(value.to_lowercase()))),
            _ => Err(invalid()),
        },
        "upper" if values.len() == 1 => match &values[0] {
            Value::String(value) => Ok(EvaluatedValue::Scalar(Value::String(value.to_uppercase()))),
            _ => Err(invalid()),
        },
        "contains" | "startsWith" | "endsWith" if values.len() == 2 => {
            match (&values[0], &values[1]) {
                (Value::String(value), Value::String(needle)) => boolean(match name {
                    "contains" => value.contains(needle),
                    "startsWith" => value.starts_with(needle),
                    _ => value.ends_with(needle),
                }),
                _ => Err(invalid()),
            }
        }
        "concat" if !values.is_empty() => {
            let mut output = String::new();
            for value in values {
                let Value::String(value) = value else {
                    return Err(invalid());
                };
                output.push_str(value);
            }
            Ok(EvaluatedValue::Scalar(Value::String(output)))
        }
        "radixScale" if values.len() == 1 => match &values[0] {
            Value::Radix { payload, .. } => {
                let scale = payload
                    .split_once('.')
                    .map_or(0, |(_, fraction)| fraction.replace('_', "").len());
                Ok(EvaluatedValue::Scalar(Value::FiniteNumber(
                    FiniteNumber::parse(scale.to_string()).expect("scale is finite"),
                )))
            }
            _ => Err(invalid()),
        },
        "temporalRelation" if values.len() == 2 => match (&values[0], &values[1]) {
            (
                Value::Temporal {
                    payload: left,
                    semantic_type: left_type,
                },
                Value::Temporal {
                    payload: right,
                    semantic_type: right_type,
                },
            ) => Ok(EvaluatedValue::Scalar(Value::String(temporal_relation(
                left, left_type, right, right_type,
            )))),
            _ => Err(invalid()),
        },
        "objectFrom" | "fieldsFrom" => Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION",
            format!("Transform extension '{name}' is disabled"),
        )),
        _ if matches!(
            name,
            "isValue"
                | "isNull"
                | "isNaN"
                | "isInfinity"
                | "isNullReason"
                | "lower"
                | "upper"
                | "contains"
                | "startsWith"
                | "endsWith"
                | "concat"
                | "radixScale"
                | "temporalRelation"
        ) =>
        {
            Err(invalid())
        }
        _ => Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION",
            format!("Unsupported SANSA Query function '{name}'"),
        )),
    }
}

fn evaluate_fallback<N: Namespace>(
    arguments: &[Expression],
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    if arguments.len() != 2 {
        return Err(invalid_function("fallback", 2));
    }
    match evaluate_expression(&arguments[0], current, namespace, options) {
        Ok(EvaluatedValue::Bindings(bindings)) if bindings.is_empty() => {}
        Ok(EvaluatedValue::Bindings(bindings)) if bindings.len() > 1 => {
            return Err(cardinality("Function 'fallback' expected one binding"));
        }
        Ok(EvaluatedValue::Bindings(bindings)) => match binding_value(namespace, &bindings[0]) {
            Ok(value) => return Ok(EvaluatedValue::Scalar(value)),
            Err(error) if error.code == "SANSA_QUERY_EVALUATE_MISSING_SCALAR" => {}
            Err(error) => return Err(error),
        },
        Ok(value) => return Ok(value),
        Err(error) if error.code == "SANSA_QUERY_EVALUATE_MISSING_SCALAR" => {}
        Err(error) => return Err(error),
    }
    let replacement = evaluate_expression(&arguments[1], current, namespace, options)?;
    match replacement {
        EvaluatedValue::Bindings(bindings) if bindings.is_empty() => Err(missing_scalar(
            "Function 'fallback' replacement resolved no scalar value",
        )),
        EvaluatedValue::Bindings(bindings) if bindings.len() > 1 => {
            Err(cardinality("Function 'fallback' expected one binding"))
        }
        EvaluatedValue::Bindings(bindings) => Ok(EvaluatedValue::Scalar(binding_value(
            namespace,
            &bindings[0],
        )?)),
        value => Ok(value),
    }
}

fn evaluate_resolve_child<N: Namespace>(
    arguments: &[Expression],
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    if arguments.len() != 2 || unwrap_resolution(&arguments[0]).is_none() {
        return Err(invalid_function("resolveChild", 2));
    }
    let base = evaluate_resolution_argument(&arguments[0], current, namespace, options)?;
    if base.is_empty() {
        return Err(missing_scalar("Function 'resolveChild' resolved no base"));
    }
    if base.len() > 1 {
        return Err(cardinality(
            "Function 'resolveChild' resolved multiple base bindings",
        ));
    }
    let key = expect_scalar(
        evaluate_expression(&arguments[1], current, namespace, options)?,
        namespace,
    )?;
    let children = namespace.children(&base[0]);
    let selected: Vec<N::Binding> = match key {
        Value::String(name) => children
            .into_iter()
            .filter(|child| namespace.name(child).as_deref() == Some(&name))
            .collect(),
        Value::FiniteNumber(number) => {
            let index = number
                .as_str()
                .parse::<usize>()
                .map_err(|_| invalid_function("resolveChild", 2))?;
            children
                .iter()
                .find(|child| namespace.position(child) == Some(index))
                .cloned()
                .or_else(|| children.get(index).cloned())
                .into_iter()
                .collect()
        }
        _ => return Err(invalid_function("resolveChild", 2)),
    };
    if selected.len() > 1 {
        return Err(cardinality(
            "Function 'resolveChild' target resolved multiple bindings",
        ));
    }
    Ok(EvaluatedValue::Bindings(selected))
}

fn evaluate_follow<N: Namespace>(
    arguments: &[Expression],
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    if arguments.len() != 1 {
        return Err(invalid_function("follow", 1));
    }
    let value = expect_scalar(
        evaluate_expression(&arguments[0], current, namespace, options)?,
        namespace,
    )?;
    let Value::ReferenceForm { target, .. } = value else {
        return Err(invalid_function("follow", 1));
    };
    let address = parse_address(&target).map_err(|error| {
        evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET",
            error.message,
        )
    })?;
    if !address.is_exact {
        return Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET",
            "Function 'follow' requires an exact reference target path",
        ));
    }
    let bindings = resolve(&address, namespace, &options.resolve)?;
    if bindings.is_empty() {
        return Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_MISSING_REFERENCE_TARGET",
            "Function 'follow' target resolved no binding",
        ));
    }
    Ok(EvaluatedValue::Bindings(bindings))
}

fn evaluate_path<N: Namespace>(
    arguments: &[Expression],
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<EvaluatedValue<N::Binding>> {
    if arguments.len() != 1 {
        return Err(invalid_function("path", 1));
    }
    let value = expect_scalar(
        evaluate_expression(&arguments[0], current, namespace, options)?,
        namespace,
    )?;
    let Value::SansaAddress(source) = value else {
        return Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL",
            "Function 'path' expects a SANSA Address Literal value",
        ));
    };
    let address = parse_address(&source).map_err(|_| {
        evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL",
            "Function 'path' received an invalid SANSA Address Literal",
        )
    })?;
    let grant = authorize_path(&address, current, namespace, &options.address_activation)?;
    let mut resolve_options = options.resolve.clone();
    if address.root == Root::Contextual {
        resolve_options.contextual_root = Some(current.clone());
    }
    resolve_options.max_bindings = match (grant.max_bindings, resolve_options.max_bindings) {
        (Some(grant), Some(host)) => Some(grant.min(host)),
        (grant, host) => grant.or(host),
    };
    resolve_options.allow_parent_from_effective_root = grant.allow_parent_from_effective_root;
    let output = resolve_parsed_address(&address, namespace, &resolve_options);
    if let Some(error) = output.errors.into_iter().next() {
        if error.code == "SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED" {
            let mut mapped = evaluate_error(
                "SANSA_QUERY_PATH_ACTIVATION_BINDING_LIMIT_EXCEEDED",
                error.message,
            );
            mapped.limit = error.limit;
            mapped.observed = error.observed;
            return Err(mapped);
        }
        return Err(error);
    }
    Ok(EvaluatedValue::Bindings(output.bindings))
}

fn authorize_path<N: Namespace>(
    address: &Address,
    current: &N::Binding,
    namespace: &N,
    activation: &AddressActivation,
) -> EvaluationResult<ActivationGrant> {
    let AddressActivation::Constrained(policy) = activation else {
        return match activation {
            AddressActivation::Trusted => Ok(ActivationGrant {
                max_bindings: None,
                allow_parent_from_effective_root: true,
            }),
            AddressActivation::Disabled => Err(evaluate_error(
                "SANSA_QUERY_PATH_ACTIVATION_POLICY_REQUIRED",
                "Function 'path' requires an explicit address-activation policy",
            )),
            AddressActivation::Constrained(_) => unreachable!(),
        };
    };
    if policy.allowed_roots.is_empty()
        || policy.allowed_roots.iter().any(|root| {
            root.root != Root::Absolute || !root.is_exact || root.qualifier_expression.is_some()
        })
    {
        return Err(path_invalid_policy(
            "Constrained address activation requires exact, unqualified absolute roots",
        ));
    }
    if address.root == Root::Contextual && !policy.allow_contextual_root {
        return Err(path_denied(
            "Contextual-root address activation is not permitted",
        ));
    }
    if policy
        .max_address_depth
        .is_some_and(|limit| address.selectors.len() > limit)
    {
        return Err(path_denied(
            "Activated address exceeds the configured depth",
        ));
    }
    if address.selectors.iter().any(|selector| {
        !policy
            .allowed_selectors
            .contains(&activation_selector(selector))
    }) {
        return Err(path_denied("Activated address selector is not permitted"));
    }
    let effective = effective_address(address, current, namespace)?;
    if !policy
        .allowed_roots
        .iter()
        .any(|root| address_has_prefix(&effective, root))
    {
        return Err(path_denied(
            "Activated address is outside every permitted root",
        ));
    }
    Ok(ActivationGrant {
        max_bindings: policy.max_bindings,
        allow_parent_from_effective_root: policy
            .allowed_selectors
            .contains(&ActivationSelector::Parent),
    })
}

fn effective_address<N: Namespace>(
    address: &Address,
    current: &N::Binding,
    namespace: &N,
) -> EvaluationResult<Address> {
    if address.root == Root::Absolute {
        return normalize_parent_selectors(address.clone());
    }
    let source = namespace.binding_address(current).ok_or_else(|| {
        path_denied("Cannot establish contextual address scope for the current binding")
    })?;
    let mut current = parse_address(&source)
        .map_err(|_| path_denied("Current binding address is not a canonical absolute address"))?;
    if current.root != Root::Absolute || !current.is_exact {
        return Err(path_denied(
            "Current binding address is not a canonical exact absolute address",
        ));
    }
    current.selectors.extend(address.selectors.clone());
    current.is_exact = current.selectors.iter().all(is_exact_selector);
    normalize_parent_selectors(current)
}

fn normalize_parent_selectors(mut address: Address) -> EvaluationResult<Address> {
    let mut selectors = Vec::new();
    for selector in address.selectors {
        if selector == Selector::Parent {
            if !selectors.last().is_some_and(is_exact_selector) {
                return Err(path_denied(
                    "Activated parent traversal cannot remain within scope",
                ));
            }
            selectors.pop();
        } else {
            selectors.push(selector);
        }
    }
    address.selectors = selectors;
    Ok(address)
}

fn evaluate_resolution_argument<N: Namespace>(
    expression: &Expression,
    current: &N::Binding,
    namespace: &N,
    options: &EvaluateOptions<N::Binding>,
) -> EvaluationResult<Vec<N::Binding>> {
    let expression = unwrap_resolution(expression).ok_or_else(|| {
        evaluate_error(
            "SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT",
            "Expected a resolution expression",
        )
    })?;
    match evaluate_expression(expression, current, namespace, options)? {
        EvaluatedValue::Bindings(bindings) => Ok(bindings),
        _ => unreachable!(),
    }
}

fn unwrap_resolution(expression: &Expression) -> Option<&Expression> {
    match expression {
        Expression::Resolution { .. } | Expression::CurrentBinding => Some(expression),
        Expression::Group(inner) => unwrap_resolution(inner),
        _ => None,
    }
}

fn expect_boolean<N: Namespace>(
    value: EvaluatedValue<N::Binding>,
    namespace: &N,
) -> EvaluationResult<bool> {
    match expect_scalar(value, namespace)? {
        Value::Boolean(value) => Ok(value),
        _ => Err(evaluate_error(
            "SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN",
            "Expected Boolean query value",
        )),
    }
}

fn expect_scalar<N: Namespace>(
    value: EvaluatedValue<N::Binding>,
    namespace: &N,
) -> EvaluationResult<Value> {
    match value {
        EvaluatedValue::Scalar(value) => Ok(value),
        EvaluatedValue::Bindings(bindings) if bindings.is_empty() => {
            Err(missing_scalar("Resolution produced no scalar binding"))
        }
        EvaluatedValue::Bindings(bindings) if bindings.len() > 1 => Err(cardinality(
            "Resolution produced multiple bindings where one scalar was required",
        )),
        EvaluatedValue::Bindings(bindings) => binding_value(namespace, &bindings[0]),
        EvaluatedValue::Object(_) => Err(cardinality(
            "Derived object cannot be consumed as a scalar query value",
        )),
    }
}

fn binding_value<N: Namespace>(namespace: &N, binding: &N::Binding) -> EvaluationResult<Value> {
    namespace
        .value(binding)
        .ok_or_else(|| missing_scalar("Binding does not expose a scalar or structural value"))
}

fn literal_value(literal: &Literal) -> EvaluationResult<Value> {
    let text = || match &literal.value {
        LiteralValue::Text(value) | LiteralValue::Number(value) => value.clone(),
        _ => literal.canonical.clone(),
    };
    Ok(match literal.kind {
        LiteralKind::String => Value::String(text()),
        LiteralKind::Number => Value::FiniteNumber(
            FiniteNumber::parse(text()).map_err(|error| invalid_comparison(error.message))?,
        ),
        LiteralKind::Boolean => {
            let LiteralValue::Boolean(value) = literal.value else {
                unreachable!()
            };
            Value::Boolean(value)
        }
        LiteralKind::Toggle => Value::Toggle(text()),
        LiteralKind::Hex => Value::Hex(text()),
        LiteralKind::Radix => Value::Radix {
            payload: text(),
            semantic_type: "radix".into(),
        },
        LiteralKind::Encoding => Value::Encoding(text()),
        LiteralKind::Separator => Value::Separator(text()),
        LiteralKind::Symbol => Value::Symbol(text()),
        LiteralKind::Date | LiteralKind::Time | LiteralKind::Datetime | LiteralKind::Wtc => {
            Value::Temporal {
                payload: text(),
                semantic_type: literal.kind.as_str().into(),
            }
        }
        LiteralKind::Null => {
            let LiteralValue::Null { reason } = &literal.value else {
                unreachable!()
            };
            Value::ExplicitNull {
                reason: reason.clone(),
            }
        }
    })
}

fn compare_values(
    operator: BinaryOperator,
    left: &Value,
    right: &Value,
    profile: Profile,
) -> EvaluationResult<bool> {
    let result = match operator {
        BinaryOperator::Equal => equal(left, right, profile),
        BinaryOperator::NotEqual => not_equal(left, right, profile),
        BinaryOperator::Less => compare(left, right, profile).map(|v| v == Ordering::Less),
        BinaryOperator::LessEqual => compare(left, right, profile).map(|v| v != Ordering::Greater),
        BinaryOperator::Greater => compare(left, right, profile).map(|v| v == Ordering::Greater),
        BinaryOperator::GreaterEqual => compare(left, right, profile).map(|v| v != Ordering::Less),
        _ => unreachable!(),
    };
    result.map_err(|error| invalid_comparison(error.message))
}

fn resolve<N: Namespace>(
    address: &Address,
    namespace: &N,
    options: &ResolveOptions<N::Binding>,
) -> EvaluationResult<Vec<N::Binding>> {
    let output = resolve_parsed_address(address, namespace, options);
    output
        .errors
        .into_iter()
        .next()
        .map_or_else(|| Ok(output.bindings), Err)
}

fn enforce_policy(query: &Query, policy: QueryPolicy) -> EvaluationResult<()> {
    if policy == QueryPolicy::General {
        return Ok(());
    }
    if query.order_by.is_some()
        || query.offset.is_some()
        || query.limit.is_some()
        || matches!(query.select.ast, Expression::Projection { .. })
    {
        return Err(diagnostic(
            "SANSA_QUERY_POLICY_VIOLATION",
            "Validation Query policy does not allow this query shape",
            DiagnosticPhase::Policy,
        ));
    }
    Ok(())
}

fn check_budget(
    name: &str,
    limit: Option<usize>,
    observed: usize,
    phase: DiagnosticPhase,
) -> EvaluationResult<()> {
    if limit.is_none_or(|limit| observed <= limit) {
        return Ok(());
    }
    let limit = limit.expect("checked");
    let mut error = diagnostic(
        "SANSA_QUERY_BUDGET_EXCEEDED",
        format!("Query budget '{name}' exceeded: limit {limit}, observed {observed}"),
        phase,
    );
    error.budget = Some(name.into());
    error.limit = Some(limit);
    error.observed = Some(observed);
    Err(error)
}

fn activation_selector(selector: &Selector) -> ActivationSelector {
    match selector {
        Selector::Member { .. } => ActivationSelector::Member,
        Selector::Position { .. } => ActivationSelector::Position,
        Selector::PositionRange { .. } => ActivationSelector::Range,
        Selector::Parent => ActivationSelector::Parent,
        Selector::AttributeSpace => ActivationSelector::Attribute,
        Selector::LocalSpace { .. } => ActivationSelector::LocalSpace,
        Selector::DirectExpansion => ActivationSelector::DirectExpansion,
        Selector::DescendantExpansion => ActivationSelector::DescendantExpansion,
        Selector::NamePattern { .. } => ActivationSelector::NamePattern,
        Selector::SemanticTypeFilter { .. } => ActivationSelector::SemanticType,
        Selector::RepresentationKindFilter { .. } => ActivationSelector::RepresentationKind,
    }
}

fn address_has_prefix(address: &Address, root: &Address) -> bool {
    address.root == root.root
        && address.selectors.len() >= root.selectors.len()
        && address
            .selectors
            .iter()
            .zip(&root.selectors)
            .all(|(left, right)| exact_selector_equals(left, right))
}

fn exact_selector_equals(left: &Selector, right: &Selector) -> bool {
    match (left, right) {
        (Selector::Member { name: left, .. }, Selector::Member { name: right, .. })
        | (Selector::LocalSpace { name: left }, Selector::LocalSpace { name: right }) => {
            left == right
        }
        (Selector::Position { index: left }, Selector::Position { index: right }) => left == right,
        (Selector::AttributeSpace, Selector::AttributeSpace) => true,
        _ => false,
    }
}

fn is_exact_selector(selector: &Selector) -> bool {
    matches!(
        selector,
        Selector::Member { .. }
            | Selector::Position { .. }
            | Selector::AttributeSpace
            | Selector::LocalSpace { .. }
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct TemporalDecimal {
    whole: i64,
    fraction: String,
}

impl Ord for TemporalDecimal {
    fn cmp(&self, other: &Self) -> Ordering {
        self.whole.cmp(&other.whole).then_with(|| {
            let width = self.fraction.len().max(other.fraction.len());
            self.fraction
                .bytes()
                .chain(std::iter::repeat(b'0'))
                .take(width)
                .cmp(
                    other
                        .fraction
                        .bytes()
                        .chain(std::iter::repeat(b'0'))
                        .take(width),
                )
        })
    }
}

impl PartialOrd for TemporalDecimal {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Debug)]
struct TemporalCompletionSet {
    domain: String,
    start: TemporalDecimal,
    end: TemporalDecimal,
    point: bool,
    leap_second: bool,
}

#[derive(Clone, Copy, Debug)]
struct TemporalDate {
    year: i64,
    month: Option<u32>,
    day: Option<u32>,
}

#[derive(Clone, Debug)]
struct TemporalClock {
    hour: u32,
    minute: Option<u32>,
    second: Option<u32>,
    fraction: String,
    anchor: Option<String>,
}

fn temporal_relation(left: &str, left_type: &str, right: &str, right_type: &str) -> String {
    let Some(left) = parse_temporal_completion_set(left, left_type) else {
        return "incomparable".into();
    };
    let Some(right) = parse_temporal_completion_set(right, right_type) else {
        return "incomparable".into();
    };
    if left.domain != right.domain {
        return "incomparable".into();
    }
    if left.leap_second || right.leap_second {
        return if left.leap_second && right.leap_second && left.start == right.start {
            "equal".into()
        } else {
            "incomparable".into()
        };
    }

    let start_order = left.start.cmp(&right.start);
    if left.point && right.point {
        return match start_order {
            Ordering::Less => "before",
            Ordering::Greater => "after",
            Ordering::Equal => "equal",
        }
        .into();
    }
    if left.point {
        if start_order == Ordering::Less {
            return "before".into();
        }
        if left.start >= right.end {
            return "after".into();
        }
        return "containedBy".into();
    }
    if right.point {
        if left.end <= right.start {
            return "before".into();
        }
        if start_order == Ordering::Greater {
            return "after".into();
        }
        return "contains".into();
    }

    let end_order = left.end.cmp(&right.end);
    if start_order == Ordering::Equal && end_order == Ordering::Equal {
        "equal".into()
    } else if left.end <= right.start {
        "before".into()
    } else if right.end <= left.start {
        "after".into()
    } else if start_order != Ordering::Greater && end_order != Ordering::Less {
        "contains".into()
    } else if start_order != Ordering::Less && end_order != Ordering::Greater {
        "containedBy".into()
    } else {
        "overlaps".into()
    }
}

fn parse_temporal_completion_set(
    payload: &str,
    semantic_type: &str,
) -> Option<TemporalCompletionSet> {
    if semantic_type == "date" {
        let date = parse_temporal_date(payload)?;
        let month = date.month.unwrap_or(1);
        let day = date.day.unwrap_or(1);
        let start_ordinal = date_ordinal(date.year, month, day)?;
        let end_ordinal = match (date.month, date.day) {
            (None, _) => date_ordinal(date.year + 1, 1, 1)?,
            (Some(12), None) => date_ordinal(date.year + 1, 1, 1)?,
            (Some(month), None) => date_ordinal(date.year, month + 1, 1)?,
            (Some(month), Some(day)) => date_ordinal(date.year, month, day)? + 1,
        };
        return Some(TemporalCompletionSet {
            domain: "date".into(),
            start: temporal_decimal(start_ordinal * 86_400, ""),
            end: temporal_decimal(end_ordinal * 86_400, ""),
            point: false,
            leap_second: false,
        });
    }
    if !matches!(semantic_type, "time" | "datetime" | "wtc") {
        return None;
    }

    let (base, context) = if semantic_type == "wtc" {
        let (base, context) = payload.split_once('&')?;
        if context.is_empty() || context.contains('&') {
            return None;
        }
        (base, Some(context))
    } else {
        (payload, None)
    };
    let (date, clock_text) = if semantic_type == "time" {
        (None, base)
    } else {
        let (date, clock) = base.split_once('T')?;
        (Some(parse_temporal_date(date)?), clock)
    };
    let clock = parse_temporal_clock(clock_text, semantic_type == "time")?;
    let domain = temporal_completion_domain(semantic_type, clock.anchor.as_deref(), context)?;

    let mut whole = i64::from(clock.hour) * 3_600
        + i64::from(clock.minute.unwrap_or(0)) * 60
        + i64::from(clock.second.unwrap_or(0));
    if let Some(date) = date {
        whole += date_ordinal(date.year, date.month?, date.day?)? * 86_400;
    }
    if let Some(anchor) = clock.anchor.as_deref()
        && !matches!(anchor, "Z" | "-00:00")
    {
        let sign = if anchor.starts_with('-') { -1 } else { 1 };
        let hours = anchor[1..3].parse::<i64>().ok()?;
        let minutes = anchor[4..6].parse::<i64>().ok()?;
        whole -= sign * (hours * 3_600 + minutes * 60);
    }
    let start = temporal_decimal(whole, &clock.fraction);
    if let Some(second) = clock.second {
        return Some(TemporalCompletionSet {
            domain,
            start: start.clone(),
            end: start,
            point: true,
            leap_second: second == 60,
        });
    }
    let width = if clock.minute.is_none() { 3_600 } else { 60 };
    Some(TemporalCompletionSet {
        domain,
        start: start.clone(),
        end: temporal_decimal(start.whole + width, &start.fraction),
        point: false,
        leap_second: false,
    })
}

fn temporal_decimal(whole: i64, fraction: &str) -> TemporalDecimal {
    TemporalDecimal {
        whole,
        fraction: fraction.trim_end_matches('0').into(),
    }
}

fn temporal_completion_domain(
    semantic_type: &str,
    anchor: Option<&str>,
    context: Option<&str>,
) -> Option<String> {
    let scope = if semantic_type == "time" {
        "time"
    } else {
        "datetime"
    };
    let recognized = matches!(context, Some("UTC" | "TAI" | "UT1" | "TT" | "GPS"));
    if recognized && anchor.is_some() && context != Some("UTC") {
        return None;
    }
    if scope == "time" && anchor.is_some_and(|value| value != "-00:00") {
        return Some(if matches!(anchor, Some("Z" | "+00:00")) {
            "instant:time:UTC".into()
        } else {
            format!("offset-time:{}", anchor.expect("checked"))
        });
    }
    if matches!(anchor, Some("Z")) || anchor.is_some_and(|value| value != "-00:00") {
        return Some("instant:datetime".into());
    }
    if anchor == Some("-00:00") {
        return Some(format!("unknown-offset:{scope}:{}", context.unwrap_or("")));
    }
    Some(match context {
        Some("local") => format!("resolver-local:{scope}"),
        Some(value) if recognized => format!("timescale:{value}:{scope}"),
        Some(value) => format!("context:{value}:{scope}"),
        None => format!("civil:{scope}"),
    })
}

fn parse_temporal_date(value: &str) -> Option<TemporalDate> {
    if value.len() == 5 && value.ends_with('-') {
        let year = parse_fixed_digits(&value[..4])? as i64;
        return (year != 0).then_some(TemporalDate {
            year,
            month: None,
            day: None,
        });
    }
    let parts = value.split('-').collect::<Vec<_>>();
    if !matches!(parts.len(), 2 | 3) || parts[0].len() != 4 || parts[1].len() != 2 {
        return None;
    }
    let year = parse_fixed_digits(parts[0])? as i64;
    let month = parse_fixed_digits(parts[1])?;
    if year == 0 || !(1..=12).contains(&month) {
        return None;
    }
    let day = if parts.len() == 3 {
        if parts[2].len() != 2 {
            return None;
        }
        let day = parse_fixed_digits(parts[2])?;
        (day >= 1 && day <= days_in_month(year, month)).then_some(day)?
    } else {
        return Some(TemporalDate {
            year,
            month: Some(month),
            day: None,
        });
    };
    Some(TemporalDate {
        year,
        month: Some(month),
        day: Some(day),
    })
}

fn parse_temporal_clock(value: &str, require_colon: bool) -> Option<TemporalClock> {
    if require_colon && !value.contains(':') {
        return None;
    }
    let (clock, anchor) = if let Some(clock) = value.strip_suffix('Z') {
        (clock, Some("Z".to_owned()))
    } else if value.len() >= 6 {
        let split = value.len() - 6;
        let candidate = &value[split..];
        if matches!(candidate.as_bytes().first(), Some(b'+' | b'-'))
            && candidate.as_bytes().get(3) == Some(&b':')
        {
            let hours = parse_fixed_digits(&candidate[1..3])?;
            let minutes = parse_fixed_digits(&candidate[4..6])?;
            if hours > 23 || minutes > 59 {
                return None;
            }
            (&value[..split], Some(candidate.to_owned()))
        } else {
            (value, None)
        }
    } else {
        (value, None)
    };
    let parts = clock.split(':').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 3 || parts[0].len() != 2 {
        return None;
    }
    let hour = parse_fixed_digits(parts[0])?;
    if hour > 23 {
        return None;
    }
    let minute = match parts.get(1) {
        Some(part) if !part.is_empty() => {
            if part.len() != 2 {
                return None;
            }
            Some(parse_fixed_digits(part)?)
        }
        _ => None,
    };
    if minute.is_some_and(|value| value > 59) {
        return None;
    }
    let (second, fraction) = if let Some(part) = parts.get(2) {
        let (second, fraction) = if let Some((second, fraction)) = part.split_once('.') {
            if fraction.is_empty() {
                return None;
            }
            (second, fraction)
        } else {
            (*part, "")
        };
        if second.len() != 2
            || (!fraction.is_empty() && !fraction.bytes().all(|b| b.is_ascii_digit()))
        {
            return None;
        }
        let second = parse_fixed_digits(second)?;
        if second > 60 {
            return None;
        }
        (Some(second), fraction.to_owned())
    } else {
        (None, String::new())
    };
    Some(TemporalClock {
        hour,
        minute,
        second,
        fraction,
        anchor,
    })
}

fn parse_fixed_digits(value: &str) -> Option<u32> {
    (!value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()))
        .then(|| value.parse().ok())
        .flatten()
}

fn date_ordinal(year: i64, month: u32, day: u32) -> Option<i64> {
    if !(1..=9999).contains(&year) || !(1..=12).contains(&month) || day == 0 {
        return None;
    }
    let prior_year = year - 1;
    let days_before_year = prior_year * 365 + prior_year / 4 - prior_year / 100 + prior_year / 400;
    let month_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let leap_adjustment = i64::from(month > 2 && is_leap_year(year));
    Some(days_before_year + month_days[(month - 1) as usize] + leap_adjustment + i64::from(day - 1))
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn is_leap_year(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn invalid_function(name: &str, arity: usize) -> Diagnostic {
    evaluate_error(
        "SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL",
        format!("Function '{name}' expects {arity} arguments"),
    )
}

fn missing_scalar(message: impl Into<String>) -> Diagnostic {
    evaluate_error("SANSA_QUERY_EVALUATE_MISSING_SCALAR", message)
}

fn cardinality(message: impl Into<String>) -> Diagnostic {
    evaluate_error("SANSA_QUERY_EVALUATE_CARDINALITY", message)
}

fn invalid_comparison(message: impl Into<String>) -> Diagnostic {
    evaluate_error("SANSA_QUERY_EVALUATE_INVALID_COMPARISON", message)
}

fn path_denied(message: impl Into<String>) -> Diagnostic {
    evaluate_error("SANSA_QUERY_PATH_ACTIVATION_DENIED", message)
}

fn path_invalid_policy(message: impl Into<String>) -> Diagnostic {
    evaluate_error("SANSA_QUERY_PATH_ACTIVATION_INVALID_POLICY", message)
}

fn evaluate_error(code: impl Into<String>, message: impl Into<String>) -> Diagnostic {
    Diagnostic::new(code, message)
}

fn diagnostic(
    code: impl Into<String>,
    message: impl Into<String>,
    phase: DiagnosticPhase,
) -> Diagnostic {
    let mut diagnostic = Diagnostic::new(code, message);
    diagnostic.phase = Some(phase);
    diagnostic
}

fn with_candidate<N: Namespace>(
    mut error: Diagnostic,
    phase: DiagnosticPhase,
    binding: &N::Binding,
    namespace: &N,
) -> Diagnostic {
    error.phase = Some(phase);
    error.candidate_address = namespace.binding_address(binding);
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct ReviewNode {
        parent: Option<usize>,
        name: Option<&'static str>,
        value: Option<Value>,
        children: Vec<usize>,
        address: &'static str,
    }

    #[derive(Clone)]
    struct ReviewNamespace(Vec<ReviewNode>);

    impl Namespace for ReviewNamespace {
        type Binding = usize;

        fn root(&self) -> Option<Self::Binding> {
            Some(0)
        }

        fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding> {
            self.0[*binding].children.clone()
        }

        fn parent(&self, binding: &Self::Binding) -> crate::resolve::Navigation<Self::Binding> {
            self.0[*binding].parent.map_or(
                crate::resolve::Navigation::Missing,
                crate::resolve::Navigation::Binding,
            )
        }

        fn name(&self, binding: &Self::Binding) -> Option<String> {
            self.0[*binding].name.map(str::to_owned)
        }

        fn position(&self, binding: &Self::Binding) -> Option<usize> {
            self.0[*binding].parent.and_then(|parent| {
                self.0[parent]
                    .children
                    .iter()
                    .position(|child| child == binding)
            })
        }

        fn value(&self, binding: &Self::Binding) -> Option<Value> {
            self.0[*binding].value.clone()
        }

        fn binding_address(&self, binding: &Self::Binding) -> Option<String> {
            Some(self.0[*binding].address.into())
        }
    }

    fn node(
        parent: Option<usize>,
        name: Option<&'static str>,
        value: Option<Value>,
        children: Vec<usize>,
        address: &'static str,
    ) -> ReviewNode {
        ReviewNode {
            parent,
            name,
            value,
            children,
            address,
        }
    }

    fn string(value: &str) -> Option<Value> {
        Some(Value::String(value.into()))
    }

    #[derive(Clone)]
    struct TinyNamespace;

    impl Namespace for TinyNamespace {
        type Binding = usize;

        fn root(&self) -> Option<Self::Binding> {
            Some(0)
        }

        fn children(&self, binding: &Self::Binding) -> Vec<Self::Binding> {
            match binding {
                0 => vec![1, 2],
                _ => Vec::new(),
            }
        }

        fn name(&self, binding: &Self::Binding) -> Option<String> {
            match binding {
                1 => Some("one".into()),
                2 => Some("two".into()),
                _ => None,
            }
        }

        fn value(&self, binding: &Self::Binding) -> Option<Value> {
            match binding {
                1 => Some(Value::FiniteNumber(FiniteNumber::parse("1").ok()?)),
                2 => Some(Value::FiniteNumber(FiniteNumber::parse("2").ok()?)),
                _ => None,
            }
        }

        fn binding_address(&self, binding: &Self::Binding) -> Option<String> {
            Some(match binding {
                0 => "$".into(),
                1 => "$.one".into(),
                2 => "$.two".into(),
                _ => return None,
            })
        }
    }

    #[test]
    fn evaluates_filter_order_limit_and_select_over_opaque_handles() {
        let output = evaluate_query(
            "from $.*\nwhere . >= 1\norder by . desc\nlimit 1\nselect .",
            &TinyNamespace,
            &EvaluateOptions::default(),
        );
        assert!(output.is_ok(), "{:?}", output.errors);
        assert_eq!(output.results.len(), 1);
        assert_eq!(output.results[0].candidate, 2);
        assert_eq!(output.results[0].value, EvaluatedValue::Bindings(vec![2]));
    }

    #[test]
    fn reports_phase_and_candidate_for_where_failures() {
        let output = evaluate_query(
            "from $.*\nwhere .\nselect .",
            &TinyNamespace,
            &EvaluateOptions::default(),
        );
        let error = &output.errors[0];
        assert_eq!(error.phase, Some(DiagnosticPhase::Where));
        assert_eq!(error.candidate_address.as_deref(), Some("$.one"));
    }

    #[test]
    fn evaluates_long_boolean_chains_without_recursive_stack_growth() {
        let predicate = std::iter::repeat_n("true", 4_096)
            .collect::<Vec<_>>()
            .join(" and ");
        let output = evaluate_query(
            &format!("from $\nwhere {predicate}\nselect ."),
            &TinyNamespace,
            &EvaluateOptions::default(),
        );
        assert!(output.is_ok(), "{:?}", output.errors);
        assert_eq!(output.results.len(), 1);
    }

    #[test]
    fn temporal_relations_cover_all_completion_set_outcomes() {
        let relation = |left, left_type, right, right_type| {
            temporal_relation(left, left_type, right, right_type)
        };
        assert_eq!(relation("2026-07", "date", "2026-07", "date"), "equal");
        assert_eq!(relation("2025-", "date", "2026-", "date"), "before");
        assert_eq!(relation("2027-", "date", "2026-", "date"), "after");
        assert_eq!(relation("2026-", "date", "2026-07", "date"), "contains");
        assert_eq!(relation("2026-07", "date", "2026-", "date"), "containedBy");
        assert_eq!(
            relation(
                "2026-07-25T10:+00:30",
                "datetime",
                "2026-07-25T10:Z",
                "datetime"
            ),
            "overlaps"
        );
        assert_eq!(relation("2026-", "date", "10:00Z", "time"), "incomparable");
    }

    #[test]
    fn constrained_path_keeps_the_stricter_host_binding_limit() {
        let namespace = ReviewNamespace(vec![
            node(
                None,
                None,
                Some(Value::SansaAddress("$.*".into())),
                vec![1, 2],
                "$",
            ),
            node(Some(0), Some("one"), string("one"), vec![], "$.one"),
            node(Some(0), Some("two"), string("two"), vec![], "$.two"),
        ]);
        let mut options = EvaluateOptions::default();
        options.resolve.max_bindings = Some(1);
        options.address_activation = AddressActivation::Constrained(AddressActivationPolicy {
            allowed_roots: vec![parse_address("$").expect("root")],
            allowed_selectors: vec![ActivationSelector::DirectExpansion],
            allow_contextual_root: false,
            max_address_depth: None,
            max_bindings: Some(5),
        });
        let output = evaluate_query("from $\nselect path(.)", &namespace, &options);
        assert_eq!(
            output.errors[0].code,
            "SANSA_QUERY_PATH_ACTIVATION_BINDING_LIMIT_EXCEEDED"
        );
        assert_eq!(output.errors[0].limit, Some(1));
    }

    #[test]
    fn constrained_path_treats_ranges_as_a_distinct_capability() {
        let namespace = ReviewNamespace(vec![node(
            None,
            None,
            Some(Value::SansaAddress("$[0..1]".into())),
            vec![],
            "$",
        )]);
        let options = EvaluateOptions {
            address_activation: AddressActivation::Constrained(AddressActivationPolicy {
                allowed_roots: vec![parse_address("$").expect("root")],
                allowed_selectors: vec![ActivationSelector::Position],
                allow_contextual_root: false,
                max_address_depth: None,
                max_bindings: None,
            }),
            ..EvaluateOptions::default()
        };
        let output = evaluate_query("from $\nselect path(.)", &namespace, &options);
        assert_eq!(output.errors[0].code, "SANSA_QUERY_PATH_ACTIVATION_DENIED");
    }

    #[test]
    fn order_comparison_errors_identify_the_offending_candidate() {
        let namespace = ReviewNamespace(vec![
            node(None, None, None, vec![1, 2], "$"),
            node(
                Some(0),
                Some("one"),
                Some(Value::FiniteNumber(
                    FiniteNumber::parse("1").expect("number"),
                )),
                vec![],
                "$.one",
            ),
            node(Some(0), Some("bad"), Some(Value::Nan), vec![], "$.bad"),
        ]);
        let output = evaluate_query(
            "from $.*\norder by .\nselect .",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert_eq!(output.errors[0].phase, Some(DiagnosticPhase::Order));
        assert_eq!(output.errors[0].candidate_address.as_deref(), Some("$.bad"));
    }

    #[test]
    fn cardinality_functions_reject_multiple_sets_and_keep_scalar_context() {
        let namespace = ReviewNamespace(vec![
            node(None, None, None, vec![1], "$"),
            node(Some(0), Some("item"), None, vec![2, 3], "$.item"),
            node(Some(1), Some("roles"), None, vec![4, 5], "$.item.roles"),
            node(
                Some(1),
                Some("needle"),
                string("MIN"),
                vec![],
                "$.item.needle",
            ),
            node(Some(2), None, string("admin"), vec![], "$.item.roles[0]"),
            node(Some(2), None, string("viewer"), vec![], "$.item.roles[1]"),
        ]);
        let invalid = evaluate_query(
            "from $.item\nwhere any(contains(.roles.*, .roles.*))\nselect .",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert_eq!(
            invalid.errors[0].code,
            "SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT"
        );
        let valid = evaluate_query(
            "from $.item\nwhere any(contains(.roles.*, lower(.needle)))\nselect .",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert!(valid.is_ok(), "{:?}", valid.errors);
        assert_eq!(valid.results.len(), 1);
    }

    #[test]
    fn missing_values_are_false_for_is_value_and_eligible_for_fallback() {
        let namespace = ReviewNamespace(vec![
            node(None, None, None, vec![1], "$"),
            node(Some(0), Some("empty"), None, vec![], "$.empty"),
        ]);
        let guard = evaluate_query(
            "from $.empty\nwhere isValue(.)\nselect .",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert!(guard.is_ok(), "{:?}", guard.errors);
        assert!(guard.results.is_empty());
        let fallback = evaluate_query(
            "from $\nselect fallback(.empty, \"replacement\")",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert!(fallback.is_ok(), "{:?}", fallback.errors);
        assert_eq!(
            fallback.results[0].value,
            EvaluatedValue::Scalar(Value::String("replacement".into()))
        );
    }

    #[test]
    fn resolve_child_rejects_duplicate_named_targets() {
        let namespace = ReviewNamespace(vec![
            node(None, None, None, vec![1, 2], "$"),
            node(Some(0), Some("dup"), string("one"), vec![], "$.dup[0]"),
            node(Some(0), Some("dup"), string("two"), vec![], "$.dup[1]"),
        ]);
        let output = evaluate_query(
            "from $\nselect resolveChild($, \"dup\")",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert_eq!(output.errors[0].code, "SANSA_QUERY_EVALUATE_CARDINALITY");
    }

    #[test]
    fn follow_requires_an_exact_existing_target() {
        let namespace = ReviewNamespace(vec![
            node(None, None, None, vec![1, 2], "$"),
            node(
                Some(0),
                Some("wild"),
                Some(Value::ReferenceForm {
                    kind: "cloneReference".into(),
                    target: "$.*".into(),
                }),
                vec![],
                "$.wild",
            ),
            node(
                Some(0),
                Some("missing"),
                Some(Value::ReferenceForm {
                    kind: "cloneReference".into(),
                    target: "$.absent".into(),
                }),
                vec![],
                "$.missing",
            ),
        ]);
        let wildcard = evaluate_query(
            "from $.wild\nselect follow(.)",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert_eq!(
            wildcard.errors[0].code,
            "SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET"
        );
        let missing = evaluate_query(
            "from $.missing\nselect follow(.)",
            &namespace,
            &EvaluateOptions::default(),
        );
        assert_eq!(
            missing.errors[0].code,
            "SANSA_QUERY_EVALUATE_MISSING_REFERENCE_TARGET"
        );
    }
}

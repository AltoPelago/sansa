//! Stable AEON minimum-consumer value semantics.

use std::cmp::Ordering;
use std::collections::BTreeMap;

pub const DEFAULT_PROFILE_ID: &str = "aeon.value.default.v1";
pub const CODEPOINT_PROFILE_ID: &str = "aeon.value.string.codepoint.v1";
pub const NATURAL_ASCII_PROFILE_ID: &str = "aeon.value.string.natural.ascii.v1";
const MAX_EXACT_NUMERIC_CHARACTERS: usize = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Profile {
    Default,
    Codepoint,
    NaturalAscii,
}

impl Profile {
    pub fn from_id(id: &str) -> Result<Self, ValueError> {
        match id {
            DEFAULT_PROFILE_ID => Ok(Self::Default),
            CODEPOINT_PROFILE_ID => Ok(Self::Codepoint),
            NATURAL_ASCII_PROFILE_ID => Ok(Self::NaturalAscii),
            _ => Err(ValueError::new(
                "unsupported_profile",
                format!("Unsupported stable value-semantics profile '{id}'"),
            )),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    FiniteNumber(FiniteNumber),
    PositiveInfinity,
    NegativeInfinity,
    Nan,
    String(String),
    Boolean(bool),
    Toggle(String),
    Hex(String),
    Radix {
        payload: String,
        semantic_type: String,
    },
    Encoding(String),
    Separator(String),
    Symbol(String),
    SansaAddress(String),
    ReferenceForm {
        kind: String,
        target: String,
    },
    Temporal {
        payload: String,
        semantic_type: String,
    },
    ExplicitNull {
        reason: String,
    },
    ExplicitAbsence {
        reason: String,
    },
    Missing,
    Container {
        kind: String,
        payload: ContainerValue,
    },
    BindingSet,
}

/// A validated, lossless finite-number lexeme.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FiniteNumber(String);

impl FiniteNumber {
    pub fn parse(value: impl Into<String>) -> Result<Self, ValueError> {
        let value = value.into();
        parse_finite_number(&value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Recursive, acyclic payload retained for structural container equality.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContainerValue {
    Null,
    Scalar(Box<Value>),
    Sequence(Vec<ContainerValue>),
    Object(BTreeMap<String, ContainerValue>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValueError {
    pub reason: &'static str,
    pub message: String,
}

impl ValueError {
    fn new(reason: &'static str, message: impl Into<String>) -> Self {
        Self {
            reason,
            message: message.into(),
        }
    }
}

#[must_use]
pub const fn is_value(value: &Value) -> bool {
    !matches!(
        value,
        Value::Nan
            | Value::ExplicitNull { .. }
            | Value::ExplicitAbsence { .. }
            | Value::Missing
            | Value::BindingSet
    )
}

pub fn equal(left: &Value, right: &Value, profile: Profile) -> Result<bool, ValueError> {
    ensure_equality_comparable(left, right)?;
    if is_numeric(left) && is_numeric(right) {
        return compare_numeric(left, right).map(|value| value == Ordering::Equal);
    }
    if !same_equality_domain(left, right) {
        return Err(mixed_categories());
    }
    Ok(match (left, right) {
        (Value::String(left), Value::String(right)) => {
            compare_strings(left, right, profile) == Ordering::Equal
        }
        (Value::Boolean(left), Value::Boolean(right)) => left == right,
        (Value::Toggle(left), Value::Toggle(right))
        | (Value::Hex(left), Value::Hex(right))
        | (Value::Encoding(left), Value::Encoding(right))
        | (Value::Separator(left), Value::Separator(right))
        | (Value::Symbol(left), Value::Symbol(right))
        | (Value::SansaAddress(left), Value::SansaAddress(right)) => left == right,
        (
            Value::Radix {
                payload: lp,
                semantic_type: lt,
            },
            Value::Radix {
                payload: rp,
                semantic_type: rt,
            },
        ) => lp == rp && lt == rt,
        (
            Value::ReferenceForm {
                kind: lk,
                target: lt,
            },
            Value::ReferenceForm {
                kind: rk,
                target: rt,
            },
        ) => lk == rk && lt == rt,
        (
            Value::Temporal {
                payload: lp,
                semantic_type: _,
            },
            Value::Temporal {
                payload: rp,
                semantic_type: _,
            },
        ) => lp == rp,
        (Value::Container { payload: left, .. }, Value::Container { payload: right, .. }) => {
            structurally_equal(left, right, profile)
        }
        _ => false,
    })
}

pub fn not_equal(left: &Value, right: &Value, profile: Profile) -> Result<bool, ValueError> {
    equal(left, right, profile).map(|value| !value)
}

pub fn compare(left: &Value, right: &Value, profile: Profile) -> Result<Ordering, ValueError> {
    ensure_orderable(left, right)?;
    if is_numeric(left) && is_numeric(right) {
        return compare_numeric(left, right);
    }
    if !same_ordering_domain(left, right) {
        return if category(left) == category(right) && !matches!(left, Value::Temporal { .. }) {
            Err(not_orderable())
        } else {
            Err(mixed_categories())
        };
    }
    Ok(match (left, right) {
        (Value::String(left), Value::String(right)) => compare_strings(left, right, profile),
        (Value::Encoding(left), Value::Encoding(right))
        | (Value::Separator(left), Value::Separator(right))
        | (Value::SansaAddress(left), Value::SansaAddress(right)) => {
            left.chars().cmp(right.chars())
        }
        (Value::Temporal { payload: left, .. }, Value::Temporal { payload: right, .. }) => {
            left.chars().cmp(right.chars())
        }
        _ => return Err(not_orderable()),
    })
}

fn ensure_equality_comparable(left: &Value, right: &Value) -> Result<(), ValueError> {
    if matches!(
        left,
        Value::Nan | Value::ExplicitNull { .. } | Value::ExplicitAbsence { .. }
    ) || matches!(
        right,
        Value::Nan | Value::ExplicitNull { .. } | Value::ExplicitAbsence { .. }
    ) {
        return Err(ValueError::new(
            "not_equality_comparable",
            "Value category is not equality-comparable in the minimum profile",
        ));
    }
    if matches!(left, Value::Missing | Value::BindingSet)
        || matches!(right, Value::Missing | Value::BindingSet)
    {
        return Err(ValueError::new(
            "not_equality_comparable",
            "Evaluation state or non-scalar value is not equality-comparable",
        ));
    }
    Ok(())
}

fn ensure_orderable(left: &Value, right: &Value) -> Result<(), ValueError> {
    if matches!(
        left,
        Value::Nan | Value::ExplicitNull { .. } | Value::ExplicitAbsence { .. }
    ) || matches!(
        right,
        Value::Nan | Value::ExplicitNull { .. } | Value::ExplicitAbsence { .. }
    ) {
        return Err(not_orderable());
    }
    if matches!(
        left,
        Value::Missing | Value::Container { .. } | Value::BindingSet
    ) || matches!(
        right,
        Value::Missing | Value::Container { .. } | Value::BindingSet
    ) || matches!((left, right), (Value::Boolean(_), Value::Boolean(_)))
    {
        return Err(not_orderable());
    }
    Ok(())
}

fn same_equality_domain(left: &Value, right: &Value) -> bool {
    if is_numeric(left) && is_numeric(right) {
        return true;
    }
    match (left, right) {
        (
            Value::Temporal {
                semantic_type: left,
                ..
            },
            Value::Temporal {
                semantic_type: right,
                ..
            },
        ) => left == right,
        (Value::Container { kind: left, .. }, Value::Container { kind: right, .. }) => {
            left == right
        }
        _ => {
            category(left) == category(right)
                && matches!(
                    left,
                    Value::String(_)
                        | Value::Boolean(_)
                        | Value::Toggle(_)
                        | Value::Hex(_)
                        | Value::Radix { .. }
                        | Value::Encoding(_)
                        | Value::Separator(_)
                        | Value::Symbol(_)
                        | Value::SansaAddress(_)
                        | Value::ReferenceForm { .. }
                )
        }
    }
}

fn same_ordering_domain(left: &Value, right: &Value) -> bool {
    if is_numeric(left) && is_numeric(right) {
        return true;
    }
    match (left, right) {
        (
            Value::Temporal {
                semantic_type: left,
                ..
            },
            Value::Temporal {
                semantic_type: right,
                ..
            },
        ) => left == right,
        _ => {
            category(left) == category(right)
                && matches!(
                    left,
                    Value::String(_)
                        | Value::Encoding(_)
                        | Value::Separator(_)
                        | Value::SansaAddress(_)
                )
        }
    }
}

fn category(value: &Value) -> &'static str {
    match value {
        Value::FiniteNumber(_) => "finiteNumber",
        Value::PositiveInfinity => "positiveInfinity",
        Value::NegativeInfinity => "negativeInfinity",
        Value::Nan => "nan",
        Value::String(_) => "string",
        Value::Boolean(_) => "boolean",
        Value::Toggle(_) => "toggle",
        Value::Hex(_) => "hex",
        Value::Radix { .. } => "radix",
        Value::Encoding(_) => "encoding",
        Value::Separator(_) => "separator",
        Value::Symbol(_) => "symbol",
        Value::SansaAddress(_) => "sansaAddress",
        Value::ReferenceForm { .. } => "referenceForm",
        Value::Temporal { .. } => "temporal",
        Value::ExplicitNull { .. } => "explicitNull",
        Value::ExplicitAbsence { .. } => "explicitAbsence",
        Value::Missing => "missing",
        Value::Container { .. } => "container",
        Value::BindingSet => "bindingSet",
    }
}

const fn is_numeric(value: &Value) -> bool {
    matches!(
        value,
        Value::FiniteNumber(_) | Value::PositiveInfinity | Value::NegativeInfinity
    )
}

fn compare_numeric(left: &Value, right: &Value) -> Result<Ordering, ValueError> {
    match (left, right) {
        (Value::NegativeInfinity, Value::NegativeInfinity)
        | (Value::PositiveInfinity, Value::PositiveInfinity) => Ok(Ordering::Equal),
        (Value::NegativeInfinity, _) | (_, Value::PositiveInfinity) => Ok(Ordering::Less),
        (Value::PositiveInfinity, _) | (_, Value::NegativeInfinity) => Ok(Ordering::Greater),
        (Value::FiniteNumber(left), Value::FiniteNumber(right)) => {
            compare_finite_numbers(left.as_str(), right.as_str())
        }
        _ => Err(mixed_categories()),
    }
}

fn structurally_equal(left: &ContainerValue, right: &ContainerValue, profile: Profile) -> bool {
    match (left, right) {
        (ContainerValue::Null, ContainerValue::Null) => true,
        (ContainerValue::Scalar(left), ContainerValue::Scalar(right)) => {
            equal(left, right, profile).unwrap_or(false)
        }
        (ContainerValue::Sequence(left), ContainerValue::Sequence(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(left, right)| structurally_equal(left, right, profile))
        }
        (ContainerValue::Object(left), ContainerValue::Object(right)) => {
            left.len() == right.len()
                && left.iter().all(|(key, left)| {
                    right
                        .get(key)
                        .is_some_and(|right| structurally_equal(left, right, profile))
                })
        }
        _ => false,
    }
}

fn compare_strings(left: &str, right: &str, profile: Profile) -> Ordering {
    match profile {
        Profile::Default | Profile::Codepoint => left.chars().cmp(right.chars()),
        Profile::NaturalAscii => compare_natural_ascii(left, right),
    }
}

fn compare_natural_ascii(left: &str, right: &str) -> Ordering {
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let (mut li, mut ri) = (0, 0);
    while li < left_chars.len() && ri < right_chars.len() {
        if left_chars[li].is_ascii_digit() && right_chars[ri].is_ascii_digit() {
            let le = digit_run_end(&left_chars, li);
            let re = digit_run_end(&right_chars, ri);
            let order = compare_digit_runs(&left_chars[li..le], &right_chars[ri..re]);
            if order != Ordering::Equal {
                return order;
            }
            li = le;
            ri = re;
        } else {
            let order = left_chars[li].cmp(&right_chars[ri]);
            if order != Ordering::Equal {
                return order;
            }
            li += 1;
            ri += 1;
        }
    }
    (left_chars.len() - li).cmp(&(right_chars.len() - ri))
}

fn digit_run_end(chars: &[char], start: usize) -> usize {
    let mut end = start;
    while end < chars.len() && chars[end].is_ascii_digit() {
        end += 1;
    }
    end
}

fn compare_digit_runs(left: &[char], right: &[char]) -> Ordering {
    let li = left
        .iter()
        .position(|ch| *ch != '0')
        .unwrap_or(left.len().saturating_sub(1));
    let ri = right
        .iter()
        .position(|ch| *ch != '0')
        .unwrap_or(right.len().saturating_sub(1));
    let order = (left.len() - li)
        .cmp(&(right.len() - ri))
        .then_with(|| left[li..].cmp(&right[ri..]));
    if order == Ordering::Equal {
        left.len().cmp(&right.len())
    } else {
        order
    }
}

#[derive(Debug)]
struct ParsedNumber {
    sign: i8,
    digits: String,
    order: SignedDecimal,
}

fn compare_finite_numbers(left: &str, right: &str) -> Result<Ordering, ValueError> {
    let left = parse_finite_number(left)?;
    let right = parse_finite_number(right)?;
    let sign_order = left.sign.cmp(&right.sign);
    if sign_order != Ordering::Equal {
        return Ok(sign_order);
    }
    if left.sign == 0 {
        return Ok(Ordering::Equal);
    }
    let mut order = left.order.cmp(&right.order);
    if order == Ordering::Equal {
        let width = left.digits.len().max(right.digits.len());
        order = left
            .digits
            .bytes()
            .chain(std::iter::repeat(b'0'))
            .take(width)
            .cmp(
                right
                    .digits
                    .bytes()
                    .chain(std::iter::repeat(b'0'))
                    .take(width),
            );
    }
    Ok(if left.sign < 0 {
        order.reverse()
    } else {
        order
    })
}

fn parse_finite_number(value: &str) -> Result<ParsedNumber, ValueError> {
    if value.is_empty() || value.len() > MAX_EXACT_NUMERIC_CHARACTERS || !value.is_ascii() {
        return Err(invalid_number());
    }
    let bytes = value.as_bytes();
    let mut index = 0;
    let negative = match bytes.first() {
        Some(b'-') => {
            index = 1;
            true
        }
        Some(b'+') => {
            index = 1;
            false
        }
        _ => false,
    };
    let integer_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    let integer_end = index;
    if integer_end - integer_start > 1 && bytes[integer_start] == b'0' {
        return Err(invalid_number());
    }
    let mut fraction_start = index;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == fraction_start {
            return Err(invalid_number());
        }
    }
    if integer_end == integer_start && fraction_start == integer_start {
        return Err(invalid_number());
    }
    let fraction_end = index;
    let exponent = if matches!(bytes.get(index), Some(b'e' | b'E')) {
        index += 1;
        let start = index;
        if matches!(bytes.get(index), Some(b'+' | b'-')) {
            index += 1;
        }
        let digit_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == digit_start {
            return Err(invalid_number());
        }
        SignedDecimal::parse(&value[start..index])?
    } else {
        SignedDecimal::zero()
    };
    if index != bytes.len() {
        return Err(invalid_number());
    }
    let raw_digits = format!(
        "{}{}",
        &value[integer_start..integer_end],
        &value[fraction_start..fraction_end]
    );
    let digits = raw_digits.trim_start_matches('0');
    if digits.is_empty() {
        return Ok(ParsedNumber {
            sign: 0,
            digits: "0".into(),
            order: SignedDecimal::zero(),
        });
    }
    let adjustment = digits.len() as i64 - (fraction_end - fraction_start) as i64;
    Ok(ParsedNumber {
        sign: if negative { -1 } else { 1 },
        digits: digits.into(),
        order: exponent.add_small(adjustment),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SignedDecimal {
    negative: bool,
    magnitude: String,
}

impl SignedDecimal {
    fn zero() -> Self {
        Self {
            negative: false,
            magnitude: "0".into(),
        }
    }
    fn parse(value: &str) -> Result<Self, ValueError> {
        let (negative, unsigned) = match value.as_bytes().first() {
            Some(b'-') => (true, &value[1..]),
            Some(b'+') => (false, &value[1..]),
            _ => (false, value),
        };
        if unsigned.is_empty() || !unsigned.bytes().all(|ch| ch.is_ascii_digit()) {
            return Err(invalid_number());
        }
        let magnitude = unsigned.trim_start_matches('0');
        Ok(if magnitude.is_empty() {
            Self::zero()
        } else {
            Self {
                negative,
                magnitude: magnitude.into(),
            }
        })
    }
    fn add_small(self, value: i64) -> Self {
        if value == 0 {
            return self;
        }
        let other = Self {
            negative: value < 0,
            magnitude: value.unsigned_abs().to_string(),
        };
        if self.negative == other.negative {
            return Self {
                negative: self.negative,
                magnitude: add_unsigned(&self.magnitude, &other.magnitude),
            };
        }
        match cmp_unsigned(&self.magnitude, &other.magnitude) {
            Ordering::Equal => Self::zero(),
            Ordering::Greater => Self {
                negative: self.negative,
                magnitude: subtract_unsigned(&self.magnitude, &other.magnitude),
            },
            Ordering::Less => Self {
                negative: other.negative,
                magnitude: subtract_unsigned(&other.magnitude, &self.magnitude),
            },
        }
    }
}

impl Ord for SignedDecimal {
    fn cmp(&self, other: &Self) -> Ordering {
        if self.negative != other.negative {
            return if self.negative {
                Ordering::Less
            } else {
                Ordering::Greater
            };
        }
        let order = cmp_unsigned(&self.magnitude, &other.magnitude);
        if self.negative {
            order.reverse()
        } else {
            order
        }
    }
}
impl PartialOrd for SignedDecimal {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn cmp_unsigned(left: &str, right: &str) -> Ordering {
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn add_unsigned(left: &str, right: &str) -> String {
    let mut carry = 0u8;
    let mut output = Vec::new();
    let mut li = left.bytes().rev();
    let mut ri = right.bytes().rev();
    loop {
        let l = li.next().map(|ch| ch - b'0');
        let r = ri.next().map(|ch| ch - b'0');
        if l.is_none() && r.is_none() && carry == 0 {
            break;
        }
        let sum = l.unwrap_or(0) + r.unwrap_or(0) + carry;
        output.push(b'0' + sum % 10);
        carry = sum / 10;
    }
    output.reverse();
    String::from_utf8(output).unwrap_or_else(|_| "0".into())
}

fn subtract_unsigned(left: &str, right: &str) -> String {
    let mut borrow = 0i8;
    let mut output = Vec::new();
    let mut right_digits = right.bytes().rev();
    for l in left.bytes().rev() {
        let mut digit =
            (l - b'0') as i8 - borrow - right_digits.next().map_or(0, |r| (r - b'0') as i8);
        if digit < 0 {
            digit += 10;
            borrow = 1;
        } else {
            borrow = 0;
        }
        output.push(b'0' + digit as u8);
    }
    while output.len() > 1 && output.last() == Some(&b'0') {
        output.pop();
    }
    output.reverse();
    String::from_utf8(output).unwrap_or_else(|_| "0".into())
}

fn mixed_categories() -> ValueError {
    ValueError::new(
        "mixed_categories",
        "Mixed categories do not compare by implicit coercion",
    )
}
fn not_orderable() -> ValueError {
    ValueError::new(
        "not_orderable",
        "Value category is not orderable in the minimum profile",
    )
}
fn invalid_number() -> ValueError {
    ValueError::new(
        "invalid_value_descriptor",
        "finiteNumber must contain a canonical finite numeric value",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_numbers_do_not_round_through_host_floats() {
        assert_eq!(
            compare_finite_numbers("9007199254740993", "9007199254740992"),
            Ok(Ordering::Greater)
        );
        assert_eq!(
            compare_finite_numbers("1e999999999999999999999", "9e999999999999999999998"),
            Ok(Ordering::Greater)
        );
        assert_eq!(compare_finite_numbers("-0.00", "0"), Ok(Ordering::Equal));
    }

    #[test]
    fn finite_numbers_are_validated_before_becoming_values() {
        assert_eq!(
            FiniteNumber::parse("invalid").map(Value::FiniteNumber),
            Err(invalid_number())
        );
        let finite = Value::FiniteNumber(FiniteNumber::parse("1").expect("valid fixture"));
        assert_eq!(
            compare(&finite, &Value::PositiveInfinity, Profile::Default),
            Ok(Ordering::Less)
        );
    }

    #[test]
    fn container_equality_retains_and_recurses_through_payloads() {
        let container = |number| Value::Container {
            kind: "object".into(),
            payload: ContainerValue::Object(BTreeMap::from([(
                "count".into(),
                ContainerValue::Scalar(Box::new(Value::FiniteNumber(
                    FiniteNumber::parse(number).expect("valid fixture"),
                ))),
            )])),
        };
        assert_eq!(
            equal(&container("1"), &container("1.0"), Profile::Default),
            Ok(true)
        );
        assert_eq!(
            equal(&container("1"), &container("2"), Profile::Default),
            Ok(false)
        );
    }

    #[test]
    fn natural_ascii_compares_digit_runs_numerically() {
        assert_eq!(compare_natural_ascii("part-2", "part-10"), Ordering::Less);
        assert_eq!(
            compare_natural_ascii("part-02", "part-2"),
            Ordering::Greater
        );
    }
}

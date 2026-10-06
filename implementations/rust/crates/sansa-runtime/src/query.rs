//! Bounded, host-neutral SANSA Query syntax parsing.

use crate::address::{Address, Root, parse_address, render_address};

const MAX_QUERY_INTEGER: u64 = 9_007_199_254_740_991;

/// Resource ceilings applied while parsing query source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseLimits {
    pub max_input_bytes: usize,
    pub max_tokens: usize,
    pub max_ast_nodes: usize,
    pub max_nesting_depth: usize,
    pub max_literal_bytes: usize,
}

impl Default for ParseLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: 1_048_576,
            max_tokens: 65_536,
            max_ast_nodes: 32_768,
            max_nesting_depth: 128,
            max_literal_bytes: 65_536,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Query {
    pub from: FromClause,
    pub where_clause: Option<ExpressionClause>,
    pub order_by: Option<OrderByClause>,
    pub offset: Option<u64>,
    pub limit: Option<u64>,
    pub select: ExpressionClause,
    pub clauses: Vec<ClauseName>,
    pub canonical: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClauseName {
    From,
    Where,
    Order,
    Offset,
    Limit,
    Select,
}

impl ClauseName {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::From => "from",
            Self::Where => "where",
            Self::Order => "order",
            Self::Offset => "offset",
            Self::Limit => "limit",
            Self::Select => "select",
        }
    }

    const fn order(self) -> usize {
        match self {
            Self::From => 0,
            Self::Where => 1,
            Self::Order => 2,
            Self::Offset => 3,
            Self::Limit => 4,
            Self::Select => 5,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FromClause {
    Address(Address),
    Path(Expression),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExpressionClause {
    pub expression: String,
    pub ast: Expression,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderByClause {
    pub keys: Vec<OrderKey>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderKey {
    pub expression: String,
    pub ast: Expression,
    pub direction: OrderDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderDirection {
    Asc,
    Desc,
}

impl OrderDirection {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expression {
    Literal(Literal),
    CurrentBinding,
    Resolution {
        scope: ResolutionScope,
        address: Address,
        canonical: String,
    },
    Group(Box<Expression>),
    Unary {
        operator: UnaryOperator,
        argument: Box<Expression>,
    },
    Binary {
        operator: BinaryOperator,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    FunctionCall {
        name: String,
        arguments: Vec<Expression>,
    },
    Existence {
        operator: ExistenceOperator,
        argument: Box<Expression>,
    },
    Cardinality {
        operator: CardinalityOperator,
        argument: Box<Expression>,
    },
    Projection {
        fields: Vec<ProjectionField>,
    },
}

impl Expression {
    #[must_use]
    pub const fn kind(&self) -> &'static str {
        match self {
            Self::Literal(_) => "literalExpression",
            Self::CurrentBinding => "currentBindingExpression",
            Self::Resolution { .. } => "resolutionExpression",
            Self::Group(_) => "groupExpression",
            Self::Unary { .. } => "unaryExpression",
            Self::Binary { .. } => "binaryExpression",
            Self::FunctionCall { .. } => "functionCallExpression",
            Self::Existence { .. } => "existenceExpression",
            Self::Cardinality { .. } => "cardinalityExpression",
            Self::Projection { .. } => "projectionExpression",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectionField {
    pub name: String,
    pub expression: Expression,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolutionScope {
    Current,
    Absolute,
    Contextual,
}

impl ResolutionScope {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::Absolute => "absolute",
            Self::Contextual => "contextual",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Literal {
    pub kind: LiteralKind,
    pub value: LiteralValue,
    pub canonical: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LiteralKind {
    String,
    Number,
    Boolean,
    Toggle,
    Hex,
    Radix,
    Encoding,
    Separator,
    Symbol,
    Date,
    Time,
    Datetime,
    Wtc,
    Null,
}

impl LiteralKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::String => "string",
            Self::Number => "number",
            Self::Boolean => "boolean",
            Self::Toggle => "toggle",
            Self::Hex => "hex",
            Self::Radix => "radix",
            Self::Encoding => "encoding",
            Self::Separator => "separator",
            Self::Symbol => "symbol",
            Self::Date => "date",
            Self::Time => "time",
            Self::Datetime => "datetime",
            Self::Wtc => "wtc",
            Self::Null => "null",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LiteralValue {
    Text(String),
    Number(String),
    Boolean(bool),
    Null { reason: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnaryOperator {
    Not,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOperator {
    Or,
    And,
    Equal,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    In,
}

impl BinaryOperator {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Or => "or",
            Self::And => "and",
            Self::Equal => "==",
            Self::NotEqual => "!=",
            Self::Less => "<",
            Self::LessEqual => "<=",
            Self::Greater => ">",
            Self::GreaterEqual => ">=",
            Self::In => "in",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExistenceOperator {
    Exists,
    Absent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardinalityOperator {
    Any,
    All,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub code: String,
    pub message: String,
    pub index: usize,
}

impl ParseError {
    fn new(code: impl Into<String>, message: impl Into<String>, index: usize) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            index,
        }
    }
}

#[derive(Default)]
struct Budget {
    tokens: usize,
    nodes: usize,
}

impl Budget {
    fn token(&mut self, limits: ParseLimits, index: usize) -> Result<(), ParseError> {
        self.tokens = self.tokens.saturating_add(1);
        if self.tokens > limits.max_tokens {
            return Err(limit_error("tokens", limits.max_tokens, index));
        }
        Ok(())
    }

    fn node(&mut self, limits: ParseLimits, index: usize) -> Result<(), ParseError> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > limits.max_ast_nodes {
            return Err(limit_error("AST nodes", limits.max_ast_nodes, index));
        }
        Ok(())
    }
}

fn limit_error(name: &str, limit: usize, index: usize) -> ParseError {
    ParseError::new(
        "SANSA_QUERY_PARSE_LIMIT_EXCEEDED",
        format!("SANSA Query {name} exceed the configured limit of {limit}"),
        index,
    )
}

pub fn parse_query(input: &str) -> Result<Query, ParseError> {
    parse_query_with_limits(input, ParseLimits::default())
}

pub fn parse_query_with_limits(input: &str, limits: ParseLimits) -> Result<Query, ParseError> {
    check_input(input, limits)?;
    let source = strip_comments(input)?;
    if source.trim().is_empty() {
        return Err(ParseError::new(
            "SANSA_QUERY_EMPTY",
            "Expected SANSA query",
            0,
        ));
    }
    let clauses = scan_clauses(&source);
    let first = clauses.first();
    if first.is_none_or(|clause| clause.name != ClauseName::From)
        || first.is_some_and(|clause| !source[..clause.start].trim().is_empty())
    {
        return Err(ParseError::new(
            "SANSA_QUERY_EXPECTED_FROM",
            "Expected 'from' clause",
            first.map_or(0, |clause| clause.start),
        ));
    }
    let mut seen = [false; 6];
    let mut previous = 0;
    let mut saw_select = false;
    for clause in &clauses {
        if saw_select {
            return Err(ParseError::new(
                "SANSA_QUERY_SELECT_MUST_BE_TERMINAL",
                "'select' must be the terminal SANSA query clause",
                clause.start,
            ));
        }
        let order = clause.name.order();
        if seen[order] {
            return Err(ParseError::new(
                "SANSA_QUERY_DUPLICATE_CLAUSE",
                format!("Duplicate SANSA query clause '{}'", clause.name.as_str()),
                clause.start,
            ));
        }
        if order < previous {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_CLAUSE_ORDER",
                format!(
                    "SANSA query clause '{}' is out of order",
                    clause.name.as_str()
                ),
                clause.start,
            ));
        }
        seen[order] = true;
        previous = order;
        saw_select = clause.name == ClauseName::Select;
    }
    if !seen[ClauseName::Select.order()] {
        return Err(ParseError::new(
            "SANSA_QUERY_EXPECTED_SELECT",
            "Expected 'select' clause",
            source.len(),
        ));
    }

    let mut budget = Budget::default();
    let get = |name| clauses.iter().find(|clause| clause.name == name);
    let from_clause = get(ClauseName::From).expect("from clause checked");
    let from = parse_from_clause(from_clause, limits, &mut budget)?;
    let where_clause = get(ClauseName::Where)
        .map(|clause| parse_expression_clause(clause, limits, &mut budget, "where"))
        .transpose()?;
    let order_by = get(ClauseName::Order)
        .map(|clause| parse_order_clause(clause, limits, &mut budget))
        .transpose()?;
    let offset = get(ClauseName::Offset)
        .map(|clause| parse_integer_clause(clause, false))
        .transpose()?;
    let limit = get(ClauseName::Limit)
        .map(|clause| parse_integer_clause(clause, true))
        .transpose()?;
    let select = parse_expression_clause(
        get(ClauseName::Select).expect("select clause checked"),
        limits,
        &mut budget,
        "select",
    )?;
    let clause_names = clauses.iter().map(|clause| clause.name).collect();
    let mut query = Query {
        from,
        where_clause,
        order_by,
        offset,
        limit,
        select,
        clauses: clause_names,
        canonical: String::new(),
    };
    query.canonical = render_query(&query);
    Ok(query)
}

pub fn parse_expression(input: &str) -> Result<Expression, ParseError> {
    parse_expression_with_limits(input, ParseLimits::default())
}

pub fn parse_expression_with_limits(
    input: &str,
    limits: ParseLimits,
) -> Result<Expression, ParseError> {
    check_input(input, limits)?;
    let source = normalize_layout(&strip_comments(input)?);
    let mut budget = Budget::default();
    parse_expression_inner(&source, limits, 0, &mut budget)
}

fn parse_expression_inner(
    source: &str,
    limits: ParseLimits,
    depth: usize,
    budget: &mut Budget,
) -> Result<Expression, ParseError> {
    if depth > limits.max_nesting_depth {
        return Err(limit_error("nesting depth", limits.max_nesting_depth, 0));
    }
    let mut parser = ExpressionParser {
        input: source,
        index: 0,
        limits,
        depth,
        budget,
    };
    if source.is_empty() {
        return Err(parser.error(
            "SANSA_QUERY_EXPECTED_EXPRESSION",
            "Expected SANSA query expression",
        ));
    }
    let expression = parser.parse_or()?;
    parser.skip_layout();
    if !parser.at_end() {
        return Err(parser.error(
            "SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN",
            "Unexpected query expression token",
        ));
    }
    Ok(expression)
}

#[must_use]
pub fn render_query(query: &Query) -> String {
    let mut lines = vec![format!(
        "from {}",
        match &query.from {
            FromClause::Address(address) => render_address(address),
            FromClause::Path(expression) => render_expression(expression),
        }
    )];
    if let Some(clause) = &query.where_clause {
        lines.push(format!("where {}", render_expression(&clause.ast)));
    }
    if let Some(order) = &query.order_by {
        lines.push(format!(
            "order by {}",
            order
                .keys
                .iter()
                .map(|key| format!("{} {}", render_expression(&key.ast), key.direction.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if let Some(offset) = query.offset {
        lines.push(format!("offset {offset}"));
    }
    if let Some(limit) = query.limit {
        lines.push(format!("limit {limit}"));
    }
    lines.push(format!("select {}", render_expression(&query.select.ast)));
    lines.join("\n")
}

#[must_use]
pub fn render_expression(expression: &Expression) -> String {
    enum Task<'a> {
        Expression(&'a Expression),
        Text(&'a str),
    }

    let mut rendered = String::new();
    let mut tasks = vec![Task::Expression(expression)];
    while let Some(task) = tasks.pop() {
        let Task::Expression(expression) = task else {
            let Task::Text(text) = task else {
                unreachable!();
            };
            rendered.push_str(text);
            continue;
        };
        match expression {
            Expression::Literal(literal) => rendered.push_str(&literal.canonical),
            Expression::CurrentBinding => rendered.push('.'),
            Expression::Resolution { canonical, .. } => rendered.push_str(canonical),
            Expression::Group(inner) => {
                tasks.push(Task::Text(")"));
                tasks.push(Task::Expression(inner));
                tasks.push(Task::Text("("));
            }
            Expression::Unary { argument, .. } => {
                tasks.push(Task::Expression(argument));
                tasks.push(Task::Text("not "));
            }
            Expression::Binary {
                operator,
                left,
                right,
            } => {
                tasks.push(Task::Expression(right));
                tasks.push(Task::Text(" "));
                tasks.push(Task::Text(operator.as_str()));
                tasks.push(Task::Text(" "));
                tasks.push(Task::Expression(left));
            }
            Expression::FunctionCall { name, arguments } => {
                tasks.push(Task::Text(")"));
                for (index, argument) in arguments.iter().enumerate().rev() {
                    tasks.push(Task::Expression(argument));
                    if index > 0 {
                        tasks.push(Task::Text(", "));
                    }
                }
                tasks.push(Task::Text("("));
                tasks.push(Task::Text(name));
            }
            Expression::Existence { operator, argument } => {
                tasks.push(Task::Text(")"));
                tasks.push(Task::Expression(argument));
                tasks.push(Task::Text(match operator {
                    ExistenceOperator::Exists => "exists(",
                    ExistenceOperator::Absent => "absent(",
                }));
            }
            Expression::Cardinality { operator, argument } => {
                tasks.push(Task::Text(")"));
                tasks.push(Task::Expression(argument));
                tasks.push(Task::Text(match operator {
                    CardinalityOperator::Any => "any(",
                    CardinalityOperator::All => "all(",
                    CardinalityOperator::None => "none(",
                }));
            }
            Expression::Projection { fields } => {
                tasks.push(Task::Text(" }"));
                for (index, field) in fields.iter().enumerate().rev() {
                    tasks.push(Task::Expression(&field.expression));
                    tasks.push(Task::Text(" = "));
                    tasks.push(Task::Text(&field.name));
                    if index > 0 {
                        tasks.push(Task::Text(" "));
                    }
                }
                tasks.push(Task::Text("{ "));
            }
        }
    }
    rendered
}

#[derive(Debug)]
struct ScannedClause {
    name: ClauseName,
    start: usize,
    body_start: usize,
    body: String,
}

fn scan_clauses(source: &str) -> Vec<ScannedClause> {
    let mut found = Vec::<(ClauseName, usize, usize)>::new();
    let mut quote = None;
    let mut parens = 0;
    let mut brackets = 0;
    let mut braces = 0;
    let mut index = 0;
    while index < source.len() {
        let Some(ch) = char_at(source, index) else {
            break;
        };
        if let Some(delimiter) = quote {
            if ch == '\\' {
                index += ch.len_utf8();
                if let Some(next) = char_at(source, index) {
                    index += next.len_utf8();
                }
                continue;
            }
            if ch == delimiter {
                quote = None;
            }
            index += ch.len_utf8();
            continue;
        }
        if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(source, index)) {
            quote = Some(ch);
            index += ch.len_utf8();
            continue;
        }
        match ch {
            '(' => parens += 1,
            ')' if parens > 0 => parens -= 1,
            '[' => brackets += 1,
            ']' if brackets > 0 => brackets -= 1,
            '{' => braces += 1,
            '}' if braces > 0 => braces -= 1,
            _ => {}
        }
        if parens == 0
            && brackets == 0
            && braces == 0
            && let Some((name, end)) = match_clause(source, index)
        {
            found.push((name, index, end));
            index = end;
            continue;
        }
        index += ch.len_utf8();
    }
    found
        .iter()
        .enumerate()
        .map(|(position, (name, start, body_start))| ScannedClause {
            name: *name,
            start: *start,
            body_start: *body_start,
            body: source[*body_start..found.get(position + 1).map_or(source.len(), |v| v.1)]
                .to_owned(),
        })
        .collect()
}

fn match_clause(source: &str, index: usize) -> Option<(ClauseName, usize)> {
    if index > 0 && !char_at(source, previous_char_index(source, index)?).is_some_and(is_layout) {
        return None;
    }
    if source[index..].starts_with("order") && boundary_after(source, index + 5) {
        let mut cursor = index + 5;
        let gap = cursor;
        while char_at(source, cursor).is_some_and(is_layout) {
            cursor += char_at(source, cursor)?.len_utf8();
        }
        if cursor > gap && source[cursor..].starts_with("by") && boundary_after(source, cursor + 2)
        {
            return Some((ClauseName::Order, cursor + 2));
        }
    }
    for (text, name) in [
        ("from", ClauseName::From),
        ("where", ClauseName::Where),
        ("offset", ClauseName::Offset),
        ("limit", ClauseName::Limit),
        ("select", ClauseName::Select),
    ] {
        if source[index..].starts_with(text) && boundary_after(source, index + text.len()) {
            return Some((name, index + text.len()));
        }
    }
    None
}

fn boundary_after(source: &str, index: usize) -> bool {
    index == source.len() || char_at(source, index).is_some_and(is_layout)
}

fn parse_from_clause(
    clause: &ScannedClause,
    limits: ParseLimits,
    budget: &mut Budget,
) -> Result<FromClause, ParseError> {
    let source = normalize_layout(&clause.body);
    if source.is_empty() {
        return Err(ParseError::new(
            "SANSA_QUERY_EXPECTED_FROM_ADDRESS",
            "Expected SANSA address after 'from'",
            clause.body_start,
        ));
    }
    if source.starts_with('$') || source.starts_with('?') {
        if source.chars().any(is_layout) {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_FROM_ADDRESS",
                "Expected a single SANSA address after 'from'",
                clause.body_start,
            ));
        }
        return parse_address(&source)
            .map(FromClause::Address)
            .map_err(|error| {
                ParseError::new(error.code, error.message, clause.body_start + error.index)
            });
    }
    let expression = parse_expression_inner(&source, limits, 0, budget)?;
    if !matches!(&expression, Expression::FunctionCall { name, .. } if name == "path") {
        return Err(ParseError::new(
            "SANSA_QUERY_INVALID_FROM_SOURCE",
            "Expected SANSA address or path(...) after 'from'",
            clause.body_start,
        ));
    }
    Ok(FromClause::Path(expression))
}

fn parse_expression_clause(
    clause: &ScannedClause,
    limits: ParseLimits,
    budget: &mut Budget,
    label: &str,
) -> Result<ExpressionClause, ParseError> {
    let source = normalize_layout(&clause.body);
    if source.is_empty() {
        return Err(ParseError::new(
            format!("SANSA_QUERY_EXPECTED_{}_EXPRESSION", label.to_uppercase()),
            format!("Expected expression after '{label}'"),
            clause.body_start,
        ));
    }
    let ast = parse_expression_inner(&source, limits, 0, budget)?;
    Ok(ExpressionClause {
        expression: render_expression(&ast),
        ast,
    })
}

fn parse_order_clause(
    clause: &ScannedClause,
    limits: ParseLimits,
    budget: &mut Budget,
) -> Result<OrderByClause, ParseError> {
    let source = normalize_layout(&clause.body);
    if source.is_empty() {
        return Err(ParseError::new(
            "SANSA_QUERY_EXPECTED_ORDER_EXPRESSION",
            "Expected expression after 'order by'",
            clause.body_start,
        ));
    }
    let mut keys = Vec::new();
    for part in split_top_level(&source, ',') {
        let normalized = normalize_layout(part);
        let (body, direction) = if let Some(value) = normalized.strip_suffix(" desc") {
            (value.trim_end(), OrderDirection::Desc)
        } else if let Some(value) = normalized.strip_suffix(" asc") {
            (value.trim_end(), OrderDirection::Asc)
        } else {
            (normalized.as_str(), OrderDirection::Asc)
        };
        if body.is_empty() {
            return Err(ParseError::new(
                "SANSA_QUERY_EXPECTED_ORDER_EXPRESSION",
                "Expected order key expression",
                clause.body_start,
            ));
        }
        let ast = parse_expression_inner(body, limits, 0, budget)?;
        keys.push(OrderKey {
            expression: render_expression(&ast),
            ast,
            direction,
        });
    }
    Ok(OrderByClause { keys })
}

fn parse_integer_clause(clause: &ScannedClause, is_limit: bool) -> Result<u64, ParseError> {
    let source = normalize_layout(&clause.body);
    let code = if is_limit {
        "SANSA_QUERY_INVALID_LIMIT"
    } else {
        "SANSA_QUERY_INVALID_OFFSET"
    };
    if source.is_empty()
        || !source.bytes().all(|byte| byte.is_ascii_digit())
        || (source.len() > 1 && source.starts_with('0'))
    {
        return Err(ParseError::new(
            code,
            "Expected non-negative integer",
            clause.body_start,
        ));
    }
    let value = source
        .parse::<u64>()
        .map_err(|_| ParseError::new(code, "Query integer is too large", clause.body_start))?;
    if value > MAX_QUERY_INTEGER {
        return Err(ParseError::new(
            code,
            "Query integer is too large",
            clause.body_start,
        ));
    }
    Ok(value)
}

struct ExpressionParser<'a, 'b> {
    input: &'a str,
    index: usize,
    limits: ParseLimits,
    depth: usize,
    budget: &'b mut Budget,
}

impl ExpressionParser<'_, '_> {
    fn parse_or(&mut self) -> Result<Expression, ParseError> {
        let mut left = self.parse_and()?;
        while self.match_keyword("or")? {
            let right = self.parse_and()?;
            left = self.binary(BinaryOperator::Or, left, right)?;
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expression, ParseError> {
        let mut left = self.parse_not()?;
        while self.match_keyword("and")? {
            let right = self.parse_not()?;
            left = self.binary(BinaryOperator::And, left, right)?;
        }
        Ok(left)
    }

    fn parse_not(&mut self) -> Result<Expression, ParseError> {
        let mut count = 0;
        while self.match_keyword("not")? {
            count += 1;
            if self.depth + count > self.limits.max_nesting_depth {
                return Err(limit_error(
                    "nesting depth",
                    self.limits.max_nesting_depth,
                    self.index,
                ));
            }
        }
        let mut expression = self.parse_comparison()?;
        for _ in 0..count {
            self.node()?;
            expression = Expression::Unary {
                operator: UnaryOperator::Not,
                argument: Box::new(expression),
            };
        }
        Ok(expression)
    }

    fn parse_comparison(&mut self) -> Result<Expression, ParseError> {
        let left = self.parse_primary()?;
        let Some(operator) = self.match_comparison()? else {
            return Ok(left);
        };
        let right = self.parse_primary()?;
        let expression = self.binary(operator, left, right)?;
        self.skip_layout();
        if self.match_comparison()?.is_some() {
            return Err(self.error(
                "SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN",
                "Chained comparison expressions are not supported",
            ));
        }
        Ok(expression)
    }

    fn parse_primary(&mut self) -> Result<Expression, ParseError> {
        self.skip_layout();
        let Some(ch) = self.peek() else {
            return Err(self.error(
                "SANSA_QUERY_EXPECTED_EXPRESSION",
                "Expected SANSA query expression",
            ));
        };
        match ch {
            '"' => self.parse_string(),
            '|' => self.parse_symbol(),
            '#' => self.parse_prefixed_literal(LiteralKind::Hex),
            '%' => self.parse_prefixed_literal(LiteralKind::Radix),
            '&' => self.parse_prefixed_literal(LiteralKind::Encoding),
            '^' => self.parse_separator(),
            '!' => self.parse_null(),
            '0'..='9' if self.starts_temporal() => self.parse_temporal(),
            '-' | '0'..='9' => self.parse_number(),
            '$' | '?' | '.' => self.parse_resolution(),
            '(' => self.parse_group(),
            '{' => self.parse_projection(),
            _ if is_identifier_start(ch) => self.parse_identifier_expression(),
            _ => Err(self.error(
                "SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN",
                "Unexpected query expression token",
            )),
        }
    }

    fn parse_identifier_expression(&mut self) -> Result<Expression, ParseError> {
        let name = self.read_identifier()?;
        self.token()?;
        if name == "true" || name == "false" {
            return self.literal(
                LiteralKind::Boolean,
                LiteralValue::Boolean(name == "true"),
                name,
            );
        }
        if matches!(name.as_str(), "yes" | "no" | "on" | "off") {
            return self.literal(LiteralKind::Toggle, LiteralValue::Text(name.clone()), name);
        }
        self.skip_layout();
        if !self.consume_if('(') {
            return Err(self.error(
                "SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN",
                "Unexpected query expression identifier",
            ));
        }
        let body = self.read_balanced_body('(', ')')?;
        let parts = if body.trim().is_empty() {
            Vec::new()
        } else {
            split_top_level(&body, ',')
        };
        let mut arguments = Vec::new();
        for part in parts {
            arguments.push(parse_expression_inner(
                &normalize_layout(part),
                self.limits,
                self.depth + 1,
                self.budget,
            )?);
        }
        self.node()?;
        match name.as_str() {
            "any" | "all" | "none" => {
                if arguments.len() != 1 {
                    return Err(self.error(
                        "SANSA_QUERY_INVALID_FUNCTION_CALL",
                        "Cardinality operators expect exactly one expression",
                    ));
                }
                let operator = match name.as_str() {
                    "any" => CardinalityOperator::Any,
                    "all" => CardinalityOperator::All,
                    _ => CardinalityOperator::None,
                };
                Ok(Expression::Cardinality {
                    operator,
                    argument: Box::new(arguments.remove(0)),
                })
            }
            "exists" | "absent" => {
                if arguments.len() != 1 || !unwraps_resolution(&arguments[0]) {
                    return Err(self.error(
                        "SANSA_QUERY_INVALID_FUNCTION_CALL",
                        "Existence operators expect one resolution expression",
                    ));
                }
                Ok(Expression::Existence {
                    operator: if name == "exists" {
                        ExistenceOperator::Exists
                    } else {
                        ExistenceOperator::Absent
                    },
                    argument: Box::new(arguments.remove(0)),
                })
            }
            _ => Ok(Expression::FunctionCall { name, arguments }),
        }
    }

    fn parse_string(&mut self) -> Result<Expression, ParseError> {
        let value = self.read_quoted_payload()?;
        let canonical = quote(&value);
        self.literal(LiteralKind::String, LiteralValue::Text(value), canonical)
    }

    fn parse_symbol(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        self.advance();
        let mut value = String::new();
        while let Some(ch) = self.peek() {
            if ch == '|' {
                self.advance();
                if value.is_empty() {
                    return Err(ParseError::new(
                        "SANSA_QUERY_INVALID_SYMBOL_LITERAL",
                        "Symbol literals must not be empty",
                        start,
                    ));
                }
                self.check_literal(&value, start)?;
                let canonical = symbol(&value);
                return self.literal(LiteralKind::Symbol, LiteralValue::Text(value), canonical);
            }
            if ch == '\n' || ch == '\r' {
                return Err(ParseError::new(
                    "SANSA_QUERY_INVALID_SYMBOL_LITERAL",
                    "Symbol literals must not contain raw newlines",
                    self.index,
                ));
            }
            if ch == '\\' {
                value.push(self.read_escape(true)?);
            } else {
                value.push(ch);
                self.advance();
            }
        }
        Err(ParseError::new(
            "SANSA_QUERY_INVALID_SYMBOL_LITERAL",
            "Unterminated symbol literal",
            start,
        ))
    }

    fn parse_number(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        self.consume_if('-');
        if self.peek() == Some('0') {
            self.advance();
            if self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
                return Err(ParseError::new(
                    "SANSA_QUERY_INVALID_NUMBER_LITERAL",
                    "Number literals must not contain leading zeroes",
                    start,
                ));
            }
        } else if self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
            while self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
                self.advance();
            }
        } else {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_NUMBER_LITERAL",
                "Expected number literal",
                start,
            ));
        }
        if self.peek() == Some('.') {
            self.advance();
            if !self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
                return Err(ParseError::new(
                    "SANSA_QUERY_INVALID_NUMBER_LITERAL",
                    "Expected decimal digits",
                    start,
                ));
            }
            while self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
                self.advance();
            }
        }
        let value = self.input[start..self.index].to_owned();
        self.check_literal(&value, start)?;
        self.literal(
            LiteralKind::Number,
            LiteralValue::Number(value.clone()),
            value,
        )
    }

    fn parse_prefixed_literal(&mut self, kind: LiteralKind) -> Result<Expression, ParseError> {
        let start = self.index;
        let prefix = self.peek().expect("prefix exists");
        self.advance();
        let payload = self.read_simple_payload()?;
        let (valid, value, code) = match kind {
            LiteralKind::Hex => (
                valid_hex(&payload),
                payload.replace('_', "").to_ascii_lowercase(),
                "SANSA_QUERY_INVALID_HEX_LITERAL",
            ),
            LiteralKind::Radix => (
                valid_radix(&payload),
                payload.replace('_', ""),
                "SANSA_QUERY_INVALID_RADIX_LITERAL",
            ),
            LiteralKind::Encoding => (
                valid_encoding(&payload),
                payload.clone(),
                "SANSA_QUERY_INVALID_ENCODING_LITERAL",
            ),
            _ => unreachable!(),
        };
        if !valid {
            return Err(ParseError::new(code, "Invalid literal", start));
        }
        self.check_literal(&payload, start)?;
        self.literal(
            kind,
            LiteralValue::Text(value.clone()),
            format!("{prefix}{value}"),
        )
    }

    fn parse_separator(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        self.advance();
        let payload = self.read_structured_payload()?;
        if !valid_separator(&payload) {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_SEPARATOR_LITERAL",
                "Invalid separator literal",
                start,
            ));
        }
        self.check_literal(&payload, start)?;
        self.literal(
            LiteralKind::Separator,
            LiteralValue::Text(payload.clone()),
            format!("^{payload}"),
        )
    }

    fn parse_null(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        self.advance();
        let reason = if self.peek() == Some('"') {
            self.read_quoted_payload()?
        } else {
            self.read_identifier()?
        };
        if reason.is_empty() {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_NULL_LITERAL",
                "Invalid null literal",
                start,
            ));
        }
        self.check_literal(&reason, start)?;
        let canonical = if valid_identifier(&reason) {
            format!("!{reason}")
        } else {
            format!("!{}", quote(&reason))
        };
        self.literal(LiteralKind::Null, LiteralValue::Null { reason }, canonical)
    }

    fn parse_temporal(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        let source = self.read_simple_payload()?;
        let kind = if source.contains('T') {
            if source.contains('&') {
                LiteralKind::Wtc
            } else {
                LiteralKind::Datetime
            }
        } else if source.contains(':') {
            LiteralKind::Time
        } else {
            LiteralKind::Date
        };
        if !valid_temporal(&source, kind) {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_TEMPORAL_LITERAL",
                "Invalid temporal literal",
                start,
            ));
        }
        self.check_literal(&source, start)?;
        self.literal(kind, LiteralValue::Text(source.clone()), source)
    }

    fn parse_resolution(&mut self) -> Result<Expression, ParseError> {
        let start = self.index;
        let source = self.read_resolution_source()?;
        if source == "." {
            self.token()?;
            self.node()?;
            return Ok(Expression::CurrentBinding);
        }
        let positional = source.starts_with(".[") && !source.starts_with(".[\"");
        let parse_source = if positional {
            format!("?{}", &source[1..])
        } else if let Some(rest) = source.strip_prefix('.') {
            format!("?.{rest}")
        } else {
            source.clone()
        };
        let inserted_root = source.starts_with('.') && !positional;
        let address = parse_address(&parse_source).map_err(|error| {
            ParseError::new(
                error.code,
                error.message,
                start
                    + if inserted_root {
                        error.index.saturating_sub(1)
                    } else {
                        error.index
                    },
            )
        })?;
        let scope = if source.starts_with('.') {
            ResolutionScope::Current
        } else if address.root == Root::Absolute {
            ResolutionScope::Absolute
        } else {
            ResolutionScope::Contextual
        };
        let rendered = render_address(&address);
        let canonical = if positional {
            format!(".{}", &rendered[1..])
        } else if source.starts_with('.') {
            rendered[1..].to_owned()
        } else {
            rendered
        };
        self.token()?;
        self.node()?;
        Ok(Expression::Resolution {
            scope,
            address,
            canonical,
        })
    }

    fn parse_group(&mut self) -> Result<Expression, ParseError> {
        self.advance();
        let body = self.read_balanced_body('(', ')')?;
        let inner = parse_expression_inner(
            &normalize_layout(&body),
            self.limits,
            self.depth + 1,
            self.budget,
        )?;
        self.node()?;
        Ok(Expression::Group(Box::new(inner)))
    }

    fn parse_projection(&mut self) -> Result<Expression, ParseError> {
        self.advance();
        let body = self.read_balanced_body('{', '}')?;
        let parts = split_projection_fields(&body)?;
        if parts.is_empty() {
            return Err(self.error(
                "SANSA_QUERY_INVALID_PROJECTION",
                "Expected at least one projection field",
            ));
        }
        let mut fields = Vec::new();
        for (name, source) in parts {
            let expression = parse_expression_inner(
                &normalize_layout(&source),
                self.limits,
                self.depth + 1,
                self.budget,
            )?;
            fields.push(ProjectionField { name, expression });
        }
        self.node()?;
        Ok(Expression::Projection { fields })
    }

    fn starts_temporal(&self) -> bool {
        let rest = &self.input[self.index..];
        let bytes = rest.as_bytes();
        (bytes.len() >= 5 && bytes[..4].iter().all(u8::is_ascii_digit) && bytes[4] == b'-')
            || (bytes.len() >= 3 && bytes[..2].iter().all(u8::is_ascii_digit) && bytes[2] == b':')
    }

    fn read_simple_payload(&mut self) -> Result<String, ParseError> {
        let start = self.index;
        while let Some(ch) = self.peek() {
            if is_layout(ch) || matches!(ch, ',' | ')' | '}' | ']') {
                break;
            }
            self.advance();
        }
        if self.index == start {
            return Err(ParseError::new(
                "SANSA_QUERY_EXPECTED_LITERAL_PAYLOAD",
                "Expected literal payload",
                start,
            ));
        }
        Ok(self.input[start..self.index].to_owned())
    }

    fn read_structured_payload(&mut self) -> Result<String, ParseError> {
        let start = self.index;
        let mut quote = None;
        while let Some(ch) = self.peek() {
            if let Some(delimiter) = quote {
                if ch == '\\' {
                    self.advance();
                    if self.peek().is_some() {
                        self.advance();
                    }
                    continue;
                }
                if ch == delimiter {
                    quote = None;
                }
                self.advance();
                continue;
            }
            if ch == '"' || ch == '\'' {
                quote = Some(ch);
                self.advance();
            } else if is_layout(ch) || matches!(ch, ',' | ')' | '}' | ']') {
                break;
            } else {
                self.advance();
            }
        }
        if quote.is_some() {
            return Err(ParseError::new(
                "SANSA_QUERY_UNTERMINATED_EXPRESSION",
                "Unterminated structured scalar literal",
                start,
            ));
        }
        Ok(self.input[start..self.index].to_owned())
    }

    fn read_resolution_source(&mut self) -> Result<String, ParseError> {
        let start = self.index;
        let mut quote = None;
        let mut parens = 0;
        let mut brackets = 0;
        let mut angles = 0;
        let mut saw_colon = false;
        while let Some(ch) = self.peek() {
            if let Some(delimiter) = quote {
                if ch == '\\' {
                    self.advance();
                    if self.peek().is_some() {
                        self.advance();
                    }
                    continue;
                }
                if ch == delimiter {
                    quote = None;
                }
                self.advance();
                continue;
            }
            if ch == '"' {
                quote = Some(ch);
                self.advance();
                continue;
            }
            if ch == ':' {
                saw_colon = true;
            }
            if ch == '<' && (saw_colon || self.previous() == Some('.')) {
                angles += 1;
                self.advance();
                continue;
            }
            if ch == '>' && angles > 0 {
                angles -= 1;
                self.advance();
                continue;
            }
            match ch {
                '(' => parens += 1,
                ')' if parens > 0 => parens -= 1,
                '[' => brackets += 1,
                ']' if brackets > 0 => brackets -= 1,
                _ => {}
            }
            if parens == 0
                && brackets == 0
                && angles == 0
                && (is_layout(ch) || matches!(ch, ',' | ')' | '}') || matches!(ch, '=' | '!'))
            {
                break;
            }
            if parens == 0 && brackets == 0 && angles == 0 && matches!(ch, '<' | '>') {
                break;
            }
            self.advance();
        }
        if self.index == start {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_RESOLUTION_EXPRESSION",
                "Expected SANSA resolution expression",
                start,
            ));
        }
        Ok(self.input[start..self.index].to_owned())
    }

    fn read_balanced_body(&mut self, open: char, close: char) -> Result<String, ParseError> {
        if self.depth >= self.limits.max_nesting_depth {
            return Err(limit_error(
                "nesting depth",
                self.limits.max_nesting_depth,
                self.index,
            ));
        }
        let start = self.index;
        let mut quote = None;
        let mut depth = 1;
        while let Some(ch) = self.peek() {
            if let Some(delimiter) = quote {
                if ch == '\\' {
                    self.advance();
                    if self.peek().is_some() {
                        self.advance();
                    }
                    continue;
                }
                if ch == delimiter {
                    quote = None;
                }
                self.advance();
                continue;
            }
            if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(self.input, self.index)) {
                quote = Some(ch);
                self.advance();
                continue;
            }
            if ch == open {
                depth += 1;
            } else if ch == close {
                depth -= 1;
            }
            if depth == 0 {
                let body = self.input[start..self.index].to_owned();
                self.advance();
                return Ok(body);
            }
            self.advance();
        }
        Err(ParseError::new(
            "SANSA_QUERY_UNTERMINATED_EXPRESSION",
            format!("Unterminated '{open}' expression"),
            start.saturating_sub(1),
        ))
    }

    fn read_quoted_payload(&mut self) -> Result<String, ParseError> {
        let start = self.index;
        if !self.consume_if('"') {
            return Err(self.error("SANSA_UNTERMINATED_QUOTED_PAYLOAD", "Expected quote"));
        }
        let mut value = String::new();
        while let Some(ch) = self.peek() {
            if ch == '"' {
                self.advance();
                self.check_literal(&value, start)?;
                return Ok(value);
            }
            if ch == '\n' || ch == '\r' {
                return Err(self.error(
                    "SANSA_RAW_NEWLINE_IN_QUOTED_PAYLOAD",
                    "Quoted payloads must not contain raw newlines",
                ));
            }
            if ch == '\\' {
                value.push(self.read_escape(false)?);
            } else {
                value.push(ch);
                self.advance();
            }
        }
        Err(ParseError::new(
            "SANSA_UNTERMINATED_QUOTED_PAYLOAD",
            "Unterminated quoted payload",
            start,
        ))
    }

    fn read_escape(&mut self, symbol_mode: bool) -> Result<char, ParseError> {
        let start = self.index;
        self.advance();
        let Some(ch) = self.peek() else {
            return Err(ParseError::new(
                "SANSA_UNTERMINATED_ESCAPE",
                "Unterminated escape sequence",
                start,
            ));
        };
        self.advance();
        let value = match ch {
            '\\' => '\\',
            '"' => '"',
            '\'' => '\'',
            '`' => '`',
            '|' if symbol_mode => '|',
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            'b' => '\u{0008}',
            'f' => '\u{000c}',
            'u' => return self.read_unicode_escape(start),
            _ => {
                return Err(ParseError::new(
                    "SANSA_INVALID_ESCAPE",
                    "Invalid escape sequence",
                    start,
                ));
            }
        };
        Ok(value)
    }

    fn read_unicode_escape(&mut self, start: usize) -> Result<char, ParseError> {
        let raw = if self.consume_if('{') {
            let digits_start = self.index;
            while self.peek().is_some_and(|ch| ch.is_ascii_hexdigit()) {
                self.advance();
            }
            let raw = &self.input[digits_start..self.index];
            if raw.is_empty() || raw.len() > 6 || !self.consume_if('}') {
                return Err(ParseError::new(
                    "SANSA_INVALID_UNICODE_ESCAPE",
                    "Invalid Unicode escape",
                    start,
                ));
            }
            raw.to_owned()
        } else {
            let digits_start = self.index;
            for _ in 0..4 {
                if !self.peek().is_some_and(|ch| ch.is_ascii_hexdigit()) {
                    return Err(ParseError::new(
                        "SANSA_INVALID_UNICODE_ESCAPE",
                        "Invalid Unicode escape",
                        start,
                    ));
                }
                self.advance();
            }
            self.input[digits_start..self.index].to_owned()
        };
        let code = u32::from_str_radix(&raw, 16).map_err(|_| {
            ParseError::new(
                "SANSA_INVALID_UNICODE_ESCAPE",
                "Invalid Unicode escape",
                start,
            )
        })?;
        char::from_u32(code).ok_or_else(|| {
            ParseError::new(
                "SANSA_INVALID_UNICODE_SCALAR",
                "Unicode escape must decode to a scalar value",
                start,
            )
        })
    }

    fn read_identifier(&mut self) -> Result<String, ParseError> {
        let start = self.index;
        if !self.peek().is_some_and(is_identifier_start) {
            return Err(self.error(
                "SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN",
                "Expected identifier",
            ));
        }
        self.advance();
        while self.peek().is_some_and(is_identifier_continue) {
            self.advance();
        }
        Ok(self.input[start..self.index].to_owned())
    }

    fn literal(
        &mut self,
        kind: LiteralKind,
        value: LiteralValue,
        canonical: String,
    ) -> Result<Expression, ParseError> {
        self.token()?;
        self.node()?;
        Ok(Expression::Literal(Literal {
            kind,
            value,
            canonical,
        }))
    }

    fn binary(
        &mut self,
        operator: BinaryOperator,
        left: Expression,
        right: Expression,
    ) -> Result<Expression, ParseError> {
        self.node()?;
        Ok(Expression::Binary {
            operator,
            left: Box::new(left),
            right: Box::new(right),
        })
    }

    fn match_comparison(&mut self) -> Result<Option<BinaryOperator>, ParseError> {
        self.skip_layout();
        if self.match_keyword("in")? {
            return Ok(Some(BinaryOperator::In));
        }
        for (text, operator) in [
            ("==", BinaryOperator::Equal),
            ("!=", BinaryOperator::NotEqual),
            ("<=", BinaryOperator::LessEqual),
            (">=", BinaryOperator::GreaterEqual),
            ("<", BinaryOperator::Less),
            (">", BinaryOperator::Greater),
        ] {
            if self.input[self.index..].starts_with(text) {
                self.index += text.len();
                self.token()?;
                return Ok(Some(operator));
            }
        }
        Ok(None)
    }

    fn match_keyword(&mut self, keyword: &str) -> Result<bool, ParseError> {
        self.skip_layout();
        if !self.input[self.index..].starts_with(keyword) {
            return Ok(false);
        }
        let before = self.previous();
        let after = char_at(self.input, self.index + keyword.len());
        if before.is_some_and(is_identifier_continue) || after.is_some_and(is_identifier_continue) {
            return Ok(false);
        }
        self.index += keyword.len();
        self.token()?;
        Ok(true)
    }

    fn check_literal(&self, value: &str, index: usize) -> Result<(), ParseError> {
        if value.len() > self.limits.max_literal_bytes {
            return Err(limit_error(
                "literal bytes",
                self.limits.max_literal_bytes,
                index,
            ));
        }
        Ok(())
    }

    fn token(&mut self) -> Result<(), ParseError> {
        self.budget.token(self.limits, self.index)
    }

    fn node(&mut self) -> Result<(), ParseError> {
        self.budget.node(self.limits, self.index)
    }

    fn skip_layout(&mut self) {
        while self.peek().is_some_and(is_layout) {
            self.advance();
        }
    }

    fn consume_if(&mut self, expected: char) -> bool {
        if self.peek() != Some(expected) {
            return false;
        }
        self.advance();
        true
    }

    fn peek(&self) -> Option<char> {
        char_at(self.input, self.index)
    }

    fn previous(&self) -> Option<char> {
        previous_char_index(self.input, self.index).and_then(|index| char_at(self.input, index))
    }

    fn advance(&mut self) {
        if let Some(ch) = self.peek() {
            self.index += ch.len_utf8();
        }
    }

    fn at_end(&self) -> bool {
        self.index >= self.input.len()
    }

    fn error(&self, code: &str, message: &str) -> ParseError {
        ParseError::new(code, message, self.index)
    }
}

fn check_input(input: &str, limits: ParseLimits) -> Result<(), ParseError> {
    if input.len() > limits.max_input_bytes {
        return Err(limit_error("input bytes", limits.max_input_bytes, 0));
    }
    check_delimiter_nesting(input, limits)?;
    Ok(())
}

fn check_delimiter_nesting(input: &str, limits: ParseLimits) -> Result<(), ParseError> {
    let mut stack = Vec::new();
    let mut quote = None;
    let mut index = 0;
    while index < input.len() {
        let ch = char_at(input, index).expect("character boundary");
        if let Some(delimiter) = quote {
            if ch == '\\' {
                index += ch.len_utf8();
                if let Some(next) = char_at(input, index) {
                    index += next.len_utf8();
                }
                continue;
            }
            if ch == delimiter {
                quote = None;
            }
        } else if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(input, index)) {
            quote = Some(ch);
        } else if matches!(ch, '(' | '[' | '{')
            || (ch == '<' && angle_starts_structure(input, index, &stack))
        {
            stack.push(ch);
            if stack.len() > limits.max_nesting_depth {
                return Err(limit_error(
                    "nesting depth",
                    limits.max_nesting_depth,
                    index,
                ));
            }
        } else if matches!(ch, ')' | ']' | '}' | '>') {
            let expected = match ch {
                ')' => '(',
                ']' => '[',
                '}' => '{',
                '>' => '<',
                _ => unreachable!(),
            };
            if stack.last() == Some(&expected) {
                stack.pop();
            }
        }
        index += ch.len_utf8();
    }
    Ok(())
}

fn angle_starts_structure(input: &str, index: usize, stack: &[char]) -> bool {
    if stack.last() == Some(&'<') {
        return true;
    }
    if previous_char_index(input, index).and_then(|at| char_at(input, at)) == Some('.') {
        return true;
    }
    let mut start = index;
    while let Some(previous) = previous_char_index(input, start) {
        let ch = char_at(input, previous).expect("character boundary");
        if is_layout(ch) || matches!(ch, ',' | '(' | ')' | '{' | '}') {
            break;
        }
        start = previous;
    }
    input[start..index].contains(':')
}

fn strip_comments(input: &str) -> Result<String, ParseError> {
    let mut output = String::with_capacity(input.len());
    let mut quote = None;
    let mut index = 0;
    while index < input.len() {
        let ch = char_at(input, index).expect("index is a character boundary");
        if let Some(delimiter) = quote {
            output.push(ch);
            index += ch.len_utf8();
            if ch == '\\' {
                if let Some(next) = char_at(input, index) {
                    output.push(next);
                    index += next.len_utf8();
                }
            } else if ch == delimiter {
                quote = None;
            }
            continue;
        }
        if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(input, index)) {
            quote = Some(ch);
            output.push(ch);
            index += ch.len_utf8();
            continue;
        }
        let next_index = index + ch.len_utf8();
        let next = char_at(input, next_index);
        if ch == '/' && matches!(next, Some('/') | Some('*')) && !zone_comment_context(input, index)
        {
            let block = next == Some('*');
            output.push(' ');
            output.push(' ');
            index = next_index + 1;
            if block {
                let start = index.saturating_sub(2);
                let mut closed = false;
                while index < input.len() {
                    let current = char_at(input, index).expect("character boundary");
                    let following = char_at(input, index + current.len_utf8());
                    if current == '*' && following == Some('/') {
                        output.push(' ');
                        output.push(' ');
                        index += 2;
                        closed = true;
                        break;
                    }
                    output.push(if matches!(current, '\n' | '\r') {
                        current
                    } else {
                        ' '
                    });
                    index += current.len_utf8();
                }
                if !closed {
                    return Err(ParseError::new(
                        "SANSA_QUERY_UNTERMINATED_BLOCK_COMMENT",
                        "Unterminated SANSA query block comment",
                        start,
                    ));
                }
            } else {
                while let Some(current) = char_at(input, index) {
                    if matches!(current, '\n' | '\r') {
                        break;
                    }
                    output.push(' ');
                    index += current.len_utf8();
                }
            }
            continue;
        }
        output.push(ch);
        index += ch.len_utf8();
    }
    Ok(output)
}

fn zone_comment_context(input: &str, slash: usize) -> bool {
    let mut start = slash;
    while let Some(previous) = previous_char_index(input, start) {
        let ch = char_at(input, previous).expect("character boundary");
        if is_layout(ch) || matches!(ch, ',' | ')' | '}' | ']') {
            break;
        }
        start = previous;
    }
    let prefix = &input[start..slash];
    prefix.len() >= 6
        && prefix
            .as_bytes()
            .get(..4)
            .is_some_and(|v| v.iter().all(u8::is_ascii_digit))
        && prefix.contains('T')
        && prefix.contains('&')
}

fn normalize_layout(source: &str) -> String {
    let mut output = String::new();
    let mut quote = None;
    let mut pending_space = false;
    let mut index = 0;
    while index < source.len() {
        let ch = char_at(source, index).expect("character boundary");
        if let Some(delimiter) = quote {
            output.push(ch);
            index += ch.len_utf8();
            if ch == '\\' {
                if let Some(next) = char_at(source, index) {
                    output.push(next);
                    index += next.len_utf8();
                }
            } else if ch == delimiter {
                quote = None;
            }
            continue;
        }
        if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(source, index)) {
            if pending_space && !output.is_empty() {
                output.push(' ');
            }
            pending_space = false;
            quote = Some(ch);
            output.push(ch);
        } else if is_layout(ch) {
            pending_space = !output.is_empty();
        } else {
            if pending_space && !output.is_empty() {
                output.push(' ');
            }
            pending_space = false;
            output.push(ch);
        }
        index += ch.len_utf8();
    }
    output.trim().to_owned()
}

fn split_top_level(source: &str, delimiter: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut quote = None;
    let mut parens = 0;
    let mut brackets = 0;
    let mut braces = 0;
    let mut start = 0;
    let mut index = 0;
    while index < source.len() {
        let ch = char_at(source, index).expect("character boundary");
        if let Some(end) = quote {
            if ch == '\\' {
                index += ch.len_utf8();
                if let Some(next) = char_at(source, index) {
                    index += next.len_utf8();
                }
                continue;
            }
            if ch == end {
                quote = None;
            }
        } else if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(source, index)) {
            quote = Some(ch);
        } else {
            match ch {
                '(' => parens += 1,
                ')' if parens > 0 => parens -= 1,
                '[' => brackets += 1,
                ']' if brackets > 0 => brackets -= 1,
                '{' => braces += 1,
                '}' if braces > 0 => braces -= 1,
                _ if ch == delimiter && parens == 0 && brackets == 0 && braces == 0 => {
                    parts.push(&source[start..index]);
                    start = index + ch.len_utf8();
                }
                _ => {}
            }
        }
        index += ch.len_utf8();
    }
    parts.push(&source[start..]);
    parts
}

fn split_projection_fields(source: &str) -> Result<Vec<(String, String)>, ParseError> {
    let mut fields = Vec::new();
    let mut cursor = 0;
    while cursor < source.len() {
        while char_at(source, cursor).is_some_and(is_layout) {
            cursor += char_at(source, cursor)
                .expect("character exists")
                .len_utf8();
        }
        if cursor >= source.len() {
            break;
        }
        let name_start = cursor;
        if !char_at(source, cursor).is_some_and(is_identifier_start) {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_PROJECTION",
                "Expected projection field name",
                cursor,
            ));
        }
        cursor += char_at(source, cursor)
            .expect("character exists")
            .len_utf8();
        while char_at(source, cursor).is_some_and(is_identifier_continue) {
            cursor += char_at(source, cursor)
                .expect("character exists")
                .len_utf8();
        }
        let name = source[name_start..cursor].to_owned();
        while char_at(source, cursor).is_some_and(is_layout) {
            cursor += char_at(source, cursor)
                .expect("character exists")
                .len_utf8();
        }
        if char_at(source, cursor) != Some('=') || char_at(source, cursor + 1) == Some('=') {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_PROJECTION",
                "Expected '=' after projection field name",
                cursor,
            ));
        }
        cursor += 1;
        let expression_start = cursor;
        let expression_end = find_next_projection_field(source, cursor).unwrap_or(source.len());
        let expression = source[expression_start..expression_end].trim().to_owned();
        if expression.is_empty() {
            return Err(ParseError::new(
                "SANSA_QUERY_INVALID_PROJECTION",
                "Expected projection field expression",
                expression_start,
            ));
        }
        fields.push((name, expression));
        cursor = expression_end;
    }
    Ok(fields)
}

fn find_next_projection_field(source: &str, start: usize) -> Option<usize> {
    let mut quote = None;
    let mut parens = 0;
    let mut brackets = 0;
    let mut braces = 0;
    let mut index = start;
    while index < source.len() {
        let ch = char_at(source, index)?;
        if let Some(end) = quote {
            if ch == '\\' {
                index += ch.len_utf8();
                if let Some(next) = char_at(source, index) {
                    index += next.len_utf8();
                }
                continue;
            }
            if ch == end {
                quote = None;
            }
        } else if ch == '"' || ch == '\'' || (ch == '|' && is_symbol_start(source, index)) {
            quote = Some(ch);
        } else {
            match ch {
                '(' => parens += 1,
                ')' if parens > 0 => parens -= 1,
                '[' => brackets += 1,
                ']' if brackets > 0 => brackets -= 1,
                '{' => braces += 1,
                '}' if braces > 0 => braces -= 1,
                _ => {}
            }
            if parens == 0 && brackets == 0 && braces == 0 && is_layout(ch) {
                let candidate = index;
                let mut cursor = index;
                while char_at(source, cursor).is_some_and(is_layout) {
                    cursor += char_at(source, cursor)?.len_utf8();
                }
                if char_at(source, cursor).is_some_and(is_identifier_start) {
                    cursor += char_at(source, cursor)?.len_utf8();
                    while char_at(source, cursor).is_some_and(is_identifier_continue) {
                        cursor += char_at(source, cursor)?.len_utf8();
                    }
                    while char_at(source, cursor).is_some_and(is_layout) {
                        cursor += char_at(source, cursor)?.len_utf8();
                    }
                    if char_at(source, cursor) == Some('=')
                        && char_at(source, cursor + 1) != Some('=')
                    {
                        return Some(candidate);
                    }
                }
            }
        }
        index += ch.len_utf8();
    }
    None
}

fn unwraps_resolution(expression: &Expression) -> bool {
    match expression {
        Expression::Resolution { .. } | Expression::CurrentBinding => true,
        Expression::Group(inner) => unwraps_resolution(inner),
        _ => false,
    }
}

fn valid_hex(value: &str) -> bool {
    valid_grouped_chars(value, |ch| ch.is_ascii_hexdigit())
}

fn valid_radix(value: &str) -> bool {
    let body = value.strip_prefix(['+', '-']).unwrap_or(value);
    let mut parts = body.split('.');
    let left = parts.next().unwrap_or_default();
    let right = parts.next();
    if parts.next().is_some() || (left.is_empty() && right.is_none()) {
        return false;
    }
    let valid = |ch: char| ch.is_ascii_alphanumeric() || matches!(ch, '&' | '!');
    (left.is_empty() || valid_grouped_chars(left, valid))
        && right.is_none_or(|part| valid_grouped_chars(part, valid))
        && (!left.is_empty() || right.is_some())
}

fn valid_encoding(value: &str) -> bool {
    let body = value.trim_end_matches('=');
    let padding = value.len() - body.len();
    !body.is_empty()
        && padding <= 2
        && body
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
}

fn valid_grouped_chars(value: &str, predicate: impl Fn(char) -> bool) -> bool {
    let mut previous_underscore = false;
    let mut saw = false;
    for ch in value.chars() {
        if ch == '_' {
            if !saw || previous_underscore {
                return false;
            }
            previous_underscore = true;
        } else if predicate(ch) {
            saw = true;
            previous_underscore = false;
        } else {
            return false;
        }
    }
    saw && !previous_underscore
}

fn valid_separator(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut quote = None;
    let mut escaped = false;
    for ch in value.chars() {
        if let Some(delimiter) = quote {
            if matches!(ch, '\n' | '\r') {
                return false;
            }
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == delimiter {
                quote = None;
            }
        } else if ch == '"' || ch == '\'' {
            quote = Some(ch);
        } else if !(ch.is_ascii_alphanumeric() || "!#$%&*+-.:;=?@^_|~<>".contains(ch)) {
            return false;
        }
    }
    quote.is_none() && !escaped
}

fn valid_temporal(value: &str, kind: LiteralKind) -> bool {
    match kind {
        LiteralKind::Date => valid_date(value, true),
        LiteralKind::Time => valid_time(value, true),
        LiteralKind::Datetime | LiteralKind::Wtc => {
            let (datetime, zone) = if kind == LiteralKind::Wtc {
                let Some((left, right)) = value.split_once('&') else {
                    return false;
                };
                if !valid_zone(right) {
                    return false;
                }
                (left, Some(right))
            } else {
                (value, None)
            };
            if zone.is_none() && datetime.contains('&') {
                return false;
            }
            let Some((date, time)) = datetime.split_once('T') else {
                return false;
            };
            valid_date(date, false) && valid_time(time, false)
        }
        _ => false,
    }
}

fn valid_date(value: &str, allow_reduced: bool) -> bool {
    let parts = value.split('-').collect::<Vec<_>>();
    if allow_reduced && parts.len() == 2 && parts[1].is_empty() {
        return four_digit_year(parts[0]);
    }
    if allow_reduced && parts.len() == 2 {
        return four_digit_year(parts[0]) && two_digits_in(parts[1], 1, 12);
    }
    if parts.len() != 3 || !four_digit_year(parts[0]) || !two_digits_in(parts[1], 1, 12) {
        return false;
    }
    let year = parts[0].parse::<u32>().unwrap_or(0);
    let month = parts[1].parse::<usize>().unwrap_or(0);
    let day = parts[2].parse::<u32>().unwrap_or(0);
    let days = [
        31,
        if leap_year(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    day >= 1 && day <= days[month - 1]
}

fn valid_time(value: &str, require_colon: bool) -> bool {
    let (clock, offset) = if let Some(clock) = value.strip_suffix('Z') {
        (clock, Some("Z"))
    } else if value.len() >= 6 {
        let split = value.len() - 6;
        value
            .get(split..)
            .zip(value.get(..split))
            .filter(|(candidate, _)| {
                (candidate.starts_with('+') || candidate.starts_with('-'))
                    && candidate.as_bytes().get(3) == Some(&b':')
            })
            .map_or((value, None), |(candidate, clock)| (clock, Some(candidate)))
    } else {
        (value, None)
    };
    if let Some(offset) = offset.filter(|offset| *offset != "Z")
        && (!two_digits_in(&offset[1..3], 0, 23) || !two_digits_in(&offset[4..6], 0, 59))
    {
        return false;
    }
    if require_colon && !clock.contains(':') {
        return false;
    }
    let components = clock.split(':').collect::<Vec<_>>();
    if components.is_empty() || components.len() > 3 || !two_digits_in(components[0], 0, 23) {
        return false;
    }
    if components.len() == 1 {
        return !require_colon;
    }
    if components[1].is_empty() {
        return components.len() == 2;
    }
    if !two_digits_in(components[1], 0, 59) {
        return false;
    }
    if components.len() == 2 {
        return true;
    }
    let (seconds, fraction) = components[2]
        .split_once('.')
        .map_or((components[2], None), |(seconds, fraction)| {
            (seconds, Some(fraction))
        });
    two_digits_in(seconds, 0, 60)
        && fraction.is_none_or(|fraction| {
            !fraction.is_empty() && fraction.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn valid_zone(value: &str) -> bool {
    !value.is_empty()
        && value.split('/').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '+' | '.' | '-'))
        })
}

fn four_digit_year(value: &str) -> bool {
    value.len() == 4 && value.bytes().all(|byte| byte.is_ascii_digit()) && value != "0000"
}

fn two_digits_in(value: &str, minimum: u32, maximum: u32) -> bool {
    value.len() == 2
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && value
            .parse::<u32>()
            .is_ok_and(|number| number >= minimum && number <= maximum)
}

const fn leap_year(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn quote(value: &str) -> String {
    let mut output = String::from("\"");
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '"' => output.push_str("\\\""),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            '\u{0008}' => output.push_str("\\b"),
            '\u{000c}' => output.push_str("\\f"),
            _ => output.push(ch),
        }
    }
    output.push('"');
    output
}

fn symbol(value: &str) -> String {
    let mut output = String::from("|");
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '|' => output.push_str("\\|"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            '\u{0008}' => output.push_str("\\b"),
            '\u{000c}' => output.push_str("\\f"),
            _ => output.push(ch),
        }
    }
    output.push('|');
    output
}

fn is_symbol_start(source: &str, index: usize) -> bool {
    if char_at(source, index) != Some('|') {
        return false;
    }
    let Some(previous_index) = previous_char_index(source, index) else {
        return true;
    };
    let previous = char_at(source, previous_index).expect("character boundary");
    is_layout(previous) || "([{,=<>!".contains(previous)
}

fn valid_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().is_some_and(is_identifier_start) && chars.all(is_identifier_continue)
}

const fn is_identifier_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}

const fn is_identifier_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_'
}

const fn is_layout(ch: char) -> bool {
    matches!(ch, ' ' | '\t' | '\n' | '\r')
}

fn char_at(source: &str, index: usize) -> Option<char> {
    source.get(index..)?.chars().next()
}

fn previous_char_index(source: &str, index: usize) -> Option<usize> {
    source
        .get(..index)?
        .char_indices()
        .next_back()
        .map(|(index, _)| index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_fail_closed_before_unbounded_parsing() {
        let limits = ParseLimits {
            max_input_bytes: 4,
            ..ParseLimits::default()
        };
        let error = parse_expression_with_limits(".name", limits).expect_err("input limit");
        assert_eq!(error.code, "SANSA_QUERY_PARSE_LIMIT_EXCEEDED");
    }

    #[test]
    fn temporal_validation_accepts_reduced_claims_and_rejects_bad_ranges() {
        assert!(valid_temporal("2024-", LiteralKind::Date));
        assert!(valid_temporal("2024-02", LiteralKind::Date));
        assert!(valid_temporal("09:", LiteralKind::Time));
        assert!(valid_temporal(
            "2026-07-25T09Z&Europe/Belgium/Brussels",
            LiteralKind::Wtc
        ));
        assert!(!valid_temporal("2025-02-29", LiteralKind::Date));
        assert!(!valid_temporal("23:59:61", LiteralKind::Time));
        assert!(!valid_temporal(
            "2025-01-01T09Z&Europe//Brussels",
            LiteralKind::Wtc
        ));
    }

    #[test]
    fn query_parser_canonicalizes_comments_order_and_projection() {
        let query = parse_query(
            "/* lead */ from $.users.*\nwhere .active == true // enabled\n\
             order by .lastName desc, .firstName\nlimit 10\n\
             select { name = .name status = |in review\\|blocked| }",
        )
        .expect("query parses");
        assert_eq!(
            query.canonical,
            "from $.users.*\nwhere .active == true\n\
             order by .lastName desc, .firstName asc\nlimit 10\n\
             select { name = .name status = |in review\\|blocked| }"
        );
    }

    #[test]
    fn query_parser_preserves_unicode_and_aeon_literal_families() {
        for (source, canonical) in [
            ("\"Sofía\"", "\"Sofía\""),
            ("#Ff_00_Aa", "#ff00aa"),
            ("%ff_00", "%ff00"),
            ("&QmFzZTY0IQ==", "&QmFzZTY0IQ=="),
            (
                "^\"hello world\"|\"this, [is] fine\"",
                "^\"hello world\"|\"this, [is] fine\"",
            ),
            ("23:59:60.3400Z", "23:59:60.3400Z"),
            ("!notSet", "!notSet"),
        ] {
            let expression = parse_expression(source).expect(source);
            assert_eq!(render_expression(&expression), canonical, "{source}");
        }
    }

    #[test]
    fn canonical_rendering_handles_long_binary_chains_linearly() {
        let source = std::iter::repeat_n("true", 4_096)
            .collect::<Vec<_>>()
            .join(" and ");
        let expression = parse_expression(&source).expect("long chain parses within limits");
        assert_eq!(render_expression(&expression), source);
    }

    #[test]
    fn temporal_validation_rejects_non_ascii_offset_boundaries_without_panicking() {
        let error = parse_expression("12:éaaaaa").expect_err("invalid temporal literal");
        assert_eq!(error.code, "SANSA_QUERY_INVALID_TEMPORAL_LITERAL");
    }

    #[test]
    fn nested_scanners_preserve_single_quoted_separator_payloads() {
        for source in ["wrap(^'x)y')", "{ value = ^'x}y' next = true }"] {
            let expression = parse_expression(source).expect(source);
            assert_eq!(render_expression(&expression), source);
        }
    }

    #[test]
    fn resolution_errors_report_source_relative_offsets() {
        for (source, expected_index) in [("$.", 2), ("?.", 2), (".[", 2), (".name.", 6)] {
            let error = parse_expression(source).expect_err(source);
            assert_eq!(error.index, expected_index, "{source}");
        }
    }

    #[test]
    fn query_parser_rejects_malformed_literal_and_projection_edges() {
        for (source, code) in [
            ("||", "SANSA_QUERY_INVALID_SYMBOL_LITERAL"),
            ("|unterminated", "SANSA_QUERY_INVALID_SYMBOL_LITERAL"),
            ("#_", "SANSA_QUERY_INVALID_HEX_LITERAL"),
            ("&bad/payload", "SANSA_QUERY_INVALID_ENCODING_LITERAL"),
            ("^root/main", "SANSA_QUERY_INVALID_SEPARATOR_LITERAL"),
            ("2025-02-29", "SANSA_QUERY_INVALID_TEMPORAL_LITERAL"),
            ("24:00", "SANSA_QUERY_INVALID_TEMPORAL_LITERAL"),
            ("23:59:61", "SANSA_QUERY_INVALID_TEMPORAL_LITERAL"),
            ("{ name: .name }", "SANSA_QUERY_INVALID_PROJECTION"),
        ] {
            let error = parse_expression(source).expect_err(source);
            assert_eq!(error.code, code, "{source}");
        }
    }

    #[test]
    fn every_parser_resource_ceiling_is_enforced() {
        let defaults = ParseLimits::default();
        let cases = [
            (
                ".name",
                ParseLimits {
                    max_input_bytes: 4,
                    ..defaults
                },
            ),
            (
                ".name or .other",
                ParseLimits {
                    max_tokens: 1,
                    ..defaults
                },
            ),
            (
                ".name or .other",
                ParseLimits {
                    max_ast_nodes: 2,
                    ..defaults
                },
            ),
            (
                "((.name))",
                ParseLimits {
                    max_nesting_depth: 1,
                    ..defaults
                },
            ),
            (
                "not not .name",
                ParseLimits {
                    max_nesting_depth: 1,
                    ..defaults
                },
            ),
            (
                "$:outer<inner<deep>>",
                ParseLimits {
                    max_nesting_depth: 1,
                    ..defaults
                },
            ),
            (
                "\"long\"",
                ParseLimits {
                    max_literal_bytes: 3,
                    ..defaults
                },
            ),
            (
                "!longReason",
                ParseLimits {
                    max_literal_bytes: 1,
                    ..defaults
                },
            ),
            (
                "23:59",
                ParseLimits {
                    max_literal_bytes: 4,
                    ..defaults
                },
            ),
        ];
        for (source, limits) in cases {
            let error = parse_expression_with_limits(source, limits).expect_err(source);
            assert_eq!(error.code, "SANSA_QUERY_PARSE_LIMIT_EXCEEDED", "{source}");
        }
    }
}

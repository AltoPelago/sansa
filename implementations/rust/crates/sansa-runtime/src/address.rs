//! Host-neutral SANSA Address parsing and canonical rendering.

/// Portable upper bound for positional indexes.
pub const MAX_POSITION_INDEX: usize = 999_999;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    pub root: Root,
    pub selectors: Vec<Selector>,
    pub qualifier_expression: Option<QualifierExpression>,
    pub is_exact: bool,
    pub canonical: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Root {
    Absolute,
    Contextual,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Selector {
    Member {
        name: String,
        quoted: bool,
    },
    Position {
        index: usize,
    },
    PositionRange {
        start: Option<usize>,
        end: Option<usize>,
    },
    Parent,
    AttributeSpace,
    LocalSpace {
        name: String,
    },
    DirectExpansion,
    DescendantExpansion,
    NamePattern {
        pattern: String,
    },
    SemanticTypeFilter {
        name: String,
    },
    RepresentationKindFilter {
        name: String,
    },
}

impl Selector {
    #[must_use]
    pub const fn kind(&self) -> &'static str {
        match self {
            Self::Member { .. } => "member",
            Self::Position { .. } => "position",
            Self::PositionRange { .. } => "positionRange",
            Self::Parent => "parent",
            Self::AttributeSpace => "attributeSpace",
            Self::LocalSpace { .. } => "localSpace",
            Self::DirectExpansion => "directExpansion",
            Self::DescendantExpansion => "descendantExpansion",
            Self::NamePattern { .. } => "namePattern",
            Self::SemanticTypeFilter { .. } => "semanticTypeFilter",
            Self::RepresentationKindFilter { .. } => "representationKindFilter",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QualifierExpression {
    pub terms: Vec<QualifierTerm>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QualifierTerm {
    pub name: String,
    pub parameter_groups: Vec<Vec<QualifierTerm>>,
    pub arguments: Vec<QualifierArgument>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QualifierArgument {
    Number(String),
    Quoted(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub code: String,
    pub message: String,
    pub index: usize,
}

impl ParseError {
    fn new(message: impl Into<String>, index: usize, code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            index,
        }
    }
}

/// Parse an Address and produce its canonical spelling.
pub fn parse_address(input: &str) -> Result<Address, ParseError> {
    Parser::new(input).parse()
}

#[must_use]
pub fn render_address(address: &Address) -> String {
    let mut output = match address.root {
        Root::Absolute => String::from("$"),
        Root::Contextual => String::from("?"),
    };
    for selector in &address.selectors {
        match selector {
            Selector::Member { name, .. } if is_identifier(name) => {
                output.push('.');
                output.push_str(name);
            }
            Selector::Member { name, .. } => {
                output.push_str(".[");
                output.push_str(&quote(name));
                output.push(']');
            }
            Selector::Position { index } => {
                output.push('[');
                output.push_str(&index.to_string());
                output.push(']');
            }
            Selector::PositionRange { start, end } => {
                output.push('[');
                if let Some(value) = start {
                    output.push_str(&value.to_string());
                }
                output.push_str("..");
                if let Some(value) = end {
                    output.push_str(&value.to_string());
                }
                output.push(']');
            }
            Selector::Parent => output.push_str(".^"),
            Selector::AttributeSpace => output.push_str(".@"),
            Selector::LocalSpace { name } => {
                output.push_str(".<");
                output.push_str(&quote(name));
                output.push('>');
            }
            Selector::DirectExpansion => output.push_str(".*"),
            Selector::DescendantExpansion => output.push_str(".**"),
            Selector::NamePattern { pattern } => {
                output.push_str(".(");
                output.push_str(&quote(pattern));
                output.push(')');
            }
            Selector::SemanticTypeFilter { name } => {
                output.push('#');
                output.push_str(name);
            }
            Selector::RepresentationKindFilter { name } => {
                output.push('%');
                output.push_str(name);
            }
        }
    }
    if let Some(expression) = &address.qualifier_expression {
        output.push(':');
        output.push_str(&render_qualifier_expression(expression));
    }
    output
}

#[must_use]
pub fn render_qualifier_expression(expression: &QualifierExpression) -> String {
    expression
        .terms
        .iter()
        .map(render_qualifier_term)
        .collect::<Vec<_>>()
        .join("|")
}

fn render_qualifier_term(term: &QualifierTerm) -> String {
    let mut output = term.name.clone();
    for group in &term.parameter_groups {
        output.push('<');
        output.push_str(
            &group
                .iter()
                .map(render_qualifier_term)
                .collect::<Vec<_>>()
                .join(","),
        );
        output.push('>');
    }
    if !term.arguments.is_empty() {
        output.push('[');
        output.push_str(
            &term
                .arguments
                .iter()
                .map(|argument| match argument {
                    QualifierArgument::Number(value) => value.clone(),
                    QualifierArgument::Quoted(value) => quote(value),
                })
                .collect::<Vec<_>>()
                .join(","),
        );
        output.push(']');
    }
    output
}

struct Parser<'a> {
    input: &'a str,
    index: usize,
}

impl<'a> Parser<'a> {
    const fn new(input: &'a str) -> Self {
        Self { input, index: 0 }
    }

    fn parse(&mut self) -> Result<Address, ParseError> {
        let root = match self.peek() {
            Some('$') => Root::Absolute,
            Some('?') => Root::Contextual,
            None => return self.fail("Expected SANSA address root", "SANSA_EMPTY_ADDRESS"),
            Some(_) => {
                return self.fail(
                    "Expected SANSA address root '$' or '?'",
                    "SANSA_EXPECTED_ROOT",
                );
            }
        };
        self.advance();
        let mut selectors = Vec::new();
        let mut qualifier_expression = None;
        while !self.at_end() {
            match self.peek() {
                Some(':') => {
                    self.advance();
                    if self.at_end() {
                        return self
                            .fail("Expected qualifier expression", "SANSA_EXPECTED_QUALIFIER");
                    }
                    qualifier_expression = Some(self.parse_qualifier_expression()?);
                    break;
                }
                Some('.') => selectors.push(self.parse_dot_selector()?),
                Some('[') => selectors.push(self.parse_position_selector()?),
                Some('#') => {
                    self.advance();
                    selectors.push(Selector::SemanticTypeFilter {
                        name: self.parse_identifier("semantic type filter")?,
                    });
                }
                Some('%') => {
                    self.advance();
                    selectors.push(Selector::RepresentationKindFilter {
                        name: self.parse_identifier("representation kind filter")?,
                    });
                }
                Some(ch) if is_layout(ch) => {
                    return self.fail(
                        "Whitespace is not allowed inside a SANSA address",
                        "SANSA_UNEXPECTED_WHITESPACE",
                    );
                }
                Some(ch) => {
                    return self.fail(
                        format!("Unexpected character '{ch}'"),
                        "SANSA_UNEXPECTED_CHARACTER",
                    );
                }
                None => break,
            }
        }
        if let Some(ch) = self.peek() {
            return self.fail(
                format!("Unexpected trailing character '{ch}'"),
                "SANSA_TRAILING_INPUT",
            );
        }
        let is_exact = selectors.iter().all(is_exact_selector);
        let mut address = Address {
            root,
            selectors,
            qualifier_expression,
            is_exact,
            canonical: String::new(),
        };
        address.canonical = render_address(&address);
        Ok(address)
    }

    fn parse_dot_selector(&mut self) -> Result<Selector, ParseError> {
        self.consume('.')?;
        if self.match_char('@') {
            return Ok(Selector::AttributeSpace);
        }
        if self.match_char('^') {
            return Ok(Selector::Parent);
        }
        if self.match_char('*') {
            return Ok(if self.match_char('*') {
                Selector::DescendantExpansion
            } else {
                Selector::DirectExpansion
            });
        }
        if self.match_char('[') {
            let name = self.parse_quoted_payload()?;
            if name.is_empty() {
                return self.fail(
                    "Quoted member names must not be empty",
                    "SANSA_EMPTY_MEMBER_NAME",
                );
            }
            self.consume(']')?;
            return Ok(Selector::Member { name, quoted: true });
        }
        if self.match_char('<') {
            let name = self.parse_quoted_payload()?;
            if name.is_empty() {
                return self.fail(
                    "Local address-space names must not be empty",
                    "SANSA_EMPTY_LOCAL_SPACE_NAME",
                );
            }
            self.consume('>')?;
            return Ok(Selector::LocalSpace { name });
        }
        if self.match_char('(') {
            let pattern = self.parse_quoted_payload()?;
            self.consume(')')?;
            return Ok(Selector::NamePattern { pattern });
        }
        Ok(Selector::Member {
            name: self.parse_identifier("member selector")?,
            quoted: false,
        })
    }

    fn parse_position_selector(&mut self) -> Result<Selector, ParseError> {
        self.consume('[')?;
        let content_start = self.index;
        let start = self.parse_optional_index()?;
        if self.input[self.index..].starts_with("..") {
            self.index += 2;
            let end = self.parse_optional_index()?;
            if start.is_none() && end.is_none() {
                return Err(ParseError::new(
                    "Position ranges must include a start or end index",
                    content_start,
                    "SANSA_EMPTY_POSITION_RANGE",
                ));
            }
            self.consume(']')?;
            return Ok(Selector::PositionRange { start, end });
        }
        let Some(index) = start else {
            return self.fail("Expected positional index", "SANSA_EXPECTED_INDEX");
        };
        self.consume(']')?;
        Ok(Selector::Position { index })
    }

    fn parse_optional_index(&mut self) -> Result<Option<usize>, ParseError> {
        let start = self.index;
        while self.peek().is_some_and(|ch| ch.is_ascii_digit()) {
            self.advance();
        }
        if self.index == start {
            return Ok(None);
        }
        let raw = &self.input[start..self.index];
        if raw.len() > 1 && raw.starts_with('0') {
            return Err(ParseError::new(
                "Positional indexes must not contain leading zeroes",
                start,
                "SANSA_LEADING_ZERO_INDEX",
            ));
        }
        if exceeds_index_limit(raw) {
            return Err(ParseError::new(
                format!("Position indexes must be less than or equal to {MAX_POSITION_INDEX}"),
                start,
                "SANSA_POSITION_INDEX_LIMIT_EXCEEDED",
            ));
        }
        raw.parse()
            .map(Some)
            .map_err(|_| ParseError::new("Invalid positional index", start, "SANSA_INVALID_INDEX"))
    }

    fn parse_qualifier_expression(&mut self) -> Result<QualifierExpression, ParseError> {
        let mut terms = vec![self.parse_qualifier_term()?];
        while self.match_char('|') {
            terms.push(self.parse_qualifier_term()?);
        }
        Ok(QualifierExpression { terms })
    }

    fn parse_qualifier_term(&mut self) -> Result<QualifierTerm, ParseError> {
        let name = self.parse_identifier("qualifier type name")?;
        let mut parameter_groups = Vec::new();
        while self.match_char('<') {
            let mut group = vec![self.parse_qualifier_term()?];
            if self.peek() == Some('|') {
                return self.fail(
                    "Nested qualifier unions are not supported",
                    "SANSA_INVALID_QUALIFIER",
                );
            }
            while self.match_char(',') {
                group.push(self.parse_qualifier_term()?);
                if self.peek() == Some('|') {
                    return self.fail(
                        "Nested qualifier unions are not supported",
                        "SANSA_INVALID_QUALIFIER",
                    );
                }
            }
            self.consume('>')?;
            parameter_groups.push(group);
        }
        let mut arguments = Vec::new();
        if self.match_char('[') {
            arguments.push(self.parse_qualifier_argument()?);
            while self.match_char(',') {
                arguments.push(self.parse_qualifier_argument()?);
            }
            self.consume(']')?;
            if self.peek() == Some('[') {
                return self.fail(
                    "Qualifier clarifiers must use a single bracketed list",
                    "SANSA_INVALID_QUALIFIER",
                );
            }
        }
        if self
            .peek()
            .is_some_and(|next| !matches!(next, '|' | ',' | '>'))
        {
            return self.fail(
                "Unexpected character in qualifier expression",
                "SANSA_INVALID_QUALIFIER",
            );
        }
        Ok(QualifierTerm {
            name,
            parameter_groups,
            arguments,
        })
    }

    fn parse_qualifier_argument(&mut self) -> Result<QualifierArgument, ParseError> {
        if self.peek() == Some('"') {
            return self.parse_quoted_payload().map(QualifierArgument::Quoted);
        }
        let start = self.index;
        while !self.at_end() && !matches!(self.peek(), Some(']' | ',')) {
            self.advance();
        }
        if self.index == start {
            return self.fail(
                "Expected qualifier argument",
                "SANSA_EXPECTED_QUALIFIER_ARGUMENT",
            );
        }
        let value = &self.input[start..self.index];
        if !is_number_literal(value) {
            return self.fail(
                "Invalid qualifier argument",
                "SANSA_INVALID_QUALIFIER_ARGUMENT",
            );
        }
        Ok(QualifierArgument::Number(value.into()))
    }

    fn parse_identifier(&mut self, context: &str) -> Result<String, ParseError> {
        let start = self.index;
        if !self.peek().is_some_and(is_identifier_start) {
            return self.fail(format!("Expected {context}"), "SANSA_EXPECTED_IDENTIFIER");
        }
        self.advance();
        while self.peek().is_some_and(is_identifier_continue) {
            self.advance();
        }
        Ok(self.input[start..self.index].into())
    }

    fn parse_quoted_payload(&mut self) -> Result<String, ParseError> {
        self.consume('"')?;
        let mut output = String::new();
        while let Some(ch) = self.peek() {
            if ch == '"' {
                self.advance();
                return Ok(output);
            }
            if matches!(ch, '\n' | '\r') {
                return self.fail(
                    "Quoted payloads must not contain raw newlines",
                    "SANSA_RAW_NEWLINE_IN_QUOTED_PAYLOAD",
                );
            }
            if ch == '\\' {
                output.push(self.parse_escape()?);
            } else {
                output.push(ch);
                self.advance();
            }
        }
        self.fail(
            "Unterminated quoted payload",
            "SANSA_UNTERMINATED_QUOTED_PAYLOAD",
        )
    }

    fn parse_escape(&mut self) -> Result<char, ParseError> {
        self.consume('\\')?;
        let start = self.index;
        let Some(ch) = self.advance() else {
            return self.fail("Unterminated escape sequence", "SANSA_UNTERMINATED_ESCAPE");
        };
        match ch {
            '\\' => Ok('\\'),
            '"' => Ok('"'),
            '\'' => Ok('\''),
            '`' => Ok('`'),
            'n' => Ok('\n'),
            'r' => Ok('\r'),
            't' => Ok('\t'),
            'b' => Ok('\u{0008}'),
            'f' => Ok('\u{000c}'),
            'u' => self.parse_unicode_escape(start),
            _ => Err(ParseError::new(
                format!("Invalid escape sequence \\{ch}"),
                start.saturating_sub(1),
                "SANSA_INVALID_ESCAPE",
            )),
        }
    }

    fn parse_unicode_escape(&mut self, escape_start: usize) -> Result<char, ParseError> {
        if self.match_char('{') {
            let start = self.index;
            while !self.at_end() && self.peek() != Some('}') {
                self.advance();
            }
            if self.at_end() {
                return self.fail(
                    "Unterminated Unicode escape",
                    "SANSA_UNTERMINATED_UNICODE_ESCAPE",
                );
            }
            let raw = &self.input[start..self.index];
            self.consume('}')?;
            if raw.is_empty() || raw.len() > 6 || !raw.chars().all(|ch| ch.is_ascii_hexdigit()) {
                return Err(ParseError::new(
                    "Invalid Unicode escape",
                    start,
                    "SANSA_INVALID_UNICODE_ESCAPE",
                ));
            }
            let code = u32::from_str_radix(raw, 16).map_err(|_| {
                ParseError::new(
                    "Invalid Unicode escape",
                    start,
                    "SANSA_INVALID_UNICODE_ESCAPE",
                )
            })?;
            return scalar(code, start);
        }
        let start = self.index;
        for _ in 0..4 {
            if !self.peek().is_some_and(|ch| ch.is_ascii_hexdigit()) {
                return Err(ParseError::new(
                    "Invalid Unicode escape",
                    start,
                    "SANSA_INVALID_UNICODE_ESCAPE",
                ));
            }
            self.advance();
        }
        let code = u32::from_str_radix(&self.input[start..self.index], 16).map_err(|_| {
            ParseError::new(
                "Invalid Unicode escape",
                start,
                "SANSA_INVALID_UNICODE_ESCAPE",
            )
        })?;
        scalar(code, escape_start)
    }

    fn consume(&mut self, expected: char) -> Result<(), ParseError> {
        if self.peek() != Some(expected) {
            return self.fail(format!("Expected '{expected}'"), "SANSA_EXPECTED_TOKEN");
        }
        self.advance();
        Ok(())
    }
    fn match_char(&mut self, expected: char) -> bool {
        if self.peek() == Some(expected) {
            self.advance();
            true
        } else {
            false
        }
    }
    fn peek(&self) -> Option<char> {
        self.input[self.index..].chars().next()
    }
    fn advance(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.index += ch.len_utf8();
        Some(ch)
    }
    fn at_end(&self) -> bool {
        self.index >= self.input.len()
    }
    fn fail<T>(
        &self,
        message: impl Into<String>,
        code: impl Into<String>,
    ) -> Result<T, ParseError> {
        Err(ParseError::new(message, self.index, code))
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
fn exceeds_index_limit(raw: &str) -> bool {
    let max = MAX_POSITION_INDEX.to_string();
    raw.len() > max.len() || (raw.len() == max.len() && raw > max.as_str())
}
fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().is_some_and(is_identifier_start) && chars.all(is_identifier_continue)
}
fn is_identifier_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}
fn is_identifier_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_'
}
fn is_layout(ch: char) -> bool {
    matches!(ch, ' ' | '\t' | '\n' | '\r')
}

fn is_number_literal(value: &str) -> bool {
    let rest = value.strip_prefix(['+', '-']).unwrap_or(value);
    if rest.is_empty() {
        return false;
    }
    if let Some(fraction) = rest.strip_prefix('.') {
        return !fraction.is_empty() && fraction.bytes().all(|ch| ch.is_ascii_digit());
    }
    let mut parts = rest.split('.');
    let integer = parts.next().unwrap_or_default();
    if integer.is_empty()
        || !integer.bytes().all(|ch| ch.is_ascii_digit())
        || (integer.len() > 1 && integer.starts_with('0'))
    {
        return false;
    }
    match parts.next() {
        None => true,
        Some(fraction) => {
            !fraction.is_empty()
                && fraction.bytes().all(|ch| ch.is_ascii_digit())
                && parts.next().is_none()
        }
    }
}

fn scalar(code: u32, index: usize) -> Result<char, ParseError> {
    char::from_u32(code).ok_or_else(|| {
        ParseError::new(
            "Unicode escape must decode to a scalar value",
            index,
            "SANSA_INVALID_UNICODE_SCALAR",
        )
    })
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

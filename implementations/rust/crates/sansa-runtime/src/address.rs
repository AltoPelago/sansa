//! Host-neutral SANSA Address parsing and canonical rendering.

/// Portable upper bound for positional indexes.
pub const MAX_POSITION_INDEX: usize = 999_999;

/// Address parser limits that a host may deliberately relax.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseOptions {
    /// Largest positional index accepted by this parser invocation.
    ///
    /// Values above [`MAX_POSITION_INDEX`] are accepted only when the host
    /// explicitly raises this ceiling and are reported as non-portable.
    pub max_position_index: usize,
}

impl Default for ParseOptions {
    fn default() -> Self {
        Self {
            max_position_index: MAX_POSITION_INDEX,
        }
    }
}

/// Non-fatal diagnostic produced while parsing a locally accepted address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseWarning {
    pub code: String,
    pub message: String,
    pub index: usize,
}

/// Parsed address together with any portability diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseOutput {
    pub address: Address,
    pub warnings: Vec<ParseWarning>,
}

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
    PropertyFilter {
        property: PropertyName,
        value: String,
    },
    ChildIdentity {
        identity: String,
    },
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyName {
    Key,
    Tag,
    HeadTag,
}
impl PropertyName {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Key => "key",
            Self::Tag => "tag",
            Self::HeadTag => "headTag",
        }
    }
}

impl Selector {
    #[must_use]
    pub const fn kind(&self) -> &'static str {
        match self {
            Self::PropertyFilter { .. } => "propertyFilter",
            Self::ChildIdentity { .. } => "childIdentity",
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
    pub limit_kind: Option<&'static str>,
    pub limit: Option<usize>,
    pub observed: Option<usize>,
}

impl ParseError {
    fn new(message: impl Into<String>, index: usize, code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            index,
            limit_kind: None,
            limit: None,
            observed: None,
        }
    }
}

/// Parse an Address and produce its canonical spelling.
pub fn parse_address(input: &str) -> Result<Address, ParseError> {
    parse_address_with_options(input, ParseOptions::default()).map(|output| output.address)
}

/// Parse an Address with explicit local limits while retaining portability
/// warnings for values outside the portable profile.
pub fn parse_address_with_options(
    input: &str,
    options: ParseOptions,
) -> Result<ParseOutput, ParseError> {
    Parser::new(input, options).parse()
}

#[must_use]
pub fn render_address(address: &Address) -> String {
    let mut output = match address.root {
        Root::Absolute => String::from("$"),
        Root::Contextual => String::from("?"),
    };
    for selector in &address.selectors {
        match selector {
            Selector::PropertyFilter { property, value } => {
                output.push('&');
                output.push_str(property.as_str());
                output.push('(');
                output.push_str(&quote(value));
                output.push(')');
            }
            Selector::ChildIdentity { identity } => {
                output.push_str(".\\");
                output.push_str(identity);
                output.push('\\');
            }
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
    enum Part<'a> {
        Term(&'a QualifierTerm),
        Text(&'a str),
        Argument(&'a QualifierArgument),
    }
    let mut output = String::new();
    let mut stack = vec![Part::Term(term)];
    while let Some(part) = stack.pop() {
        match part {
            Part::Text(text) => output.push_str(text),
            Part::Argument(argument) => match argument {
                QualifierArgument::Number(value) => output.push_str(value),
                QualifierArgument::Quoted(value) => output.push_str(&quote(value)),
            },
            Part::Term(term) => {
                output.push_str(&term.name);
                if !term.arguments.is_empty() {
                    stack.push(Part::Text("]"));
                    for (index, argument) in term.arguments.iter().enumerate().rev() {
                        stack.push(Part::Argument(argument));
                        if index > 0 {
                            stack.push(Part::Text(","));
                        }
                    }
                    stack.push(Part::Text("["));
                }
                for group in term.parameter_groups.iter().rev() {
                    stack.push(Part::Text(">"));
                    for (index, child) in group.iter().enumerate().rev() {
                        stack.push(Part::Term(child));
                        if index > 0 {
                            stack.push(Part::Text(","));
                        }
                    }
                    stack.push(Part::Text("<"));
                }
            }
        }
    }
    output
}

// Drop deeply nested plain qualifier data without consuming the host stack.
impl Drop for QualifierTerm {
    fn drop(&mut self) {
        let mut stack: Vec<_> = std::mem::take(&mut self.parameter_groups)
            .into_iter()
            .flatten()
            .collect();
        while let Some(mut term) = stack.pop() {
            stack.extend(
                std::mem::take(&mut term.parameter_groups)
                    .into_iter()
                    .flatten(),
            );
        }
    }
}

struct Parser<'a> {
    input: &'a str,
    index: usize,
    options: ParseOptions,
    warnings: Vec<ParseWarning>,
    properties: bool,
    property_work: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str, options: ParseOptions) -> Self {
        Self {
            input,
            index: 0,
            options,
            warnings: Vec::new(),
            properties: has_property_syntax(input),
            property_work: 0,
        }
    }

    fn parse(&mut self) -> Result<ParseOutput, ParseError> {
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
            if self.properties && self.peek() != Some(':') && selectors.len() >= 256 {
                return Err(property_limit("selectors", 256, self.index));
            }
            match self.peek() {
                Some('&') => selectors.push(self.parse_property()?),
                Some(':') => {
                    self.advance();
                    if self.at_end() {
                        return self
                            .fail("Expected qualifier expression", "SANSA_EXPECTED_QUALIFIER");
                    }
                    qualifier_expression = Some(if self.properties {
                        self.parse_property_qualifiers()?
                    } else {
                        self.parse_qualifier_expression()?
                    });
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
        if self.properties {
            property_canonical_bound(&address, self.index)?;
        }
        address.canonical = render_address(&address);
        Ok(ParseOutput {
            address,
            warnings: std::mem::take(&mut self.warnings),
        })
    }

    fn charge_property(&mut self, count: usize) -> Result<(), ParseError> {
        if self.properties {
            self.property_work = self.property_work.saturating_add(count);
            if self.property_work > 65536 {
                return Err(property_limit("canonicalScalars", 65536, self.index));
            }
        }
        Ok(())
    }
    fn parse_property(&mut self) -> Result<Selector, ParseError> {
        self.consume('&')?;
        let start = self.index;
        while self.peek().is_some_and(is_identifier_continue) {
            self.advance();
        }
        let property = match &self.input[start..self.index] {
            "key" => PropertyName::Key,
            "tag" => PropertyName::Tag,
            "headTag" => PropertyName::HeadTag,
            _ => {
                return self.fail(
                    "Unknown property selector",
                    "SANSA_UNKNOWN_PROPERTY_SELECTOR",
                );
            }
        };
        self.consume('(')?;
        if self.peek().is_some_and(is_layout) {
            return self.fail(
                "Whitespace is not allowed inside a SANSA address",
                "SANSA_UNEXPECTED_WHITESPACE",
            );
        }
        if self.peek() != Some('"') {
            return self.fail(
                "Expected quoted property argument",
                "SANSA_EXPECTED_PROPERTY_ARGUMENT",
            );
        }
        let value = self.parse_payload_with_limit(4096)?;
        self.consume(')')?;
        Ok(Selector::PropertyFilter { property, value })
    }
    fn parse_property_qualifiers(&mut self) -> Result<QualifierExpression, ParseError> {
        struct Frame {
            term: QualifierTerm,
            group: Option<Vec<QualifierTerm>>,
        }
        let make = |parser: &mut Self| -> Result<Frame, ParseError> {
            Ok(Frame {
                term: QualifierTerm {
                    name: parser.parse_identifier("qualifier type name")?,
                    parameter_groups: Vec::new(),
                    arguments: Vec::new(),
                },
                group: None,
            })
        };
        let mut terms = Vec::new();
        let mut stack = vec![make(self)?];
        while !stack.is_empty() {
            let in_group = stack.last().is_some_and(|frame| frame.group.is_some());
            if in_group {
                if self.peek() == Some('|') {
                    return self.fail(
                        "Nested qualifier unions are not supported",
                        "SANSA_INVALID_QUALIFIER",
                    );
                }
                if self.match_char(',') {
                    stack.push(make(self)?);
                    continue;
                }
                self.consume('>')?;
                let frame = stack.last_mut().expect("nonempty");
                frame
                    .term
                    .parameter_groups
                    .push(frame.group.take().expect("group"));
                continue;
            }
            if self.match_char('<') {
                stack.last_mut().expect("nonempty").group = Some(Vec::new());
                stack.push(make(self)?);
                continue;
            }
            if self.match_char('[') {
                let frame = stack.last_mut().expect("nonempty");
                frame.term.arguments.push(self.parse_qualifier_argument()?);
                while self.match_char(',') {
                    frame.term.arguments.push(self.parse_qualifier_argument()?);
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
            let term = stack.pop().expect("nonempty").term;
            if let Some(frame) = stack.last_mut() {
                frame.group.as_mut().expect("parent group").push(term);
            } else {
                terms.push(term);
                if self.match_char('|') {
                    stack.push(make(self)?);
                }
            }
        }
        Ok(QualifierExpression { terms })
    }

    fn parse_dot_selector(&mut self) -> Result<Selector, ParseError> {
        self.consume('.')?;
        if self.match_char('\\') {
            return self.parse_child_identity();
        }
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

    fn parse_child_identity(&mut self) -> Result<Selector, ParseError> {
        let start = self.index;
        while let Some(ch) = self.peek() {
            if ch == '\\' {
                if self.index == start {
                    return Err(ParseError::new(
                        "Expected structural identity name",
                        self.index,
                        "SANSA_EXPECTED_IDENTITY",
                    ));
                }
                self.charge_property(self.index - start)?;
                let identity = self.input[start..self.index].to_owned();
                self.advance();
                return Ok(Selector::ChildIdentity { identity });
            }
            if !(ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-')) {
                return Err(ParseError::new(
                    "Expected structural identity name",
                    self.index,
                    "SANSA_EXPECTED_IDENTITY",
                ));
            }
            self.advance();
        }
        Err(ParseError::new(
            "Unterminated structural identity selector",
            self.index,
            "SANSA_UNTERMINATED_IDENTITY",
        ))
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
        if exceeds_index_limit(raw, self.options.max_position_index) {
            return Err(ParseError::new(
                format!(
                    "Position indexes must be less than or equal to {}",
                    self.options.max_position_index
                ),
                start,
                "SANSA_POSITION_INDEX_LIMIT_EXCEEDED",
            ));
        }
        let index = raw.parse().map_err(|_| {
            ParseError::new("Invalid positional index", start, "SANSA_INVALID_INDEX")
        })?;
        if exceeds_index_limit(raw, MAX_POSITION_INDEX) {
            self.warnings.push(ParseWarning {
                code: "SANSA_NON_PORTABLE_POSITION_INDEX".into(),
                message: format!(
                    "Position index {raw} exceeds the portable limit {MAX_POSITION_INDEX}"
                ),
                index: start,
            });
        }
        Ok(Some(index))
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
        self.charge_property(self.index - start)?;
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
        self.charge_property(self.index - start)?;
        Ok(self.input[start..self.index].into())
    }

    fn parse_quoted_payload(&mut self) -> Result<String, ParseError> {
        self.parse_payload_with_limit(65536)
    }
    fn parse_payload_with_limit(&mut self, limit: usize) -> Result<String, ParseError> {
        self.consume('"')?;
        self.charge_property(1)?;
        let mut scalars = 0;
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
            if self.properties {
                scalars += 1;
                if scalars > limit {
                    return Err(property_limit(
                        if limit == 4096 {
                            "payloadScalars"
                        } else {
                            "canonicalScalars"
                        },
                        limit,
                        self.index,
                    ));
                }
                self.charge_property(1)?;
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
fn exceeds_index_limit(raw: &str, limit: usize) -> bool {
    let max = limit.to_string();
    raw.len() > max.len() || (raw.len() == max.len() && raw > max.as_str())
}
pub(crate) fn is_identifier(value: &str) -> bool {
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

pub(crate) fn is_number_literal(value: &str) -> bool {
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

fn has_property_syntax(source: &str) -> bool {
    if !source.contains('&') {
        return false;
    }
    let mut quoted = false;
    let mut escaped = false;
    for ch in source.chars() {
        if quoted && escaped {
            escaped = false;
            continue;
        }
        if quoted && ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '"' {
            quoted = !quoted;
            continue;
        }
        if !quoted && ch == ':' {
            return false;
        }
        if !quoted && ch == '&' {
            return true;
        }
    }
    false
}
fn property_limit(kind: &'static str, limit: usize, index: usize) -> ParseError {
    let mut error = ParseError::new(
        "Property address preparation bound exceeded",
        index,
        "SANSA_PROPERTY_LIMIT_EXCEEDED",
    );
    error.limit_kind = Some(kind);
    error.limit = Some(limit);
    error.observed = Some(limit + 1);
    error
}
pub(crate) fn validate_property_ast(address: &Address) -> Result<(), ParseError> {
    if address.selectors.len() > 256 {
        return Err(property_limit("selectors", 256, 0));
    }
    for selector in &address.selectors {
        let invalid = match selector {
            Selector::PropertyFilter { value, .. } => {
                if value.chars().take(4097).count() > 4096 {
                    return Err(property_limit("payloadScalars", 4096, 0));
                }
                false
            }
            Selector::SemanticTypeFilter { name } | Selector::RepresentationKindFilter { name } => {
                !is_identifier(name)
            }
            Selector::ChildIdentity { identity } => {
                identity.is_empty()
                    || !identity
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
            }
            Selector::LocalSpace { name } => name.is_empty(),
            Selector::PositionRange { start, end } => start.is_none() && end.is_none(),
            _ => false,
        };
        if invalid {
            return Err(ParseError::new(
                "Invalid property address AST",
                0,
                "SANSA_RESOLVE_INVALID_ADDRESS",
            ));
        }
    }
    property_canonical_bound(address, 0)?;
    let mut stack = Vec::new();
    if let Some(expression) = &address.qualifier_expression {
        if expression.terms.is_empty() {
            return Err(ParseError::new(
                "Empty qualifier",
                0,
                "SANSA_RESOLVE_INVALID_ADDRESS",
            ));
        }
        stack.extend(&expression.terms);
    }
    while let Some(term) = stack.pop() {
        if !is_identifier(&term.name)
            || term
                .arguments
                .iter()
                .any(|a| matches!(a,QualifierArgument::Number(value) if !is_number_literal(value)))
            || term.parameter_groups.iter().any(Vec::is_empty)
        {
            return Err(ParseError::new(
                "Invalid qualifier",
                0,
                "SANSA_RESOLVE_INVALID_ADDRESS",
            ));
        }
        for group in &term.parameter_groups {
            stack.extend(group);
        }
    }
    Ok(())
}

fn property_canonical_bound(address: &Address, index: usize) -> Result<(), ParseError> {
    let mut count = 1usize;
    let quoted = |value: &str| {
        2 + value
            .chars()
            .map(|ch| {
                if matches!(ch, '\\' | '"' | '\n' | '\r' | '\t' | '\u{8}' | '\u{c}') {
                    2
                } else {
                    1
                }
            })
            .sum::<usize>()
    };
    let mut charge = |amount: usize| -> Result<(), ParseError> {
        count = count.saturating_add(amount);
        if count > 65536 {
            Err(property_limit("canonicalScalars", 65536, index))
        } else {
            Ok(())
        }
    };
    for selector in &address.selectors {
        charge(match selector {
            Selector::PropertyFilter { property, value } => {
                3 + property.as_str().len() + quoted(value)
            }
            Selector::Member { name, .. } => {
                if is_identifier(name) {
                    1 + name.len()
                } else {
                    3 + quoted(name)
                }
            }
            Selector::ChildIdentity { identity } => 3 + identity.len(),
            Selector::Position { index } => 2 + index.to_string().len(),
            Selector::PositionRange { start, end } => {
                4 + start.map_or(0, |i| i.to_string().len())
                    + end.map_or(0, |i| i.to_string().len())
            }
            Selector::Parent | Selector::AttributeSpace | Selector::DirectExpansion => 2,
            Selector::DescendantExpansion => 3,
            Selector::LocalSpace { name } => 3 + quoted(name),
            Selector::NamePattern { pattern } => 3 + quoted(pattern),
            Selector::SemanticTypeFilter { name } | Selector::RepresentationKindFilter { name } => {
                1 + name.len()
            }
        })?;
    }
    if let Some(expression) = &address.qualifier_expression {
        charge(expression.terms.len())?; // Colon plus union separators.
        let mut stack: Vec<_> = expression.terms.iter().collect();
        while let Some(term) = stack.pop() {
            charge(term.name.len())?;
            if !term.arguments.is_empty() {
                charge(term.arguments.len() + 1)?;
            }
            for argument in &term.arguments {
                charge(match argument {
                    QualifierArgument::Quoted(value) => quoted(value),
                    QualifierArgument::Number(value) => value.len(),
                })?;
            }
            for group in &term.parameter_groups {
                charge(group.len() + 1)?;
                stack.extend(group);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_position_limit_remains_strict() {
        let error = parse_address("$.items[1000000]").expect_err("portable limit");
        assert_eq!(error.code, "SANSA_POSITION_INDEX_LIMIT_EXCEEDED");
    }

    #[test]
    fn relaxed_position_limit_retains_portability_warning() {
        let output = parse_address_with_options(
            "$.items[1000000]",
            ParseOptions {
                max_position_index: 1_000_000,
            },
        )
        .expect("locally accepted address");

        assert_eq!(output.address.canonical, "$.items[1000000]");
        assert_eq!(output.warnings.len(), 1);
        assert_eq!(output.warnings[0].code, "SANSA_NON_PORTABLE_POSITION_INDEX");
    }
}

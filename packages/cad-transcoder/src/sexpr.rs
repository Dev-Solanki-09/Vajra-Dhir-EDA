use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SExpr {
    Atom(String),
    StringLit(String),
    List(Vec<SExpr>),
}

#[derive(Debug, Error)]
pub enum SExprError {
    #[error("Unexpected end of input at offset {0}")]
    UnexpectedEof(usize),

    #[error("Unmatched closing parenthesis at offset {0}")]
    UnmatchedClosingParen(usize),

    #[error("Unterminated string literal starting at offset {0}")]
    UnterminatedString(usize),
}

impl SExpr {
    /// Parse an S-Expression string into an AST.
    pub fn parse(input: &str) -> Result<Vec<SExpr>, SExprError> {
        let chars: Vec<char> = input.chars().collect();
        let mut idx = 0;
        let mut results = Vec::new();

        while idx < chars.len() {
            skip_whitespace(&chars, &mut idx);
            if idx >= chars.len() {
                break;
            }
            results.push(parse_one(&chars, &mut idx)?);
        }

        Ok(results)
    }

    /// Serialize this S-Expression to a formatted string.
    pub fn to_string_formatted(&self, indent_level: usize) -> String {
        let mut out = String::new();
        self.format_internal(&mut out, indent_level);
        out
    }

    fn format_internal(&self, out: &mut String, _indent: usize) {
        match self {
            SExpr::Atom(s) => out.push_str(s),
            SExpr::StringLit(s) => {
                out.push('"');
                for c in s.chars() {
                    if c == '"' || c == '\\' {
                        out.push('\\');
                    }
                    out.push(c);
                }
                out.push('"');
            }
            SExpr::List(items) => {
                out.push('(');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(' ');
                    }
                    item.format_internal(out, _indent + 1);
                }
                out.push(')');
            }
        }
    }

    pub fn get_tag(&self) -> Option<&str> {
        match self {
            SExpr::List(items) if !items.is_empty() => match &items[0] {
                SExpr::Atom(tag) => Some(tag.as_str()),
                _ => None,
            },
            _ => None,
        }
    }

    pub fn find_child_by_tag(&self, tag: &str) -> Option<&SExpr> {
        match self {
            SExpr::List(items) => items.iter().find(|item| item.get_tag() == Some(tag)),
            _ => None,
        }
    }

    pub fn find_child(&self, tag: &str) -> Option<&SExpr> {
        self.find_child_by_tag(tag)
    }

    pub fn find_children(&self, tag: &str) -> Vec<&SExpr> {
        match self {
            SExpr::List(items) => items
                .iter()
                .filter(|item| item.get_tag() == Some(tag))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn get_attr(&self, key: &str) -> Option<&str> {
        let child = self.find_child_by_tag(key)?;
        match child {
            SExpr::List(items) if items.len() >= 2 => match &items[1] {
                SExpr::Atom(s) | SExpr::StringLit(s) => Some(s.as_str()),
                _ => None,
            },
            _ => None,
        }
    }
}

fn skip_whitespace(chars: &[char], idx: &mut usize) {
    while *idx < chars.len() {
        let c = chars[*idx];
        if c.is_whitespace() {
            *idx += 1;
        } else if c == '#' || (c == ';' && (*idx + 1 < chars.len() && chars[*idx + 1] == ';')) {
            // Line comment
            while *idx < chars.len() && chars[*idx] != '\n' {
                *idx += 1;
            }
        } else {
            break;
        }
    }
}

fn parse_one(chars: &[char], idx: &mut usize) -> Result<SExpr, SExprError> {
    skip_whitespace(chars, idx);
    if *idx >= chars.len() {
        return Err(SExprError::UnexpectedEof(*idx));
    }

    match chars[*idx] {
        '(' => {
            *idx += 1; // consume '('
            let mut items = Vec::new();
            loop {
                skip_whitespace(chars, idx);
                if *idx >= chars.len() {
                    return Err(SExprError::UnexpectedEof(*idx));
                }
                if chars[*idx] == ')' {
                    *idx += 1; // consume ')'
                    break;
                }
                items.push(parse_one(chars, idx)?);
            }
            Ok(SExpr::List(items))
        }
        ')' => Err(SExprError::UnmatchedClosingParen(*idx)),
        '"' => {
            let start = *idx;
            *idx += 1; // consume '"'
            let mut s = String::new();
            while *idx < chars.len() {
                let c = chars[*idx];
                if c == '\\' {
                    *idx += 1;
                    if *idx < chars.len() {
                        s.push(chars[*idx]);
                        *idx += 1;
                    }
                } else if c == '"' {
                    *idx += 1; // consume closing '"'
                    return Ok(SExpr::StringLit(s));
                } else {
                    s.push(c);
                    *idx += 1;
                }
            }
            Err(SExprError::UnterminatedString(start))
        }
        _ => {
            // Atom
            let mut s = String::new();
            while *idx < chars.len() {
                let c = chars[*idx];
                if c.is_whitespace() || c == '(' || c == ')' || c == '"' {
                    break;
                }
                s.push(c);
                *idx += 1;
            }
            Ok(SExpr::Atom(s))
        }
    }
}

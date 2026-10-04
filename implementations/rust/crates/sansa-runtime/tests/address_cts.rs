use std::fs;
use std::path::{Path, PathBuf};

use sansa_runtime::address::{Root, parse_address};
use serde::Deserialize;

#[derive(Deserialize)]
struct Suite {
    tests: Vec<TestCase>,
}

#[derive(Deserialize)]
struct TestCase {
    id: String,
    input: Input,
    expected: Expected,
}

#[derive(Deserialize)]
struct Input {
    source: String,
}

#[derive(Deserialize)]
struct Expected {
    ok: bool,
    canonical: Option<String>,
    exact: Option<bool>,
    root: Option<String>,
    selectors: Option<Vec<String>>,
    qualifier_terms: Option<Vec<String>>,
    error: Option<String>,
}

#[test]
fn passes_every_stable_address_parser_case() {
    let path = cts_root().join("sansa/v1/suites/01-address-parser.json");
    let suite: Suite = read_json(&path);
    assert_eq!(suite.tests.len(), 32, "{path:?}");

    for test in suite.tests {
        let result = parse_address(&test.input.source);
        if test.expected.ok {
            let address =
                result.unwrap_or_else(|error| panic!("{}: unexpected {error:?}", test.id));
            if let Some(expected) = test.expected.canonical {
                assert_eq!(address.canonical, expected, "{}", test.id);
            }
            if let Some(expected) = test.expected.exact {
                assert_eq!(address.is_exact, expected, "{}", test.id);
            }
            if let Some(expected) = test.expected.root {
                let actual = match address.root {
                    Root::Absolute => "absolute",
                    Root::Contextual => "contextual",
                };
                assert_eq!(actual, expected, "{}", test.id);
            }
            if let Some(expected) = test.expected.selectors {
                let actual = address
                    .selectors
                    .iter()
                    .map(|selector| selector.kind())
                    .collect::<Vec<_>>();
                assert_eq!(actual, expected, "{}", test.id);
            }
            if let Some(expected) = test.expected.qualifier_terms {
                let actual = address
                    .qualifier_expression
                    .as_ref()
                    .map(|expression| {
                        expression
                            .terms
                            .iter()
                            .map(|term| term.name.as_str())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                assert_eq!(actual, expected, "{}", test.id);
            }
        } else {
            let error = result.expect_err(&test.id);
            assert_eq!(Some(error.code), test.expected.error, "{}", test.id);
        }
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> T {
    let source =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("failed to read {path:?}: {error}"));
    serde_json::from_str(&source)
        .unwrap_or_else(|error| panic!("failed to parse {path:?}: {error}"))
}

fn cts_root() -> PathBuf {
    if let Some(path) = std::env::var_os("AEONITE_CTS_ROOT") {
        return PathBuf::from(path);
    }
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(4)
        .expect("SANSA repository root")
        .join("..")
        .join("..")
        .join("aeonite-org")
        .join("aeonite-cts")
        .join("cts")
}

use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use sansa_runtime::{CTS_PROTOCOL, STABLE_CTS_LANES};
use serde::Deserialize;

const EXPECTED_LANES: [ExpectedLane; 4] = [
    ExpectedLane {
        manifest: "value-semantics/v1/value-semantics-cts.v1.json",
        capability: "AEON.ValueSemantics",
        snapshot_id: "value-semantics-cts-v1-snapshot-0.1",
        stable_cases: 51,
        experimental_cases: 0,
    },
    ExpectedLane {
        manifest: "sansa/v1/sansa-address-parser-cts.v1.json",
        capability: "SANSA.Addressing",
        snapshot_id: "sansa-address-parser-cts-v1-snapshot-0.1",
        stable_cases: 32,
        experimental_cases: 0,
    },
    ExpectedLane {
        manifest: "sansa/v1/sansa-resolve-cts.v1.json",
        capability: "SANSA.Resolve",
        snapshot_id: "sansa-resolve-cts-v1-snapshot-0.1",
        stable_cases: 37,
        experimental_cases: 0,
    },
    ExpectedLane {
        manifest: "sansa/v1/sansa-query-parser-cts.v1.json",
        capability: "SANSA.Query",
        snapshot_id: "sansa-query-parser-cts-v1-snapshot-0.2",
        stable_cases: 226,
        experimental_cases: 13,
    },
];

#[derive(Debug, Clone, Copy)]
struct ExpectedLane {
    manifest: &'static str,
    capability: &'static str,
    snapshot_id: &'static str,
    stable_cases: usize,
    experimental_cases: usize,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    meta: ManifestMetadata,
    suites: Vec<SuiteReference>,
}

#[derive(Debug, Deserialize)]
struct ManifestMetadata {
    capability: String,
    snapshot_id: String,
    sut_protocol: String,
}

#[derive(Debug, Deserialize)]
struct SuiteReference {
    id: String,
    file: String,
}

#[derive(Debug, Deserialize)]
struct Suite {
    tests: Vec<TestCase>,
}

#[derive(Debug, Deserialize)]
struct TestCase {
    id: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    conformance: TestConformance,
}

#[derive(Debug, Default, Deserialize)]
struct TestConformance {
    maturity: Option<String>,
}

#[test]
fn reads_pinned_stable_cts_manifests_without_private_fixture_copies() {
    let cts_root = cts_root();
    let mut observed_snapshots = HashSet::new();

    for lane in EXPECTED_LANES {
        let manifest_path = cts_root.join(lane.manifest);
        let manifest: Manifest = read_json(&manifest_path);
        assert_eq!(
            manifest.meta.capability, lane.capability,
            "{manifest_path:?}"
        );
        assert_eq!(
            manifest.meta.snapshot_id, lane.snapshot_id,
            "{manifest_path:?}"
        );
        assert_eq!(
            manifest.meta.sut_protocol, CTS_PROTOCOL,
            "{manifest_path:?}"
        );
        assert!(!manifest.suites.is_empty(), "{manifest_path:?}");
        assert!(observed_snapshots.insert(manifest.meta.snapshot_id.clone()));

        let manifest_dir = manifest_path.parent().expect("manifest parent directory");
        let mut suite_ids = HashSet::new();
        let mut test_ids = HashSet::new();
        let mut stable_cases = 0;
        let mut experimental_cases = 0;

        for suite_reference in manifest.suites {
            assert!(!suite_reference.id.is_empty(), "{manifest_path:?}");
            assert!(suite_ids.insert(suite_reference.id), "{manifest_path:?}");
            assert_safe_relative_path(&suite_reference.file);
            let suite_path = manifest_dir.join(&suite_reference.file);
            let suite: Suite = read_json(&suite_path);
            assert!(!suite.tests.is_empty(), "{suite_path:?}");

            for test in suite.tests {
                assert!(!test.id.is_empty(), "{suite_path:?}");
                let experimental = is_experimental(&test);
                assert!(test_ids.insert(test.id), "{suite_path:?}");
                if experimental {
                    experimental_cases += 1;
                } else {
                    stable_cases += 1;
                }
            }
        }

        assert_eq!(stable_cases, lane.stable_cases, "{manifest_path:?}");
        assert_eq!(
            experimental_cases, lane.experimental_cases,
            "{manifest_path:?}"
        );
    }

    let tracked_snapshots = STABLE_CTS_LANES
        .iter()
        .map(|lane| lane.snapshot_id)
        .collect::<HashSet<_>>();
    assert_eq!(
        observed_snapshots
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>(),
        tracked_snapshots
    );
}

fn is_experimental(test: &TestCase) -> bool {
    test.conformance.maturity.as_deref() == Some("experimental")
        || test.tags.iter().any(|tag| tag == "experimental")
}

fn assert_safe_relative_path(path: &str) {
    let path = Path::new(path);
    assert!(!path.is_absolute(), "suite path must be relative: {path:?}");
    assert!(
        path.components()
            .all(|component| matches!(component, Component::Normal(_))),
        "suite path must not escape its manifest directory: {path:?}"
    );
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

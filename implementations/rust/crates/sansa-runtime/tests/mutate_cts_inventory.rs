use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

use sansa_runtime::{
    CTS_PROTOCOL, CapabilityStatus, EXPERIMENTAL_MUTATE_CTS_SLICES, MUTATE_CTS_SNAPSHOT_ID,
    MutateCtsSurface,
};
use serde::Deserialize;
use serde_json::Value;

const MANIFEST_PATH: &str = "sansa/v1/sansa-mutate-cts.v1.json";

#[derive(Debug, Deserialize)]
struct Manifest {
    meta: ManifestMetadata,
    suites: Vec<SuiteReference>,
}

#[derive(Debug, Deserialize)]
struct ManifestMetadata {
    capability: String,
    profile: String,
    snapshot_id: String,
    sut_protocol: String,
    conformance: ManifestConformance,
}

#[derive(Debug, Deserialize)]
struct ManifestConformance {
    surface: String,
    experimental_default: String,
}

#[derive(Debug, Deserialize)]
struct SuiteReference {
    id: String,
    file: String,
}

#[derive(Debug, Deserialize)]
struct Suite {
    meta: SuiteMetadata,
    tests: Vec<TestCase>,
}

#[derive(Debug, Deserialize)]
struct SuiteMetadata {
    lane: String,
    capability: String,
    profile: String,
    sut_protocol: String,
}

#[derive(Debug, Deserialize)]
struct TestCase {
    id: String,
    #[serde(default)]
    tags: Vec<String>,
    input: TestInput,
}

#[derive(Debug, Deserialize)]
struct TestInput {
    mode: String,
    #[serde(default)]
    target: Option<Value>,
}

#[test]
fn inventories_pinned_experimental_mutate_surfaces_independently() {
    let cts_root = cts_root();
    let manifest_path = cts_root.join(MANIFEST_PATH);
    let manifest: Manifest = read_json(&manifest_path);

    assert_eq!(manifest.meta.capability, "SANSA.Mutate");
    assert_eq!(manifest.meta.profile, "mutate-plan-and-policy");
    assert_eq!(manifest.meta.snapshot_id, MUTATE_CTS_SNAPSHOT_ID);
    assert_eq!(manifest.meta.sut_protocol, CTS_PROTOCOL);
    assert_eq!(manifest.meta.conformance.surface, "experimental");
    assert_eq!(manifest.meta.conformance.experimental_default, "exclude");
    assert_eq!(manifest.suites.len(), 1);

    let manifest_dir = manifest_path.parent().expect("manifest parent directory");
    let mut suite_ids = HashSet::new();
    let mut test_ids = HashSet::new();
    let mut observed = HashMap::new();

    for suite_reference in manifest.suites {
        assert!(!suite_reference.id.is_empty(), "{manifest_path:?}");
        assert!(suite_ids.insert(suite_reference.id), "{manifest_path:?}");
        assert_safe_relative_path(&suite_reference.file);

        let suite_path = manifest_dir.join(&suite_reference.file);
        let suite: Suite = read_json(&suite_path);
        assert_eq!(suite.meta.lane, "sansa-mutate", "{suite_path:?}");
        assert_eq!(suite.meta.capability, "SANSA.Mutate", "{suite_path:?}");
        assert_eq!(
            suite.meta.profile, "mutate-plan-and-policy",
            "{suite_path:?}"
        );
        assert_eq!(suite.meta.sut_protocol, CTS_PROTOCOL, "{suite_path:?}");
        assert!(!suite.tests.is_empty(), "{suite_path:?}");

        for test in suite.tests {
            assert!(!test.id.is_empty(), "{suite_path:?}");
            assert!(test_ids.insert(test.id.clone()), "{suite_path:?}");
            assert!(
                test.tags.iter().any(|tag| tag == "experimental"),
                "{} must remain explicitly experimental",
                test.id
            );

            let surface = classify_surface(&test);
            *observed.entry(surface).or_insert(0usize) += 1;
        }
    }

    assert_eq!(test_ids.len(), 106);
    assert_eq!(observed.len(), EXPERIMENTAL_MUTATE_CTS_SLICES.len());

    for slice in EXPERIMENTAL_MUTATE_CTS_SLICES {
        assert_eq!(slice.capability, manifest.meta.capability);
        assert_eq!(slice.snapshot_id, manifest.meta.snapshot_id);
        assert_eq!(slice.profile, manifest.meta.profile);
        assert_eq!(observed.get(&slice.surface), Some(&slice.case_count));
        let expected_status = if matches!(
            slice.surface,
            MutateCtsSurface::Plan | MutateCtsSurface::TargetValidation
        ) {
            CapabilityStatus::Implemented
        } else {
            CapabilityStatus::NotImplemented
        };
        assert_eq!(slice.status, expected_status);
    }
}

fn classify_surface(test: &TestCase) -> MutateCtsSurface {
    match test.input.mode.as_str() {
        "plan" if test.input.target.is_some() => MutateCtsSurface::TargetValidation,
        "plan" => MutateCtsSurface::Plan,
        "apply" => MutateCtsSurface::Apply,
        "policy" => MutateCtsSurface::Policy,
        mode => panic!("{}: unclassified Mutate CTS mode {mode:?}", test.id),
    }
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

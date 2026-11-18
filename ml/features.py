"""The unchanged API feature contract and its documented collection policy."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    kind: str
    minimum: float
    maximum: float | None
    meaning: str
    extraction: str
    historical: bool


FEATURES: tuple[FeatureSpec, ...] = (
    FeatureSpec("files_changed", "int", 0, None, "Distinct paths changed on the incoming source branch since the merge base.", "git diff --name-only <base> <source>; direct Git metadata.", False),
    FeatureSpec("lines_added", "int", 0, None, "Text lines added on the incoming source branch since the merge base; binary files are excluded.", "Sum additions from git diff --numstat <base> <source>; direct Git metadata.", False),
    FeatureSpec("commit_severity", "float", 0, 1, "Unspecified severity score for the relevant change set; the existing API does not define its formula.", "Not extracted until a stable, pre-merge definition and normalization are agreed.", False),
    FeatureSpec("developer_commits", "int", 0, None, "Commit activity attributed to a relevant developer; developer identity and time window are unspecified.", "Requires an explicit actor/window definition and Git author metadata; not collected by default.", True),
    FeatureSpec("avg_files_per_commit", "float", 0, None, "Mean distinct first-parent changed paths per source-branch commit after the merge base.", "Per-commit git diff-tree path counts; direct Git metadata using the documented first-parent convention.", False),
    FeatureSpec("developer_conflicts", "int", 0, None, "Past attempted-merge conflict count attributed to a developer before the prediction snapshot.", "Requires a time-ordered, identity-attributed merge-outcome history; never derived from the current label.", True),
    FeatureSpec("activity_score", "float", 0, None, "Unspecified developer or branch activity score; scale and lookback are not defined by the API.", "Not extracted until score formula, time window, and prediction-time cutoff are defined.", True),
    FeatureSpec("import_count", "int", 0, None, "Import statements relevant to the candidate changes; language and counting rules are unspecified.", "Requires language-aware parsing and a supported-language policy; not collected by the Git-only collector.", False),
    FeatureSpec("dependency_conflicts", "int", 0, None, "Historical dependency-related conflict count, distinct from the current merge-conflict target.", "Requires a documented dependency-conflict label and past-only repository history; not inferred from current conflict status.", True),
    FeatureSpec("coverage", "float", 0, 1, "Test coverage measured for a specified pre-merge snapshot and test environment.", "Only from a recorded coverage artifact produced before the attempted merge; the collector does not run tests.", False),
    FeatureSpec("branch_commits", "int", 0, None, "Target-branch first-parent commits after the merge base.", "git rev-list --first-parent --count <base>..<target>; direct Git metadata.", False),
    FeatureSpec("branch_files_changed", "int", 0, None, "Distinct paths changed on the target branch since the merge base.", "git diff --name-only <base> <target>; direct Git metadata.", False),
    FeatureSpec("branch_conflicts", "int", 0, None, "Historical merge conflicts associated with the target branch before the snapshot.", "Requires traceable prior merge-attempt outcomes and a fixed lookback; not derivable from one merge attempt.", True),
    FeatureSpec("branch_risk_score", "float", 0, None, "Unspecified historical target-branch risk aggregate; formula and window are undefined.", "Not extracted until defined; if later derived from labels, compute using training-fold history only.", True),
    FeatureSpec("pattern_frequency", "int", 0, None, "Frequency of a defined conflict pattern observed before the prediction snapshot.", "Requires a versioned pattern taxonomy and past-only conflict examples; no patterns are defined yet.", True),
    FeatureSpec("pattern_conflicts", "int", 0, None, "Prior conflict outcomes associated with a defined pattern.", "Requires historical labeled merges and a fixed pattern-matching rule; never use the current target.", True),
    FeatureSpec("dependency_risk", "float", 0, 1, "Unspecified dependency-related risk value on a 0–1 scale.", "Requires an agreed, past-only calculation and dependency evidence; currently unavailable.", True),
    FeatureSpec("pattern_risk", "float", 0, 1, "Unspecified pattern-related risk value on a 0–1 scale.", "Requires an agreed, past-only calculation and versioned pattern taxonomy; currently unavailable.", True),
)

FEATURE_NAMES: tuple[str, ...] = tuple(feature.name for feature in FEATURES)
FEATURE_BY_NAME = {feature.name: feature for feature in FEATURES}
INTEGER_FEATURES = frozenset(feature.name for feature in FEATURES if feature.kind == "int")

# A narrow, pre-merge Git-metadata baseline: the five fields consistently
# measurable across repositories with the current local-only collector.
MODEL_FEATURES: tuple[str, ...] = (
    "files_changed",
    "lines_added",
    "avg_files_per_commit",
    "branch_commits",
    "branch_files_changed",
)

TARGET_COLUMN = "merge_conflict"
TARGET_DEFINITION = "1 when the Git merge algorithm reports content/tree conflicts for the attempted source-into-target merge; 0 when that merge completes without conflicts."

PROVENANCE_COLUMNS: tuple[str, ...] = (
    "repo_fingerprint",
    "source_ref",
    "target_ref",
    "base_commit",
    "source_commit",
    "target_commit",
    "snapshot_timestamp",
    "collected_at",
    "git_version",
    "label_method",
    "collector_version",
)

DATASET_COLUMNS: tuple[str, ...] = FEATURE_NAMES + (TARGET_COLUMN,) + PROVENANCE_COLUMNS

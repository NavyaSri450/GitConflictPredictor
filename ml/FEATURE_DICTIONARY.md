# Feature dictionary â€” current 18-field API

This table documents the existing `PredictionRequest` contract without changing it. Data collection fills only the five fields with an unambiguous Git-only definition below. Every other feature is written as blank (`NaN` when read); blank means unknown, never zero.

The initial baseline model uses only the five measured fields listed in [FEATURE_EXTRACTION_REVIEW.md](FEATURE_EXTRACTION_REVIEW.md). All 18 request fields remain in the API and dataset schema; the unused 13 stay missing and are explicitly excluded from this baseline.

Source/target convention for the collector: `source` is the incoming branch and `target` is the branch it would merge into. The feature names do not encode that distinction, so this convention is versioned here and in the collector label method. Both branch tips, their merge base, and refs are retained for traceability.

| Feature | Type and API range | Meaning and extraction | Availability / missing data |
| --- | --- | --- | --- |
| `files_changed` | integer, 0+ | Number of distinct paths changed by incoming source since the merge base (`git diff --name-only base source`). | Direct Git metadata; collected. |
| `lines_added` | integer, 0+ | Text-line additions on incoming source since base (`git diff --numstat`); binary files have no line count and are excluded. | Direct Git metadata; collected. |
| `commit_severity` | float, 0â€“1 | A severity score, but no formula or interpretation is defined in the current contract. | Not collected until a stable pre-merge definition is agreed. |
| `developer_commits` | integer, 0+ | Commits attributable to a relevant developer. Identity and lookback are undefined. | Requires explicit developer and time-window policy; blank otherwise. |
| `avg_files_per_commit` | float, 0+ | Mean distinct paths changed for first-parent commits on incoming source after base; merge commits compare to their first parent. | Direct Git metadata under this documented convention; collected. |
| `developer_conflicts` | integer, 0+ | Prior attempted-merge conflicts attributable to a developer before the snapshot. | Requires time-ordered labeled history and identity policy; never derive from the current target label. |
| `activity_score` | float, 0+ | Activity score with no formula, unit, or time window in the current contract. | Not collected until normalized definition and cutoff exist. |
| `import_count` | integer, 0+ | Relevant import statements; language and counting rules are unspecified. | Requires a language-aware parser policy; Git-only collector leaves blank. |
| `dependency_conflicts` | integer, 0+ | Historical dependency-related conflict count, separate from the current merge-conflict label. | Requires a separate historical label definition; blank otherwise. |
| `coverage` | float, 0â€“1 | Coverage for a specifically identified pre-merge revision and test environment. | Use only a recorded pre-merge coverage artifact; collector does not run tests. |
| `branch_commits` | integer, 0+ | Target branch first-parent commits after base (`git rev-list --first-parent --count base..target`). | Direct Git metadata under this convention; collected. |
| `branch_files_changed` | integer, 0+ | Distinct paths changed by target since base (`git diff --name-only base target`). | Direct Git metadata under this convention; collected. |
| `branch_conflicts` | integer, 0+ | Historical conflicts associated with target before the snapshot. | Requires prior labeled merge outcomes and a fixed lookback; blank otherwise. |
| `branch_risk_score` | float, 0+ | Historical target-branch score; formula and scale are unspecified. | Requires a past-only definition; calculate within training folds if label-derived. |
| `pattern_frequency` | integer, 0+ | Frequency of a defined conflict pattern observed before the snapshot. | Requires a versioned pattern taxonomy and prior examples; blank otherwise. |
| `pattern_conflicts` | integer, 0+ | Prior conflicts associated with a defined pattern. | Requires historical labels and fixed matching rules; never use the current outcome. |
| `dependency_risk` | float, 0â€“1 | Dependency-related risk score with no current formula. | Requires dependency evidence and a past-only normalization; blank otherwise. |
| `pattern_risk` | float, 0â€“1 | Pattern-related risk score with no current formula. | Requires a versioned taxonomy and past-only normalization; blank otherwise. |

## Measurement and leakage policy

- The collector can directly extract **5/18** fields: `files_changed`, `lines_added`, `avg_files_per_commit`, `branch_commits`, and `branch_files_changed`.
- Historical, actor-specific, normalized, or language-specific features stay missing until their definitions and evidence sources are specified. Do not substitute zero, guessed values, current merge outcome, or post-merge test results.
- The target `merge_conflict` is never a predictor. Historical aggregates must use only examples whose snapshot precedes the current snapshot and must be recomputed inside each training fold.
- Raw CSV values remain blank. The model pipeline uses median imputation for the selected five inputs, fit only on each training fold. If a selected input is entirely absent in a fold, training stops rather than filling it with an arbitrary constant. The 13 unused API fields are not imputed into model inputs.
- `coverage` must have been available before the merge attempt. Running tests after the candidate merge would leak future information and may also produce unrelated build/test failures.

Several current field names do not define who, what branch, time window, or scale they refer to. The collector's source/target conventions make its five directly extractable values reproducible, but do not resolve the other ambiguities or alter the API contract.

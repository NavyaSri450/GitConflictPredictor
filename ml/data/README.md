# Local merge dataset workflow

For a beginner-friendly Windows PowerShell workflow that starts with public repositories you choose and clone yourself, see [PUBLIC_REPOSITORY_WORKFLOW.md](PUBLIC_REPOSITORY_WORKFLOW.md).

The collector accepts only an explicitly supplied local working-copy path. It never downloads a repository, contacts GitHub, fetches a remote, or reads remote URLs. It creates a temporary clone with no checkout, uses Git's non-local clone transport to avoid hard links, disables ambient Git environment/configuration overrides, disables system config, and uses an empty clone template. Merge attempts run against that temporary copy; transient merge-tree objects are discarded with it. The source working copy is not checked out, indexed, merged, or written to.

The collector uses `git merge-tree --write-tree --merge-base=<base> <target> <source>`. Git documents that this performs a merge without touching the working tree or index and returns 0 for a clean merge and 1 when conflicts are present. Exit codes other than 0 or 1 are collection errors and produce no label. No build or test command is run. The installed Git version and the resolved base/source/target commits are recorded for each row.

## Label definition

`merge_conflict=1` means Git's merge algorithm reports a content/tree conflict for this explicit source-into-target commit pair. `merge_conflict=0` means Git reports a clean merge. This is a reproducible merge attempt performed by `merge-tree`; it is not evidence that a historical human merge was attempted. A build failure, failed test, authentication error, unrelated Git error, missing common ancestor, invalid ref, or non-diverged/no-op pair is not labeled 1 or 0. Errors and no-op pairs are skipped.

The label depends on the recorded Git version and the collector's isolated default merge configuration. The collector checks tracked attributes from both branch tips and refuses custom merge drivers; it never executes their commands. Labels therefore describe the controlled built-in Git merge behavior and may differ from a repository owner's custom local/global merge configuration. The collector does not execute repository hooks, project scripts, tests, or builds.

## Collect from a local repository

First create or obtain the repository yourself and decide which source/target pairs are appropriate. Then, from the project root, with the ML dependencies installed:

```powershell
python -m ml.data.collector --repo "D:\work\my-local-repo" --repository-id "team-project-01" --pair "feature/cleanup" "main" --pair "feature/refactor" "main"
```

For a pilot with multiple repositories, run the command once per repository and assign each a stable, non-sensitive ID. These commands only read local repositories that you explicitly name; they append to the same raw CSV and deduplicate repository/source/target commit triplets:

```powershell
python -m ml.data.collector --repo "D:\work\service-a" --repository-id "service-a" --pair "feature/a" "main" --pair "feature/b" "main"
python -m ml.data.collector --repo "D:\work\service-b" --repository-id "service-b" --pair "topic/c" "develop"
```

Choose maintained repositories with complete local history, known branch pairs that have both diverged from a common base, and a mix of likely clean/conflicting cases selected without looking at the collector's resulting labels. Record the selection rationale outside the CSV. Avoid many near-identical pairs from the same commit family; they are correlated and the evaluator groups repositories, not individual rows. Track class balance after collection with the validator's reported distribution. If a class is absent or too rare, collect more eligible pairs from additional repositories rather than resampling or fabricating rows. Keep each repository ID stable across collection runs so repository-aware splitting can detect related examples.

The output defaults to `ml/data/raw/merge_examples.csv`. Use a stable, non-sensitive `--repository-id` when collecting from the same repository at different paths. Otherwise a one-way hash of the local path is used as a grouping ID. Branch/ref names and commit hashes are retained for auditability; raw and processed data folders are ignored by Git. Do not use private data in shared artifacts.

Rows contain numerical features, the binary label, repository fingerprint, refs, commit IDs, a `snapshot_timestamp` equal to the later source/target tip committer timestamp (a timeline proxy, not an actual historical merge-event time), actual `collected_at`, Git version, label method, and collector version. They do not contain commit messages, author names/emails, source code, remotes, or credentials. Five well-defined features are currently extracted; the rest remain blank. Repeated repository/source/target commit triplets are not appended twice.

Validate and copy raw rows into the separate processed area (no imputation occurs in this step):

```powershell
python -m ml.data.prepare --input ml/data/raw/merge_examples.csv --output ml/data/processed/merge_examples.csv
```

Inspect provenance and missingness before training. The initial baseline uses only the five measured Git fields; the other 13 API fields remain blank and are explicitly excluded. A real dataset still needs sufficient labeled examples and repository diversity. Repository holdout is preferred. The single-repository fallback sorts by tip-commit timestamps; this proxy can be skewed and cannot represent real historical merge-event ordering, so results from it are limited and explicitly reported. See [the feature review](../FEATURE_EXTRACTION_REVIEW.md) for the per-field decisions.

## Git references

- [git clone](https://git-scm.com/docs/git-clone) documents `--no-hardlinks` and `--no-checkout`.
- [git merge-tree](https://git-scm.com/docs/git-merge-tree) documents no working-tree/index changes and its 0/1 exit-status semantics.
- [git check-attr](https://git-scm.com/docs/git-check-attr) documents checking attributes against a selected commit/tree.
- [gitattributes](https://git-scm.com/docs/gitattributes) documents built-in and custom merge drivers.


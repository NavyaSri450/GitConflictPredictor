# Stage 6A: collect examples from public Git repositories

This guide is for a person who chooses public repositories and runs every clone and collection command locally. GitNexus does not discover repositories, contact GitHub, or fetch remotes automatically. The collector accepts only a local repository path.

## Keep test fixtures separate from research data

| Data | Purpose | Location / handling |
| --- | --- | --- |
| Test fixtures | Small controlled temporary repositories and rows used to test collector behavior. They are not evidence about public repositories. | `ml/tests/`; Git repositories are created under pytest temporary directories. Never append these rows to the raw CSV. |
| Public repository collection | Reproducible merge outcomes for explicitly selected commit pairs from repositories you chose. | `ml/data/raw/merge_examples.csv`, then `ml/data/processed/merge_examples.csv`. These directories are Git-ignored; do not commit them. |

The collector's label is a fresh `git merge-tree` result for the selected branch tips, not proof that project contributors historically attempted that merge. The collection describes only those selected commits, Git's recorded version, and the collector's controlled built-in merge behavior. It does not represent every project, branch, merge strategy, or real-world conflict.

## 1. Install and verify Git

In PowerShell, install Git for Windows with Windows Package Manager:

```powershell
winget install --id Git.Git --exact
```

Close and reopen PowerShell, then verify installation:

```powershell
git --version
```

If `winget` is unavailable, install Git for Windows from [git-scm.com](https://git-scm.com/download/win), reopen PowerShell, and run `git --version` again. These are instructions only; no installation or network access is performed by GitNexus.

## 2. Prepare the Python environment

Run these commands from the GitNexus project root. They create or reuse the project's backend virtual environment and install the existing backend and lightweight ML requirements:

```powershell
py --version
py -m venv backend\.venv
& .\backend\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
& .\backend\.venv\Scripts\python.exe -m pip install -r ml\requirements.txt
```

If `py` is not recognized, install Python 3.10 or newer and reopen PowerShell. The commands below assume the current directory is still the project root.

## 3. Clone a public repository yourself

Choose a public repository whose license and intended use permit your research. Replace `OWNER`, `REPOSITORY`, and the destination with the project you chose. A normal full clone is recommended; do not use `--depth`, because shallow history can prevent Git from finding the true merge base.

```powershell
$CollectionRoot = 'D:\gitnexus-public-repos'
New-Item -ItemType Directory -Force -Path $CollectionRoot | Out-Null
git clone 'https://github.com/OWNER/REPOSITORY.git' (Join-Path $CollectionRoot 'REPOSITORY')
```

The clone command above is an explicit user-run network action. GitNexus itself does not run it. The collector later reads the named local clone and makes its own disposable temporary copy; it does not modify the named clone or use its remote.

## 4. Inspect branches and choose a pair

Set `$Repo` to the clone you made. List local and remote-tracking branches and inspect recent commits:

```powershell
$Repo = 'D:\gitnexus-public-repos\REPOSITORY'
git -C $Repo branch --all --no-color
git -C $Repo log --all --oneline --decorate -20
```

Select an incoming source branch and the target branch it would be merged into. For example, replace the sample names with branch names shown by `git branch --all`:

```powershell
$Source = 'origin/feature-x'
$Target = 'origin/main'
$Base = git -C $Repo merge-base $Source $Target
if ($LASTEXITCODE -ne 0 -or -not $Base) { throw 'No common merge base; choose another pair or check that the clone has complete history.' }
$Divergence = (git -C $Repo rev-list --left-right --count "$Target...$Source") -split '\s+'
"Merge base: $Base"
"Target-only commits: $($Divergence[0]); source-only commits: $($Divergence[1])"
```

Both counts should be greater than zero: that means both tips contain commits after they diverged. The collector rejects identical or non-diverged/no-op pairs. It records the resolved commit IDs, so branch names may later move without changing the row's recorded commit identity.

If the repository has changed since cloning and you decide to update it, fetch manually and then re-inspect the refs. This optional command contacts the configured remote:

```powershell
git -C $Repo fetch origin
git -C $Repo branch --all --no-color
```

The collector never runs `fetch` for you.

## 5. Collect selected branch pairs

From the GitNexus project root, use a stable, non-sensitive ID for each repository. Repeat `--pair` for more pairs in the same repository:

```powershell
$RepositoryId = 'owner-repository'
& .\backend\.venv\Scripts\python.exe -m ml.data.collector `
  --repo $Repo `
  --repository-id $RepositoryId `
  --pair $Source $Target
```

To add another deliberately selected pair, repeat `--pair` before running the command:

```powershell
& .\backend\.venv\Scripts\python.exe -m ml.data.collector `
  --repo $Repo `
  --repository-id $RepositoryId `
  --pair 'origin/feature-x' 'origin/main' `
  --pair 'origin/feature-y' 'origin/main'
```

Run the command once for each additional local repository, using a different stable ID and the same default output file. The raw CSV is appended to and duplicate `(repo_fingerprint, source_commit, target_commit)` triplets are skipped. Without `--repository-id`, the collector hashes the local path; a stable explicit ID avoids treating the same repository at different paths as separate groups.

The CLI arguments are:

- `--repo`: required local working-copy directory; a URL is not accepted.
- `--pair SOURCE TARGET`: required and repeatable; source is merged into target.
- `--repository-id`: optional stable alias used for provenance and repository grouping.
- `--output`: optional raw CSV destination; defaults to `ml/data/raw/merge_examples.csv`.

The collector skips pairs with unsupported custom merge drivers, missing common history, invalid refs, or other Git errors; skipped cases receive no label. It does not run project hooks, tests, or builds and does not collect source files, commit messages, author names/emails, remotes, or credentials.

## 6. Prepare and inspect the dataset

Validate the raw file and copy it to the separate processed location. This preserves missing feature values and prints class and repository counts; it does not impute or synthesize rows:

```powershell
& .\backend\.venv\Scripts\python.exe -m ml.data.prepare `
  --input ml/data/raw/merge_examples.csv `
  --output ml/data/processed/merge_examples.csv
```

Inspect class balance and repository group sizes:

```powershell
Import-Csv ml/data/processed/merge_examples.csv |
  Group-Object merge_conflict |
  Select-Object Name, Count

Import-Csv ml/data/processed/merge_examples.csv |
  Group-Object repo_fingerprint |
  Sort-Object Count -Descending |
  Select-Object Name, Count
```

Check for duplicate repository/source/target commit triplets:

```powershell
Import-Csv ml/data/processed/merge_examples.csv |
  Group-Object { "$($_.repo_fingerprint)|$($_.source_commit)|$($_.target_commit)" } |
  Where-Object Count -gt 1 |
  Select-Object Name, Count
```

No output from the duplicate check means no duplicates were found. If validation reports a missing file, no raw examples have been collected yet. If one class is absent or scarce, choose more eligible pairs across repositories; do not duplicate, rebalance by fabrication, or create synthetic rows.

## 7. Avoid repository leakage and overclaiming

- Keep one repository ID per repository across every collection run and path. Otherwise related rows may appear to belong to independent repositories.
- Prefer examples from several independent repositories. Many branch pairs from one repository are correlated. The current evaluator keeps repository groups together; two repository groups are insufficient for its repository holdout policy. A single-repository time split uses tip commit timestamps as an imperfect proxy, not real merge-event time.
- Do not randomly split rows from the same repository between training and testing.
- Avoid collecting many near-identical pairs from the same commit family. Record your repository and pair-selection rationale separately from the CSV.
- Track Git version and class distribution; the validator records/reports them. Do not interpret class balance alone as dataset quality.
- Public visibility does not mean the dataset represents all real-world conflicts. These are controlled reproducible outcomes for a selected sample and built-in Git merge behavior.
- Never put raw or processed public repository data in source control. The directories are ignored by `.gitignore`; verify before sharing or backing up artifacts.

## Repository suitability checklist

- [ ] Public repository and its license/terms permit the intended research use.
- [ ] Full local Git history is available, and the selected branches have a common merge base.
- [ ] Both source and target have commits beyond that base.
- [ ] Pair selection is documented and not based only on the collector's observed result.
- [ ] Repository ID is stable, non-sensitive, and unique to this repository.
- [ ] Repository content is mature enough that selected branches and history are meaningful; avoid generated mirrors, empty repositories, and unrelated forks of an already included repository.
- [ ] The selection adds repository or branch diversity rather than many near-duplicate rows.
- [ ] You understand the label is a current reproducible `merge-tree` result, not a historical record of a human merge attempt.

## Keep collection separate from training

This Stage 6A workflow ends after collection, preparation, and manual quality review. It intentionally does not train a model or connect one to the application. Test fixtures remain in `ml/tests`; collected research rows remain in the ignored raw/processed directories.

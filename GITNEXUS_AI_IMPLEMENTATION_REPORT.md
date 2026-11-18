# GITNEXUS AI — Implementation and Integration Report

**Report date:** 2026-11-18  
**Project:** GITNEXUS AI — Predictive Merge Intelligence  
**Tagline:** “See the merge before it happens.”

## 1. Project Overview

The existing application was upgraded in place. The React/Vite frontend, FastAPI backend, API contracts, saved exploratory Random Forest, collection pipeline, datasets, and seven-page architecture were retained. A recoverable pre-upgrade archive is present at `backups/pre-upgrade-2026-11-18.zip`.

The main addition is a real repository workflow: explicitly connect a public GitHub repository or an allowlisted local repository, list available refs, inspect two committed tips, extract supported measurements, run Git’s merge-tree check in a temporary isolated snapshot, and persist the result in SQLite. The actual Git outcome and the model estimate are displayed separately.

All 12 previously completed stages remain represented in the project; none was removed or restarted. The currently checked-in/application state differed from the stale two-row description in the upgrade brief: the raw and processed datasets already contained 20 real examples when inspected. No additional training examples were added in this upgrade. No dependency manifests received new dependencies for this integration work.

## 2. Frontend Implementation

The existing Stage 9 visual design and seven pages were kept. The work extends their real data and interaction flows instead of replacing the UI.

- **Merge Observatory:** reads repository counts, analysis outcomes, recent analyses, and activity from FastAPI; browser-only prediction counts remain labeled separately.
- **Collision Studio:** repository connection, branch selection, measured feature display, actual Git merge check, and separate optional model estimate. The existing manual five-input prediction form remains available in an advanced disclosure. The page avoids initially selecting refs at the same commit, collapses repository switching controls after connection, and offers verified Flask and Vitest conflict/clean pair shortcuts that fill the branch selectors; the user still runs the actual Git check by clicking Analyze branches.
- **Conflict DNA:** displays changed paths and overlap from saved analyses. Overlap is not presented as proof of a conflict.
- **Simulation Lab:** retains model what-if scoring and surfaces saved repository branch analyses.
- **Intelligence Archive:** combines browser-local successful prediction responses with searchable/filterable backend SQLite repository analyses.
- **Compare Runs:** compares saved prediction responses and can compare two persisted repository analyses through FastAPI.
- **System Pulse:** reports health, model readiness, model metadata, dataset validation/completeness, integration services, response timings, and the recorded evaluation report.

Charts and data views use API/dataset values: observed class balance, repository-group counts, collection timeline, feature completeness, actual measured response timings, branch change summaries, and the held-out confusion matrix. Empty, loading, unavailable, and backend-error states remain explicit. The model evaluation view marks the model exploratory and shows the held-out sample size.

Prediction-only history remains in browser localStorage. Repository connections and branch analyses are persisted by the backend in SQLite.

## 3. Backend Implementation

Existing FastAPI prediction, model loading, Pydantic prediction contract, dataset summary, health/readiness routes, and CORS middleware were reused. Additions include:

- `backend/app/services/repository_service.py`: public URL validation, managed public clone, local-path allowlist, branch listing, isolated analysis, merge-driver refusal, feature extraction, and persistence integration.
- `backend/app/services/analysis_store.py`: SQLite repository and analysis storage, filtering, comparison, and dashboard aggregates.
- `backend/app/api/repositories.py`: repository, analysis-history, dashboard, and integration-status routes.
- `backend/app/services/model_evaluation.py` and `backend/app/schemas/evaluation.py`: validated, path-free readout of the existing saved evaluation report.
- Repository and evaluation request/response schemas, configuration, API client validation, and integration tests.

Repository analysis copies only the selected refs into an isolated temporary snapshot. A compatibility issue was fixed: bundles containing `refs/remotes/*` are not cloned as branch refs by Git. The service now maps the selected commits to temporary local branch refs before creating the bundle, verifies their SHAs, and leaves repository refs and working trees untouched. Regression coverage confirms remote-tracking refs work. Custom merge-driver protections remain enabled.

Added endpoints include `/api/v1/repositories/connect`, `/api/v1/repositories`, `/api/v1/repositories/{id}/branches`, `/api/v1/repositories/{id}/analyze`, `/api/v1/analyses`, `/api/v1/analyses/{id}`, `/api/v1/analyses/compare`, `/api/v1/dashboard`, `/api/v1/integration-status`, and `/api/v1/model-evaluation`.

The frontend and backend communicated successfully. A real local Vitest clone was connected, refs were listed, the existing user-event branch pair was analyzed, and FastAPI returned its actual merge base, divergence counts, changed paths, merge-tree conflict result, measured five features, and saved-model estimate. A second existing Vitest pair returned a clean result. Both source repositories remained read-only.

## 4. Dataset Collection

The verified dataset predates this integration upgrade; this work did not run the research collector or modify either CSV.

| Public repository | URL | Examples | Clean (0) | Conflict (1) |
| --- | --- | ---: | ---: | ---: |
| `pallets-flask` | https://github.com/pallets/flask | 2 | 1 | 1 |
| `go-git-go-git` | https://github.com/go-git/go-git | 2 | 2 | 0 |
| `expressjs-express` | https://github.com/expressjs/express | 1 | 1 | 0 |
| `sharkdp-fd` | https://github.com/sharkdp/fd | 1 | 1 | 0 |
| `vitest-dev-vitest` | https://github.com/vitest-dev/vitest | 4 | 1 | 3 |
| `fastify-fastify` | https://github.com/fastify/fastify | 3 | 3 | 0 |
| `vitejs-vite` | https://github.com/vitejs/vite | 4 | 1 | 3 |
| `cli-cli` | https://github.com/cli/cli | 1 | 0 | 1 |
| `sebastianbergmann-phpunit` | https://github.com/sebastianbergmann/phpunit | 1 | 0 | 1 |
| `pestphp-pest` | https://github.com/pestphp/pest | 1 | 0 | 1 |
| **Total** |  | **20** | **10** | **10** |

Validation found 20 rows, 10 independent repository groups, balanced labels, no duplicate `(repository, source commit, target commit)` triplets, and no schema errors. The 18 numerical API features, label, and 11 provenance fields remain present. Five features have values in all 20 rows: `files_changed`, `lines_added`, `avg_files_per_commit`, `branch_commits`, and `branch_files_changed`. Thirteen features remain missing in all rows; missing values were not filled.

- Raw CSV: `ml/data/raw/merge_examples.csv`
- Processed CSV: `ml/data/processed/merge_examples.csv`
- Raw SHA-256: `490A2368A83E841C5A0F6C7F0C64104025EB1F8C6723FE36D604E63446A07199`
- Processed SHA-256: `BE13EB03C2594751C7958E460E2E672BBCEE42C43758D71384B644BCE00970A5`

The processed file remains at 20 rows. Test fixtures used by pytest/Playwright are controlled software tests and are not part of either dataset.

## 5. Machine Learning Implementation

The existing saved exploratory Random Forest was preserved and loaded successfully with scikit-learn **1.9.0**. No model was retrained or replaced during this upgrade. The training/evaluation report records comparison of DummyClassifier, Logistic Regression, and Random Forest. The selected artifact is the Random Forest.

The existing training pipeline uses the five populated features, median imputation with missingness indicators, and repository-group-aware holdout selection. Logistic Regression additionally uses standard scaling. The recorded holdout keeps repositories disjoint: 15 train rows from 8 groups and 5 test rows from 2 groups. The test set contains 2 clean and 3 conflict examples.

Recorded Random Forest holdout results:

- Precision: **1.00**
- Recall: **0.667**
- F1: **0.800**
- ROC-AUC: **0.833**
- Confusion matrix, actual rows `[clean, conflict]` and predicted columns `[clean, conflict]`: `[[2, 0], [1, 2]]`

The evaluation report records five GroupKFold folds on the training groups. Some validation folds contain only one class, limiting which fold metrics are defined. These results come from only 20 examples and are not production evidence. The artifact metadata explicitly reports `production_ready: false`.

- Artifact: `ml/models/exploratory/merge_conflict_exploratory_model.joblib`
- Artifact SHA-256: `9F2987B93E43FD42954292065E7A1D239687FEA2ED9D2C2486E9FC4774806A4E`
- Evaluation: `ml/reports/merge_conflict_model_evaluation.json`
- Robustness report: `ml/reports/merge_conflict_model_robustness.json`

The prediction API scores only the same five supported features. The other 13 contract fields remain compatibility fields and are not used for scoring. Prediction probabilities are uncalibrated exploratory model scores, not guarantees.

## 6. GitHub Repository Integration

- Public GitHub URL support is implemented without asking for a personal access token. The backend validates the URL, confirms public status, enforces repository/object-size and timeout limits, and clones only after an explicit user submission. Live outbound GitHub cloning was not verified in this environment.
- Local repository paths require an explicit `GITNEXUS_LOCAL_REPOSITORY_ROOTS` allowlist. The live verification used existing clones under `D:\gitnexus-public-repos`.
- The application lists available local and remote-tracking branches and identifies the default branch.
- The backend extracts the existing supported Git features, reports commit divergence and changed paths, and performs an actual Git merge-tree check on an isolated temporary snapshot.
- The actual Git check is distinct from the ML estimate. It does not expose a claim that overlapping paths alone are conflicts or provide per-file conflict attribution.
- Invalid, identical, fast-forward/no-divergence, unrelated, unavailable, or custom-merge-driver cases are refused rather than assigned an invented outcome. Unsuitable attempted pairs were refused because their tips did not satisfy the common-base divergence requirement; they were not saved as successful analyses.
- Analysis does not check out or merge in the supplied repository, push, fetch/update its refs, execute project code, or alter the original worktree. Public repository connection itself does perform the explicitly requested clone into a managed cache.

## 7. Frontend–Backend Connectivity

| Workflow | Status | Verification evidence |
| --- | --- | --- |
| Backend health | PASS | Live `GET /health` returned 200; model available. |
| Frontend API connection | PASS | Live browser prediction reached FastAPI and rendered the returned Random Forest response. |
| GitHub repository connection | PARTIAL | URL validation, public metadata lookup, and clone path implemented; external GitHub network flow not live-tested. |
| Local repository connection | PASS | Live browser connected to the existing Vitest clone under the configured allowlist. |
| Branch listing | PASS | FastAPI returned Vitest branch refs and SHAs to the frontend. |
| Feature extraction | PASS | Live analysis returned measured values for five fields and null for unavailable fields. |
| ML prediction | PASS | Live API returned an actual saved-model response; not fabricated. |
| Actual merge checking | PASS | Live isolated Git check returned one conflict and one clean result for two existing Vitest branch pairs. |
| Database persistence | PASS | SQLite saved repository connections and analysis history; dashboard/history/compare endpoints returned those records. |
| Dashboard analytics | PASS | Live dashboard returned the persisted connection, analysis, outcome, and prediction counts. |
| Analysis history | PASS | Archive displayed persisted Vitest analyses; API history returned saved records. |
| Compare runs | PASS | Frontend compared two real saved Vitest analyses and rendered API-returned feature differences. |
| Prediction-only history | PASS | Live browser stored successful API responses in localStorage and the archive displayed them. |
| System Pulse | PASS | Health, readiness, model info/evaluation, dataset, Git, and SQLite status were loaded; the recorded confusion matrix was rendered. |

## 8. Testing Results

| Check | Result | Command/evidence |
| --- | --- | --- |
| Frontend production build | PASS | `npm --prefix frontend run build`; TypeScript build and Vite production build succeeded. Final output after the evaluator demo shortcuts: JS 353.86 kB (101.37 kB gzip), CSS 63.77 kB (14.45 kB gzip). |
| Frontend TypeScript check | PASS | `npm --prefix frontend run lint` (`tsc -b --pretty`). |
| Chromium suite | PASS | `npx playwright test --project=chromium --workers=1 --reporter=line --timeout=20000`: 17 passed, 1 skipped. |
| Opt-in live model browser test | PASS | Set `GITNEXUS_LIVE_API=1`, then ran the live prediction test separately: 1 passed. |
| Live repository browser workflow | PASS | Direct Chromium session connected to the real Vitest local clone, selected exact refs, and displayed actual conflict, divergence, feature, and model data. |
| Verified demo shortcuts | PASS | Direct browser check selected the Vitest conflict/clean refs. Flask shortcuts use existing collected pairs: `origin/workflow` ? `origin/main` (label 1) and `origin/automatic-options` ? `origin/main` (label 0); shortcuts only preselect refs and leave the real Git check to the user. |
| Live history and comparison UI | PASS | Archive showed 3 saved real analysis runs; Compare Runs compared the clean browser-mock-import pair and conflicting user-event pair returned by FastAPI. |
| Backend tests | PASS | From `backend`: `python -m pytest tests -q`; 45 passed. One Starlette/httpx TestClient deprecation warning. |
| ML pipeline tests | PASS | `python -m pytest ml/tests -q`; 15 passed. No training was run. |
| CORS preflight | PASS | `OPTIONS /api/v1/repositories/connect` from `http://127.0.0.1:5173` returned 200 and the expected allow-origin/method headers. |
| Invalid prediction input | PASS | Negative count returned 422 `VALIDATION_ERROR`. |
| Live backend prediction | PASS | Real `POST /api/v1/predict` returned 200 in approximately 125 ms on this machine. This is one local sample, not a benchmark. |
| Model health/readiness/evaluation | PASS | `/health` 200, `/ready` 200, `/api/v1/model-evaluation` 200. |

The live Playwright model test is opt-in, so it is skipped in the normal Chromium suite and was run separately. Early browser invocations that launched a new Vite child under Playwright did not exit cleanly after the cases completed. The final suite reused the already running Vite server and completed with the result above; no tests were removed or weakened.

## 9. Files Changed

Important backend files added or modified:

- Added: `backend/app/api/repositories.py`, `backend/app/schemas/repository.py`, `backend/app/schemas/evaluation.py`, `backend/app/services/repository_service.py`, `backend/app/services/analysis_store.py`, `backend/app/services/model_evaluation.py`, `backend/tests/test_repository_integration.py`.
- Modified: `backend/app/api/router.py`, `backend/app/core/config.py`, `backend/app/schemas/dataset.py`, `backend/app/services/dataset_summary.py`, and CORS configuration.

Important frontend files added or modified:

- Added: `frontend/src/components/RepositoryAnalysisWorkspace.tsx`.
- Modified: `frontend/src/App.tsx`, `frontend/src/services/api.ts`, `frontend/src/types/api.ts`, `frontend/src/styles.css`, `frontend/src/pages/CollisionStudio.tsx`, `MergeObservatory.tsx`, `ConflictDNA.tsx`, `SimulationLab.tsx`, `IntelligenceArchive.tsx`, `CompareRuns.tsx`, and `SystemPulse.tsx`.
- Modified: `tests/app.smoke.spec.ts` for API fixtures, repository flow, and model-evaluation display.

Documentation/configuration modified: `.gitignore`, `README.md`, `backend/README.md`, and `docs/API.md`. Added this report. No files were deleted. No package or requirements dependencies were added. Existing app structure, model artifact, raw/processed CSVs, feature definitions, and schemas were preserved.

## 10. How to Run the Application

Open two Windows PowerShell terminals from the project root:

**Terminal 1 — FastAPI backend**

```powershell
Set-Location .\backend
$env:PYTHONPATH = (Resolve-Path ..).Path
$env:GITNEXUS_LOCAL_REPOSITORY_ROOTS = "D:\gitnexus-public-repos"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The local path allowlist is optional; omit that environment variable to disable local repository paths. Public GitHub connections require outbound network access and are cloned only after URL submission.

**Terminal 2 — React/Vite frontend**

```powershell
Set-Location .\frontend
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open `http://127.0.0.1:5173` in a browser. The frontend API base is configured in `frontend/.env.example` for local development.

**Verify backend health from another PowerShell terminal**

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/ready
```

API documentation is at `http://127.0.0.1:8000/docs`.

## 11. Remaining Work and Limitations

- The 20-row, 10-repository dataset is small. Its balanced labels do not establish generalization, and the five-example holdout is especially uncertain.
- Thirteen of 18 API feature values are missing in every collected row. No fabricated values were added; the model uses only five populated features.
- The saved model is explicitly exploratory and not production-ready. Probabilities are uncalibrated.
- Public GitHub URL validation and cloning are implemented but were not verified against live GitHub from this environment. The local repository integration path was verified.
- Local repository access is intentionally limited to configured roots. Private GitHub repositories and authentication are not implemented.
- Git analysis reports actual merge-tree outcome and changed-path overlap, but does not produce file-by-file conflict attribution or automatically resolve/merge anything.
- SQLite persistence is local to the backend host. The API has no authentication, multi-user isolation, or rate limiting and must not be exposed publicly as-is.
- Application database history can contain repeated runs of the same commit pair; each successful analysis is a timestamped run. Dataset collection separately enforces triplet deduplication.
- No new public repositories were cloned and no ML rows were collected in this upgrade because the verified current dataset already had 20 examples; the stale brief’s two-row starting point did not match the workspace.

## 12. Final Acceptance Summary

| Requirement | Status | Notes |
| --- | --- | --- |
| Upgrade existing application instead of recreating it | COMPLETED | Existing seven-page React app, FastAPI, tests, model, and schemas retained. |
| Preserve the twelve completed stages | COMPLETED | No completed-stage implementation was removed. |
| Expand the real dataset from the originally described two examples | COMPLETED | Current workspace already held 20 valid real examples across 10 repositories before this upgrade; this task added zero rows. |
| Preserve 18-feature API and honest missingness | COMPLETED | 5 populated; 13 missing; no imputation/fabrication in collection data. |
| Train and evaluate the current model | PARTIALLY COMPLETED | Existing group-aware model/evaluation is present and verified; no retraining occurred during this upgrade. |
| Public GitHub repository connection | PARTIALLY COMPLETED | Implemented; external live clone not verified here. |
| Local repository connection and branch listing | COMPLETED | Verified from the local Vitest clone. |
| Real isolated merge check and optional model estimate | COMPLETED | Both actual conflict and clean outcomes verified. |
| Persisted analysis history, dashboard, and comparison | COMPLETED | SQLite endpoints and frontend views verified. |
| Seven-page frontend and System Pulse evaluation view | COMPLETED | Browser navigation, responsive widths, data states, and evaluation panel verified. |
| Frontend/backend tests and live prediction | COMPLETED | Build, TypeScript, 45 backend tests, 15 ML tests, 17 Chromium tests, and separate live test passed. |
| Production deployment/security readiness | NOT COMPLETED | No auth/rate limiting or production deployment; model/data are not sufficient for production claims. |

**Integrity check:** The raw CSV, processed CSV, and saved model SHA-256 hashes match the verified values recorded in this report. No training, data collection, or model replacement was performed during the integration upgrade.

# GitNexus AI — Predictive Merge Intelligence

**See the merge before it happens.**

GitNexus AI is a final-year engineering project that explores whether Git-history measurements can provide a useful pre-merge signal for merge-conflict risk. It combines a React dashboard, a FastAPI prediction service, and an exploratory Random Forest baseline trained from real merge attempts.

> The model is exploratory and is not production validated. Its probabilities are raw, uncalibrated model scores, not guarantees. Repository analysis uses committed refs and Git merge-tree in an isolated temporary snapshot; it does not check out, merge, push, or change the connected repository working tree.

## Problem and objective

Git reports textual/tree merge conflicts when developers attempt to integrate branches. The project studies a narrower question: can measurements known before an attempted integration help estimate the chance of a conflict? The objective is to build a reproducible, inspectable prototype and document its limitations—not to replace Git's merge behavior or developer review.

## Proposed solution and features

- A responsive seven-page developer-focused dashboard.
- Collision Studio sends a validated JSON request to the existing FastAPI model.
- It can connect a public GitHub URL after explicit submission or an allowlisted local repository, list branches, inspect committed changes, and run an isolated actual Git merge check. Git output is separate from the exploratory model estimate.
- Repository connections and analyses are stored by the backend in SQLite. Prediction-only records remain in this browser?s localStorage.
- System Pulse separates process health from model readiness.
- Successful API responses can be saved in browser localStorage, reviewed in Intelligence Archive, modified in Simulation Lab, and compared in Compare Runs.
- A local-only Git collection and data-validation pipeline records merge outcomes and provenance from explicitly supplied repositories.
- The API preserves an 18-field numeric contract while the current model scores only five measured fields.

### Frontend pages

| Page | Purpose |
| --- | --- |
| Merge Observatory | Backend-backed repository analysis counts and recent activity, plus service state and prediction links. |
| Collision Studio | Submit the five supported model inputs and view an API response. |
| Conflict DNA | Explain conflict concepts and review changed paths from saved repository analyses. |
| Simulation Lab | Change a saved prediction request for model scoring and review saved branch analyses. |
| Intelligence Archive | Search browser-stored model responses and backend-persisted repository analyses. |
| Compare Runs | Compare saved prediction responses or two repository analyses. |
| System Pulse | Check health, readiness, model metadata, dataset validation, and integration services. |

Branch illustrations are conceptual. They do not show a scan of a connected repository.

## System architecture

    Developer browser
      ?? React + TypeScript + Vite single-page frontend
           ?? API client ? FastAPI prediction and repository endpoints
           ?                ?? Model service ? saved exploratory scikit-learn bundle
           ?                ?? Repository service ? isolated Git snapshot ? merge-tree check
           ?? Prediction-only history ? versioned browser localStorage

    Repository analysis history ? local SQLite database
    Local research repository ? separate collector ? raw CSV ? validation/preparation ? evaluation/training

The frontend and backend run independently. The research collector is not called by dashboard or prediction endpoints.

## Technology stack

- Frontend: React 19, TypeScript 7, Vite 8, Tailwind CSS 4, Lucide React.
- Backend: Python 3.12, FastAPI, Pydantic 2, Uvicorn.
- ML/data: scikit-learn 1.9.0, pandas, NumPy, joblib.
- Tests: pytest, FastAPI TestClient, Playwright with Chromium.

Frontend package versions are pinned in frontend/package.json and frontend/package-lock.json. Backend constraints are in backend/requirements.txt; scikit-learn is pinned to match the saved model artifact.

## Dataset and preparation

The documented dataset contains 20 genuine merge examples from 10 repository groups, with 10 clean outcomes (label 0) and 10 conflict outcomes (label 1). The label is produced by the existing local Git collector from an attempted source-into-target merge procedure. A conflict label concerns Git's merge result; it does not mean a build or test failed.

Each CSV row keeps the 18 numerical API fields, the binary target, and 11 provenance fields. Only five feature values are currently populated consistently. The other 13 remain missing; they are not filled with arbitrary values. Raw and processed data are excluded from version control by .gitignore because collected repository data may be private. Test fixtures are separate and are not training examples.

See ml/FEATURE_DICTIONARY.md, ml/FEATURE_EXTRACTION_REVIEW.md, and ml/data/README.md for feature definitions, missingness, provenance, safe local collection, and validation rules.

## ML model and evaluation

Training compared DummyClassifier, Logistic Regression, and Random Forest using repository-group-aware train/test separation and cross-validation. The saved artifact is the exploratory Random Forest. The model uses only:

1. files_changed
2. lines_added
3. avg_files_per_commit
4. branch_commits
5. branch_files_changed

The recorded held-out evaluation contains only five examples from two repository groups. The report records precision 1.00, recall 0.67, F1 0.80, balanced accuracy 0.83, and ROC-AUC 0.83 on that small holdout. These figures are descriptive of that evaluation run and are too uncertain to establish generalization or readiness. Group cross-validation folds also contain very few examples and some folds lack one class, making some per-fold metrics undefined. See ml/reports/merge_conflict_model_evaluation.json and ml/reports/merge_conflict_model_robustness.json for the full reports and caveats.

The response probabilities are not calibrated confidence. No feature-importance claim is presented as a product explanation. Do not retrain or overwrite the preserved model/reports without reviewing the data and retaining a verified backup.

## API

The API is documented in [docs/API.md](docs/API.md). Available endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /health | Process and model-load status. |
| GET | /ready | Whether prediction is currently available. |
| GET | /api/v1/model-info | Model name, feature contract and metadata. |
| GET | /api/v1/dataset-summary | Verified aggregate statistics from local raw/processed CSVs; 503 if unavailable. |
| GET | /api/v1/model-evaluation | Path-free summary of the saved model evaluation report. |
| POST | /api/v1/repositories/connect | Connect an explicitly submitted public GitHub URL or allowlisted local path. |
| GET | /api/v1/repositories | List saved repository connections. |
| GET | /api/v1/repositories/{id}/branches | List verified local and remote-tracking refs. |
| POST | /api/v1/repositories/{id}/analyze | Run isolated Git merge check and persist the analysis. |
| GET | /api/v1/analyses | Search and filter saved repository analyses. |
| GET | /api/v1/analyses/{id} | Retrieve a saved repository analysis. |
| GET | /api/v1/analyses/compare | Compare two saved repository analyses. |
| GET | /api/v1/dashboard | Return backend-backed repository and analysis aggregates. |
| GET | /api/v1/integration-status | Report database, Git, and connection-feature availability. |
| POST | /api/v1/predict | Versioned prediction endpoint. |
| POST | /api/predict | Backward-compatible alias. |

## Windows PowerShell setup

Requirements: Node.js 20.19+ or 22.12+, npm, Python 3.12, and the preserved model artifact at ml/models/exploratory/merge_conflict_exploratory_model.joblib. A clean checkout does not contain ignored model/data artifacts automatically; provide the trusted project artifact separately. Do not download an unverified joblib file.

### Backend terminal

Run from the project root:

    Set-Location .\backend
    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    $env:PYTHONPATH = (Resolve-Path ..).Path
    $env:GITNEXUS_LOCAL_REPOSITORY_ROOTS = "D:\gitnexus-public-repos" # Optional local-path allowlist
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

The API is then available at http://127.0.0.1:8000. Interactive API documentation is at http://127.0.0.1:8000/docs.

### Frontend terminal

Open a second PowerShell window from the project root:

    Set-Location .\frontend
    npm ci
    Copy-Item .env.example .env.local
    npm run dev

Open the URL printed by Vite, normally http://127.0.0.1:5173. The copy command is for first-time setup; if .env.local already exists, keep and review that file instead of replacing it. The local example contains only the public API base URL, not a credential.

For local repository connections, set GITNEXUS_LOCAL_REPOSITORY_ROOTS to semicolon-separated trusted roots on Windows before starting FastAPI; leave it unset to disable local paths. A public GitHub URL is cloned only after explicit submission, and remote access must be available. Repository analysis uses committed refs in a temporary snapshot, refuses custom merge drivers, and does not run project code or mutate the source repository. The model uses only five measured feature values; unavailable inputs remain missing.

## Environment configuration

- Development: frontend/.env.example supplies the local FastAPI URL; Vite uses that by default in development.
- Production build: configure VITE_API_BASE_URL to the deployed backend's public HTTPS origin. See frontend/.env.production.example. This value is public client configuration, not a secret. Production builds no longer fall back to localhost.
- Backend CORS: set GITNEXUS_ENV=production and GITNEXUS_CORS_ORIGINS to the exact comma-separated frontend origins, including scheme and host. Wildcard origins are rejected and credentials are disabled.
- Do not place API keys, passwords, or private tokens in VITE_* variables; they are compiled into browser-accessible code.

Deployment recommendations and the backend container configuration are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). No service has been deployed or published.

## Build and test commands

Install root Playwright tools and the separate frontend packages from the project root:

    npm ci
    npm ci --prefix frontend
    npm run build --prefix frontend
    npm run lint --prefix frontend

Run backend tests from the backend folder:

    Set-Location .\backend
    $env:PYTHONPATH = (Resolve-Path ..).Path
    .\.venv\Scripts\python.exe -m pytest -q

Run Chromium tests from the project root after installing Chromium once with npx playwright install chromium:

    npx playwright test --project=chromium --workers=1

With the backend running, the opt-in live model test can be run with:

    $env:GITNEXUS_LIVE_API = "1"
    npx playwright test --project=chromium --workers=1 --grep="live frontend saves"
    Remove-Item Env:\GITNEXUS_LIVE_API

The saved model is loaded and tested; tests do not retrain it. ML pipeline tests are separate: python -m pytest ml/tests.

## Screenshots

No genuine screenshots are currently included in this project. This section intentionally contains no placeholder or generated image presented as an application capture.

## Known limitations

- Twenty examples across ten repository groups are insufficient to demonstrate production-level performance.
- The 13 unavailable feature values remain missing and are not used by the model.
- The model is exploratory, uncalibrated, and may not generalize to unseen repositories or development workflows.
- API users must measure and submit the five required values; no GitHub connection or local repository scanner is part of the web app.
- Browser history is stored per browser in localStorage and is not synchronized or backed up.
- The application currently has no user authentication, rate limiting, database, or multi-user history.
- Risk bands, automatic merges, conflict resolution, file-level predictions, build/test outcome prediction, and production deployment are not implemented.

## Future enhancements

- Collect a larger, more diverse, independently sourced dataset and keep repository-group evaluation.
- Define and validate additional pre-merge features before using any of the remaining 13 fields.
- Evaluate temporal and repository-held-out generalization on a sufficiently large dataset.
- Add authenticated repository integrations only with explicit permission and safe credential handling.
- Consider model calibration and interpretable explanations only after evidence supports them.
- Add production identity, request controls, monitoring, and retention policies before public deployment.

## Conclusion

GitNexus AI delivers a working full-stack research prototype for exploratory merge-conflict risk estimation. It demonstrates a reproducible Git-derived dataset workflow, a small leakage-aware baseline, a typed prediction API, and a connected dashboard. Its main project result is the integrated, inspectable workflow; the current data and evaluation do not establish a reliable production predictor.

For the final-year report and presentation materials, see [docs/FINAL_PROJECT_REPORT.md](docs/FINAL_PROJECT_REPORT.md) and [docs/PRESENTATION_OUTLINE.md](docs/PRESENTATION_OUTLINE.md).

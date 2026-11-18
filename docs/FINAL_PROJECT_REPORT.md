# GitNexus AI — Final-Year Project Report

## Abstract

GitNexus AI is a full-stack research prototype for estimating merge-conflict risk from pre-merge Git-history measurements. A React and TypeScript dashboard sends numeric inputs to a FastAPI service, which validates the request and scores it with a saved exploratory Random Forest. A separate local-only collection pipeline labels merge attempts and preserves repository-group provenance. The current dataset has 20 examples from 10 repository groups. Its 18-field request contract includes 13 fields that are still missing; the model uses only five consistently populated fields. Group-aware evaluation is implemented, but the five-row holdout and small number of repositories are too limited to support a production-readiness claim.

## Introduction

Branch integration is a routine part of collaborative software development. Git can report conflicts when branch histories cannot be combined cleanly. GitNexus AI explores whether selected measurements available before integration can provide an additional decision-support signal. The application does not replace Git's merge behavior, review, testing, or conflict resolution.

## Problem statement

Developers commonly learn that a merge has conflicts when they attempt to combine branches. A pre-merge estimate could help prioritize review, but a useful estimate requires a reliable target label, features available at prediction time, reproducible collection, and evaluation that avoids learning repository-specific patterns. This project builds a prototype around those constraints while documenting where evidence remains insufficient.

## Existing system and proposed system

In the ordinary Git workflow, merge results and textual conflicts are determined when an integration is attempted. Build and test failures are separate outcomes and are not merge-conflict labels. GitNexus AI adds an exploratory prediction request based on a small set of numeric pre-merge inputs. Git remains responsible for actual integration, and users must review and attempt merges through their normal workflow.

The proposed system has four distinct parts: explicit local repository data collection, validation/preparation, repository-aware baseline evaluation, and a frontend/API prediction workflow. Public repositories are not fetched automatically by the application, and prediction does not execute Git.

## Objectives

- Preserve a traceable binary merge-outcome target.
- Record Git-derived measurements without modifying supplied repositories.
- Retain an 18-field API contract while limiting the current model to measured fields.
- Compare simple baseline algorithms with reproducible, repository-aware evaluation.
- Expose the saved exploratory model through a typed API and connected dashboard.
- Communicate uncertainty and operational limits rather than claiming production readiness.

## System architecture

    Local repositories explicitly supplied by a researcher
      → isolated Git collection attempt
      → raw CSV with label and provenance
      → validation and preparation without fabricated imputation
      → repository-group-aware training/evaluation
      → trusted saved model artifact
      → FastAPI model service
      → React/TypeScript dashboard
      → optional browser-local response history

The API accepts only numeric features. It does not receive source code, branch names, repository identifiers, Git credentials, or dataset rows. The user interface stores optional source/target labels only in local browser history.

## Methodology

### Target and collection

The binary target is 1 when the collector's reproducible Git merge attempt reports a merge conflict and 0 when it completes without a merge conflict. A failed build, failed test, missing commit, or unrelated Git error is not a conflict label. Collection uses a local repository supplied by the researcher, retains source/target/base commit identifiers for provenance, and uses the collector's isolated approach rather than modifying the supplied working tree. See ml/data/git_collection.py and ml/data/PUBLIC_REPOSITORY_WORKFLOW.md.

### Dataset

The current documented dataset has 20 real examples, 10 repository groups, 10 clean merge outcomes, and 10 conflicts. Each row has 18 feature columns, one target column, and 11 provenance columns. The raw and processed CSV schemas each contain 30 columns. Test fixtures are not included in these counts.

The collection is small and repository diversity is limited. Ten groups allow group-aware splits to be computed, but only two groups appear in the five-row held-out test set. The set cannot represent all languages, project types, Git policies, merge strategies, or development workflows.

### Feature engineering

The 18 fields are defined in ml/FEATURE_DICTIONARY.md. The five measured model inputs are files_changed, lines_added, avg_files_per_commit, branch_commits, and branch_files_changed. The other 13 remain missing unless explicitly supplied by a user, and they are excluded from scoring. No feature is replaced with a fabricated zero. The collector uses Git metadata and does not collect source code or secrets.

### Algorithms and evaluation

The training pipeline compares a DummyClassifier baseline, Logistic Regression, and Random Forest. The saved artifact is the Random Forest, using median imputation inside its pipeline. Training uses deterministic seed 42 and repository-group separation when possible. The evaluation report records a 15-row training set and five-row held-out set with disjoint repository groups, plus five-fold GroupKFold on the training partition.

The held-out metrics in ml/reports/merge_conflict_model_evaluation.json for the selected Random Forest are:

| Metric | Recorded value | Evaluation sample |
| --- | ---: | ---: |
| Precision | 1.00 | 5 held-out rows; 2 predicted conflicts |
| Recall | 0.67 | 3 actual conflict rows |
| F1 | 0.80 | 5 held-out rows |
| Balanced accuracy | 0.83 | 5 held-out rows |
| ROC-AUC | 0.83 | Both classes present in held-out set |

The held-out confusion matrix, with rows as true labels [0,1] and columns as predicted labels [0,1], is [[2,0],[1,2]]. These are the stored exploratory evaluation results, not a performance guarantee. Five test cases are far too few for stable estimates. The pooled cross-validation scores are also based on only 15 training examples and were part of candidate-model comparison, so they should not be read as independent confirmation. Fold class distributions vary, and some per-fold metrics are undefined.

The robustness report examines seeds and validation-fold permutation sensitivity. Its folds are small, and the feature sensitivity values are noisy; the project does not present them as reliable product explanations.

## Backend implementation

FastAPI exposes /health, /ready, /api/v1/model-info, /api/v1/predict, and the backward-compatible /api/predict alias. Pydantic validates five required model inputs and 13 optional contract fields. The model service loads the trusted joblib bundle once per process, checks metadata and feature order, and reports readiness separately from process health. Error handlers return sanitized client responses. A 16 KiB request-body limit applies to normal and chunked write requests. Production CORS requires exact explicit origins.

The artifact is served only from the project-managed path. Loading a joblib file executes Python object deserialization, so only a trusted artifact may be deployed. scikit-learn 1.9.0 is pinned for the saved bundle.

## Frontend implementation

The React dashboard has seven hash-routed pages: Merge Observatory, Collision Studio, Conflict DNA, Simulation Lab, Intelligence Archive, Compare Runs, and System Pulse. A centralized API service reads VITE_API_BASE_URL, validates responses, uses request timeouts, and reports errors. In development only, the API client defaults to the local FastAPI origin; production builds require a configured API origin or use same-origin relative requests. Successful response history is versioned in localStorage and validated before display.

## Testing and verification

Stage 12 verification completed on 2026-11-14. Clean `npm ci` installs succeeded at the project root and in `frontend/`. The frontend TypeScript and production build passed, and `npm run lint` passed. The default Chromium run completed with **16 passed and 1 opt-in live test skipped**; enabling the live test separately produced **1 passed** against FastAPI and the saved model. A second browser check served the built production preview with an explicit local API URL and displayed the real model response. The final default build was then restored and scanned to confirm it contains no localhost API fallback. Backend tests: **34 passed**. Both root and frontend npm audits reported **0 known vulnerabilities**; `pip check` reported no broken requirements. Docker image construction was not verified because Docker is unavailable in this environment. Python vulnerability scanning was not completed because `pip-audit` was unavailable. No tests were removed or weakened.

Security-oriented cases cover invalid/non-finite/large input, oversized and chunked payloads, unsupported methods, sanitized errors, rejected CORS origins, malformed frontend responses, user-controlled branch labels rendered as text, missing/invalid model artifacts, and unavailable API states. The live test exercises prediction, local history, simulation, run comparison, and readiness.

## Security considerations

- No API key is required or exposed by the frontend.
- Browser-origin CORS is restricted, but CORS is not authentication.
- No authentication, authorization, rate limiting, multi-user storage, or public deployment has been implemented.
- Request bodies are capped at 16 KiB; numeric fields are bounded and validated.
- API error bodies do not disclose internal paths or stack traces.
- The model artifact is ignored by Git and must be supplied through a trusted private artifact process.
- Node dependency audits reported no known advisories at the time of verification. Python package CVE scanning remains incomplete because pip-audit was unavailable in the environment; pip check found no broken requirements.

## Performance observations

The local production-preview measurement from Stage 11 recorded a 136.9 ms initial page load, 97,432 transferred bytes across two assets, and a browser-reported JavaScript heap near 10 MB before and after 21 route changes. Warm local API samples recorded health median 6.38 ms and maximum 28.07 ms across 12 requests; prediction median 113.96 ms and maximum 170.23 ms across 10 requests. These are single-machine observations, not benchmarks. A separate early dev-mode run had a 9.4 second health outlier; later warm samples were lower. Host/network, concurrency, cold start, and hardware will change these figures.

## Results and discussion

The project demonstrates an end-to-end research prototype: local Git outcome collection, a preserved dataset schema, group-aware model comparison, saved-model loading, a validated JSON API, and a browser dashboard. The model can return a score for the five measured inputs, but the small dataset and holdout prevent conclusions about production performance. The strongest result is a reproducible architecture and documented workflow, not a claim that Git conflicts can be predicted reliably in general.

## Limitations

- Only 20 examples from 10 independent repository groups are available.
- Five of 18 feature fields are populated consistently; 13 remain unavailable and excluded.
- The held-out test set has five rows from two groups.
- Model probabilities are not calibrated.
- Manual numeric inputs can be inaccurate; the frontend does not measure Git history automatically.
- There is no GitHub integration, repository connection, automatic merge, conflict resolution, user authentication, rate limiting, or database-backed history.
- Screenshots were not present in the workspace during the audit; no screenshot is represented as captured.
- Python dependency vulnerability scanning was not completed; see the Stage 12 verification report for the audit-tool limitation.

## Future scope

Increase independent repository and branch-pair coverage; investigate reliable pre-merge definitions for optional features; collect a temporally ordered dataset; validate on unseen repositories and time periods; assess probability calibration; add secure opt-in repository integrations; and implement authentication, abuse limits, operational monitoring, and data retention before any public service.

## Conclusion

GitNexus AI provides a connected, documented prototype for studying merge-conflict prediction. The data collection and evaluation steps preserve provenance and repository groups, and the API/frontend integration provides a reviewable demonstration. The small exploratory dataset does not support production use or broad reliability claims.

## References

References below were consulted for this project report; they describe technical behavior and are not evidence that the model predicts conflicts accurately.

### Stage 12 verification artifacts

- Production build: `cd frontend; npm run build` — passed, 2,100 modules transformed; emitted JS 293.36 kB (87.96 kB gzip) and CSS 39.78 kB (9.71 kB gzip). The default bundle did not contain `127.0.0.1:8000` or `localhost:8000`.
- Browser suite: `npx playwright test --project=chromium --workers=1 --reporter=line` — 16 passed, 1 opt-in live test skipped. Separate opt-in live run — 1 passed. Production-preview browser request — passed.
- Backend: `backend\.venv\Scripts\python.exe -m pytest backend\tests` — 34 passed (one Starlette/httpx TestClient deprecation warning).
- npm audit: root and frontend — 0 known vulnerabilities. `pip check` — no broken requirements. `pip-audit` and Docker image build were unavailable and are not represented as passing checks.
- Live local service checks returned HTTP 200 from `/health`, `/ready`, and `/api/v1/model-info`; readiness reported the model available and five supported features out of the 18-field contract.
- Integrity remained unchanged: raw CSV SHA-256 `490A2368A83E841C5A0F6C7F0C64104025EB1F8C6723FE36D604E63446A07199`; processed CSV `BE13EB03C2594751C7958E460E2E672BBCEE42C43758D71384B644BCE00970A5`; model artifact `9F2987B93E43FD42954292065E7A1D239687FEA2ED9D2C2486E9FC4774806A4E`. The raw dataset remains 20 rows from 10 repository groups (10 examples per class), with its original 30-column schema. The processed dataset remains 20 rows and 30 columns.
- The project was not deployed or published. The Dockerfile is a deployment starting point only; build and hosted behavior remain unverified.

1. Git documentation, “git-merge” — https://git-scm.com/docs/git-merge (accessed 2026-11-14).
2. FastAPI documentation, “Deployment Concepts” — https://fastapi.tiangolo.com/deployment/concepts/ (accessed 2026-11-14).
3. FastAPI documentation, “About HTTPS” — https://fastapi.tiangolo.com/deployment/https/ (accessed 2026-11-14).
4. FastAPI documentation, “CORS” — https://fastapi.tiangolo.com/tutorial/cors/ (accessed 2026-11-14).
5. Vite documentation, “Building for Production” — https://vite.dev/guide/build (accessed 2026-11-14).
6. Vite documentation, “Deploying a Static Site” — https://vite.dev/guide/static-deploy (accessed 2026-11-14).
7. scikit-learn documentation, “RandomForestClassifier” — https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html (accessed 2026-11-14).
8. scikit-learn documentation, “Cross-validation: evaluating estimator performance” — https://scikit-learn.org/stable/modules/cross_validation.html (accessed 2026-11-14).
9. GitNexus AI project documentation: ml/FEATURE_DICTIONARY.md, ml/FEATURE_EXTRACTION_REVIEW.md, ml/data/README.md, ml/reports/merge_conflict_model_evaluation.json, and ml/reports/merge_conflict_model_robustness.json.
10. Git documentation, “git-merge-tree” — https://git-scm.com/docs/git-merge-tree (accessed 2026-11-14).

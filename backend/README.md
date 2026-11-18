# GitNexus AI FastAPI backend

The backend exposes the saved exploratory Random Forest and a read-only repository analysis API to the React frontend. The model is not production validated. Repository analysis inspects committed refs in an isolated temporary snapshot, uses Git merge-tree, and never checks out, merges, pushes, or fetches into a connected repository.

## Windows PowerShell setup

Run these commands in a backend PowerShell terminal from the project root:

    Set-Location .\backend
    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    $env:PYTHONPATH = (Resolve-Path ..).Path
    $env:GITNEXUS_LOCAL_REPOSITORY_ROOTS = "D:\gitnexus-public-repos" # Optional; enables local paths under this root

The saved model must be supplied at ml/models/exploratory/merge_conflict_exploratory_model.joblib relative to the project root. That directory is excluded from source control. Use only the trusted artifact that matches scikit-learn 1.9.0. The API remains available for health checks if the artifact is absent or invalid; readiness and prediction then return a model-unavailable error.

## Start the API

From the backend folder after setup:

    $env:PYTHONPATH = (Resolve-Path ..).Path
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

Open interactive documentation at http://127.0.0.1:8000/docs.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /health | Process health and whether the model loaded. |
| GET | /ready | Prediction readiness; returns 503 when the model is unavailable. |
| GET | /api/v1/model-info | Model and supported feature metadata. |
| POST | /api/v1/predict | Current versioned prediction route. |
| POST | /api/predict | Backward-compatible alias. |
| POST | /api/v1/repositories/connect | Connect explicitly submitted public GitHub URL or allowlisted local path. |
| GET | /api/v1/repositories | List persisted connections. |
| GET | /api/v1/repositories/{id}/branches | List local and remote-tracking refs. |
| POST | /api/v1/repositories/{id}/analyze | Isolated actual Git check and persistence. |
| GET | /api/v1/analyses | Search/filter repository analysis history. |
| GET | /api/v1/analyses/{id} | Retrieve a saved analysis. |
| GET | /api/v1/analyses/compare | Compare saved analyses. |
| GET | /api/v1/dashboard | Persisted repository-analysis aggregates. |
| GET | /api/v1/integration-status | Database, Git, and connection status. |

See [../docs/API.md](../docs/API.md) for the actual fields, bounds, examples, errors, and response shape.

## Input and error protections

- Five finite, non-negative model fields are required; the remaining 13 contract fields are optional and are not used for scoring.
- Unknown fields, booleans, numeric strings, NaN, infinity, invalid ratios, fractional counts, and out-of-range values are rejected.
- JSON request bodies above 16 KiB are rejected with a sanitized 413 response. This limit applies to declared and chunked request bodies.
- CORS has explicit localhost development and Vite-preview origins. Production requires GITNEXUS_ENV=production and an explicit GITNEXUS_CORS_ORIGINS allowlist; wildcard origins are rejected.
- Errors returned to clients do not include Python tracebacks or model file paths.

Local path connection is disabled unless GITNEXUS_LOCAL_REPOSITORY_ROOTS is set to explicit trusted roots. Public GitHub connection clones only a user-submitted public URL; it has size and timeout limits. SQLite repository history is written under backend/data by default and ignored by Git. The backend has no authentication or rate limiting. CORS is not authentication; do not expose this API publicly until a deployment adds appropriate identity, HTTPS, request controls, and monitoring.

## Tests

    Set-Location .\backend
    $env:PYTHONPATH = (Resolve-Path ..).Path
    .\.venv\Scripts\python.exe -m pytest -q

The suite uses deterministic test doubles and one local test of the saved model artifact. It does not retrain or replace model/data files.

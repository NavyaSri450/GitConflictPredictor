# GitNexus AI API reference

Base URL for local development: http://127.0.0.1:8000. Interactive OpenAPI documentation is available at /docs while the backend is running.

## Endpoints

| Method | Path | Success | Description |
| --- | --- | --- | --- |
| GET | /health | 200 | Process health. Returns model_available without requiring the model to be ready. |
| GET | /ready | 200 | Prediction readiness. Returns 503 when the model is unavailable. |
| GET | /api/v1/model-info | 200 | Model name, status, selected features, class map, and dataset checksum metadata. |
| GET | /api/v1/dataset-summary | 200 | Aggregate row, class, feature-completeness, anonymous repository-group, and collection-date statistics from locally available CSV files. Returns 503 if files or schema are unavailable. It does not return row-level provenance. |
| POST | /api/v1/predict | 200 | Current versioned prediction endpoint. |
| POST | /api/predict | 200 | Backward-compatible alias with the same request and response schemas. |
| GET | /api/v1/model-evaluation | 200 | Path-free saved evaluation summary; 503 when the report is missing or invalid. |
| POST | /api/v1/repositories/connect | 201 | Connect an explicitly submitted public GitHub URL or allowlisted local path. |
| GET | /api/v1/repositories | 200 | List saved repository connections. |
| GET | /api/v1/repositories/{repository_id}/branches | 200 | List locally available branch refs and commit SHAs. |
| POST | /api/v1/repositories/{repository_id}/analyze | 201 | Compute an isolated Git merge check, optional model estimate, features, and persist history. |
| GET | /api/v1/analyses | 200 | Search/filter persisted analysis history. |
| GET | /api/v1/analyses/{analysis_id} | 200 | Retrieve one saved repository analysis. |
| GET | /api/v1/analyses/compare | 200 | Compare two distinct persisted analyses. |
| GET | /api/v1/dashboard | 200 | Repository and analysis aggregates from SQLite. |
| GET | /api/v1/integration-status | 200 | Database, Git, and repository connection feature availability. |

## Repository analysis

Repository endpoints operate only on committed refs. Public GitHub connection accepts only `https://github.com/{owner}/{repository}` URLs without credentials and clones after the request; local paths must be under the `GITNEXUS_LOCAL_REPOSITORY_ROOTS` allowlist. Shallow repositories are rejected. The API lists refs available in the connected clone, then bundles the two selected refs into a temporary isolated snapshot and checks the actual Git merge-tree outcome. Tracked custom merge drivers are refused. The source working tree and refs are not checked out, merged, pushed, or fetched/updated by analysis. It records the actual Git outcome separately from any estimate from the saved model.

The analysis response includes source/target commit IDs, merge base, divergence counts, changed paths, line summaries, the unchanged 18-feature contract with unavailable values as null, the actual Git merge check, and an optional exploratory model estimate. History and aggregate dashboard endpoints read/write backend SQLite data. This is not the research collector and does not add examples to the ML CSV files.

## Health and readiness responses

GET /health returns:

    {
      "status": "ok",
      "service": "gitnexus-ai-api",
      "model_available": true
    }

The model_available value reflects whether the model loaded in this process. Health remains available if it did not.

GET /ready returns:

    {
      "status": "ready",
      "model_available": true
    }

If the saved model is missing or fails bundle validation, /ready returns 503 with error code MODEL_UNAVAILABLE. A successful health response alone does not establish prediction readiness.

## Prediction request

POST /api/v1/predict requires a JSON object. The five required model inputs are:

| Field | JSON type | Range | Definition |
| --- | --- | --- | --- |
| files_changed | integer | 0 to 1,000,000,000 | Distinct source-branch paths changed since the merge base. |
| lines_added | integer | 0 to 1,000,000,000 | Text lines added on the source branch since the merge base. |
| avg_files_per_commit | number | 0 to 1,000,000,000 | Mean changed paths per source first-parent commit after the merge base. Decimal values are allowed. |
| branch_commits | integer | 0 to 1,000,000,000 | Target-branch first-parent commits after the merge base. |
| branch_files_changed | integer | 0 to 1,000,000,000 | Distinct target-branch paths changed since the merge base. |

These are the only fields passed into model scoring. The API retains 13 optional compatibility fields. They may be omitted or supplied as null. If supplied, they are validated but ignored by the model:

| Field | JSON type and bounds | Definition |
| --- | --- | --- |
| commit_severity | number, 0..1 | No agreed measurement formula currently exists. |
| developer_commits | integer, 0..1,000,000,000 | Optional actor-specific commit count. |
| developer_conflicts | integer, 0..1,000,000,000 | Optional past-only conflict count. |
| activity_score | number, 0..1,000,000,000 | Activity scale/lookback is not currently defined. |
| import_count | integer, 0..1,000,000,000 | Language-specific import count; not extracted by the current collector. |
| dependency_conflicts | integer, 0..1,000,000,000 | Historical dependency-conflict count; not derived from the current merge. |
| coverage | number, 0..1 | Requires a pre-merge coverage artifact. |
| branch_conflicts | integer, 0..1,000,000,000 | Past-only target-branch conflict count. |
| branch_risk_score | number, 0..1,000,000,000 | No agreed calculation currently exists. |
| pattern_frequency | integer, 0..1,000,000,000 | Requires a defined, versioned conflict-pattern taxonomy. |
| pattern_conflicts | integer, 0..1,000,000,000 | Historical count for a defined pattern. |
| dependency_risk | number, 0..1 | Requires a documented dependency-risk calculation. |
| pattern_risk | number, 0..1 | Requires a documented pattern-risk calculation. |

Unknown fields are rejected. The endpoint does not accept branch names, repository identifiers, provenance, labels, source code, or credentials. Booleans and numeric strings are not accepted as numbers; integers must be whole; NaN and infinity are rejected. Request bodies over 16 KiB return 413, including chunked requests.

### Request example

PowerShell example from any directory with the backend running:

    $body = @{
      files_changed = 12
      lines_added = 240
      avg_files_per_commit = 3.5
      branch_commits = 8
      branch_files_changed = 15
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post `
      -Uri "http://127.0.0.1:8000/api/v1/predict" `
      -ContentType "application/json" `
      -Body $body

The input values above demonstrate request syntax; they are not claimed to describe a collected merge example. Replace them with measured values. A valid response is produced by the saved model and may vary if the trusted model artifact changes.

### Successful response

The exact response fields are:

- prediction: integer class 0 or 1.
- prediction_label and predicted_class: matching human-readable class labels.
- class_probabilities: clean_merge and merge_conflict values in [0, 1].
- probability_note: explains that these are uncalibrated exploratory probabilities.
- model_name, model_status, features_used, predicted_at, and message.

The response sample below is captured from an actual local request during Stage 12 verification. It is one response to the example input values above, not an evaluation result, performance claim, or guarantee of any real merge outcome.

    {
      "prediction": 0,
      "prediction_label": "Clean merge estimate",
      "predicted_class": "clean_merge",
      "class_probabilities": {
        "clean_merge": 0.8940833333333335,
        "merge_conflict": 0.10591666666666669
      },
      "probability_note": "These are raw exploratory model probabilities and are not calibrated confidence or a guarantee of merge outcome.",
      "model_name": "random_forest",
      "model_status": "exploratory; not production validated",
      "features_used": [
        "files_changed",
        "lines_added",
        "avg_files_per_commit",
        "branch_commits",
        "branch_files_changed"
      ],
      "predicted_at": "2026-11-14T18:04:09.993345+00:00",
      "message": "Exploratory estimate only. Always review and attempt merges using your normal Git workflow."
    }

The returned probabilities are not calibrated confidence. No risk band or feature-importance explanation is returned by the API.

## Model information

GET /api/v1/model-info returns model_name, model_type, model_status, supported_features, supported_feature_count, feature_contract_size, class_mapping, and dataset_sha256. It does not return the model file path or the dataset rows. The checksum is metadata for artifact/data traceability.

## Error responses

Errors use this envelope:

    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Request body is malformed or does not match the prediction schema.",
        "fields": [
          { "field": "files_changed", "message": "Invalid or missing value." }
        ]
      },
      "timestamp": "<UTC timestamp>"
    }

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | INVALID_CONTENT_LENGTH | Invalid Content-Length header. |
| 404 | NOT_FOUND | Endpoint is not defined. |
| 405 | METHOD_NOT_ALLOWED | HTTP method is unsupported for that endpoint. |
| 413 | PAYLOAD_TOO_LARGE | Request body exceeds the 16 KiB limit. |
| 422 | VALIDATION_ERROR | JSON, field, type, or value validation failed. |
| 500 | PREDICTION_FAILED or INTERNAL_ERROR | Scoring or unexpected server failure; internal paths and stack traces are not returned in the HTTP body. |
| 503 | MODEL_UNAVAILABLE | Trusted model artifact is missing or invalid. |

## CORS and environment

Development defaults allow the Vite dev server on localhost/127.0.0.1 port 5173 and preview server on port 4173. A production backend must set GITNEXUS_ENV=production and GITNEXUS_CORS_ORIGINS to a comma-separated allowlist of exact frontend origins. Wildcards and credentialed requests are disabled. CORS is not authentication.

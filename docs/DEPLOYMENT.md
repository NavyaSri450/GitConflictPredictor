# Deployment preparation and runbook

This document prepares GitNexus AI for a future deployment. No public service has been created, and this repository has not been published. The model is exploratory, and the backend has no authentication or rate limiting; do not expose it publicly as-is.

## Current deployment support

- The frontend produces a static Vite build in frontend/dist.
- The API base URL is a public build-time setting, VITE_API_BASE_URL. Production builds no longer fall back to localhost.
- FastAPI starts with Uvicorn and computes the expected model location from the project layout.
- The backend requires an explicit CORS allowlist in production; wildcard origins are rejected.
- backend/Dockerfile prepares a single-process Python 3.12 API container. Build context must be the project root. The container image includes the trusted model artifact but excludes raw/processed datasets, evaluation reports, test fixtures, frontend code, and model backups.
- The frontend and API remain separate deployable services. No deployment workflow publishes either service.
- `/api/v1/dataset-summary` reports anonymous aggregates only when both local CSVs are present and match the documented schema. The current container intentionally excludes research CSVs, so this endpoint and its dashboard charts report unavailable there unless a separately reviewed data-provisioning design is added.

## Hosting choices

1. **Local demonstration:** run the frontend dev server and FastAPI in separate terminals. This is the least operational work and requires no hosting subscription.
2. **Frontend static hosting plus Python ASGI service:** build the Vite project and publish only frontend/dist to a static-site host. Run the backend container on a host that supports long-running Python/ASGI containers. This keeps the API and model separate from browser assets.
3. **One self-managed virtual machine:** serve static assets through a web server and run FastAPI behind a TLS-terminating reverse proxy. This offers control but requires OS updates, firewall rules, service supervision, certificate renewal, and monitoring.

Vite's static-deployment guide lists common static hosting patterns. It also identifies vite preview as a local build preview, not a production server: https://vite.dev/guide/static-deploy. FastAPI's deployment guidance covers HTTPS termination, process restarts, memory, and worker count: https://fastapi.tiangolo.com/deployment/concepts/ and https://fastapi.tiangolo.com/deployment/https/.

No paid host is required for local development. Hosted services may have free quotas, paid tiers, or changing limits; check the provider's current terms and cost before choosing one. No vendor account or service is configured here.

## Frontend deployment

Build the frontend from the frontend directory with the actual backend origin supplied at build time:

    Set-Location .\frontend
    npm ci
    $env:VITE_API_BASE_URL = "https://api.example.com"
    npm run build

Publish the contents of frontend/dist to a static host configured to serve a single-page application from the site root. GitNexus uses hash navigation, so application page navigation remains after the # fragment. If a host deploys under a repository subpath instead of a domain root, configure Vite's base path for that host before building.

frontend/.env.production.example shows the expected variable shape. Replace the example domain with the actual backend's HTTPS origin. VITE_* values are visible to browser users; they must never contain API keys, passwords, or private tokens. For one-time local preview integration, a developer can build with VITE_API_BASE_URL=http://127.0.0.1:8000. Do not use that value for a public deployment.

After building, verify that the bundle targets the intended API origin and that no localhost address was compiled into the production bundle. Do not use vite preview as the public production server.

## Backend deployment

### Container build

Docker is optional. If it is available, build from the project root—not the backend folder—because the Dockerfile uses explicit backend/ and ml/ paths:

    docker build -f backend/Dockerfile -t gitnexus-ai-api .

Run it with the actual deployed frontend origin:

    docker run --rm -p 8000:8000 `
      -e GITNEXUS_ENV=production `
      -e GITNEXUS_CORS_ORIGINS=https://app.example.com `
      -e PORT=8000 `
      gitnexus-ai-api

The example domains are placeholders. Replace them before use. The Docker build expects ml/models/exploratory/merge_conflict_exploratory_model.joblib to be present in the trusted build context; it fails if the artifact is absent. The Docker CLI was not available during Stage 12, so the image was not built or run here.

### Non-container Python host

Use Python 3.12, install backend/requirements.txt, and start the app from backend with the project root on PYTHONPATH. A typical process command is:

    python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT

The shell syntax for $PORT depends on the host. Disable reload in deployed environments. Start with one worker because every worker loads the model into its own process memory; only scale after measuring memory and behavior on the chosen host.

## Environment configuration

Backend runtime environment:

    GITNEXUS_ENV=production
    GITNEXUS_CORS_ORIGINS=https://app.example.com
    PORT=8000

Frontend build environment:

    VITE_API_BASE_URL=https://api.example.com

The backend allowlist must contain the exact browser origin (scheme, hostname, and non-default port where applicable), not the API origin. Keep local development origins out of the production allowlist unless they are genuinely required. CORS does not authenticate non-browser clients.

## Model artifact and data handling

- The backend expects the model at ml/models/exploratory/merge_conflict_exploratory_model.joblib relative to the project root. The application does not accept a client-selected artifact path.
- Model directories and datasets are ignored by Git. Provision the reviewed model through a private, access-controlled artifact/build process and verify its approved SHA-256 before building or starting the service.
- Do not package raw/processed research CSVs, private repositories, test fixtures, backup model files, or training reports into a public image. The included Dockerfile copies only code required for model loading and the named artifact.
- Joblib uses Python object serialization. Only load a trusted artifact with compatible Python and scikit-learn versions. A writable or replaced artifact is a code-execution risk.
- Keep scikit-learn pinned to 1.9.0 for this saved model unless a separately tested migration and artifact rebuild is approved.

## Required production controls before public exposure

The current application has no user authentication, authorization, per-user history service, request rate limiting, abuse monitoring, or production operational alerts. The 16 KiB API body limit and input validation reduce malformed/oversized request risk but do not prevent high request volume.

Before exposing a backend to the public internet, add and verify:

- HTTPS through a trusted TLS endpoint and secure certificate renewal.
- Authentication and authorization appropriate to the intended users.
- Rate limits, concurrency limits, and infrastructure request-size/time limits.
- Restricted network access to the backend and trusted proxy configuration.
- Protected model artifact storage, deployment integrity checks, and least-privilege filesystem access.
- Dependency update and vulnerability review for both Python and Node packages.
- Privacy-aware logs, retention, monitoring, backup/recovery, and incident handling.
- A larger, independently evaluated dataset and a model review before making product claims.

FastAPI deployment references: https://fastapi.tiangolo.com/deployment/concepts/, https://fastapi.tiangolo.com/deployment/https/, and https://fastapi.tiangolo.com/tutorial/cors/. Vite production build reference: https://vite.dev/guide/build.

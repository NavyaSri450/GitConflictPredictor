# GitNexus AI — Project Demonstration and Viva Preparation

This is a presentation outline, not a PowerPoint file. No slide deck is claimed to exist.

## Slide outline

### 1. Title — GitNexus AI

- Predictive Merge Intelligence
- Tagline: “See the merge before it happens.”
- Final-year B.E. CSE (AI & ML) project
- Add presenter name, roll number, department, and institution during personal preparation.

Suggested visual: Git branch diagram leading into the GitNexus wordmark. Speaker: Introduce the goal as an exploratory estimate before integration, not an automated merge tool.

### 2. Introduction — Why study merge conflicts?

- Parallel branch work is common in software development.
- Git reports conflicts during integration.
- Earlier risk signals could help prioritize review.

Suggested visual: Two branches diverging and approaching a merge point. Speaker: Explain the workflow problem without suggesting every overlap is a conflict.

### 3. Problem statement — Signals before integration

- Conflict outcomes are only known after an attempted merge.
- Build/test failures are different outcomes.
- Reliable prediction needs pre-merge data and trustworthy labels.

Suggested visual: Timeline separating “before merge” inputs from “merge attempt” outcome. Speaker: Emphasize the target definition and prevention of label leakage.

### 4. Existing system — Git decides the merge result

- Git performs the actual three-way merge.
- Developers inspect and resolve reported conflicts.
- CI failures do not define the conflict target.

Suggested visual: Existing Git integration workflow. Speaker: State that GitNexus complements review; Git remains authoritative.

### 5. Proposed system — A research prototype

- Collect real merge attempts from explicitly supplied local repositories.
- Extract five current pre-merge measurements.
- Serve an exploratory model via FastAPI and a browser dashboard.

Suggested visual: Collector → model API → dashboard. Speaker: Clarify that the user enters measurements; the dashboard does not scan a repository.

### 6. Objectives — Reproducibility and honest limits

- Maintain a stable 18-field API contract.
- Record label and provenance safely.
- Evaluate by repository group.
- Avoid fabricated features and production claims.

Suggested visual: Four objective icons/checkpoints. Speaker: Connect objectives to the design choices.

### 7. System architecture — Frontend, API, model, data pipeline

- React + TypeScript + Vite frontend.
- FastAPI + Pydantic request validation.
- Saved scikit-learn Random Forest bundle.
- Separate local Git dataset pipeline.

Suggested visual: Browser → FastAPI → model, with a separate collector → CSV → training path. Speaker: Explain that collection/training is not triggered by prediction requests.

### 8. Dataset and feature engineering — 20 examples, five measured fields

- 20 real merge examples across 10 repository groups.
- 10 clean outcomes and 10 conflict outcomes.
- Five populated model features; 13 contract fields remain missing.
- 18 feature columns, one target, 11 provenance fields.

Suggested visual: Dataset composition bar and a five-of-eighteen feature indicator. Speaker: Distinguish genuine collected rows from test fixtures.

### 9. ML development — Simple baselines, group-aware evaluation

- Compared DummyClassifier, Logistic Regression, Random Forest.
- Selected saved exploratory Random Forest.
- 15 training examples; five held-out examples from two groups.
- Holdout F1 0.80 and ROC-AUC 0.83; both highly uncertain at this size.

Suggested visual: Model comparison and a 2×2 confusion matrix [[2,0],[1,2]]. Speaker: Explain the small sample and why the scores are descriptive only.

### 10. Backend and API — Validate, score, report readiness

- Five required numerical model inputs.
- Optional fields validated but not scored.
- Health and readiness are separate.
- Errors are structured and request size is limited.

Suggested visual: API request/response sequence. Speaker: Give one endpoint example and explain the model unavailable response.

### 11. Frontend dashboard — Seven connected pages

- Collision Studio sends a real request.
- Archive stores successful responses locally.
- Simulation Lab calls the API again for changed inputs.
- Compare Runs compares saved responses; System Pulse checks the service.

Suggested visual: Genuine live browser capture, if the presenter creates one before the presentation. Speaker: Walk through the role of each page; do not imply repository scanning.

### 12. Results and testing — Integrated, not production validated

- Frontend build and TypeScript checks pass.
- Backend and Chromium suites pass.
- Live saved-model browser workflow verified separately.
- Predictions are actual model output, not merge guarantees.

Suggested visual: Test summary with separate frontend/backend/live-test columns. Speaker: State the exact final verification counts after reading the Stage 12 report.

### 13. Security and performance — Local measurements and safeguards

- Numeric validation, 16 KiB request-body cap, exact CORS origins.
- Production API URL is configured at build time.
- Local production-preview load and API timings are documented.
- No authentication/rate limiting; no public exposure yet.

Suggested visual: Request guard diagram and small performance table. Speaker: Distinguish local measurements from a benchmark and list production controls still needed.

### 14. Limitations and future scope — More evidence first

- Small dataset and ten repository groups.
- Thirteen features unavailable.
- Tiny holdout makes metrics unstable.
- Future work: more repositories, temporal evaluation, secure integrations.

Suggested visual: “Current evidence” versus “Next research steps” columns. Speaker: Do not promise a model accuracy improvement.

### 15. Conclusion — An inspectable end-to-end prototype

- Reproducible data path, API, model service, and frontend.
- No fabricated values or automatic merges.
- The model remains exploratory.

Suggested visual: Architecture recap. Speaker: Close with the project contribution and the need for more data.

## Three-to-five-minute project explanation

Good morning. My project is GitNexus AI, a predictive merge-intelligence prototype with the tagline “See the merge before it happens.” It studies whether measurements available before a Git integration attempt can provide a useful signal about merge-conflict risk.

The target is specific: label one means Git reported a merge conflict during an attempted branch integration; label zero means the attempt completed without a merge conflict. A failed test or build is not treated as a conflict. Data collection is a separate local-only process that records real branch commits and provenance and does not modify the supplied repository.

The current dataset contains 20 examples from ten repository groups, balanced between the two labels. The API retains an 18-feature contract, but only five fields are currently populated consistently: files changed, lines added, average files per commit, target branch commit count, and target branch changed paths. The other 13 fields remain missing and are not filled with invented zeros.

The training pipeline compared a dummy baseline, Logistic Regression, and Random Forest. Evaluation uses repository-group separation so examples from one repository do not appear on both sides of the holdout. The saved model is an exploratory Random Forest. Its recorded five-example holdout has F1 0.80 and ROC-AUC 0.83, but those values are very uncertain because the test set has only five examples from two repository groups. The probabilities shown by the application are raw and uncalibrated, not guarantees.

The backend is FastAPI with Pydantic validation, health and readiness endpoints, a size-limited request body, and a model service that loads a trusted saved artifact. The frontend is a seven-page React and TypeScript application. Collision Studio sends a real request; successful responses can be inspected in the browser archive, reused in Simulation Lab, and compared in Compare Runs. System Pulse distinguishes whether the API process is responding from whether the model is ready.

The project demonstrates a reproducible, connected prototype rather than a production predictor. It does not scan repositories in the UI, connect to GitHub, resolve conflicts, or merge branches. The most important next step is more independent real data and stronger evaluation before making predictive claims. Thank you.

## Live demonstration script

### Preparation

1. Confirm the trusted model artifact is present at the documented path and scikit-learn reports 1.9.0.
2. Start FastAPI in one terminal using the root README instructions; wait for startup to complete.
3. Start Vite in another terminal and open the printed local URL.
4. Keep the API docs available as a fallback. Do not display local absolute paths, tokens, or private repository data on the projector.

### Demo flow

1. **System Pulse:** open the page; point out that process health and prediction readiness are separate checks.
2. **Collision Studio:** enter measured values or the documented request-shape demonstration values. Clearly identify hand-entered demo values as examples, not a repository result.
3. Submit and wait for “ACTUAL API RESPONSE.” Explain the displayed class and raw class probabilities; note they are exploratory and uncalibrated.
4. **Intelligence Archive:** review the successful response saved in this browser. Explain that this history is localStorage, not a shared database.
5. **Simulation Lab:** select a saved request, change one input, and run the API comparison. Explain that this is a new API call, not a Git merge simulation.
6. **Compare Runs:** select two saved responses and show that the page compares their stored inputs and outputs.
7. Optionally show the **Conflict DNA** and **Merge Observatory** pages and identify conceptual artwork as illustrative.
8. Close by stating that the app does not scan, merge, or resolve repositories automatically.

If the API is unavailable, use System Pulse to show the real offline state and explain the recovery behavior. Do not present a test fixture response as a production prediction.

## Viva questions and answers

1. **What problem does GitNexus AI address?** — It explores pre-merge measurements as signals for whether an attempted Git integration may report a conflict.
2. **What exactly is a merge conflict in this project?** — A conflict reported by the collector's Git merge attempt, not a failed build or test.
3. **What are the class labels?** — 0 means the attempted merge completed without a merge conflict; 1 means it reported a merge conflict.
4. **Why collect from real repositories?** — Real Git histories and merge attempts provide traceable examples; fabricated rows would not represent actual outcomes.
5. **How is the original repository protected?** — Collection is performed in an isolated approach using supplied local repository history; it avoids merging into the user's working tree.
6. **What is target leakage?** — Using information from the outcome or future history that would not be available when making a prediction.
7. **How many examples are in the current dataset?** — 20 examples from 10 repository groups, with ten examples in each class.
8. **Why is 20 examples still too small?** — Each test or validation fold contains very few examples and repository diversity is limited, so metrics have high uncertainty.
9. **Why keep 18 API fields if only five are used?** — The existing contract is preserved for compatibility; only five have reliable observed values for the current baseline.
10. **What are the five model inputs?** — files_changed, lines_added, avg_files_per_commit, branch_commits, and branch_files_changed.
11. **What happens to the other 13 fields?** — They remain missing unless supplied; they are validated but excluded from current scoring.
12. **Which algorithms were compared?** — DummyClassifier, Logistic Regression, and Random Forest.
13. **Why was Random Forest selected?** — The recorded group-aware comparison selected it under the documented pooled out-of-fold F1 rule; the result is exploratory and dataset-specific.
14. **What does precision mean here?** — Among cases predicted as conflict, the fraction that were conflict cases in the evaluated sample.
15. **What does recall mean?** — Among actual conflict cases in that evaluated sample, the fraction predicted as conflict.
16. **What is F1?** — The harmonic mean of precision and recall for the positive conflict class.
17. **What does ROC-AUC represent?** — Ranking separation between positive and negative examples; it requires both classes and remains uncertain on tiny test sets.
18. **Why use repository-group splits?** — They reduce leakage from related examples in the same repository appearing in both train and test data.
19. **What is the current held-out test size?** — Five examples from two repository groups.
20. **What does a prediction probability mean?** — It is an uncalibrated score from the exploratory model, not confidence or a guaranteed merge result.
21. **What does FastAPI do in the architecture?** — It exposes validated HTTP endpoints and delegates scoring to the model service.
22. **Why use Pydantic?** — It checks request types and bounds and rejects malformed or unexpected input.
23. **How does React communicate with the backend?** — A centralized TypeScript API service sends JSON to the configured API base URL and validates responses.
24. **Where is browser prediction history stored?** — In versioned browser localStorage on the current browser; it is not a server database.
25. **Does Simulation Lab run a Git merge?** — No. It changes saved numeric inputs and submits a new request to the prediction API.
26. **Does the application connect to GitHub?** — No. Data collection uses repositories supplied explicitly outside the dashboard.
27. **Does the app merge or resolve branches?** — No. It provides only an exploratory estimate.
28. **Why separate health and readiness?** — The API process may be alive even if the model artifact failed to load.
29. **Why is CORS configured?** — Browsers enforce cross-origin request rules; CORS allows only the configured frontend origins to read API responses.
30. **Is CORS a replacement for authentication?** — No. Non-browser clients can call an API directly, so public services need authentication and other controls.
31. **What security protections are present?** — Numeric validation, unknown-field rejection, a 16 KiB request cap, explicit CORS, and sanitized client errors.
32. **What security controls are still missing?** — Authentication, authorization, rate limiting, public deployment monitoring, and a completed Python CVE scan.
33. **Why must the model artifact be trusted?** — joblib deserializes Python objects; loading a malicious or replaced artifact can execute unsafe code.
34. **What is the most important future work?** — Collect more independent, diverse real repositories and evaluate on unseen repositories/time periods before product claims.
35. **What is the main project contribution if accuracy is uncertain?** — A traceable collection/evaluation pipeline and an integrated, honest prototype that exposes evidence and limitations.

## Presentation integrity note

Use only genuine screenshots captured from the running application. No screenshot or PowerPoint file is currently included with this outline. Replace any presenter-specific placeholders yourself and verify the final demonstration environment before presenting.

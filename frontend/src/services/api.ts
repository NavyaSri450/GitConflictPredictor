import type {
  HealthResponse,
  DatasetSummaryResponse,
  RepositorySummary,
  BranchSummary,
  RepositoryAnalysis,
  RepositoryAnalysisList,
  DashboardAnalytics,
  SystemIntegrationStatus,
  ModelEvaluationResponse,
  ModelInfoResponse,
  PredictionRequest,
  PredictionResponse,
  ReadinessResponse,
  SystemSnapshot,
  TimedResult,
} from '../types/api';
import { modelFeatures } from '../types/api';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const developmentApiBaseUrl = import.meta.env.DEV ? 'http://127.0.0.1:8000' : '';

// Keep localhost convenient in Vite development without baking it into a
// production bundle. Production must configure its API origin at build time.
export const apiBaseUrl = (configuredApiBaseUrl || developmentApiBaseUrl).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberBetweenZeroAndOne(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function errorFromPayload(payload: unknown, status: number): ApiError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = typeof payload.error.message === 'string' ? payload.error.message : `The API returned ${status}.`;
    const code = typeof payload.error.code === 'string' ? payload.error.code : undefined;
    return new ApiError(message, status, code);
  }
  if (isRecord(payload) && typeof payload.detail === 'string') return new ApiError(payload.detail, status);
  return new ApiError(`The API returned ${status}.`, status);
}

function validatePredictionResponse(value: unknown): PredictionResponse {
  const features = isRecord(value) ? value.features_used : undefined;
  if (!isRecord(value)
    || (value.prediction !== 0 && value.prediction !== 1)
    || (value.predicted_class !== 'clean_merge' && value.predicted_class !== 'merge_conflict')
    || !isRecord(value.class_probabilities)
    || !numberBetweenZeroAndOne(value.class_probabilities.clean_merge)
    || !numberBetweenZeroAndOne(value.class_probabilities.merge_conflict)
    || Math.abs(value.class_probabilities.clean_merge + value.class_probabilities.merge_conflict - 1) > 1e-5
    || typeof value.prediction_label !== 'string'
    || typeof value.probability_note !== 'string'
    || typeof value.model_name !== 'string'
    || typeof value.model_status !== 'string'
    || !Array.isArray(features)
    || !features.every((feature) => typeof feature === 'string')
    || typeof value.predicted_at !== 'string'
    || typeof value.message !== 'string') {
    throw new ApiError('The API returned a response that does not match the prediction contract.', 502, 'INVALID_API_RESPONSE');
  }
  if (!modelFeatures.every((name) => features.includes(name))) {
    throw new ApiError('The API response does not report the supported model inputs.', 502, 'INVALID_API_RESPONSE');
  }
  return value as unknown as PredictionResponse;
}

async function requestTimed<T>(path: string, validate: (value: unknown) => T): Promise<TimedResult<T>> {
  const start = performance.now();
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
    const payload: unknown = await response.json().catch(() => null);
    const duration = Math.round(performance.now() - start);
    if (!response.ok) return { data: null, error: errorFromPayload(payload, response.status).message, duration_ms: duration };
    return { data: validate(payload), error: null, duration_ms: duration };
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'The API request failed.',
      duration_ms: duration,
    };
  }
}

function validateIntegrationStatus(value: unknown): SystemIntegrationStatus {
  if (!isRecord(value) || typeof value.database_available !== 'boolean' || typeof value.git_available !== 'boolean'
    || typeof value.local_repository_connection_enabled !== 'boolean' || typeof value.public_github_connection_enabled !== 'boolean') {
    throw new Error('Integration status did not match the expected schema.');
  }
  return value as unknown as SystemIntegrationStatus;
}

function validateModelEvaluation(value: unknown): ModelEvaluationResponse {
  if (!isRecord(value) || value.status !== 'available' || typeof value.model_name !== 'string'
    || typeof value.artifact_type !== 'string' || typeof value.production_ready !== 'boolean'
    || !(value.trained_at_utc === null || typeof value.trained_at_utc === 'string')
    || typeof value.dataset_rows !== 'number' || typeof value.repository_group_count !== 'number'
    || typeof value.split_method !== 'string' || typeof value.test_rows !== 'number'
    || ![value.precision, value.recall, value.f1, value.roc_auc].every((metric) => metric === null || (typeof metric === 'number' && Number.isFinite(metric)))
    || !Array.isArray(value.confusion_matrix) || value.confusion_matrix.length !== 2
    || value.confusion_matrix.some((row) => !Array.isArray(row) || row.length !== 2 || row.some((count) => !Number.isInteger(count) || count < 0))) {
    throw new Error('Model evaluation did not match the expected schema.');
  }
  return value as unknown as ModelEvaluationResponse;
}

function validateRepository(value: unknown): RepositorySummary {
  if (!isRecord(value) || typeof value.id !== 'string' || !['github_url', 'local_path'].includes(String(value.kind))
    || typeof value.name !== 'string' || !(value.owner === null || typeof value.owner === 'string')
    || typeof value.default_branch !== 'string' || typeof value.branch_count !== 'number' || typeof value.connected_at !== 'string') {
    throw new ApiError('The API returned invalid repository information.', 502, 'INVALID_API_RESPONSE');
  }
  return value as unknown as RepositorySummary;
}

function validateBranches(value: unknown): { repository: RepositorySummary; branches: BranchSummary[] } {
  if (!isRecord(value) || !Array.isArray(value.branches)) throw new ApiError('The API returned an invalid branch list.', 502, 'INVALID_API_RESPONSE');
  const repository = validateRepository(value.repository);
  const branches = value.branches.map((branch): BranchSummary => {
    if (!isRecord(branch) || typeof branch.name !== 'string' || typeof branch.ref !== 'string' || typeof branch.commit_sha !== 'string' || typeof branch.is_default !== 'boolean') {
      throw new ApiError('The API returned an invalid branch entry.', 502, 'INVALID_API_RESPONSE');
    }
    return branch as unknown as BranchSummary;
  });
  return { repository, branches };
}

function validateAnalysis(value: unknown): RepositoryAnalysis {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.repository_id !== 'string' || typeof value.repository_name !== 'string'
    || typeof value.source_branch !== 'string' || typeof value.target_branch !== 'string' || typeof value.source_commit !== 'string'
    || typeof value.target_commit !== 'string' || typeof value.merge_base !== 'string' || typeof value.source_only_commits !== 'number'
    || typeof value.target_only_commits !== 'number' || !Array.isArray(value.source_changed_files) || !Array.isArray(value.target_changed_files)
    || !Array.isArray(value.overlapping_paths) || typeof value.source_lines_added !== 'number' || typeof value.source_lines_deleted !== 'number'
    || typeof value.target_lines_added !== 'number' || typeof value.target_lines_deleted !== 'number' || !isRecord(value.feature_values)
    || (value.merge_check !== 'clean' && value.merge_check !== 'conflict') || !(value.prediction === null || isRecord(value.prediction))
    || !(value.prediction_unavailable_reason === null || typeof value.prediction_unavailable_reason === 'string') || typeof value.created_at !== 'string') {
    throw new ApiError('The API returned an invalid repository analysis.', 502, 'INVALID_API_RESPONSE');
  }
  const values = Object.values(value.feature_values);
  if (!values.every((item) => item === null || (typeof item === 'number' && Number.isFinite(item)))) {
    throw new ApiError('The API returned invalid feature values.', 502, 'INVALID_API_RESPONSE');
  }
  const prediction = value.prediction === null ? null : validatePredictionResponse(value.prediction);
  return { ...value, prediction } as unknown as RepositoryAnalysis;
}

async function requestJson<T>(path: string, validate: (value: unknown) => T, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'The API request could not reach FastAPI.', 0, 'NETWORK_ERROR');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromPayload(payload, response.status);
  return validate(payload);
}

function validateHealth(value: unknown): HealthResponse {
  if (!isRecord(value) || typeof value.status !== 'string' || typeof value.service !== 'string' || typeof value.model_available !== 'boolean') {
    throw new Error('Health response did not match the expected schema.');
  }
  return value as unknown as HealthResponse;
}

function validateReadiness(value: unknown): ReadinessResponse {
  if (!isRecord(value) || typeof value.status !== 'string' || typeof value.model_available !== 'boolean') {
    throw new Error('Readiness response did not match the expected schema.');
  }
  return value as unknown as ReadinessResponse;
}

function validateModelInfo(value: unknown): ModelInfoResponse {
  if (!isRecord(value)
    || typeof value.model_name !== 'string'
    || typeof value.model_status !== 'string'
    || !Array.isArray(value.supported_features)
    || typeof value.supported_feature_count !== 'number'
    || typeof value.feature_contract_size !== 'number'
    || !isRecord(value.class_mapping)) {
    throw new Error('Model information response did not match the expected schema.');
  }
  return value as unknown as ModelInfoResponse;
}

function validateDatasetSummary(value: unknown): DatasetSummaryResponse {
  if (!isRecord(value) || value.status !== 'available'
    || (value.validation_status !== 'valid' && value.validation_status !== 'invalid')
    || typeof value.raw_rows !== 'number' || typeof value.processed_rows !== 'number'
    || typeof value.feature_count !== 'number' || typeof value.provenance_count !== 'number'
    || typeof value.repository_group_count !== 'number' || !isRecord(value.class_counts)
    || !Array.isArray(value.feature_aggregates) || !Array.isArray(value.repository_distribution)
    || !Array.isArray(value.collection_timeline)) {
    throw new Error('Dataset summary response did not match the expected schema.');
  }
  const classCounts = value.class_counts as Record<string, unknown>;
  if (!['0', '1'].every((label) => typeof classCounts[label] === 'number' && Number.isFinite(classCounts[label]))) {
    throw new Error('Dataset class counts did not match the expected schema.');
  }
  const featureIsValid = (item: unknown) => isRecord(item)
    && typeof item.name === 'string'
    && typeof item.observed_count === 'number' && Number.isFinite(item.observed_count)
    && typeof item.missing_count === 'number' && Number.isFinite(item.missing_count)
    && (item.minimum === null || (typeof item.minimum === 'number' && Number.isFinite(item.minimum)))
    && (item.mean === null || (typeof item.mean === 'number' && Number.isFinite(item.mean)))
    && (item.maximum === null || (typeof item.maximum === 'number' && Number.isFinite(item.maximum)));
  const groupIsValid = (item: unknown) => isRecord(item) && typeof item.group === 'string'
    && typeof item.examples === 'number' && Number.isFinite(item.examples);
  const dateIsValid = (item: unknown) => isRecord(item) && typeof item.date === 'string'
    && typeof item.examples === 'number' && Number.isFinite(item.examples);
  if (!value.feature_aggregates.every(featureIsValid)
    || !value.repository_distribution.every(groupIsValid)
    || !value.collection_timeline.every(dateIsValid)) {
    throw new Error('Dataset summary response contained invalid aggregate values.');
  }
  return value as unknown as DatasetSummaryResponse;
}

let systemSnapshotInFlight: Promise<SystemSnapshot> | null = null;

/** Deduplicates concurrent initial/StrictMode refreshes of the three system endpoints. */
export function getSystemSnapshot(): Promise<SystemSnapshot> {
  if (systemSnapshotInFlight) return systemSnapshotInFlight;
  systemSnapshotInFlight = Promise.all([
    requestTimed('/health', validateHealth),
    requestTimed('/ready', validateReadiness),
    requestTimed('/api/v1/model-info', validateModelInfo),
    requestTimed('/api/v1/model-evaluation', validateModelEvaluation),
    requestTimed('/api/v1/dataset-summary', validateDatasetSummary),
    requestTimed('/api/v1/integration-status', validateIntegrationStatus),
    requestTimed('/api/v1/dashboard', validateDashboard),
  ]).then(([health, readiness, model_info, model_evaluation, dataset_summary, integration_status, dashboard]) => ({ health, readiness, model_info, model_evaluation, dataset_summary, integration_status, dashboard, checked_at: new Date().toISOString() }))
    .finally(() => { systemSnapshotInFlight = null; });
  return systemSnapshotInFlight;
}

function validateDashboard(value: unknown): DashboardAnalytics {
  if (!isRecord(value) || typeof value.repository_count !== 'number' || typeof value.analysis_count !== 'number'
    || typeof value.clean_merge_checks !== 'number' || typeof value.conflicting_merge_checks !== 'number'
    || typeof value.predictions_available !== 'number' || !Array.isArray(value.recent_analyses) || !Array.isArray(value.activity_by_date)) {
    throw new Error('Dashboard response did not match the expected schema.');
  }
  return { ...value, recent_analyses: value.recent_analyses.map(validateAnalysis) } as unknown as DashboardAnalytics;
}

export async function connectRepository(kind: 'github_url' | 'local_path', value: string): Promise<RepositorySummary> {
  return requestJson('/api/v1/repositories/connect', validateRepository, { method: 'POST', body: JSON.stringify({ kind, value }) }, 210_000);
}

export async function listRepositories(): Promise<RepositorySummary[]> {
  return requestJson('/api/v1/repositories', (value) => {
    if (!isRecord(value) || !Array.isArray(value.repositories)) throw new ApiError('The API returned an invalid repository list.', 502);
    return value.repositories.map(validateRepository);
  });
}

export async function listRepositoryBranches(repositoryId: string): Promise<{ repository: RepositorySummary; branches: BranchSummary[] }> {
  return requestJson(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/branches`, validateBranches);
}

export async function analyzeRepository(repositoryId: string, sourceRef: string, targetRef: string): Promise<RepositoryAnalysis> {
  try {
    return await requestJson(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/analyze`, validateAnalysis, {
      method: 'POST', body: JSON.stringify({ source_ref: sourceRef, target_ref: targetRef }),
    }, 210_000);
  } catch (error) {
    // The backend intentionally sanitizes HTTPException details. Give users a
    // useful next step for rejected branch pairs without exposing server data.
    if (error instanceof ApiError && error.status === 422 && error.code === 'HTTP_ERROR') {
      throw new ApiError('These refs cannot be analyzed. Choose two different branch tips with a common base and commits unique to both sides. Branches that are identical, already integrated, unrelated, or use custom merge drivers are not eligible.', 422, 'BRANCH_PAIR_NOT_ANALYZABLE');
    }
    throw error;
  }
}

export async function listAnalyses(options: { search?: string; outcome?: 'clean' | 'conflict'; limit?: number; offset?: number } = {}): Promise<RepositoryAnalysisList> {
  const params = new URLSearchParams();
  if (options.search) params.set('search', options.search);
  if (options.outcome) params.set('outcome', options.outcome);
  params.set('limit', String(options.limit ?? 50)); params.set('offset', String(options.offset ?? 0));
  return requestJson(`/api/v1/analyses?${params.toString()}`, (value) => {
    if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total !== 'number' || typeof value.limit !== 'number' || typeof value.offset !== 'number') {
      throw new ApiError('The API returned an invalid analysis history.', 502);
    }
    return { ...value, items: value.items.map(validateAnalysis) } as unknown as RepositoryAnalysisList;
  });
}

export async function compareAnalyses(leftId: string, rightId: string): Promise<{ left: RepositoryAnalysis; right: RepositoryAnalysis; feature_differences: Record<string, { left: number | null; right: number | null }> }> {
  const params = new URLSearchParams({ left_id: leftId, right_id: rightId });
  return requestJson(`/api/v1/analyses/compare?${params.toString()}`, (value) => {
    if (!isRecord(value) || !isRecord(value.feature_differences)) throw new ApiError('The API returned an invalid comparison.', 502);
    return { left: validateAnalysis(value.left), right: validateAnalysis(value.right), feature_differences: value.feature_differences as Record<string, { left: number | null; right: number | null }> };
  });
}

export async function submitPrediction(payload: PredictionRequest): Promise<PredictionResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'The prediction request could not reach the API.', 0, 'NETWORK_ERROR');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromPayload(body, response.status);
  return validatePredictionResponse(body);
}

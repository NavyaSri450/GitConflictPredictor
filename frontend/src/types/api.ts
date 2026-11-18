export const modelFeatures = [
  'files_changed',
  'lines_added',
  'avg_files_per_commit',
  'branch_commits',
  'branch_files_changed',
] as const;

export type ModelFeature = (typeof modelFeatures)[number];

export interface HealthResponse {
  status: string;
  service: string;
  model_available: boolean;
}

export interface ReadinessResponse {
  status: string;
  model_available: boolean;
}

export interface ModelInfoResponse {
  model_name: string;
  model_type: string | null;
  model_status: string;
  supported_features: string[];
  supported_feature_count: number;
  feature_contract_size: number;
  class_mapping: Record<string, string>;
  dataset_sha256: string | null;
}

export interface FeatureAggregate {
  name: string;
  observed_count: number;
  missing_count: number;
  minimum: number | null;
  mean: number | null;
  maximum: number | null;
}

export interface DatasetSummaryResponse {
  status: string;
  validation_status: 'valid' | 'invalid';
  raw_rows: number;
  processed_rows: number;
  feature_count: number;
  provenance_count: number;
  repository_group_count: number;
  repository_distribution: { group: string; examples: number }[];
  class_counts: Record<string, number>;
  feature_aggregates: FeatureAggregate[];
  collection_timeline: { date: string; examples: number }[];
  raw_available: boolean;
  processed_available: boolean;
}

export interface RepositorySummary {
  id: string;
  kind: 'github_url' | 'local_path';
  name: string;
  owner: string | null;
  default_branch: string;
  branch_count: number;
  connected_at: string;
}

export interface BranchSummary {
  name: string;
  ref: string;
  commit_sha: string;
  is_default: boolean;
}

export interface RepositoryAnalysis {
  id: string;
  repository_id: string;
  repository_name: string;
  source_branch: string;
  target_branch: string;
  source_commit: string;
  target_commit: string;
  merge_base: string;
  source_only_commits: number;
  target_only_commits: number;
  source_changed_files: string[];
  target_changed_files: string[];
  overlapping_paths: string[];
  source_lines_added: number;
  source_lines_deleted: number;
  target_lines_added: number;
  target_lines_deleted: number;
  feature_values: Record<string, number | null>;
  merge_check: 'clean' | 'conflict';
  prediction: PredictionResponse | null;
  prediction_unavailable_reason: string | null;
  created_at: string;
}

export interface RepositoryAnalysisList {
  items: RepositoryAnalysis[];
  total: number;
  limit: number;
  offset: number;
}

export interface DashboardAnalytics {
  repository_count: number;
  analysis_count: number;
  clean_merge_checks: number;
  conflicting_merge_checks: number;
  predictions_available: number;
  recent_analyses: RepositoryAnalysis[];
  activity_by_date: { date: string; analyses: number }[];
}

export interface SystemIntegrationStatus {
  database_available: boolean;
  git_available: boolean;
  local_repository_connection_enabled: boolean;
  public_github_connection_enabled: boolean;
}

export interface ModelEvaluationResponse {
  status: string;
  model_name: string;
  artifact_type: string;
  production_ready: boolean;
  trained_at_utc: string | null;
  dataset_rows: number;
  repository_group_count: number;
  split_method: string;
  test_rows: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  roc_auc: number | null;
  confusion_matrix: number[][];
}

export type ServiceState = 'checking' | 'connected' | 'offline';

/** The five model inputs are required; the remaining contract fields are optional. */
export interface PredictionRequest {
  files_changed: number;
  lines_added: number;
  avg_files_per_commit: number;
  branch_commits: number;
  branch_files_changed: number;
  commit_severity?: number | null;
  developer_commits?: number | null;
  developer_conflicts?: number | null;
  activity_score?: number | null;
  import_count?: number | null;
  dependency_conflicts?: number | null;
  coverage?: number | null;
  branch_conflicts?: number | null;
  branch_risk_score?: number | null;
  pattern_frequency?: number | null;
  pattern_conflicts?: number | null;
  dependency_risk?: number | null;
  pattern_risk?: number | null;
}

export interface BranchMetadata {
  source: string;
  target: string;
}

export interface PredictionResponse {
  prediction: 0 | 1;
  prediction_label: string;
  predicted_class: 'clean_merge' | 'merge_conflict';
  class_probabilities: {
    clean_merge: number;
    merge_conflict: number;
  };
  probability_note: string;
  model_name: string;
  model_status: string;
  features_used: string[];
  predicted_at: string;
  message: string;
}

export interface SavedPrediction {
  id: string;
  saved_at: string;
  request: PredictionRequest;
  branch_metadata: BranchMetadata;
  response: PredictionResponse;
}

export interface TimedResult<T> {
  data: T | null;
  error: string | null;
  duration_ms: number | null;
}

export interface SystemSnapshot {
  health: TimedResult<HealthResponse>;
  readiness: TimedResult<ReadinessResponse>;
  model_info: TimedResult<ModelInfoResponse>;
  model_evaluation: TimedResult<ModelEvaluationResponse>;
  dataset_summary: TimedResult<DatasetSummaryResponse>;
  integration_status: TimedResult<SystemIntegrationStatus>;
  dashboard: TimedResult<DashboardAnalytics>;
  checked_at: string;
}

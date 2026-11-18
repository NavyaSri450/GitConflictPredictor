import type { PredictionRequest, PredictionResponse, SavedPrediction } from '../types/api';
import { modelFeatures } from '../types/api';

const storageKey = 'gitnexus.predictions.v1';
const storageVersion = 1;
const requestFields = [
  'files_changed', 'lines_added', 'commit_severity', 'developer_commits', 'avg_files_per_commit',
  'developer_conflicts', 'activity_score', 'import_count', 'dependency_conflicts', 'coverage',
  'branch_commits', 'branch_files_changed', 'branch_conflicts', 'branch_risk_score',
  'pattern_frequency', 'pattern_conflicts', 'dependency_risk', 'pattern_risk',
] as const;
const integerFields = new Set([
  'files_changed', 'lines_added', 'developer_commits', 'developer_conflicts', 'import_count',
  'dependency_conflicts', 'branch_commits', 'branch_files_changed', 'branch_conflicts',
  'pattern_frequency', 'pattern_conflicts',
]);
const ratioFields = new Set(['commit_severity', 'coverage', 'dependency_risk', 'pattern_risk']);

export interface HistoryReadResult {
  records: SavedPrediction[];
  warning: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validRequest(value: unknown): value is PredictionRequest {
  if (!isRecord(value)) return false;
  if (!modelFeatures.every((name) => typeof value[name] === 'number' && Number.isFinite(value[name]) && (value[name] as number) >= 0)) return false;
  if (!Object.keys(value).every((name) => requestFields.includes(name as (typeof requestFields)[number]))) return false;
  return Object.entries(value).every(([name, fieldValue]) => {
    if (modelFeatures.includes(name as (typeof modelFeatures)[number])) return true;
    if (fieldValue === null) return true;
    return typeof fieldValue === 'number'
      && Number.isFinite(fieldValue)
      && fieldValue >= 0
      && fieldValue <= 1_000_000_000
      && (!integerFields.has(name) || Number.isInteger(fieldValue))
      && (!ratioFields.has(name) || fieldValue <= 1);
  });
}

function validResponse(value: unknown): value is PredictionResponse {
  if (!isRecord(value) || (value.prediction !== 0 && value.prediction !== 1)
    || (value.predicted_class !== 'clean_merge' && value.predicted_class !== 'merge_conflict')
    || !isRecord(value.class_probabilities)) return false;
  const clean = value.class_probabilities.clean_merge;
  const conflict = value.class_probabilities.merge_conflict;
  const requiredFeaturesValid = Array.isArray(value.features_used)
    && value.features_used.length === modelFeatures.length
    && value.features_used.every((feature, index) => feature === modelFeatures[index]);
  return typeof clean === 'number' && Number.isFinite(clean) && clean >= 0 && clean <= 1
    && typeof conflict === 'number' && Number.isFinite(conflict) && conflict >= 0 && conflict <= 1
    && Math.abs(clean + conflict - 1) <= 1e-5
    && value.predicted_class === (value.prediction === 0 ? 'clean_merge' : 'merge_conflict')
    && typeof value.predicted_at === 'string' && Number.isFinite(Date.parse(value.predicted_at))
    && typeof value.model_name === 'string'
    && typeof value.model_status === 'string'
    && typeof value.prediction_label === 'string'
    && typeof value.message === 'string'
    && typeof value.probability_note === 'string'
    && requiredFeaturesValid;
}

function validSavedPrediction(value: unknown): value is SavedPrediction {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.saved_at === 'string'
    && Number.isFinite(Date.parse(value.saved_at))
    && validRequest(value.request)
    && isRecord(value.branch_metadata)
    && typeof value.branch_metadata.source === 'string'
    && typeof value.branch_metadata.target === 'string'
    && validResponse(value.response);
}

export function readPredictionHistory(): HistoryReadResult {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return { records: [], warning: null };
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || parsed.version !== storageVersion || !Array.isArray(parsed.records)) {
      return { records: [], warning: 'Saved history has an unsupported or damaged format. Existing browser data was left untouched.' };
    }
    if (!parsed.records.every(validSavedPrediction)) {
      return { records: [], warning: 'Some saved history could not be verified. Existing browser data was left untouched.' };
    }
    return { records: (parsed.records as SavedPrediction[]).sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at)), warning: null };
  } catch {
    return { records: [], warning: 'Browser history could not be read. Check local storage availability.' };
  }
}

export function savePrediction(record: SavedPrediction): HistoryReadResult {
  const current = readPredictionHistory();
  if (current.warning) return current;
  if (!validSavedPrediction(record)) {
    return { records: current.records, warning: 'The prediction response failed local history validation and was not saved.' };
  }
  try {
    const records = [record, ...current.records.filter((item) => item.id !== record.id)];
    window.localStorage.setItem(storageKey, JSON.stringify({ version: storageVersion, records }));
    return { records, warning: null };
  } catch {
    return { records: current.records, warning: 'This prediction succeeded but could not be saved in browser history.' };
  }
}

export function createPredictionRecord(
  request: PredictionRequest,
  response: PredictionResponse,
  branchMetadata: { source: string; target: string },
): SavedPrediction {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: `pred_${uuid}`,
    saved_at: new Date().toISOString(),
    request,
    response,
    branch_metadata: branchMetadata,
  };
}

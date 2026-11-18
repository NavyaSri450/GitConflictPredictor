import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Beaker, GitCompareArrows, LoaderCircle, RotateCcw } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { BranchConvergenceMap } from '../components/BranchConvergenceMap';
import { RepositoryAnalysisWorkspace } from '../components/RepositoryAnalysisWorkspace';
import { ChartPanel, FeatureBarChart, ProbabilityComparisonChart } from '../components/DataCharts';
import type { BranchMetadata, ModelFeature, PredictionRequest, PredictionResponse, RepositoryAnalysis, SavedPrediction } from '../types/api';
import { modelFeatures } from '../types/api';

interface SimulationLabProps {
  records: SavedPrediction[];
  initialRecordId: string | null;
  onPredict: (payload: PredictionRequest, metadata: BranchMetadata) => Promise<PredictionResponse>;
  onOpenCollision: () => void;
  analyses: RepositoryAnalysis[];
  onAnalysisSaved: () => void;
}

const labels: Record<ModelFeature, string> = {
  files_changed: 'Files changed',
  lines_added: 'Lines added',
  avg_files_per_commit: 'Average files per commit',
  branch_commits: 'Target branch commits',
  branch_files_changed: 'Target branch files changed',
};

export function SimulationLab({ records, initialRecordId, onPredict, onOpenCollision, analyses, onAnalysisSaved }: SimulationLabProps) {
  const [selectedId, setSelectedId] = useState(initialRecordId ?? '');
  const [values, setValues] = useState<Partial<Record<ModelFeature, string>>>({});
  const [newResponse, setNewResponse] = useState<PredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const original = useMemo(() => records.find((record) => record.id === selectedId) ?? null, [records, selectedId]);

  useEffect(() => {
    if (original) {
      setValues(Object.fromEntries(modelFeatures.map((feature) => [feature, String(original.request[feature])])));
      setNewResponse(null);
      setError(null);
    }
  }, [original?.id]);

  const changes = original ? modelFeatures.filter((field) => {
    const raw = values[field];
    return raw !== undefined && raw !== '' && Number(raw) !== original.request[field];
  }) : [];

  async function runComparison() {
    if (!original) return;
    setError(null);
    setNewResponse(null);
    const updated: Partial<PredictionRequest> = { ...original.request };
    for (const field of modelFeatures) {
      const raw = values[field]?.trim();
      if (!raw) { setError(`${labels[field]} is required.`); return; }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000 || (field !== 'avg_files_per_commit' && !Number.isInteger(value))) {
        setError(`${labels[field]} must be a finite, non-negative${field === 'avg_files_per_commit' ? '' : ' whole'} number within the supported range.`);
        return;
      }
      updated[field] = value;
    }
    setSubmitting(true);
    try {
      setNewResponse(await onPredict(updated as PredictionRequest, original.branch_metadata));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The API request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetValues() {
    if (!original) return;
    setValues(Object.fromEntries(modelFeatures.map((feature) => [feature, String(original.request[feature])])));
    setNewResponse(null);
    setError(null);
  }

  if (!records.length) return <>
    <PageHeading eyebrow="PREDICTION COMPARISON" title="Simulation Lab" description="Modify a saved request and compare actual responses from the model API." />
    <RepositoryAnalysisWorkspace onAnalysisSaved={onAnalysisSaved} />
    <section className="surface-card compare-panel"><EmptyState icon={Beaker} title="A saved prediction is required">Create a successful prediction in Collision Studio first. This workspace only compares real saved requests and real API responses.</EmptyState><button className="button button-primary" onClick={onOpenCollision}>Open Collision Studio <ArrowRight size={15} /></button></section>
  </>;

  return <>
    <PageHeading eyebrow="PREDICTION COMPARISON" title="Simulation Lab" description="Start with an actual saved request, change supported inputs, then compare the API’s original and new responses." />
    <RepositoryAnalysisWorkspace onAnalysisSaved={onAnalysisSaved} />
    {analyses.length > 0 && <section className="surface-card simulation-controls"><div className="section-title-row"><div><span className="section-kicker">SAVED BRANCH PAIRS</span><h2>Previous repository simulations</h2></div><span className="chart-tag">{analyses.length} RESULTS</span></div><div className="recent-prediction-list">{analyses.slice(0, 5).map((item) => <div className="recent-prediction-row" key={item.id}><span className={`prediction-dot ${item.merge_check === 'conflict' ? 'dot-risk' : 'dot-clean'}`} /><span className="recent-run-copy"><strong>{item.repository_name}: {item.source_branch} → {item.target_branch}</strong><small>{new Date(item.created_at).toLocaleString()} · {item.source_only_commits} source-only, {item.target_only_commits} target-only commits</small></span><span className={`class-badge compact ${item.merge_check === 'conflict' ? 'class-conflict' : 'class-clean'}`}>Git {item.merge_check}</span><code>{item.prediction ? `${(item.prediction.class_probabilities.merge_conflict * 100).toFixed(1)}%` : 'ML N/A'}</code></div>)}</div><p className="chart-caption">Re-running a pair creates a new persisted analysis from its current branch tips; it does not reuse or invent an earlier result.</p></section>}
    <section className="surface-card simulation-controls">
      <div className="section-title-row"><div><span className="section-kicker">BASELINE SELECTION</span><h2>Choose a saved prediction</h2></div><label className="simulation-select"><span className="sr-only">Select baseline prediction</span><select aria-label="Select baseline prediction" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose a saved prediction</option>{records.map((record) => <option key={record.id} value={record.id}>{new Date(record.saved_at).toLocaleString()} · {record.response.predicted_class} · {record.id.slice(-8)}</option>)}</select></label></div>
      {!original ? <EmptyState icon={GitCompareArrows} title="Select a baseline run">Choose one of the saved API predictions above to load its original feature values.</EmptyState> : <>
        <div className="baseline-caption"><span>Original class <strong>{original.response.predicted_class}</strong></span><span>Original conflict probability <strong>{String(original.response.class_probabilities.merge_conflict)}</strong></span><span>Risk band <strong>Not provided by API</strong></span></div>
        <div className="simulation-input-grid">{modelFeatures.map((field) => <label className="field" key={field}><span>{labels[field]}</span><input type="number" min="0" max="1000000000" step={field === 'avg_files_per_commit' ? 'any' : 1} value={values[field] ?? ''} onChange={(event) => setValues({ ...values, [field]: event.target.value })} /><small>Original: {String(original.request[field])}</small></label>)}</div>
        {error && <div role="alert" className="form-alert"><strong>Comparison request failed</strong><span>{error}</span></div>}
        <div className="form-submit-row"><span className="privacy-note">{changes.length} changed {changes.length === 1 ? 'input' : 'inputs'} · optional fields remain as originally saved</span><div className="simulation-actions"><button className="button button-secondary" onClick={resetValues} disabled={submitting}><RotateCcw size={14} /> Reset</button><button className="button button-primary" onClick={() => void runComparison()} disabled={submitting || changes.length === 0}>{submitting ? <><LoaderCircle size={15} className="spin" /> Requesting</> : <>Run comparison <ArrowRight size={15} /></>}</button></div></div>
      </>}
    </section>
    {original && <div className="chart-grid chart-grid-simulation">
      <ChartPanel title="Branch context" subtitle="User-entered branch labels only. The graphic is schematic and contains no commit history." aside={<span className="chart-tag">NO GIT SIMULATION</span>}>
        <BranchConvergenceMap source={original.branch_metadata.source} target={original.branch_metadata.target} />
        <p className="chart-caption">A changed request is sent to the prediction API; no merge, conflict check, or file inspection runs here.</p>
      </ChartPanel>
      <ChartPanel title="Baseline input profile" subtitle="Values loaded from the selected saved API request." aside={<span className="chart-tag">REAL REQUEST</span>}>
        <FeatureBarChart data={modelFeatures.map((field, index) => ({ label: labels[field], value: original.request[field], color: ['#54d5e4', '#58d6be', '#a78bea', '#80a9ff', '#f1b66f'][index] }))} />
      </ChartPanel>
    </div>}
    {original && newResponse && <section className="surface-card comparison-results"><div className="section-title-row"><div><span className="section-kicker">API-TO-API COMPARISON</span><h2>Original and modified results</h2></div><GitCompareArrows size={17} /></div>
      <div className="comparison-columns"><div><span className="comparison-label">ORIGINAL SAVED RESPONSE</span><strong>{String(original.response.class_probabilities.merge_conflict)}</strong><span>{original.response.predicted_class}</span><small>{new Date(original.saved_at).toLocaleString()}</small></div><div><span className="comparison-label">NEW API RESPONSE</span><strong>{String(newResponse.class_probabilities.merge_conflict)}</strong><span>{newResponse.predicted_class}</span><small>{new Date(newResponse.predicted_at).toLocaleString()}</small></div></div>
      <div className="changed-inputs"><h3>Changed model inputs</h3>{changes.map((field) => <div className="changed-input-row" key={field}><span>{labels[field]}</span><code>{String(original.request[field])}</code><ArrowRight size={13} /><code>{String(Number(values[field]))}</code></div>)}</div>
      <ChartPanel title="Actual probability response comparison" subtitle="Both columns use probabilities returned by FastAPI." aside={<span className="chart-tag">NO LABELS FABRICATED</span>} className="comparison-chart-panel">
        <ProbabilityComparisonChart baseline={{ label: 'Saved response', clean: original.response.class_probabilities.clean_merge, conflict: original.response.class_probabilities.merge_conflict }} comparison={{ label: 'New API response', clean: newResponse.class_probabilities.clean_merge, conflict: newResponse.class_probabilities.merge_conflict }} />
      </ChartPanel>
      <p className="concept-note">Both probabilities above came from saved or live API responses. Risk bands are not included in the backend response.</p>
    </section>}
  </>;
}

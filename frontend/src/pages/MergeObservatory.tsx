import { ArrowRight, Clock3, GitBranch, GitMerge, Layers3, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { BranchConvergenceMap } from '../components/BranchConvergenceMap';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { ChartPanel, CollectionTimeline, DonutChart, FeatureBarChart, ProbabilityTimeline } from '../components/DataCharts';
import type { SavedPrediction, SystemSnapshot } from '../types/api';

interface ObservatoryProps {
  system: SystemSnapshot | null;
  records: SavedPrediction[];
  historyWarning: string | null;
  onAnalyze: () => void;
  onOpenPrediction: (record: SavedPrediction) => void;
}

export function MergeObservatory({ system, records, historyWarning, onAnalyze, onOpenPrediction }: ObservatoryProps) {
  const latest = records[0];
  const health = system?.health.data;
  const ready = system?.readiness.data?.model_available === true;
  const latestConflict = latest?.response.class_probabilities.merge_conflict;
  const conflictRuns = records.filter((record) => record.response.prediction === 1).length;
  const cleanRuns = records.length - conflictRuns;
  const dataset = system?.dataset_summary.data;
  const backend = system?.dashboard.data;

  return <>
    <PageHeading eyebrow="PREDICTIVE MERGE INTELLIGENCE" title="See the merge before it happens." description="A focused view of real estimates returned by the local model. Predictions remain exploratory and do not scan or merge repositories." action={<button className="button button-primary" onClick={onAnalyze}><GitMerge size={16} /> Analyze a merge <ArrowRight size={15} /></button>} />
    <div className="observatory-grid">
      <section className="surface-card overview-card">
        <div className="section-title-row"><div><span className="section-kicker">LATEST PREDICTION</span><h2>{latest ? 'Saved API result' : 'Prediction workspace'}</h2></div><span className="subtle-badge"><Sparkles size={13} /> {latest ? 'EXPLORATORY' : 'NO RUNS YET'}</span></div>
        {latest ? <div className="latest-prediction">
          <div className={`latest-class ${latest.response.prediction === 1 ? 'text-risk' : 'text-clean'}`}><span>{latest.response.predicted_class.replace('_', ' ')}</span><strong>{String(latestConflict)}</strong><small>Merge conflict probability · API value</small></div>
          <div className="latest-facts"><div><span>Clean merge probability</span><strong>{String(latest.response.class_probabilities.clean_merge)}</strong></div><div><span>Predicted class</span><strong>{latest.response.prediction_label}</strong></div><div><span>Risk band</span><strong>Not included in API response</strong></div><div><span>Saved</span><strong>{new Date(latest.saved_at).toLocaleString()}</strong></div></div>
          <button className="text-button" onClick={() => onOpenPrediction(latest)}>Use this run in Simulation Lab <ArrowRight size={14} /></button>
        </div> : <EmptyState icon={ShieldAlert} title="No prediction has been made">A result will appear after Collision Studio receives a successful response from FastAPI. No probabilities or repository metrics are prefilled.</EmptyState>}
        <div className="overview-divider" />
        <div className="overview-foot"><span><ShieldCheck size={14} /> Decision support only</span><span>{latest ? latest.response.model_status : 'No saved API response'}</span></div>
      </section>
      <section className="surface-card readiness-card-wide">
        <div className="section-title-row"><div><span className="section-kicker">LIVE SERVICE CHECK</span><h2>Backend readiness</h2></div><span className={`mini-status ${health ? 'mini-connected' : 'mini-checking'}`}><i />{health ? 'Health responded' : 'Waiting for health'}</span></div>
        <div className="service-row"><span className="service-glyph glyph-api"><Layers3 size={16} /></span><div><strong>FastAPI process</strong><small>{health?.service ?? system?.health.error ?? 'Checking configured API'}</small></div><span className={`service-state ${health ? 'connected' : 'offline'}`}>{health ? 'Available' : 'Unavailable'}</span></div>
        <div className="service-row"><span className="service-glyph glyph-model"><Sparkles size={16} /></span><div><strong>Prediction readiness</strong><small>{ready ? 'GET /ready confirmed model readiness' : system?.readiness.error ?? 'Readiness has not been verified'}</small></div><span className={`service-state ${ready ? 'connected' : 'offline'}`}>{ready ? 'Ready' : 'Unverified'}</span></div>
        {system?.model_info.data && <p className="dashboard-model-note">{system.model_info.data.model_name} · {system.model_info.data.supported_feature_count}/{system.model_info.data.feature_contract_size} input fields supported</p>}
      </section>
    </div>

    <div className="analytics-kpis" aria-label="Current data totals">
      <div className="surface-card analytics-kpi"><span>Repositories connected</span><strong>{backend?.repository_count ?? '—'}</strong><small>Persisted local or public GitHub connections</small></div>
      <div className="surface-card analytics-kpi"><span>Actual Git checks</span><strong>{backend?.analysis_count ?? '—'}</strong><small>Saved branch-pair merge-tree runs</small></div>
      <div className="surface-card analytics-kpi"><span>Git conflicts</span><strong className="kpi-conflict">{backend?.conflicting_merge_checks ?? '—'}</strong><small>Observed isolated Git merge-check results</small></div>
      <div className="surface-card analytics-kpi"><span>Clean Git checks</span><strong className="kpi-clean">{backend?.clean_merge_checks ?? '—'}</strong><small>Observed isolated Git merge-check results</small></div>
    </div>
    <div className="analytics-kpis" aria-label="Model and research data totals">
      <div className="surface-card analytics-kpi"><span>Saved predictions</span><strong>{records.length}</strong><small>Successful API responses in this browser</small></div>
      <div className="surface-card analytics-kpi"><span>Predicted conflict</span><strong className="kpi-conflict">{conflictRuns}</strong><small>Predicted class; not confirmed outcomes</small></div>
      <div className="surface-card analytics-kpi"><span>Predicted clean</span><strong className="kpi-clean">{cleanRuns}</strong><small>Predicted class; not confirmed outcomes</small></div>
      <div className="surface-card analytics-kpi"><span>Dataset groups</span><strong>{dataset?.repository_group_count ?? '—'}</strong><small>{dataset ? `${dataset.raw_rows} locally verified raw examples` : 'Local dataset summary unavailable'}</small></div>
    </div>

    <div className="chart-grid chart-grid-overview">
      <ChartPanel title="Analysis activity" subtitle="Repository analyses saved by the FastAPI service, grouped by stored date." aside={<span className="chart-tag">PERSISTED RESULTS</span>}>
        {backend ? <FeatureBarChart data={backend.activity_by_date.map((item) => ({ label: item.date, value: item.analyses, color: '#54d5e4' }))} caption={`${backend.analysis_count} saved Git analysis records.`} /> : <div className="chart-empty">Backend dashboard analytics are unavailable. No activity values are filled in.</div>}
      </ChartPanel>
      <ChartPanel title="Recent repository analyses" subtitle="Actual Git merge-tree outcomes and optional model estimates saved by the backend." aside={<span className="chart-tag">SERVER HISTORY</span>}>
        {backend?.recent_analyses.length ? <div className="recent-prediction-list">{backend.recent_analyses.slice(0, 5).map((run) => <div className="recent-prediction-row" key={run.id}><span className={`prediction-dot ${run.merge_check === 'conflict' ? 'dot-risk' : 'dot-clean'}`} /><span className="recent-run-copy"><strong>{run.repository_name}: {run.source_branch} → {run.target_branch}</strong><small>{new Date(run.created_at).toLocaleString()} · {run.overlapping_paths.length} shared paths</small></span><span className={`class-badge compact ${run.merge_check === 'conflict' ? 'class-conflict' : 'class-clean'}`}>Git {run.merge_check}</span><code>{run.prediction ? `${(run.prediction.class_probabilities.merge_conflict * 100).toFixed(1)}%` : 'ML N/A'}</code></div>)}</div> : <div className="chart-empty">No repository analyses have been saved yet. Connect a repository in Collision Studio to begin.</div>}
      </ChartPanel>
    </div>

    <div className="chart-grid chart-grid-overview">
      <ChartPanel title="Saved prediction mix" subtitle="Predicted classes in this browser’s local archive; not dataset labels." aside={<span className="chart-tag">LOCAL HISTORY</span>}>
        <DonutChart values={[{ label: 'Predicted clean', value: cleanRuns, color: '#57d6be' }, { label: 'Predicted conflict', value: conflictRuns, color: '#f0a56f' }]} center={String(records.length)} label="saved" />
      </ChartPanel>
      <ChartPanel title="Conflict probability over time" subtitle="Actual API probabilities ordered by saved timestamp." aside={<span className="chart-tag">SAVED RESPONSES</span>}>
        <ProbabilityTimeline records={records} />
      </ChartPanel>
      <ChartPanel title="Repository-group distribution" subtitle="Anonymized groups from the local research CSV. Does not identify connected repositories." aside={<span className="chart-tag">RESEARCH DATA</span>}>
        {dataset ? <FeatureBarChart data={dataset.repository_distribution.map((item) => ({ label: item.group, value: item.examples, color: '#aa91f2' }))} caption={`${dataset.repository_group_count} independent repository groups represented.`} /> : <div className="chart-empty">Dataset groups are not exposed by the current backend environment.</div>}
      </ChartPanel>
      <ChartPanel title="Dataset collection timeline" subtitle="Examples grouped by their recorded collection date; not branch activity." aside={<span className="chart-tag">CSV TIMESTAMPS</span>}>
        {dataset ? <CollectionTimeline summary={dataset} /> : <div className="chart-empty">A local dataset summary is unavailable; collection timestamps cannot be shown.</div>}
      </ChartPanel>
    </div>

    <section className="surface-card convergence-card">
      <div className="section-title-row"><div><span className="section-kicker">BRANCH CONTEXT</span><h2>{latest ? 'Signals from the latest request' : 'Branch convergence concept'}</h2></div><span className="concept-badge">{latest ? 'MEASURED INPUTS' : 'SCHEMATIC'}</span></div>
      {latest ? <>
        <div className="branch-signal-grid">
          <div><span><GitBranch size={14} /> Source metadata</span><strong>{latest.branch_metadata.source || 'Not entered'}</strong><small>Local label only; no repository graph is connected.</small></div>
          <div><span><GitBranch size={14} /> Target metadata</span><strong>{latest.branch_metadata.target || 'Not entered'}</strong><small>Local label only; no repository graph is connected.</small></div>
          <div><span>Source file changes</span><strong>{latest.request.files_changed}</strong><small>Request value sent to the model.</small></div>
          <div><span>Target file changes</span><strong>{latest.request.branch_files_changed}</strong><small>Request value sent to the model.</small></div>
          <div><span>Target commits after base</span><strong>{latest.request.branch_commits}</strong><small>Request value sent to the model.</small></div>
          <div><span>Source lines added</span><strong>{latest.request.lines_added}</strong><small>Request value sent to the model.</small></div>
        </div>
        <BranchConvergenceMap source={latest.branch_metadata.source} target={latest.branch_metadata.target} />
        <p className="concept-note">The diagram is schematic, not a commit graph or overlap calculation. Values above are the saved request and do not show repository contents.</p>
      </> : <><BranchConvergenceMap /><p className="concept-note">Illustrative paths only. No commit graph, branch comparison, or file-level analysis is available.</p></>}
    </section>

    <section className="surface-card recent-card">
      <div className="section-title-row"><div><span className="section-kicker">RECENT ACTIVITY</span><h2>Saved predictions</h2></div><span className="muted-inline"><Clock3 size={14} /> {records.length} actual {records.length === 1 ? 'response' : 'responses'}</span></div>
      {historyWarning && <div className="form-alert" role="status"><strong>Local history notice</strong><span>{historyWarning}</span></div>}
      {records.length ? <div className="recent-prediction-list">{records.slice(0, 4).map((record) => <button className="recent-prediction-row" key={record.id} onClick={() => onOpenPrediction(record)}><span className={`prediction-dot ${record.response.prediction === 1 ? 'dot-risk' : 'dot-clean'}`} /><span className="recent-run-copy"><strong>{record.branch_metadata.source || record.id}</strong><small>{record.branch_metadata.target ? `→ ${record.branch_metadata.target} · ` : ''}{new Date(record.saved_at).toLocaleString()}</small></span><code>{String(record.response.class_probabilities.merge_conflict)}</code><span className={`class-badge compact ${record.response.prediction === 1 ? 'class-conflict' : 'class-clean'}`}>{record.response.predicted_class.replace('_', ' ')}</span></button>)}</div> : <EmptyState icon={GitMerge} title="Your activity stream is empty">Only successful predictions from the API are saved here. Create one in Collision Studio to start a local history.</EmptyState>}
    </section>
  </>;
}

import { useMemo, useState } from 'react';
import { ArrowRight, GitCompareArrows } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { ChartPanel, FeatureComparisonChart, ProbabilityComparisonChart } from '../components/DataCharts';
import { compareAnalyses } from '../services/api';
import type { RepositoryAnalysis, SavedPrediction } from '../types/api';

const featureFields = [
  'files_changed', 'lines_added', 'commit_severity', 'developer_commits', 'avg_files_per_commit',
  'developer_conflicts', 'activity_score', 'import_count', 'dependency_conflicts', 'coverage',
  'branch_commits', 'branch_files_changed', 'branch_conflicts', 'branch_risk_score',
  'pattern_frequency', 'pattern_conflicts', 'dependency_risk', 'pattern_risk',
] as const;

export function CompareRuns({ records, analyses }: { records: SavedPrediction[]; analyses: RepositoryAnalysis[] }) {
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [leftAnalysisId, setLeftAnalysisId] = useState('');
  const [rightAnalysisId, setRightAnalysisId] = useState('');
  const [analysisComparison, setAnalysisComparison] = useState<Awaited<ReturnType<typeof compareAnalyses>> | null>(null);
  const [analysisCompareError, setAnalysisCompareError] = useState<string | null>(null);
  const [analysisCompareBusy, setAnalysisCompareBusy] = useState(false);
  const left = useMemo(() => records.find((record) => record.id === leftId) ?? null, [records, leftId]);
  const right = useMemo(() => records.find((record) => record.id === rightId) ?? null, [records, rightId]);
  const differences = left && right ? featureFields.filter((field) => left.request[field] !== right.request[field]) : [];

  async function compareSavedAnalyses() {
    if (!leftAnalysisId || !rightAnalysisId || leftAnalysisId === rightAnalysisId) return;
    setAnalysisCompareBusy(true); setAnalysisCompareError(null); setAnalysisComparison(null);
    try { setAnalysisComparison(await compareAnalyses(leftAnalysisId, rightAnalysisId)); }
    catch (error) { setAnalysisCompareError(error instanceof Error ? error.message : 'Saved analysis comparison failed.'); }
    finally { setAnalysisCompareBusy(false); }
  }

  return <>
    <PageHeading eyebrow="RUN COMPARISON" title="Compare Runs" description="Compare two saved API responses and their original request values side by side." />
    <section className="surface-card compare-panel repository-compare-panel">
      <div className="section-title-row"><div><span className="section-kicker">PERSISTED REPOSITORY ANALYSES</span><h2>Compare actual Git runs</h2></div><span className="chart-tag">SERVER HISTORY</span></div>
      {analyses.length < 2 ? <EmptyState icon={GitCompareArrows} title="Two saved Git analyses are needed">Connect a repository and run branch analysis twice. Git outcomes and measured features will be compared from backend history.</EmptyState> : <>
        <div className="compare-selectors"><label className="compare-select"><span>FIRST GIT ANALYSIS</span><select aria-label="Select first Git analysis" value={leftAnalysisId} onChange={(event) => { setLeftAnalysisId(event.target.value); setAnalysisComparison(null); }}><option value="">Select saved analysis</option>{analyses.map((item) => <option key={item.id} value={item.id}>{item.repository_name} · {item.source_branch} → {item.target_branch} · {new Date(item.created_at).toLocaleString()}</option>)}</select></label><span className="compare-glyph"><GitCompareArrows size={19} /></span><label className="compare-select"><span>SECOND GIT ANALYSIS</span><select aria-label="Select second Git analysis" value={rightAnalysisId} onChange={(event) => { setRightAnalysisId(event.target.value); setAnalysisComparison(null); }}><option value="">Select saved analysis</option>{analyses.map((item) => <option key={item.id} value={item.id}>{item.repository_name} · {item.source_branch} → {item.target_branch} · {new Date(item.created_at).toLocaleString()}</option>)}</select></label></div>
        <button className="button button-primary" onClick={() => void compareSavedAnalyses()} disabled={analysisCompareBusy || !leftAnalysisId || !rightAnalysisId || leftAnalysisId === rightAnalysisId}>{analysisCompareBusy ? 'Comparing…' : 'Compare saved Git analyses'}</button>
        {analysisCompareError && <div role="alert" className="form-alert">{analysisCompareError}</div>}
        {analysisComparison && <div className="comparison-results"><div className="comparison-columns">{[analysisComparison.left, analysisComparison.right].map((item, index) => <div key={`${item.id}-${index}`}><span className="comparison-label">{index ? 'SECOND ANALYSIS' : 'FIRST ANALYSIS'}</span><strong>{item.repository_name}</strong><span>{item.source_branch} → {item.target_branch}</span><small>Git result: {item.merge_check}</small><small>Source-only / target-only commits: {item.source_only_commits} / {item.target_only_commits}</small><small>Changed / overlapping paths: {item.source_changed_files.length + item.target_changed_files.length} / {item.overlapping_paths.length}</small><small>Model: {item.prediction ? `${item.prediction.predicted_class} · ${(item.prediction.class_probabilities.merge_conflict * 100).toFixed(1)}%` : 'Unavailable'}</small></div>)}</div><h3>Feature differences returned by the API</h3>{Object.entries(analysisComparison.feature_differences).length ? Object.entries(analysisComparison.feature_differences).map(([field, values]) => <div className="comparison-probability-row" key={field}><span>{field.replaceAll('_', ' ')}</span><code>{values.left === null ? 'Unavailable' : values.left}</code><ArrowRight size={14} /><code>{values.right === null ? 'Unavailable' : values.right}</code></div>) : <p>The selected runs have the same extracted feature values.</p>}</div>}
      </>}
    </section>
    {records.length < 2 ? <section className="surface-card compare-panel"><EmptyState icon={GitCompareArrows} title="Two saved predictions are needed">Create two successful predictions in Collision Studio. Only actual API responses stored in this browser can be compared.</EmptyState></section> : <>
      <section className="surface-card compare-panel">
        <div className="compare-selectors">
          <label className="compare-select"><span><i className="compare-marker marker-cyan" />BASELINE RUN</span><select aria-label="Select baseline run" value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">Select saved run</option>{records.map((record) => <option key={record.id} value={record.id}>{new Date(record.saved_at).toLocaleString()} · {record.response.predicted_class} · {record.id.slice(-8)}</option>)}</select></label>
          <span className="compare-glyph"><GitCompareArrows size={19} /></span>
          <label className="compare-select"><span><i className="compare-marker marker-purple" />COMPARISON RUN</span><select aria-label="Select comparison run" value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">Select saved run</option>{records.map((record) => <option key={record.id} value={record.id}>{new Date(record.saved_at).toLocaleString()} · {record.response.predicted_class} · {record.id.slice(-8)}</option>)}</select></label>
        </div>
      </section>
      {left && right ? <section className="surface-card comparison-results">
        <div className="section-title-row"><div><span className="section-kicker">ACTUAL SAVED RESPONSES</span><h2>Prediction comparison</h2></div><span className="concept-badge">NO RE-SCORING</span></div>
        <div className="comparison-columns">
          {[left, right].map((record, index) => <div key={record.id} className={index ? 'comparison-right' : ''}>
            <span className="comparison-label">{index ? 'COMPARISON RUN' : 'BASELINE RUN'}</span><strong>{String(record.response.class_probabilities.merge_conflict)}</strong><span>Conflict probability · {record.response.predicted_class}</span><small>{record.response.prediction_label}</small><small>{new Date(record.saved_at).toLocaleString()}</small><code>{record.id}</code><small>Branch labels: {record.branch_metadata.source || 'source not labeled'} → {record.branch_metadata.target || 'target not labeled'}</small>
          </div>)}
        </div>
        <div className="comparison-probability-row"><span>Clean-merge probability</span><code>{String(left.response.class_probabilities.clean_merge)}</code><ArrowRight size={14} /><code>{String(right.response.class_probabilities.clean_merge)}</code></div>
        <div className="comparison-probability-row"><span>Risk band</span><code>Not provided by API</code><ArrowRight size={14} /><code>Not provided by API</code></div>
        <div className="chart-grid chart-grid-compare">
          <ChartPanel title="Probability comparison" subtitle="Actual class probabilities stored from the two API responses." aside={<span className="chart-tag">SAVED OUTPUT</span>}>
            <ProbabilityComparisonChart baseline={{ label: 'Baseline run', clean: left.response.class_probabilities.clean_merge, conflict: left.response.class_probabilities.merge_conflict }} comparison={{ label: 'Comparison run', clean: right.response.class_probabilities.clean_merge, conflict: right.response.class_probabilities.merge_conflict }} />
          </ChartPanel>
          <ChartPanel title="Input measurements" subtitle="Five values sent to the model; bars share one relative scale across different units." aside={<span className="chart-tag">SAVED REQUESTS</span>}>
            <FeatureComparisonChart left={left} right={right} />
          </ChartPanel>
        </div>
        <div className="changed-inputs"><h3>Input differences ({differences.length})</h3>{differences.length ? differences.map((field) => <div className="changed-input-row" key={field}><span>{field}</span><code>{left.request[field] == null ? 'Not supplied' : String(left.request[field])}</code><ArrowRight size={13} /><code>{right.request[field] == null ? 'Not supplied' : String(right.request[field])}</code></div>) : <p className="concept-note">The saved request values match across all 18 contract fields.</p>}</div>
        <p className="compare-metadata-note">Repository identity, commit SHAs, file paths, and confirmed merge results are not part of the saved prediction response.</p>
        <div className="compare-foot"><GitCompareArrows size={13} /> Probabilities and classes are copied from saved API responses; this page does not calculate a replacement score.</div>
      </section> : <div className="empty-inline">Select two different saved predictions to compare their responses.</div>}
    </>}
  </>;
}

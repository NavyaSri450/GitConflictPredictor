import { Activity, CheckCircle2, CircleHelp, CloudOff, Cpu, ExternalLink, Globe2, LoaderCircle, RotateCw, Server, Timer } from 'lucide-react';
import { PageHeading } from '../components/PageHeading';
import { apiBaseUrl } from '../services/api';
import { ChartPanel, CollectionTimeline, DonutChart, FeatureBarChart, FeatureCoverageHeatmap } from '../components/DataCharts';
import type { SystemSnapshot } from '../types/api';

interface SystemPulseProps {
  system: SystemSnapshot | null;
  error: string | null;
  refreshing: boolean;
  lastSuccessfulHealth: string | null;
  onRefresh: () => Promise<SystemSnapshot>;
}

export function SystemPulse({ system, error, refreshing, lastSuccessfulHealth, onRefresh }: SystemPulseProps) {
  const healthy = Boolean(system?.health.data);
  const ready = system?.readiness.data?.model_available === true;
  const dataset = system?.dataset_summary.data;
  const evaluation = system?.model_evaluation.data;
  const integration = system?.integration_status.data;
  const timings = [
    { label: 'Health', value: system?.health.duration_ms },
    { label: 'Readiness', value: system?.readiness.duration_ms },
    { label: 'Model metadata', value: system?.model_info.duration_ms },
    { label: 'Model evaluation', value: system?.model_evaluation.duration_ms },
    { label: 'Dataset summary', value: system?.dataset_summary.duration_ms },
  ].filter((item): item is { label: string; value: number } => item.value != null);

  return <>
    <PageHeading eyebrow="SERVICE HEALTH" title="System Pulse" description="Independent health, readiness, model evaluation, and integration checks from the configured FastAPI service." action={<button className="button button-secondary" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? <LoaderCircle size={15} className="spin" /> : <RotateCw size={15} />} Refresh checks</button>} />
    {error && <div className="system-error" role="alert"><CircleHelp size={15} /> {error}</div>}
    <section className={`pulse-banner ${healthy ? 'pulse-ok' : refreshing ? 'pulse-checking' : 'pulse-down'}`}>
      <span className="pulse-icon">{refreshing ? <LoaderCircle size={21} className="spin" /> : healthy ? <CheckCircle2 size={21} /> : <CloudOff size={21} />}</span>
      <div><span className="section-kicker">PROCESS HEALTH</span><h2>{refreshing && !system ? 'Checking backend' : healthy ? 'Backend is responding' : 'Backend is unreachable'}</h2><p>{system?.health.data ? `GET /health returned “${system.health.data.status}” from ${system.health.data.service}.` : system?.health.error ?? 'Waiting for a health response.'}</p></div>
      <span className={`class-badge ${healthy ? 'class-clean' : 'class-conflict'}`}>{healthy ? 'Available' : 'Unavailable'}</span>
    </section>
    <div className="pulse-grid">
      <section className="surface-card pulse-detail">
        <div className="section-title-row"><div><span className="section-kicker">SERVICE DETAILS</span><h2>Health and readiness</h2></div><Server size={17} className="detail-header-icon" /></div>
        <div className="detail-row"><span><Globe2 size={15} /> Health endpoint</span><code>{apiBaseUrl}/health</code></div>
        <div className="detail-row"><span><Activity size={15} /> Last successful health check</span><strong>{lastSuccessfulHealth ? new Date(lastSuccessfulHealth).toLocaleString() : 'None yet'}</strong></div>
        <div className="detail-row"><span><Timer size={15} /> Health response time</span><strong>{system?.health.duration_ms != null ? `${system.health.duration_ms} ms` : 'Unavailable'}</strong></div>
        <div className="detail-row"><span><CheckCircle2 size={15} /> Prediction readiness</span><strong className={ready ? 'text-clean' : 'text-risk'}>{ready ? 'Ready' : system?.readiness.error ? 'Not ready' : 'Unverified'}</strong></div>
        <div className="detail-row"><span><Timer size={15} /> Readiness response time</span><strong>{system?.readiness.duration_ms != null ? `${system.readiness.duration_ms} ms` : 'Unavailable'}</strong></div>
        <a className="docs-link" href={`${apiBaseUrl}/docs`} target="_blank" rel="noreferrer">Open FastAPI documentation <ExternalLink size={13} /></a>
      </section>
      <section className="surface-card pulse-detail model-detail">
        <div className="section-title-row"><div><span className="section-kicker">MODEL INFO</span><h2>Verified artifact metadata</h2></div><Cpu size={17} className="detail-header-icon" /></div>
        {system?.model_info.data ? <>
          <div className="model-status"><span className={`model-status-icon ${ready ? 'model-on' : ''}`}><Cpu size={19} /></span><div><strong>{ready ? system.model_info.data.model_name : 'Model not ready'}</strong><p>{ready ? `${system.model_info.data.model_type ?? 'Unknown type'} · ${system.model_info.data.model_status}` : 'The model-info endpoint responded, but readiness has not verified the model.'}</p></div></div>
          <div className="detail-row"><span>Supported inputs</span><strong>{system.model_info.data.supported_feature_count} of {system.model_info.data.feature_contract_size}</strong></div>
          <div className="feature-list pulse-features"><span>Supported model fields</span><div>{system.model_info.data.supported_features.map((feature) => <code key={feature}>{feature}</code>)}</div></div>
          <div className="detail-row"><span>Training dataset checksum</span><code className="checksum-value">{system.model_info.data.dataset_sha256 ?? 'Not available'}</code></div>
          <div className="detail-row"><span>Metadata response time</span><strong>{system.model_info.duration_ms != null ? `${system.model_info.duration_ms} ms` : 'Unavailable'}</strong></div>
        </> : <div className="system-error model-error"><CircleHelp size={15} />{system?.model_info.error ?? 'Model metadata has not been checked yet.'}</div>}
        <div className="model-honesty"><CircleHelp size={14} /> Health alone does not prove readiness. “Ready” is shown only after GET /ready succeeds.</div>
      </section>
    </div>
    <section className="surface-card system-capabilities"><div><span className="section-kicker">APPLICATION INTEGRATION</span><h2>Git and persistence status</h2><p>Statuses below come from the FastAPI integration endpoint. Local paths require an explicit allowlist; public GitHub connection is unauthenticated and limited to public repositories.</p></div><div className="capability-status"><span><i className={integration?.git_available ? 'status-ok-dot' : 'status-neutral-dot'} /> Git executable</span><strong>{integration ? integration.git_available ? 'Available' : 'Unavailable' : 'Unverified'}</strong><span><i className={integration?.database_available ? 'status-ok-dot' : 'status-neutral-dot'} /> SQLite history</span><strong>{integration ? integration.database_available ? 'Available' : 'Unavailable' : 'Unverified'}</strong><span><i className={integration?.public_github_connection_enabled ? 'status-ok-dot' : 'status-neutral-dot'} /> Public GitHub</span><strong>{integration ? integration.public_github_connection_enabled ? 'Enabled' : 'Unavailable' : 'Unverified'}</strong><span><i className={integration?.local_repository_connection_enabled ? 'status-ok-dot' : 'status-neutral-dot'} /> Allowlisted local paths</span><strong>{integration ? integration.local_repository_connection_enabled ? 'Enabled' : 'Not configured' : 'Unverified'}</strong></div></section>
    <div className="chart-grid chart-grid-pulse">
      <ChartPanel title="Recorded model evaluation" subtitle="Metrics from the saved, repository-group holdout report. These are evaluation results, not a prediction for a selected branch pair." aside={<span className={`chart-tag ${evaluation?.production_ready ? 'tag-ready' : 'tag-unavailable'}`}>{evaluation?.production_ready ? 'PRODUCTION VALIDATED' : 'EXPLORATORY'}</span>}>
        {evaluation ? <div className="evaluation-panel">
          <div className="evaluation-meta"><strong>{evaluation.model_name.replaceAll('_', ' ')}</strong><span>{evaluation.test_rows} held-out examples · {evaluation.dataset_rows} dataset rows · {evaluation.repository_group_count} repository groups</span><span>Split: {evaluation.split_method.replaceAll('_', ' ')}</span>{evaluation.trained_at_utc && <span>Recorded training time: {new Date(evaluation.trained_at_utc).toLocaleString()}</span>}</div>
          <div className="evaluation-metrics">{[
            ['Precision', evaluation.precision], ['Recall', evaluation.recall], ['F1', evaluation.f1], ['ROC-AUC', evaluation.roc_auc],
          ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{typeof value === 'number' ? value.toFixed(3) : 'Unavailable'}</strong></div>)}</div>
          <table className="confusion-matrix"><caption>Confusion matrix · actual rows, predicted columns</caption><thead><tr><th scope="col">Actual / predicted</th><th scope="col">Clean</th><th scope="col">Conflict</th></tr></thead><tbody>{evaluation.confusion_matrix.map((row, index) => <tr key={index}><th scope="row">{index === 0 ? 'Clean' : 'Conflict'}</th>{row.map((count, cell) => <td key={cell}>{count}</td>)}</tr>)}</tbody></table>
          <p className="evaluation-caveat">{evaluation.production_ready ? 'Review the evaluation report before relying on this model.' : `Exploratory only. The holdout contains ${evaluation.test_rows} examples; this small result does not establish production performance.`}</p>
        </div> : <div className="chart-empty">{system?.model_evaluation.error ?? 'The saved model evaluation report has not been checked yet.'}</div>}
      </ChartPanel>
      <ChartPanel title="Local dataset status" subtitle="Read-only aggregate from the raw and processed CSV files on the API host." aside={<span className={`chart-tag ${dataset ? 'tag-ready' : 'tag-unavailable'}`}>{dataset ? 'VERIFIED' : 'UNAVAILABLE'}</span>}>
        {dataset ? <div className="dataset-kpi-grid"><div><span>Raw examples</span><strong>{dataset.raw_rows}</strong></div><div><span>Processed rows</span><strong>{dataset.processed_rows}</strong></div><div><span>Repository groups</span><strong>{dataset.repository_group_count}</strong></div><div><span>Feature contract</span><strong>{dataset.feature_count}</strong></div><div><span>Provenance fields</span><strong>{dataset.provenance_count}</strong></div><div><span>Validation</span><strong>{dataset.validation_status}</strong></div></div> : <div className="chart-empty">{system?.dataset_summary.error ?? 'Dataset summary is loading.'} Data files may be absent in a deployed backend.</div>}
      </ChartPanel>
      <ChartPanel title="Observed class balance" subtitle="Collected merge labels from the verified local dataset." aside={<span className="chart-tag">MERGE OUTCOMES</span>}>
        {dataset ? <DonutChart values={[{ label: 'Clean · 0', value: dataset.class_counts['0'] ?? 0, color: '#57d6be' }, { label: 'Conflict · 1', value: dataset.class_counts['1'] ?? 0, color: '#f0a56f' }]} center={String(dataset.raw_rows)} label="examples" /> : <div className="chart-empty">Verified class labels are not currently available.</div>}
      </ChartPanel>
      <ChartPanel title="Feature completeness" subtitle="Observed values in raw dataset; empty cells remain missing." aside={<span className="chart-tag">NO IMPUTATION</span>}>
        {dataset ? <FeatureCoverageHeatmap summary={dataset} /> : <div className="chart-empty">Feature coverage cannot be verified without the local dataset.</div>}
      </ChartPanel>
      <ChartPanel title="Actual API response times" subtitle="Milliseconds measured in this browser during the last System Pulse refresh." aside={<span className="chart-tag">ONE REFRESH SAMPLE</span>}>
        <FeatureBarChart data={timings.map((item, index) => ({ label: item.label, value: item.value, color: ['#54d5e4', '#58d6be', '#aa91f2', '#f1b66f'][index] }))} caption={timings.length ? `Checked at ${system?.checked_at ? new Date(system.checked_at).toLocaleTimeString() : 'unknown time'}. A single sample is not a benchmark.` : 'Response timings appear after the API checks return.'} />
      </ChartPanel>
      <ChartPanel title="Repository-group distribution" subtitle="Anonymous grouping counts from the local collection dataset." aside={<span className="chart-tag">DATASET</span>}>
        {dataset ? <FeatureBarChart data={dataset.repository_distribution.map((item) => ({ label: item.group, value: item.examples, color: '#aa91f2' }))} /> : <div className="chart-empty">No repository distribution is available from the backend.</div>}
      </ChartPanel>
      <ChartPanel title="Dataset collection activity" subtitle="Recorded collection dates, not a real-time collector health signal." aside={<span className="chart-tag">CSV TIMESTAMPS</span>}>
        {dataset ? <CollectionTimeline summary={dataset} /> : <div className="chart-empty">Collection timestamps are unavailable.</div>}
      </ChartPanel>
    </div>
    <div className="pulse-footer-note">Response times are measured by this browser. No secrets, local artifact paths, or repository credentials are requested by these checks.</div>
  </>;
}

import { Activity, Boxes, Braces, GitBranch, GitCommitHorizontal, ShieldCheck, Workflow } from 'lucide-react';
import { PageHeading } from '../components/PageHeading';
import { ChartPanel, DonutChart, FeatureBarChart, FeatureCoverageHeatmap } from '../components/DataCharts';
import type { RepositoryAnalysis, SystemSnapshot } from '../types/api';
import { modelFeatures } from '../types/api';

const signals = [
  { icon: ShieldCheck, title: 'Repository', text: 'Repository-level test context may help describe a change environment. Coverage is optional and needs a recorded pre-merge artifact.', accent: 'cyan', fields: ['coverage'] },
  { icon: GitCommitHorizontal, title: 'Commit', text: 'Change volume and commit summaries describe the incoming change set. The current baseline uses three measured change fields.', accent: 'teal', fields: ['files_changed', 'lines_added', 'avg_files_per_commit', 'commit_severity'] },
  { icon: Activity, title: 'Developer', text: 'Actor-specific activity and prior outcomes could provide historical context only with a defined identity and lookback window.', accent: 'purple', fields: ['developer_commits', 'developer_conflicts', 'activity_score'] },
  { icon: GitBranch, title: 'Branch', text: 'Target-side history describes the destination branch since the merge base. Two branch measurements are used by the current baseline.', accent: 'amber', fields: ['branch_commits', 'branch_files_changed', 'branch_conflicts', 'branch_risk_score'] },
  { icon: Boxes, title: 'Dependency', text: 'Imports and dependency history may describe dependency changes, but require language rules or past labeled evidence.', accent: 'coral', fields: ['import_count', 'dependency_conflicts', 'dependency_risk'] },
  { icon: Workflow, title: 'Conflict pattern', text: 'Pattern signals need a stable taxonomy and historical examples. No pattern importance or matching result is available.', accent: 'blue', fields: ['pattern_frequency', 'pattern_conflicts', 'pattern_risk'] },
];

export function ConflictDNA({ system, analyses }: { system: SystemSnapshot | null; analyses: RepositoryAnalysis[] }) {
  const dataset = system?.dataset_summary.data;
  return <>
    <PageHeading eyebrow="MODEL SIGNAL REFERENCE" title="Conflict DNA" description="A transparent field guide to the API schema and the smaller input set used by the current exploratory model." />
    <section className="surface-card dna-intro"><span className="dna-intro-icon"><Braces size={19} /></span><div><span className="section-kicker">18-FIELD API · 5 MODEL INPUTS</span><h2>Context is not certainty.</h2><p>The backend model scores only the five observed Git measurements. Optional fields are preserved in the request contract but are not used by this model.</p></div><span className="concept-badge">EXPLORATORY</span></section>
    <div className="model-input-strip"><span className="section-kicker">CURRENT MODEL INPUTS</span>{modelFeatures.map((feature) => <code key={feature}>{feature}</code>)}</div>
    <div className="dna-grid">{signals.map(({ icon: Icon, title, text, accent, fields }, index) => <article className="surface-card dna-card" key={title}>
      <div className="dna-card-top"><span className={`dna-icon dna-${accent}`}><Icon size={18} /></span><span className="dna-index">CATEGORY 0{index + 1}</span></div>
      <h3>{title}</h3><p>{text}</p>
      <div className="dna-fields-label">SCHEMA FIELDS</div>
      <div className="dna-field-list">{fields.map((field) => <code className={modelFeatures.includes(field as (typeof modelFeatures)[number]) ? 'field-current' : 'field-optional'} key={field}>{field}{modelFeatures.includes(field as (typeof modelFeatures)[number]) ? ' · used' : ' · optional'}</code>)}</div>
    </article>)}</div>
    <div className="chart-grid chart-grid-dna">
      <ChartPanel title="Observed feature coverage" subtitle="Counts come from the validated local CSV. Blank values stay missing; no imputation is applied." aside={<span className="chart-tag">18 CONTRACT FIELDS</span>}>
        {dataset ? <FeatureCoverageHeatmap summary={dataset} /> : <div className="chart-empty">Dataset summary is unavailable. The page will not infer missing feature counts.</div>}
      </ChartPanel>
      <ChartPanel title="Collected merge outcomes" subtitle="Labels are from recorded Git merge attempts, not model predictions." aside={<span className="chart-tag">RAW DATASET</span>}>
        {dataset ? <DonutChart values={[{ label: 'Clean merge · 0', value: dataset.class_counts['0'] ?? 0, color: '#57d6be' }, { label: 'Conflict · 1', value: dataset.class_counts['1'] ?? 0, color: '#f0a56f' }]} center={String(dataset.raw_rows)} label="examples" /> : <div className="chart-empty">No verified class distribution is available from the connected backend.</div>}
      </ChartPanel>
      <ChartPanel title="Measured feature ranges" subtitle="Mean values from non-missing raw rows. Values use different units and are not comparable as risk weights." aside={<span className="chart-tag">DESCRIPTIVE ONLY</span>} className="dna-range-panel">
        {dataset ? <FeatureBarChart data={dataset.feature_aggregates.filter((item) => item.mean != null).map((item) => ({ label: item.name.replaceAll('_', ' '), value: item.mean ?? 0 }))} caption="Only fields with observed values appear; these are not model feature importances." /> : <div className="chart-empty">No feature distribution can be shown without verified dataset aggregates.</div>}
      </ChartPanel>
    </div>
    <section className="surface-card unavailable-analysis"><div><span className="section-kicker">REPOSITORY FILE ANALYSIS</span><h2>{analyses[0] ? `Latest branch analysis · ${analyses[0].repository_name}` : 'Connect a repository to inspect changed paths'}</h2><p>{analyses[0] ? `Committed path sets from ${analyses[0].source_branch} and ${analyses[0].target_branch}. Shared paths indicate overlap only; Git’s merge check is reported separately.` : 'No repository analysis is saved yet. Once Collision Studio completes a real branch check, this section will show its path-level summary.'}</p></div><span className="connection-state">{analyses[0] ? `GIT ${analyses[0].merge_check.toUpperCase()}` : 'AWAITING ANALYSIS'}</span>
      {analyses[0] && <div className="changed-path-columns dna-path-columns"><section><h3>Source changed paths ({analyses[0].source_changed_files.length})</h3>{analyses[0].source_changed_files.length ? <ul>{analyses[0].source_changed_files.slice(0, 40).map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p>No source changes.</p>}</section><section><h3>Target changed paths ({analyses[0].target_changed_files.length})</h3>{analyses[0].target_changed_files.length ? <ul>{analyses[0].target_changed_files.slice(0, 40).map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p>No target changes.</p>}</section><section><h3>Overlapping paths ({analyses[0].overlapping_paths.length})</h3>{analyses[0].overlapping_paths.length ? <ul>{analyses[0].overlapping_paths.slice(0, 40).map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p>No overlapping paths.</p>}</section></div>}
    </section>
    <div className="disclaimer-line">These categories explain feature intent from the canonical feature dictionary. They are not feature-importance rankings, causal claims, or a live explanation of the saved model.</div>
  </>;
}

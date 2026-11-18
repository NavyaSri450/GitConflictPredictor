import type { ReactNode } from 'react';
import type { DatasetSummaryResponse, ModelFeature, SavedPrediction } from '../types/api';

export function ChartPanel({ title, subtitle, aside, children, className = '' }: { title: string; subtitle: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`surface-card chart-panel ${className}`}>
    <div className="chart-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{aside}</div>
    {children}
  </section>;
}

export function DonutChart({ values, center, label, percentValues = false }: { values: { label: string; value: number; color: string }[]; center: string; label: string; percentValues?: boolean }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <div className="chart-empty">No saved result data is available yet.</div>;
  const circumference = 2 * Math.PI * 58;
  let offset = 0;
  return <div className="donut-layout">
    <svg className="donut-svg" viewBox="0 0 180 180" role="img" aria-label={`${label}: ${values.map((item) => `${item.label} ${item.value}`).join(', ')}`}>
      <circle cx="90" cy="90" r="58" fill="none" stroke="#243142" strokeWidth="19" />
      {values.filter((item) => item.value > 0).map((item) => {
        const length = (item.value / total) * circumference;
        const circle = <circle key={item.label} cx="90" cy="90" r="58" fill="none" stroke={item.color} strokeWidth="19" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />;
        offset += length;
        return circle;
      })}
      <text x="90" y="84" textAnchor="middle" className="donut-center-value">{center}</text>
      <text x="90" y="105" textAnchor="middle" className="donut-center-label">{label}</text>
    </svg>
    <div className="chart-legend">{values.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{percentValues ? `${(item.value * 100).toFixed(1)}%` : item.value}</strong></div>)}</div>
  </div>;
}

export function ProbabilityTimeline({ records }: { records: SavedPrediction[] }) {
  const points = [...records].sort((a, b) => Date.parse(a.saved_at) - Date.parse(b.saved_at));
  if (!points.length) return <div className="chart-empty">A probability timeline appears after successful predictions are saved in this browser.</div>;
  const width = 560; const height = 210; const left = 34; const right = 18; const top = 15; const bottom = 38;
  const xAt = (index: number) => points.length === 1 ? (left + width - right) / 2 : left + (index / (points.length - 1)) * (width - left - right);
  const yAt = (value: number) => top + (1 - value) * (height - top - bottom);
  const coordinates = points.map((point, index) => `${xAt(index)},${yAt(point.response.class_probabilities.merge_conflict)}`).join(' ');
  return <div className="line-chart-wrap">
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Saved merge-conflict probability by prediction time">
      {[0, .5, 1].map((value) => <g key={value}><line x1={left} x2={width - right} y1={yAt(value)} y2={yAt(value)} className="chart-gridline" /><text x={left - 8} y={yAt(value) + 4} textAnchor="end" className="chart-axis-label">{Math.round(value * 100)}%</text></g>)}
      <polyline points={coordinates} className="probability-line" />
      {points.map((point, index) => <circle key={point.id} cx={xAt(index)} cy={yAt(point.response.class_probabilities.merge_conflict)} r="5" className="probability-point"><title>{`${new Date(point.saved_at).toLocaleString()}: ${(point.response.class_probabilities.merge_conflict * 100).toFixed(1)}% conflict probability`}</title></circle>)}
      <text x={left} y={height - 8} className="chart-axis-label">Oldest saved</text><text x={width - right} y={height - 8} textAnchor="end" className="chart-axis-label">Newest saved</text>
    </svg>
  </div>;
}

export function FeatureBarChart({ data, caption }: { data: { label: string; value: number; color?: string }[]; caption?: string }) {
  if (!data.length) return <div className="chart-empty">Enter the five required measurements and submit a prediction to visualize the request inputs.</div>;
  const max = Math.max(...data.map((item) => item.value), 1);
  return <div className="feature-chart" aria-label={caption ?? 'Feature value comparison'}>
    {data.map((item) => <div className="feature-chart-row" key={item.label}>
      <span title={item.label}>{item.label}</span><div className="feature-bar-track"><i style={{ width: `${Math.max(item.value === 0 ? 0 : 2, (item.value / max) * 100)}%`, background: item.color ?? 'var(--cyan)' }} /></div><strong>{item.value.toLocaleString()}</strong>
    </div>)}
    {caption && <p className="chart-caption">{caption}</p>}
  </div>;
}

export function FeatureComparisonChart({ left, right }: { left: SavedPrediction; right: SavedPrediction }) {
  const features: ModelFeature[] = ['files_changed', 'lines_added', 'avg_files_per_commit', 'branch_commits', 'branch_files_changed'];
  const max = Math.max(1, ...features.flatMap((feature) => [left.request[feature], right.request[feature]]));
  return <div className="compare-feature-chart">
    <div className="compare-chart-legend"><span><i className="legend-cyan" /> Baseline</span><span><i className="legend-violet" /> Comparison</span></div>
    {features.map((feature) => <div className="compare-feature-row" key={feature}>
      <span>{feature.replaceAll('_', ' ')}</span><div className="compare-track"><i className="compare-bar baseline" style={{ width: `${(left.request[feature] / max) * 100}%` }} /><i className="compare-bar comparison" style={{ width: `${(right.request[feature] / max) * 100}%` }} /></div><small>{left.request[feature]} / {right.request[feature]}</small>
    </div>)}
    <p className="chart-caption">Bars scale against the largest value in these two saved requests; units differ by feature.</p>
  </div>;
}

export function ProbabilityComparisonChart({ baseline, comparison }: { baseline: { label: string; clean: number; conflict: number }; comparison: { label: string; clean: number; conflict: number } }) {
  return <div className="probability-comparison-chart">
    {[baseline, comparison].map((run) => <div className="probability-run" key={run.label}>
      <strong>{run.label}</strong>
      <div className="probability-run-bars"><span>Clean</span><i><b className="clean-bar" style={{ width: `${run.clean * 100}%` }} /></i><code>{(run.clean * 100).toFixed(1)}%</code></div>
      <div className="probability-run-bars"><span>Conflict</span><i><b className="conflict-bar" style={{ width: `${run.conflict * 100}%` }} /></i><code>{(run.conflict * 100).toFixed(1)}%</code></div>
    </div>)}
  </div>;
}

export function FeatureCoverageHeatmap({ summary }: { summary: DatasetSummaryResponse }) {
  const features = summary.feature_aggregates;
  if (!features.length) return <div className="chart-empty">The dataset did not provide feature coverage.</div>;
  return <div className="coverage-heatmap" role="img" aria-label={`Feature completeness across ${summary.raw_rows} raw examples`}>
    {features.map((feature) => <div className={`coverage-cell ${feature.observed_count ? 'coverage-present' : 'coverage-missing'}`} key={feature.name} title={`${feature.name}: ${feature.observed_count} observed, ${feature.missing_count} missing`}><span>{feature.name.replaceAll('_', ' ')}</span><strong>{feature.observed_count}/{summary.raw_rows}</strong></div>)}
    <div className="coverage-legend"><span><i className="coverage-present" /> Observed values</span><span><i className="coverage-missing" /> All missing</span></div>
  </div>;
}

export function CollectionTimeline({ summary }: { summary: DatasetSummaryResponse }) {
  const max = Math.max(1, ...summary.collection_timeline.map((item) => item.examples));
  if (!summary.collection_timeline.length) return <div className="chart-empty">No valid collection timestamps were present in the local CSV.</div>;
  return <><div className="collection-timeline">{summary.collection_timeline.map((item) => <div key={item.date} title={`${item.date}: ${item.examples} collected examples`}><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</span><i style={{ width: `${Math.max(8, item.examples / max * 100)}%` }} /><strong>{item.examples}</strong></div>)}</div>{summary.collection_timeline.length === 1 && <p className="chart-caption">All {summary.collection_timeline[0].examples} examples share this recorded collection date; a time trend cannot be inferred.</p>}</>;
}

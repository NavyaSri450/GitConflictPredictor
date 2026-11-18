import { useMemo, useState } from 'react';
import { Archive, ArrowUpDown, Search, X } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { PredictionResult } from '../components/PredictionResult';
import { ChartPanel, DonutChart, ProbabilityTimeline } from '../components/DataCharts';
import type { RepositoryAnalysis, SavedPrediction } from '../types/api';

interface IntelligenceArchiveProps { records: SavedPrediction[]; warning: string | null; analyses: RepositoryAnalysis[]; historyError: string | null }

export function IntelligenceArchive({ records, warning, analyses, historyError }: IntelligenceArchiveProps) {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [targetFilter, setTargetFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest');
  const [selected, setSelected] = useState<SavedPrediction | null>(null);
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisOutcome, setAnalysisOutcome] = useState('all');
  const [selectedAnalysis, setSelectedAnalysis] = useState<RepositoryAnalysis | null>(null);
  const filtered = useMemo(() => records.filter((record) => {
    const searchable = [record.id, record.branch_metadata.source, record.branch_metadata.target, record.response.predicted_class].join(' ').toLowerCase();
    return searchable.includes(query.toLowerCase())
      && (classFilter === 'all' || record.response.predicted_class === classFilter)
      && (sourceFilter === 'all' || record.branch_metadata.source === sourceFilter)
      && (targetFilter === 'all' || record.branch_metadata.target === targetFilter);
  }).sort((a, b) => (Date.parse(a.saved_at) - Date.parse(b.saved_at)) * (sortDirection === 'newest' ? -1 : 1)), [records, query, classFilter, sourceFilter, targetFilter, sortDirection]);
  const sourceOptions = [...new Set(records.map((record) => record.branch_metadata.source).filter(Boolean))].sort();
  const targetOptions = [...new Set(records.map((record) => record.branch_metadata.target).filter(Boolean))].sort();
  const filteredAnalyses = analyses.filter((analysis) => `${analysis.repository_name} ${analysis.source_branch} ${analysis.target_branch}`.toLowerCase().includes(analysisQuery.toLowerCase()) && (analysisOutcome === 'all' || analysis.merge_check === analysisOutcome));

  return <>
    <PageHeading eyebrow="PERSISTED ANALYSIS HISTORY" title="Intelligence Archive" description="Browse real Git branch checks saved by FastAPI, alongside successful model-only estimates saved in this browser." />
    <section className="surface-card archive-panel repository-archive-panel">
      <div className="section-title-row"><div><span className="section-kicker">SERVER-SAVED GIT ANALYSES</span><h2>Repository analysis history</h2></div><span className="chart-tag">{analyses.length} LOADED</span></div>
      <div className="archive-toolbar"><label className="search-control"><Search size={16} /><span className="sr-only">Search repository analyses</span><input type="search" aria-label="Search repository analyses" placeholder="Search repository or branch" value={analysisQuery} onChange={(event) => setAnalysisQuery(event.target.value)} /></label><label className="filter-control"><span className="sr-only">Filter by Git outcome</span><select aria-label="Filter by Git outcome" value={analysisOutcome} onChange={(event) => setAnalysisOutcome(event.target.value)}><option value="all">All Git outcomes</option><option value="clean">Clean check</option><option value="conflict">Conflict check</option></select></label></div>
      {historyError && <div className="form-alert" role="alert"><strong>Server history unavailable</strong><span>{historyError}</span></div>}
      {filteredAnalyses.length ? <div className="archive-table-scroll"><div className="archive-table-head server-analysis-head"><span>ANALYZED AT</span><span>REPOSITORY / BRANCH PAIR</span><span>ACTUAL GIT CHECK</span><span>MODEL ESTIMATE</span><span /></div>{filteredAnalyses.map((analysis) => <button className="archive-row server-analysis-row" key={analysis.id} onClick={() => setSelectedAnalysis(analysis)}><time dateTime={analysis.created_at}>{new Date(analysis.created_at).toLocaleString()}</time><span className="archive-run-cell"><strong>{analysis.repository_name}</strong><small>{analysis.source_branch} → {analysis.target_branch}</small></span><span className={`class-badge compact ${analysis.merge_check === 'conflict' ? 'class-conflict' : 'class-clean'}`}>Git {analysis.merge_check}</span><code>{analysis.prediction ? `${(analysis.prediction.class_probabilities.merge_conflict * 100).toFixed(1)}%` : 'Unavailable'}</code><span className="archive-review">Details</span></button>)}</div> : <EmptyState icon={Archive} title={historyError ? 'History could not be loaded' : 'No matching Git analyses'}>{historyError ? 'Check that FastAPI and its local database are available.' : analyses.length ? 'Try another repository name or Git outcome.' : 'Run a repository analysis in Collision Studio. Successful Git checks are persisted by the backend.'}</EmptyState>}
      <div className="archive-filter-note">Git outcomes are measured by an isolated merge-tree check. Predictions are optional model outputs and do not replace the Git result.</div>
    </section>
    {warning && <div className="form-alert" role="status"><strong>History storage notice</strong><span>{warning}</span></div>}
    <section className="surface-card archive-panel">
      <div className="archive-toolbar">
        <label className="search-control"><Search size={16} /><span className="sr-only">Search predictions</span><input type="search" aria-label="Search predictions" placeholder="Search ID or branch label…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="filter-control"><span className="sr-only">Filter by predicted class</span><select aria-label="Filter by predicted class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">All predicted classes</option><option value="clean_merge">Clean merge</option><option value="merge_conflict">Merge conflict</option></select></label>
        <label className="filter-control"><span className="sr-only">Filter by source branch label</span><select aria-label="Filter by source branch label" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All source labels</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
        <label className="filter-control"><span className="sr-only">Filter by target branch label</span><select aria-label="Filter by target branch label" value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">All target labels</option>{targetOptions.map((target) => <option key={target} value={target}>{target}</option>)}</select></label>
        <button className="button button-secondary" onClick={() => setSortDirection((current) => current === 'newest' ? 'oldest' : 'newest')}><ArrowUpDown size={14} /> {sortDirection === 'newest' ? 'Newest first' : 'Oldest first'}</button>
      </div>
      <p className="archive-availability-note">Branch-label filters use browser-local metadata. Repository identity and commit refs are not included in saved frontend API records.</p>
      {records.length > 0 && <div className="chart-grid chart-grid-archive">
        <ChartPanel title="Filtered predicted classes" subtitle="Counts reflect predictions in browser-local history, not confirmed merge outcomes." aside={<span className="chart-tag">{filtered.length} MATCHING</span>}>
          <DonutChart values={[{ label: 'Predicted clean', value: filtered.filter((record) => record.response.prediction === 0).length, color: '#57d6be' }, { label: 'Predicted conflict', value: filtered.filter((record) => record.response.prediction === 1).length, color: '#f0a56f' }]} center={String(filtered.length)} label="shown" />
        </ChartPanel>
        <ChartPanel title="Saved probability timeline" subtitle="Actual conflict probabilities from filtered local API responses." aside={<span className="chart-tag">LOCAL HISTORY</span>}>
          <ProbabilityTimeline records={filtered} />
        </ChartPanel>
      </div>}
      {records.length ? <>
        <div className="archive-table-scroll"><div className="archive-table-head"><span>SAVED AT</span><span>PREDICTION ID / BRANCHES</span><span>CLASS</span><span>CONFLICT PROBABILITY</span><span /></div>
          {filtered.map((record) => <button className="archive-row" key={record.id} onClick={() => setSelected(record)}>
            <time dateTime={record.saved_at}>{new Date(record.saved_at).toLocaleString()}</time>
            <span className="archive-run-cell"><strong>{record.id}</strong><small>{record.branch_metadata.source || 'Source not labeled'}{record.branch_metadata.target ? ` → ${record.branch_metadata.target}` : ''}</small></span>
            <span className={`class-badge compact ${record.response.prediction === 1 ? 'class-conflict' : 'class-clean'}`}>{record.response.predicted_class.replace('_', ' ')}</span>
            <code>{String(record.response.class_probabilities.merge_conflict)}</code><span className="archive-review">Review</span>
          </button>)}
        </div>
        {filtered.length === 0 && <EmptyState icon={Search} title="No matching predictions">Try a different search term or predicted class.</EmptyState>}
      </> : <EmptyState icon={Archive} title="Your archive is empty">Successful API responses are stored in versioned browser localStorage. Create a prediction in Collision Studio to add the first real record.</EmptyState>}
      <div className="archive-filter-note">{filtered.length} of {records.length} locally saved API {records.length === 1 ? 'response' : 'responses'} · risk bands are not returned by the backend</div>
    </section>
    {selected && <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="prediction-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="prediction-detail-title">
        <div className="section-title-row"><div><span className="section-kicker">SAVED PREDICTION DETAIL</span><h2 id="prediction-detail-title">{selected.id}</h2></div><button className="icon-button" aria-label="Close prediction details" onClick={() => setSelected(null)}><X size={17} /></button></div>
        <PredictionResult response={selected.response} />
        <div className="detail-request-grid"><h3>Original request values</h3>{Object.entries(selected.request).map(([field, value]) => <div key={field}><span>{field}</span><code>{String(value)}</code></div>)}<p>Source: {selected.branch_metadata.source || 'not labeled'} · Target: {selected.branch_metadata.target || 'not labeled'}</p></div>
      </section>
    </div>}
    {selectedAnalysis && <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAnalysis(null); }}><section className="prediction-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="git-analysis-title"><div className="section-title-row"><div><span className="section-kicker">PERSISTED GIT ANALYSIS</span><h2 id="git-analysis-title">{selectedAnalysis.repository_name}: {selectedAnalysis.source_branch} → {selectedAnalysis.target_branch}</h2></div><button className="icon-button" aria-label="Close Git analysis details" onClick={() => setSelectedAnalysis(null)}><X size={17} /></button></div><div className="repo-analysis-metric-grid"><div><span>Actual Git merge check</span><strong>{selectedAnalysis.merge_check}</strong></div><div><span>Source-only commits</span><strong>{selectedAnalysis.source_only_commits}</strong></div><div><span>Target-only commits</span><strong>{selectedAnalysis.target_only_commits}</strong></div><div><span>Merge base</span><code>{selectedAnalysis.merge_base}</code></div></div><h3>Measured features</h3>{Object.entries(selectedAnalysis.feature_values).map(([field, value]) => <div className="detail-row" key={field}><span>{field}</span><strong>{value === null ? 'Unavailable' : value}</strong></div>)}<h3>Overlapping paths ({selectedAnalysis.overlapping_paths.length})</h3>{selectedAnalysis.overlapping_paths.length ? <ul>{selectedAnalysis.overlapping_paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p>No overlapping paths were detected.</p>}<p className="concept-note">Overlapping paths do not guarantee a merge conflict. This record’s Git outcome is shown separately.</p></section></div>}
  </>;
}

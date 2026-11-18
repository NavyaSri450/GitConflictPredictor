import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, GitBranch, GitMerge, LoaderCircle, Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { analyzeRepository, connectRepository, listRepositories, listRepositoryBranches } from '../services/api';
import type { BranchSummary, RepositoryAnalysis, RepositorySummary } from '../types/api';

export function RepositoryAnalysisWorkspace({ onAnalysisSaved }: { onAnalysisSaved?: () => void }) {
  const [kind, setKind] = useState<'github_url' | 'local_path'>('github_url');
  const [value, setValue] = useState('');
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [repository, setRepository] = useState<RepositorySummary | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [sourceRef, setSourceRef] = useState('');
  const [targetRef, setTargetRef] = useState('');
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    let active = true;
    void listRepositories().then((items) => { if (active) setRepositories(items); }).catch(() => { if (active) setError('The backend could not load saved repository connections. Check System Pulse and retry.'); }).finally(() => { if (active) setInitialLoad(false); });
    return () => { active = false; };
  }, []);

  async function chooseRepository(item: RepositorySummary) {
    setBusy(true); setError(null); setRepository(item); setAnalysis(null); setBranches([]); setSourceRef(''); setTargetRef('');
    try {
      const result = await listRepositoryBranches(item.id);
      setRepository(result.repository); setBranches(result.branches);
      const target = result.branches.find((branch) => branch.is_default) ?? result.branches[0];
      // Repositories often expose both `main` and `origin/main` at the same
      // commit. Do not preselect that no-op pair as the source and target.
      const source = result.branches.find((branch) => branch.commit_sha !== target?.commit_sha);
      setTargetRef(target?.ref ?? ''); setSourceRef(source?.ref ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Branch listing failed.');
    } finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true); setError(null); setAnalysis(null);
    try {
      const item = await connectRepository(kind, value.trim());
      setRepositories((items) => [item, ...items.filter((entry) => entry.id !== item.id)]);
      await chooseRepository(item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repository connection failed.');
    } finally { setBusy(false); }
  }

  async function runAnalysis() {
    if (!repository || !sourceRef || !targetRef || sourceRef === targetRef) return;
    setBusy(true); setError(null); setAnalysis(null);
    try {
      const saved = await analyzeRepository(repository.id, sourceRef, targetRef);
      setAnalysis(saved); onAnalysisSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repository analysis failed.');
    } finally { setBusy(false); }
  }

  function selectVerifiedExample(sourceName: string) {
    if (!repository) return;
    const source = branches.find((branch) => branch.name === sourceName);
    const target = branches.find((branch) => branch.is_default);
    if (!source || !target) {
      setError(`This verified example is unavailable in the connected clone. Choose branches manually.`);
      return;
    }
    setSourceRef(source.ref); setTargetRef(target.ref); setAnalysis(null); setError(null);
  }

  const examplePair = repository?.name.toLowerCase() === 'vitest'
    ? { conflict: 'pilot/stage6f-vitest-user-event-api', clean: 'pilot/stage6f-vitest-browser-mock-import-urls', conflictLabel: 'user-event API', cleanLabel: 'browser mock imports' }
    : repository?.name.toLowerCase() === 'flask'
      ? { conflict: 'origin/workflow', clean: 'origin/automatic-options', conflictLabel: 'workflow branch', cleanLabel: 'automatic options' }
      : null;
  const hasConflictExample = Boolean(examplePair && branches.some((branch) => branch.name === examplePair.conflict));
  const hasCleanExample = Boolean(examplePair && branches.some((branch) => branch.name === examplePair.clean));

  return <section className="surface-card repo-workspace">
    <div className="section-title-row"><div><span className="section-kicker">REPOSITORY WORKFLOW</span><h2>Connect branches for a real Git analysis</h2></div><span className={`subtle-badge ${repository ? 'repo-connected-badge' : ''}`}><Link2 size={13} />{repository ? 'BACKEND VERIFIED' : initialLoad ? 'CHECKING' : 'NO REPOSITORY SELECTED'}</span></div>
    <p className="repo-workspace-copy">Public GitHub repositories are cloned only after you submit their URL. Local paths must be under the backend’s configured allowlist. The analysis reads committed refs in an isolated temporary snapshot.</p>
    {repository ? <details className="repo-switch-disclosure"><summary><Link2 size={14} /> Connect or switch repository</summary><div className="repo-switch-content"><div className="repo-connect-grid">
      <label className="field"><span>Repository source</span><select aria-label="Repository source type" value={kind} onChange={(event) => setKind(event.target.value as 'github_url' | 'local_path')}><option value="github_url">Public GitHub URL</option><option value="local_path">Allowlisted local repository</option></select></label>
      <label className="field repo-url-field"><span>{kind === 'github_url' ? 'Repository URL' : 'Local repository path'}</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === 'github_url' ? 'https://github.com/pallets/flask' : 'D:\\gitnexus-public-repos\\flask'} autoComplete="off" /></label>
      <button className="button button-primary" onClick={() => void connect()} disabled={busy || !value.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />} Connect</button>
    </div>
    {repositories.length > 1 && <label className="field saved-repository-field"><span>Saved connections</span><select aria-label="Select connected repository" value={repository.id} onChange={(event) => { const next = repositories.find((item) => item.id === event.target.value); if (next) void chooseRepository(next); }}><option value="">Choose a saved repository</option>{repositories.map((item) => <option key={item.id} value={item.id}>{item.owner ? `${item.owner}/` : ''}{item.name} · {item.kind === 'github_url' ? 'GitHub' : 'local'}</option>)}</select></label>}</div></details> : <>
      <div className="repo-connect-grid">
        <label className="field"><span>Repository source</span><select aria-label="Repository source type" value={kind} onChange={(event) => setKind(event.target.value as 'github_url' | 'local_path')}><option value="github_url">Public GitHub URL</option><option value="local_path">Allowlisted local repository</option></select></label>
        <label className="field repo-url-field"><span>{kind === 'github_url' ? 'Repository URL' : 'Local repository path'}</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === 'github_url' ? 'https://github.com/pallets/flask' : 'D:\\gitnexus-public-repos\\flask'} autoComplete="off" /></label>
        <button className="button button-primary" onClick={() => void connect()} disabled={busy || !value.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />} Connect</button>
      </div>
      {repositories.length > 0 && <label className="field saved-repository-field"><span>Saved repository connections</span><select aria-label="Select connected repository" value="" onChange={(event) => { const next = repositories.find((item) => item.id === event.target.value); if (next) void chooseRepository(next); }}><option value="">Choose a saved repository</option>{repositories.map((item) => <option key={item.id} value={item.id}>{item.owner ? `${item.owner}/` : ''}{item.name} · {item.kind === 'github_url' ? 'GitHub' : 'local'}</option>)}</select></label>}
    </>}
    {error && <div role="alert" className="form-alert"><AlertTriangle size={15} /><strong>Repository request failed</strong><span>{error}</span></div>}
    {repository && <div className="connected-repository-card"><span className="repo-avatar"><GitBranch size={17} /></span><div><strong>{repository.owner ? `${repository.owner}/` : ''}{repository.name}</strong><small>Connected by FastAPI · default branch {repository.default_branch} · {repository.branch_count} available branches</small></div><span className="service-state connected">Connected</span></div>}
    {repository && <>
      {examplePair && (hasConflictExample || hasCleanExample) && <div className="verified-example-panel"><div className="verified-example-heading"><div><span className="section-kicker">EVALUATOR QUICK DEMO</span><strong>Choose a verified Git example</strong><small>Pick a real branch pair to fill the selectors, then click Analyze branches to run Git’s check.</small></div><span className="chart-tag">REAL REFS</span></div><div className="verified-example-actions">{hasConflictExample && <button className="verified-example-button verified-conflict" onClick={() => selectVerifiedExample(examplePair.conflict)} disabled={busy}><ShieldAlert size={16} /><span><strong>Use conflict example</strong><small>{examplePair.conflictLabel} → {repository.default_branch}</small></span></button>}{hasCleanExample && <button className="verified-example-button verified-clean" onClick={() => selectVerifiedExample(examplePair.clean)} disabled={busy}><ShieldCheck size={16} /><span><strong>Use clean example</strong><small>{examplePair.cleanLabel} → {repository.default_branch}</small></span></button>}</div></div>}
      <div className="repo-branch-grid">
        <label className="field"><span>Repository source branch</span><select aria-label="Repository source branch" value={sourceRef} onChange={(event) => { setSourceRef(event.target.value); setAnalysis(null); setError(null); }}><option value="">Select source branch</option>{branches.map((branch) => <option key={branch.ref} value={branch.ref}>{branch.name} · {branch.commit_sha.slice(0, 8)}</option>)}</select></label>
        <label className="field"><span>Repository target branch</span><select aria-label="Repository target branch" value={targetRef} onChange={(event) => { setTargetRef(event.target.value); setAnalysis(null); setError(null); }}><option value="">Select target branch</option>{branches.map((branch) => <option key={branch.ref} value={branch.ref}>{branch.name}{branch.is_default ? ' · default' : ''} · {branch.commit_sha.slice(0, 8)}</option>)}</select></label>
        <button className="button button-primary" onClick={() => void runAnalysis()} disabled={busy || !sourceRef || !targetRef || sourceRef === targetRef}>{busy ? <LoaderCircle size={15} className="spin" /> : <GitMerge size={15} />} Analyze branches</button>
      </div>
      <p className="repo-safety-note"><CheckCircle2 size={14} /> Only commits are inspected. The selected repository is never checked out, merged, pushed, or fetched during analysis. Custom merge drivers are refused.</p>
    </>}
    {analysis && <div className="repo-analysis-summary">
      <div className="repo-analysis-heading"><div><span className="section-kicker">SAVED ANALYSIS · {new Date(analysis.created_at).toLocaleString()}</span><h3>{analysis.source_branch} → {analysis.target_branch}</h3></div><span className={`class-badge ${analysis.merge_check === 'conflict' ? 'class-conflict' : 'class-clean'}`}>Git says {analysis.merge_check}</span></div>
      <div className="repo-analysis-metric-grid"><div><span>Source-only commits</span><strong>{analysis.source_only_commits}</strong></div><div><span>Target-only commits</span><strong>{analysis.target_only_commits}</strong></div><div><span>Merge base</span><code>{analysis.merge_base.slice(0, 12)}</code></div><div><span>Overlapping paths</span><strong>{analysis.overlapping_paths.length}</strong></div><div><span>Source lines + / −</span><strong>{analysis.source_lines_added} / {analysis.source_lines_deleted}</strong></div><div><span>Target lines + / −</span><strong>{analysis.target_lines_added} / {analysis.target_lines_deleted}</strong></div></div>
      <div className="repo-feature-values"><h4>Measured model inputs</h4>{Object.entries(analysis.feature_values).map(([name, value]) => <div key={name}><span>{name.replaceAll('_', ' ')}</span><strong>{value === null ? 'Unavailable' : value}</strong></div>)}</div>
      {analysis.prediction ? <div className="repo-model-estimate"><strong>Exploratory model estimate</strong><span>{analysis.prediction.predicted_class.replaceAll('_', ' ')} · {(analysis.prediction.class_probabilities.merge_conflict * 100).toFixed(1)}% raw conflict score</span><small>{analysis.prediction.probability_note}</small></div> : <div className="chart-empty repo-model-empty">ML estimate unavailable: {analysis.prediction_unavailable_reason}</div>}
      <p className="chart-caption">Git’s merge-check outcome is an actual isolated merge-tree result. The model estimate is separate. Shared paths alone do not prove a conflict.</p>
    </div>}
  </section>;
}

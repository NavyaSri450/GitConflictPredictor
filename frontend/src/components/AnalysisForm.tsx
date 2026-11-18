import { useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';
import type { BranchMetadata, PredictionRequest } from '../types/api';

interface FieldDefinition {
  name: keyof PredictionRequest;
  label: string;
  help: string;
  integer?: boolean;
  maximum?: number;
  modelInput?: boolean;
}

const groups: { title: string; description: string; fields: FieldDefinition[] }[] = [
  { title: 'Repository information', description: 'Optional repository context currently unavailable from the collector.', fields: [
    { name: 'coverage', label: 'Test coverage', help: 'Optional fraction from 0 to 1. A pre-merge coverage artifact is required.', maximum: 1 },
  ] },
  { title: 'Commit information', description: 'Change volume measured for the incoming branch.', fields: [
    { name: 'files_changed', label: 'Files changed', help: 'Distinct source-branch paths since the merge base.', integer: true, modelInput: true },
    { name: 'lines_added', label: 'Lines added', help: 'Text-line additions on the source branch.', integer: true, modelInput: true },
    { name: 'avg_files_per_commit', label: 'Average files per commit', help: 'Mean changed paths for source first-parent commits.', modelInput: true },
    { name: 'commit_severity', label: 'Commit severity', help: 'Optional; the feature definition has no agreed formula.', maximum: 1 },
  ] },
  { title: 'Developer information', description: 'Optional historical signals; they are not collected by the current Git-only collector.', fields: [
    { name: 'developer_commits', label: 'Developer commits', help: 'Optional actor-specific commit count.', integer: true },
    { name: 'developer_conflicts', label: 'Developer conflicts', help: 'Optional past-only conflict count.', integer: true },
    { name: 'activity_score', label: 'Activity score', help: 'Optional; a stable scale and lookback are not defined.' },
  ] },
  { title: 'Branch information', description: 'Target history and source/target labels kept as local metadata only.', fields: [
    { name: 'branch_commits', label: 'Target branch commits', help: 'Target first-parent commits after the merge base.', integer: true, modelInput: true },
    { name: 'branch_files_changed', label: 'Target branch files changed', help: 'Distinct paths changed on the target since base.', integer: true, modelInput: true },
    { name: 'branch_conflicts', label: 'Historical branch conflicts', help: 'Optional past-only target-branch conflict count.', integer: true },
    { name: 'branch_risk_score', label: 'Branch risk score', help: 'Optional; no scoring formula is defined.' },
  ] },
  { title: 'Dependency information', description: 'Optional signals that need language-aware or historical evidence.', fields: [
    { name: 'import_count', label: 'Import count', help: 'Optional language-specific import count.', integer: true },
    { name: 'dependency_conflicts', label: 'Historical dependency conflicts', help: 'Optional; separate from this prediction target.', integer: true },
    { name: 'dependency_risk', label: 'Dependency risk', help: 'Optional fraction from 0 to 1.', maximum: 1 },
  ] },
  { title: 'Conflict-pattern information', description: 'Optional historical signals; no pattern taxonomy is currently configured.', fields: [
    { name: 'pattern_frequency', label: 'Pattern frequency', help: 'Optional prior pattern frequency.', integer: true },
    { name: 'pattern_conflicts', label: 'Historical pattern conflicts', help: 'Optional prior pattern conflict count.', integer: true },
    { name: 'pattern_risk', label: 'Pattern risk', help: 'Optional fraction from 0 to 1.', maximum: 1 },
  ] },
];

const requiredModelInputs = new Set<keyof PredictionRequest>([
  'files_changed', 'lines_added', 'avg_files_per_commit', 'branch_commits', 'branch_files_changed',
]);

interface AnalysisFormProps {
  onSubmit: (payload: PredictionRequest, metadata: BranchMetadata) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
  initialValues?: PredictionRequest;
}

export function AnalysisForm({ onSubmit, submitting, errorMessage, initialValues }: AnalysisFormProps) {
  const [values, setValues] = useState<Partial<Record<keyof PredictionRequest, string>>>(() => {
    if (!initialValues) return {};
    return Object.fromEntries(Object.entries(initialValues).map(([key, value]) => [key, String(value)])) as Partial<Record<keyof PredictionRequest, string>>;
  });
  const [branchLabels, setBranchLabels] = useState<BranchMetadata>({ source: '', target: '' });
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Partial<PredictionRequest> = {};
    for (const group of groups) for (const field of group.fields) {
      const raw = values[field.name]?.trim();
      if (!raw) {
        if (requiredModelInputs.has(field.name)) {
          setValidationError(`Enter a value for ${field.label.toLowerCase()}.`);
          return;
        }
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000
        || (field.maximum !== undefined && value > field.maximum)
        || (field.integer && !Number.isInteger(value))) {
        setValidationError(`${field.label} must be a finite, non-negative${field.integer ? ' whole' : ''} number${field.maximum !== undefined ? ` no greater than ${field.maximum}` : ''}.`);
        return;
      }
      payload[field.name] = value;
    }
    setValidationError(null);
    await onSubmit(payload as PredictionRequest, branchLabels);
  }

  return (
    <form className="analysis-form" onSubmit={handleSubmit} noValidate>
      <section className="form-section branch-metadata">
        <div className="form-section-heading"><span className="form-step">00</span><div><h3>Branch labels</h3><p>Optional local metadata; not sent as model features.</p></div><span className="metadata-only"><LockKeyhole size={12} /> LOCAL ONLY</span></div>
        <div className="form-grid two-columns">
          {(['source', 'target'] as const).map((key) => <label className="field" key={key}><span>{key === 'source' ? 'Source branch' : 'Target branch'} <em>Optional metadata</em></span><input name={key} value={branchLabels[key]} onChange={(event) => setBranchLabels({ ...branchLabels, [key]: event.target.value })} placeholder={key === 'source' ? 'Enter source branch' : 'Enter target branch'} autoComplete="off" /><small>Stored locally with this result only.</small></label>)}
        </div>
      </section>
      {groups.map((group, index) => (
        <section className="form-section" key={group.title}>
          <div className="form-section-heading"><span className="form-step">{String(index + 1).padStart(2, '0')}</span><div><h3>{group.title}</h3><p>{group.description}</p></div></div>
          <div className="form-grid">
            {group.fields.map((field) => {
              const required = requiredModelInputs.has(field.name);
              return <label className="field" key={field.name}>
                <span>{field.label} <em>{required ? 'Required · current model input' : 'Optional · not used by current model'}</em></span>
                <input name={field.name} type="number" min="0" max={field.maximum ?? 1_000_000_000} step={field.integer ? 1 : 'any'} inputMode="decimal" required={required} value={values[field.name] ?? ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} placeholder={required ? 'Required for prediction' : 'Leave blank if unavailable'} aria-describedby={`${field.name}-help`} />
                <small id={`${field.name}-help`}>{field.help}{field.modelInput && <span className="input-used-tag"><Sparkles size={11} /> Used by model</span>}</small>
              </label>;
            })}
          </div>
        </section>
      ))}
      {(validationError || errorMessage) && <div className="form-alert" role="alert"><strong>{validationError ? 'Check the form' : 'Prediction request failed'}</strong><span>{validationError ?? errorMessage}</span></div>}
      <div className="form-submit-row"><div className="privacy-note"><LockKeyhole size={13} /> Only the five supported values are scored; optional values are not imputed.</div><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle size={16} className="spin" /> Requesting estimate</> : <>Analyze future merge <ArrowRight size={16} /></>}</button></div>
    </form>
  );
}

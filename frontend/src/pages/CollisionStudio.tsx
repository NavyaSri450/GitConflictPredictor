import { useState } from 'react';
import { GitPullRequest, ShieldAlert } from 'lucide-react';
import { AnalysisForm } from '../components/AnalysisForm';
import { RepositoryAnalysisWorkspace } from '../components/RepositoryAnalysisWorkspace';
import { ChartPanel, DonutChart, FeatureBarChart } from '../components/DataCharts';
import { PageHeading } from '../components/PageHeading';
import { PredictionResult } from '../components/PredictionResult';
import type { BranchMetadata, ModelFeature, PredictionRequest, PredictionResponse, SystemSnapshot } from '../types/api';

interface CollisionStudioProps {
  onSubmit: (payload: PredictionRequest, metadata: BranchMetadata) => Promise<PredictionResponse>;
  initialValues?: PredictionRequest;
  system: SystemSnapshot | null;
  onAnalysisSaved?: () => void;
}

const featureLabels: Record<ModelFeature, string> = {
  files_changed: 'Source files changed',
  lines_added: 'Source lines added',
  avg_files_per_commit: 'Average files per commit',
  branch_commits: 'Target commits after base',
  branch_files_changed: 'Target files changed',
};

export function CollisionStudio({ onSubmit, initialValues, system, onAnalysisSaved }: CollisionStudioProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<PredictionResponse | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<PredictionRequest | null>(null);

  async function submit(payload: PredictionRequest, metadata: BranchMetadata) {
    setSubmitting(true);
    setErrorMessage(null);
    setResponse(null);
    setSubmittedRequest(null);
    try {
      setResponse(await onSubmit(payload, metadata));
      setSubmittedRequest(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The API request could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <PageHeading eyebrow="ANALYSIS WORKSPACE" title="Collision Studio" description="Connect a public GitHub repository or an allowlisted local clone. Git analysis and the exploratory model result are reported separately." />
    <RepositoryAnalysisWorkspace onAnalysisSaved={onAnalysisSaved} />
    <details className="surface-card advanced-prediction-disclosure">
      <summary><span><GitPullRequest size={15} /> Advanced manual prediction</span><span>Optional · measured inputs only</span></summary>
    <div className="studio-layout">
      <section className="surface-card form-card">
        <div className="section-title-row"><div><span className="section-kicker">ANALYSIS INPUT</span><h2>Merge conditions</h2></div><span className="subtle-badge"><GitPullRequest size={13} /> 5 MODEL INPUTS · 18-FIELD CONTRACT</span></div>
        <p className="form-intro">Enter the five required measured values. Other schema fields are optional and excluded from current scoring; leave unknown values blank.</p>
        <AnalysisForm onSubmit={submit} submitting={submitting} errorMessage={errorMessage} initialValues={initialValues} />
      </section>
      <aside className="studio-side">
        {response ? <PredictionResult response={response} /> : <section className="surface-card result-card">
          <div className="section-kicker">ANALYSIS RESPONSE</div><div className="result-unavailable"><span className="unavailable-icon"><ShieldAlert size={18} /></span><h2>Awaiting a real prediction</h2><p>After a successful API response, its predicted class and raw class probabilities will appear here.</p></div>
          <div className="result-foot"><ShieldAlert size={14} /> Exploratory model only · no guaranteed outcome</div>
        </section>}
        <section className="surface-card api-contract-card"><span className="section-kicker">MODEL CONTRACT</span><h3>Inputs actually scored</h3><ul className="used-input-list"><li>Files changed</li><li>Lines added</li><li>Average files per commit</li><li>Target branch commits</li><li>Target branch files changed</li></ul><p>Branch labels remain browser-local metadata and are not sent as model inputs.</p></section>
      </aside>
    </div>
    <div className="chart-grid chart-grid-studio">
      <ChartPanel title="Input profile" subtitle="Measured values from the most recent successful request. Bars share a relative scale across mixed units." aside={<span className="chart-tag">REQUEST INPUTS</span>}>
        <FeatureBarChart data={submittedRequest ? (Object.keys(featureLabels) as ModelFeature[]).map((field, index) => ({ label: featureLabels[field], value: submittedRequest[field], color: ['#54d5e4', '#58d6be', '#a78bea', '#80a9ff', '#f1b66f'][index] })) : []} />
      </ChartPanel>
      <ChartPanel title="Returned class probabilities" subtitle="Only displayed after the backend returns a valid prediction." aside={<span className="chart-tag">PROBABILITY CHART</span>}>
        {response ? <DonutChart values={[{ label: 'Clean merge', value: response.class_probabilities.clean_merge, color: '#57d6be' }, { label: 'Merge conflict', value: response.class_probabilities.merge_conflict, color: '#f0a56f' }]} center={`${(response.class_probabilities.merge_conflict * 100).toFixed(1)}%`} label="conflict" percentValues /> : <div className="chart-empty">No prediction is available yet. The model readiness state is {system?.readiness.data?.model_available ? 'ready' : 'not verified'}.</div>}
      </ChartPanel>
    </div>
    </details>
  </>;
}

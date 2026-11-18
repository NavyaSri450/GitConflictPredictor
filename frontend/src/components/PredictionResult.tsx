import { CheckCircle2, CircleAlert, ShieldAlert } from 'lucide-react';
import type { PredictionResponse } from '../types/api';

export function PredictionResult({ response }: { response: PredictionResponse }) {
  const conflict = response.predicted_class === 'merge_conflict';
  return (
    <section className="surface-card prediction-result" aria-live="polite">
      <div className="section-title-row">
        <div><span className="section-kicker">ACTUAL API RESPONSE</span><h2>Prediction estimate</h2></div>
        <span className={`class-badge ${conflict ? 'class-conflict' : 'class-clean'}`}>{conflict ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}{response.predicted_class.replace('_', ' ')}</span>
      </div>
      <p className="prediction-label">{response.prediction_label}</p>
      <div className="probability-grid">
        <div><span>Merge conflict probability</span><strong>{String(response.class_probabilities.merge_conflict)}</strong></div>
        <div><span>Clean merge probability</span><strong>{String(response.class_probabilities.clean_merge)}</strong></div>
      </div>
      <div className="result-meta"><span>Model <strong>{response.model_name}</strong></span><span>Status <strong>{response.model_status}</strong></span><span>Risk band <strong>Not provided by API</strong></span></div>
      <div className="result-warning"><ShieldAlert size={15} /><div><strong>Exploratory estimate only</strong><p>{response.probability_note} {response.message}</p></div></div>
      <div className="feature-list"><span>Features used by this model</span><div>{response.features_used.map((feature) => <code key={feature}>{feature}</code>)}</div></div>
      <time className="prediction-time" dateTime={response.predicted_at}>Returned {new Date(response.predicted_at).toLocaleString()}</time>
    </section>
  );
}

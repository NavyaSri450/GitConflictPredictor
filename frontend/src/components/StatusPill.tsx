import { Circle, LoaderCircle } from 'lucide-react';
import type { ServiceState } from '../types/api';

const labels: Record<ServiceState, string> = {
  checking: 'Checking connection',
  connected: 'API connected',
  offline: 'API offline',
};

export function StatusPill({ state }: { state: ServiceState }) {
  return (
    <span className={`status-pill status-${state}`} role="status" aria-live="polite">
      {state === 'checking' ? <LoaderCircle size={14} className="spin" /> : <Circle size={9} fill="currentColor" />}
      {labels[state]}
    </span>
  );
}

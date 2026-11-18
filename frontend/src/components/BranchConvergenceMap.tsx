import { GitBranch, GitMerge } from 'lucide-react';

export function BranchConvergenceMap({ source, target }: { source?: string; target?: string } = {}) {
  return (
    <div className="convergence-wrap">
      <div className="convergence-label"><span className="concept-dot" /> SCHEMATIC VIEW <span className="convergence-caption">No live Git graph</span></div>
      <svg className="convergence-svg" viewBox="0 0 720 174" role="img" aria-labelledby="convergence-title convergence-desc">
        <title id="convergence-title">Schematic branch convergence</title>
        <desc id="convergence-desc">A schematic illustration only. It does not show commits, changed paths, or a calculated merge outcome.</desc>
        <defs><linearGradient id="branch-cyan" x1="0" x2="1"><stop stopColor="#315b69" /><stop offset="1" stopColor="#55d9e9" /></linearGradient><linearGradient id="branch-violet" x1="0" x2="1"><stop stopColor="#48425e" /><stop offset="1" stopColor="#b29aff" /></linearGradient></defs>
        <path d="M64 44 C175 44 190 44 278 44 S402 48 510 87" fill="none" stroke="url(#branch-cyan)" strokeWidth="2" />
        <path d="M64 132 C175 132 190 132 278 132 S402 126 510 87" fill="none" stroke="url(#branch-violet)" strokeWidth="2" />
        {[64, 172, 278, 382].map((x) => <circle key={`a-${x}`} cx={x} cy="44" r="4" fill="#71d9e5" />)}
        {[64, 172, 278, 382].map((x) => <circle key={`b-${x}`} cx={x} cy="132" r="4" fill="#b29aff" />)}
        <circle cx="510" cy="87" r="19" fill="#11232d" stroke="#3c6671" />
        <path d="M510 76v7m0 8v7m-8-11h16" stroke="#7de2e6" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M531 87H645" stroke="#293846" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="646" cy="87" r="4" fill="#62788b" />
        <text x="64" y="23" fill="#94b5c1" fontSize="10" fontFamily="ui-monospace, monospace">{(source || 'SOURCE BRANCH').slice(0, 30)}</text>
        <text x="64" y="158" fill="#a89bc6" fontSize="10" fontFamily="ui-monospace, monospace">{(target || 'TARGET BRANCH').slice(0, 30)}</text>
        <text x="468" y="122" fill="#8396a8" fontSize="9" fontFamily="ui-monospace, monospace">POSSIBLE MERGE</text>
        <text x="617" y="72" fill="#687b8d" fontSize="9" fontFamily="ui-monospace, monospace">OUTCOME</text>
      </svg>
      <div className="convergence-mobile" aria-hidden="true"><GitBranch size={16} /><span>Source branch</span><i /><GitMerge size={16} /><i /><GitBranch size={16} /><span>Target branch</span></div>
    </div>
  );
}

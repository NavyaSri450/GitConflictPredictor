import {
  Activity, Archive, GitCompareArrows, GitMerge, GitPullRequest,
  Microscope, Orbit, Radar, X,
} from 'lucide-react';

export type PageId = 'observatory' | 'collision' | 'dna' | 'simulation' | 'archive' | 'compare' | 'pulse';

export const pages: { id: PageId; label: string; icon: typeof Activity; group: string }[] = [
  { id: 'observatory', label: 'Merge Observatory', icon: Orbit, group: 'INTELLIGENCE' },
  { id: 'collision', label: 'Collision Studio', icon: GitPullRequest, group: 'INTELLIGENCE' },
  { id: 'dna', label: 'Conflict DNA', icon: Microscope, group: 'INTELLIGENCE' },
  { id: 'simulation', label: 'Simulation Lab', icon: Activity, group: 'WORKSPACE' },
  { id: 'archive', label: 'Intelligence Archive', icon: Archive, group: 'WORKSPACE' },
  { id: 'compare', label: 'Compare Runs', icon: GitCompareArrows, group: 'WORKSPACE' },
  { id: 'pulse', label: 'System Pulse', icon: Radar, group: 'SYSTEM' },
];

interface AppSidebarProps {
  activePage: PageId;
  isOpen: boolean;
  onNavigate: (page: PageId) => void;
  onClose: () => void;
}

export function AppSidebar({ activePage, isOpen, onNavigate, onClose }: AppSidebarProps) {
  return (
    <>
      {isOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-top">
          <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); onNavigate('observatory'); }} aria-label="GitNexus AI home">
            <span className="brand-mark"><GitMerge size={19} strokeWidth={2.1} /></span>
            <span className="brand-copy"><strong>GITNEXUS <i>AI</i></strong><small>PREDICTIVE MERGE INTELLIGENCE</small></span>
          </a>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-chip"><span className="workspace-avatar">W</span><span><strong>Workspace</strong><small>Local environment</small></span><span className="chevron">⌄</span></div>
        <nav className="nav-groups">
          {(['INTELLIGENCE', 'WORKSPACE', 'SYSTEM'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-caption">{group}</div>
              {pages.filter((page) => page.group === group).map(({ id, label, icon: Icon }) => (
                <button key={id} className={`nav-item ${activePage === id ? 'nav-current' : ''}`} onClick={() => onNavigate(id)} aria-current={activePage === id ? 'page' : undefined}>
                  <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{activePage === id && <span className="nav-indicator" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="repo-empty"><GitMerge size={16} /><div><strong>No repository connected</strong><span>Repository analysis is not set up</span></div></div>
          <div className="sidebar-version"><span className="version-dot" /> FOUNDATION BUILD <span>0.2</span></div>
        </div>
      </aside>
    </>
  );
}

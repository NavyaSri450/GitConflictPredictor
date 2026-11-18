import { Menu, RotateCw } from 'lucide-react';
import { pages, type PageId } from './AppSidebar';
import { StatusPill } from './StatusPill';
import type { ServiceState } from '../types/api';

interface AppHeaderProps {
  activePage: PageId;
  apiState: ServiceState;
  menuOpen: boolean;
  onMenu: () => void;
  onRefresh: () => void;
}

export function AppHeader({ activePage, apiState, menuOpen, onMenu, onRefresh }: AppHeaderProps) {
  const title = pages.find((page) => page.id === activePage)?.label ?? 'Merge Observatory';
  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" onClick={onMenu} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}><Menu size={19} /></button>
      <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
      <div className="header-actions">
        <button className="icon-button refresh-button" onClick={onRefresh} aria-label="Refresh backend status" title="Refresh backend status"><RotateCw size={15} /></button>
        <StatusPill state={apiState} />
      </div>
    </header>
  );
}

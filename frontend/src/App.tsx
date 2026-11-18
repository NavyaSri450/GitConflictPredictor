import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { AppSidebar, type PageId } from './components/AppSidebar';
import { ConflictDNA } from './pages/ConflictDNA';
import { CollisionStudio } from './pages/CollisionStudio';
import { CompareRuns } from './pages/CompareRuns';
import { IntelligenceArchive } from './pages/IntelligenceArchive';
import { MergeObservatory } from './pages/MergeObservatory';
import { SimulationLab } from './pages/SimulationLab';
import { SystemPulse } from './pages/SystemPulse';
import { createPredictionRecord, readPredictionHistory, savePrediction } from './services/history';
import { getSystemSnapshot, listAnalyses, submitPrediction } from './services/api';
import type { BranchMetadata, PredictionRequest, PredictionResponse, RepositoryAnalysis, SavedPrediction, ServiceState, SystemSnapshot } from './types/api';

const pageIds: PageId[] = ['observatory', 'collision', 'dna', 'simulation', 'archive', 'compare', 'pulse'];

function pageFromHash(): PageId {
  const candidate = window.location.hash.slice(1) as PageId;
  return pageIds.includes(candidate) ? candidate : 'observatory';
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(() => pageFromHash());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiState, setApiState] = useState<ServiceState>('checking');
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [lastSuccessfulHealth, setLastSuccessfulHealth] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<SavedPrediction[]>([]);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [repositoryAnalyses, setRepositoryAnalyses] = useState<RepositoryAnalysis[]>([]);
  const [repositoryHistoryError, setRepositoryHistoryError] = useState<string | null>(null);

  const refreshSystem = useCallback(async () => {
    setRefreshing(true);
    if (!system) setApiState('checking');
    const snapshot = await getSystemSnapshot();
    setSystem(snapshot);
    setApiState(snapshot.health.data ? 'connected' : 'offline');
    setHealthError(snapshot.health.error);
    if (snapshot.health.data) setLastSuccessfulHealth(snapshot.checked_at);
    setRefreshing(false);
    return snapshot;
  }, [system]);

  const refreshRepositoryAnalyses = useCallback(async () => {
    try {
      const history = await listAnalyses({ limit: 100 });
      setRepositoryAnalyses(history.items);
      setRepositoryHistoryError(null);
    } catch (error) {
      setRepositoryHistoryError(error instanceof Error ? error.message : 'Saved Git analyses are unavailable.');
    }
  }, []);

  const onRepositoryAnalysisSaved = useCallback(() => {
    void refreshSystem();
    void refreshRepositoryAnalyses();
  }, [refreshRepositoryAnalyses, refreshSystem]);

  useEffect(() => {
    void refreshSystem();
    void refreshRepositoryAnalyses();
    const history = readPredictionHistory();
    setRecords(history.records);
    setHistoryWarning(history.warning);
  }, []);

  useEffect(() => {
    const updateFromLocation = () => setActivePage(pageFromHash());
    window.addEventListener('hashchange', updateFromLocation);
    return () => window.removeEventListener('hashchange', updateFromLocation);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileNavOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function navigate(page: PageId) {
    setActivePage(page);
    setMobileNavOpen(false);
    if (window.location.hash !== `#${page}`) window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function runPrediction(payload: PredictionRequest, metadata: BranchMetadata): Promise<PredictionResponse> {
    const response = await submitPrediction(payload);
    const saved = savePrediction(createPredictionRecord(payload, response, metadata));
    setRecords(saved.records);
    setHistoryWarning(saved.warning);
    return response;
  }

  function renderPage() {
    switch (activePage) {
      case 'observatory': return <MergeObservatory system={system} records={records} historyWarning={historyWarning} onAnalyze={() => navigate('collision')} onOpenPrediction={(record) => navigateToSavedRun(record)} />;
      case 'collision': return <CollisionStudio onSubmit={runPrediction} system={system} onAnalysisSaved={onRepositoryAnalysisSaved} />;
      case 'dna': return <ConflictDNA system={system} analyses={repositoryAnalyses} />;
      case 'simulation': return <SimulationLab records={records} initialRecordId={selectedSimulationId} onPredict={runPrediction} onOpenCollision={() => navigate('collision')} analyses={repositoryAnalyses} onAnalysisSaved={onRepositoryAnalysisSaved} />;
      case 'archive': return <IntelligenceArchive records={records} warning={historyWarning} analyses={repositoryAnalyses} historyError={repositoryHistoryError} />;
      case 'compare': return <CompareRuns records={records} analyses={repositoryAnalyses} />;
      case 'pulse': return <SystemPulse system={system} error={healthError} refreshing={refreshing} lastSuccessfulHealth={lastSuccessfulHealth} onRefresh={refreshSystem} />;
    }
  }

  function navigateToSavedRun(record: SavedPrediction) {
    setSelectedSimulationId(record.id);
    navigate('simulation');
  }

  return (
    <div className="app-shell">
      <AppSidebar activePage={activePage} isOpen={mobileNavOpen} onNavigate={navigate} onClose={() => setMobileNavOpen(false)} />
      <main className="main-content" id="main-content">
        <AppHeader activePage={activePage} apiState={apiState} menuOpen={mobileNavOpen} onMenu={() => setMobileNavOpen((open) => !open)} onRefresh={() => { void refreshSystem(); }} />
        <div className="page-wrap" key={activePage}>{renderPage()}<footer className="page-footer"><span>GITNEXUS AI <b>·</b> PREDICTIVE MERGE INTELLIGENCE</span><span>Decision support only <span className="footer-dot">·</span> No automatic merges</span></footer></div>
      </main>
    </div>
  );
}

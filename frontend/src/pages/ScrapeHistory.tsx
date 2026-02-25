import { useState, useEffect } from 'react';
import { scrapeHistoryApi, ScrapeRun } from '../api/client';

function ScrapeHistory() {
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ScrapeRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const res = await scrapeHistoryApi.getRuns({ page, limit: 20 });
      setRuns(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch scrape runs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, [page]);

  const handleDeleteRun = async (runId: number) => {
    try {
      await scrapeHistoryApi.deleteRun(runId);
      if (selectedRun?.id === runId) setSelectedRun(null);
      fetchRuns();
    } catch (error) {
      console.error('Failed to delete run:', error);
    }
  };

  const handleDeleteAllRuns = async () => {
    try {
      await scrapeHistoryApi.deleteAllRuns();
      setSelectedRun(null);
      setPage(1);
      setShowDeleteAllConfirm(false);
      fetchRuns();
    } catch (error) {
      console.error('Failed to delete all runs:', error);
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'Running...';
    const duration = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusBadge = (status: ScrapeRun['status']) => {
    switch (status) {
      case 'running': return <span className="badge badge-warning">Running</span>;
      case 'completed': return <span className="badge badge-success">Completed</span>;
      case 'failed': return <span className="badge badge-error">Failed</span>;
    }
  };

  if (loading && runs.length === 0) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Scrape History</h1>
        {runs.length > 0 && (
          showDeleteAllConfirm ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--error)', fontWeight: 500 }}>Delete all?</span>
              <button className="btn btn-danger" onClick={handleDeleteAllRuns}>Yes</button>
              <button className="btn btn-secondary" onClick={() => setShowDeleteAllConfirm(false)}>No</button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => setShowDeleteAllConfirm(true)}>Delete All</button>
          )
        )}
      </div>

      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        {/* Runs List */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Scrape Runs</h2>
          {runs.length === 0 ? (
            <p className="text-muted">No scrape runs yet.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {runs.map(run => (
                  <div key={run.id} onClick={() => setSelectedRun(run)}
                    style={{
                      padding: '0.75rem', background: selectedRun?.id === run.id ? 'var(--accent)' : 'var(--bg-primary)',
                      borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{formatDate(run.startedAt)}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {run.domainsProcessed}/{run.domainsTotal} domains | {run.screenshotsTaken} screenshots
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusBadge(run.status)}
                      <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); handleDeleteRun(run.id); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                  <span style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{page} / {totalPages}</span>
                  <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Run Details */}
        <div className="card">
          {selectedRun ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>Run Details</h2>
                {getStatusBadge(selectedRun.status)}
              </div>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Started</span>
                  <div>{formatDate(selectedRun.startedAt)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Duration</span>
                  <div>{formatDuration(selectedRun.startedAt, selectedRun.completedAt)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>WHOIS Lookups</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedRun.whoisLookups}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>DNS Records</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedRun.dnsLookups}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Subdomains</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedRun.subdomainsFound}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Screenshots</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedRun.screenshotsTaken}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Errors</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: selectedRun.errorsCount > 0 ? 'var(--error)' : 'inherit' }}>
                    {selectedRun.errorsCount}
                  </div>
                </div>
              </div>
              {selectedRun.errorMessages && (
                <div style={{
                  background: 'var(--error)', color: 'white', padding: '0.75rem', borderRadius: '8px',
                  marginTop: '1rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap'
                }}>
                  {selectedRun.errorMessages}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p className="text-muted">Select a scrape run to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScrapeHistory;

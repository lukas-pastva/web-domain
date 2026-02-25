import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, scraperApi, DomainStats, ScraperStatus } from '../api/client';

function Dashboard() {
  const [stats, setStats] = useState<DomainStats | null>(null);
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const [statsRes, statusRes] = await Promise.all([
        domainsApi.getStats(),
        scraperApi.getStatus(),
      ]);
      setStats(statsRes.data);
      setScraperStatus(statusRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    try {
      setTriggering(true);
      const res = await scraperApi.trigger();
      setMessage({ type: res.data.success ? 'success' : 'error', text: res.data.message });
      setTimeout(fetchData, 2000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to trigger scrape' });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <button className="btn btn-primary" onClick={handleTrigger} disabled={triggering || scraperStatus?.scraper?.isRunning}>
          {triggering ? 'Starting...' : scraperStatus?.scraper?.isRunning ? 'Scraping...' : 'Run Scrape Now'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: message.type === 'success' ? 'var(--success)' : 'var(--error)', color: 'white'
        }}>
          {message.text}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" onClick={() => navigate('/domains')} style={{ cursor: 'pointer' }}>
          <h3>Total Domains</h3>
          <div className="value">{stats?.totalDomains ?? '-'}</div>
          <div className="subtitle">{stats?.activeDomains ?? 0} active</div>
        </div>
        <div className="stat-card">
          <h3>Subdomains</h3>
          <div className="value">{stats?.totalSubdomains ?? '-'}</div>
          <div className="subtitle">discovered</div>
        </div>
        <div className="stat-card">
          <h3>DNS Records</h3>
          <div className="value">{stats?.totalDnsRecords ?? '-'}</div>
          <div className="subtitle">stored</div>
        </div>
        <div className="stat-card">
          <h3>Screenshots</h3>
          <div className="value">{stats?.totalScreenshots ?? '-'}</div>
          <div className="subtitle">captured</div>
        </div>
      </div>

      {/* Scraper Status */}
      {scraperStatus && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Scraper Status</h2>

          {scraperStatus.scraper.isRunning && (
            <div style={{
              padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Scraping: {scraperStatus.scraper.currentDomain || 'Initializing...'}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Progress: {scraperStatus.scraper.progress.current}/{scraperStatus.scraper.progress.total} domains |
                WHOIS: {scraperStatus.scraper.stats.whoisLookups} |
                DNS: {scraperStatus.scraper.stats.dnsLookups} |
                Subdomains: {scraperStatus.scraper.stats.subdomainsFound} |
                Screenshots: {scraperStatus.scraper.stats.screenshotsTaken}
              </div>
              {/* Progress bar */}
              <div style={{
                width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '0.75rem'
              }}>
                <div style={{
                  width: `${scraperStatus.scraper.progress.total > 0
                    ? (scraperStatus.scraper.progress.current / scraperStatus.scraper.progress.total) * 100 : 0}%`,
                  height: '100%', background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.3s'
                }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {scraperStatus.scheduler.schedulers.map(s => (
              <div key={s.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: '6px'
              }}>
                <span style={{ fontWeight: 500 }}>
                  {s.key === 'default' ? 'Default Schedule' : `Config #${s.configId}`}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {s.isRunning ? (
                    <span className="badge badge-warning">Running</span>
                  ) : s.nextRunAt ? (
                    <>Next: {new Date(s.nextRunAt).toLocaleString()}</>
                  ) : 'Idle'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

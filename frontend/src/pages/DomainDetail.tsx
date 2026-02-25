import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { domainsApi, scraperApi, DomainDetail as DomainDetailType } from '../api/client';

function DomainDetail() {
  const { id } = useParams<{ id: string }>();
  const [domain, setDomain] = useState<DomainDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'whois' | 'dns' | 'subdomains' | 'screenshots'>('whois');
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchDomain = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await domainsApi.getById(parseInt(id));
      setDomain(res.data);
    } catch (error) {
      console.error('Failed to fetch domain:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomain();
  }, [id]);

  const handleScrape = async () => {
    if (!domain) return;
    try {
      await scraperApi.triggerDomain(domain.id);
      setTimeout(fetchDomain, 5000);
    } catch (error) {
      console.error('Failed to trigger scrape:', error);
    }
  };

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!domain) return <div className="empty-state">Domain not found</div>;

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : 'N/A';

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/domains')} style={{ marginBottom: '0.5rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <h1>{domain.name}</h1>
          {domain.notes && <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{domain.notes}</p>}
        </div>
        <button className="btn btn-primary" onClick={handleScrape}>Scrape Now</button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <h3>Subdomains</h3>
          <div className="value">{domain.subdomains.length}</div>
          <div className="subtitle">{domain.subdomains.filter(s => s.active).length} active</div>
        </div>
        <div className="stat-card">
          <h3>DNS Records</h3>
          <div className="value">{domain.dnsRecords.length}</div>
        </div>
        <div className="stat-card">
          <h3>Screenshots</h3>
          <div className="value">{domain.screenshots.length}</div>
        </div>
        <div className="stat-card">
          <h3>Last Scraped</h3>
          <div className="value" style={{ fontSize: '1rem' }}>{domain.lastScrapedAt ? new Date(domain.lastScrapedAt).toLocaleDateString() : 'Never'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['whois', 'dns', 'subdomains', 'screenshots'] as const).map(tab => (
          <button key={tab} className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'dns' && ` (${domain.dnsRecords.length})`}
            {tab === 'subdomains' && ` (${domain.subdomains.length})`}
            {tab === 'screenshots' && ` (${domain.screenshots.length})`}
          </button>
        ))}
      </div>

      {/* WHOIS Tab */}
      {activeTab === 'whois' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>WHOIS Information</h2>
          {domain.latestInfo ? (
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Registrar</span>
                <div>{domain.latestInfo.registrar || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Registrant</span>
                <div>{domain.latestInfo.registrant || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Created</span>
                <div>{formatDate(domain.latestInfo.creationDate)}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Expires</span>
                <div style={{ color: domain.latestInfo.expiryDate && new Date(domain.latestInfo.expiryDate) < new Date(Date.now() + 30 * 86400000) ? 'var(--error)' : undefined }}>
                  {formatDate(domain.latestInfo.expiryDate)}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Updated</span>
                <div>{formatDate(domain.latestInfo.updatedDate)}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Status</span>
                <div style={{ fontSize: '0.85rem' }}>{domain.latestInfo.status || 'N/A'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Name Servers</span>
                <div style={{ fontSize: '0.85rem' }}>{domain.latestInfo.nameServers || 'N/A'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Scraped At</span>
                <div style={{ fontSize: '0.85rem' }}>{formatDate(domain.latestInfo.scrapedAt)}</div>
              </div>
              {domain.latestInfo.rawWhois && (
                <details style={{ gridColumn: '1 / -1' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }}>Raw WHOIS</summary>
                  <pre style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', overflow: 'auto', maxHeight: '400px', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                    {domain.latestInfo.rawWhois}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <p className="text-muted">No WHOIS data yet. Run a scrape to fetch it.</p>
          )}
        </div>
      )}

      {/* DNS Tab */}
      {activeTab === 'dns' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>DNS Records</h2>
          {domain.dnsRecords.length === 0 ? (
            <p className="text-muted">No DNS records yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>TTL</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {domain.dnsRecords.map(record => (
                    <tr key={record.id}>
                      <td><span className="badge badge-info">{record.type}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{record.name}</td>
                      <td style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{record.value}</td>
                      <td>{record.ttl ?? '-'}</td>
                      <td>{record.priority ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subdomains Tab */}
      {activeTab === 'subdomains' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Subdomains</h2>
          {domain.subdomains.length === 0 ? (
            <p className="text-muted">No subdomains discovered yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subdomain</th>
                    <th>IP</th>
                    <th>Active</th>
                    <th>First Seen</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {domain.subdomains.map(sub => (
                    <tr key={sub.id}>
                      <td style={{ fontWeight: 500 }}>{sub.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{sub.ip || '-'}</td>
                      <td>
                        <span className={`badge ${sub.active ? 'badge-success' : 'badge-warning'}`}>
                          {sub.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{new Date(sub.firstSeenAt).toLocaleDateString()}</td>
                      <td style={{ fontSize: '0.85rem' }}>{new Date(sub.lastSeenAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Screenshots Tab */}
      {activeTab === 'screenshots' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Screenshots</h2>
          {domain.screenshots.length === 0 ? (
            <p className="text-muted">No screenshots yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {domain.screenshots.map(ss => (
                <div key={ss.id} style={{
                  background: 'var(--bg-primary)', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                  border: '1px solid var(--border)'
                }} onClick={() => setSelectedScreenshot(ss.localPath)}>
                  <img src={`/api/images/${ss.localPath}`} alt={ss.url}
                    style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div style={{ padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ss.url}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                      <span className={`badge ${ss.type === 'domain' ? 'badge-info' : 'badge-success'}`}>{ss.type}</span>
                      {ss.httpStatus && <span>HTTP {ss.httpStatus}</span>}
                      <span>{new Date(ss.capturedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screenshot Lightbox */}
      {selectedScreenshot && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '2rem'
        }} onClick={() => setSelectedScreenshot(null)}>
          <img src={`/api/images/${selectedScreenshot}`} alt="Screenshot"
            style={{ maxWidth: '90%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export default DomainDetail;

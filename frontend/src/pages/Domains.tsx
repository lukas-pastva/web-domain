import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, scraperApi, Domain } from '../api/client';

function Domains() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const fetchDomains = async () => {
    try {
      setLoading(true);
      const res = await domainsApi.getAll();
      setDomains(res.data);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    try {
      await domainsApi.create({ name: newDomain.trim(), notes: newNotes.trim() || undefined });
      setNewDomain('');
      setNewNotes('');
      setShowAddModal(false);
      setMessage({ type: 'success', text: 'Domain added successfully' });
      fetchDomains();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to add domain' });
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await domainsApi.delete(id);
      setMessage({ type: 'success', text: 'Domain deleted' });
      fetchDomains();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete domain' });
    }
  };

  const handleToggleActive = async (domain: Domain, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await domainsApi.update(domain.id, { active: !domain.active });
      fetchDomains();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update domain' });
    }
  };

  const handleScrape = async (domainId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await scraperApi.triggerDomain(domainId);
      setMessage({ type: 'success', text: 'Scrape started for domain' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to trigger scrape' });
    }
  };

  if (loading) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Domains ({domains.length})</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Add Domain</button>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: message.type === 'success' ? 'var(--success)' : 'var(--error)', color: 'white'
        }}>
          {message.text}
        </div>
      )}

      {domains.length === 0 ? (
        <div className="empty-state">
          <p>No domains yet. Add your first domain to start monitoring.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Domain</th>
                  <th>Active</th>
                  <th>Subdomains</th>
                  <th>DNS</th>
                  <th>Screenshots</th>
                  <th>Last Scraped</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {domains.map(domain => (
                  <tr key={domain.id} onClick={() => navigate(`/domains/${domain.id}`)}
                    style={{ cursor: 'pointer' }}>
                    <td style={{ width: '80px', padding: '0.5rem' }}>
                      {domain.latestScreenshotPath ? (
                        <img
                          src={`/api/images/${domain.latestScreenshotPath}`}
                          alt={domain.name}
                          style={{
                            width: '64px', height: '48px', objectFit: 'cover',
                            borderRadius: '4px', border: '1px solid var(--border)',
                            display: 'block',
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '64px', height: '48px', borderRadius: '4px',
                          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--text-muted)', fontSize: '0.6rem',
                        }}>
                          No img
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: 'var(--accent)' }}>
                        {domain.name}
                      </span>
                      {domain.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{domain.notes}</div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${domain.active ? 'badge-success' : 'badge-warning'}`}
                        onClick={(e) => handleToggleActive(domain, e)}
                        style={{ cursor: 'pointer' }}
                      >
                        {domain.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{domain.subdomainCount ?? 0}</td>
                    <td>{domain.dnsRecordCount ?? 0}</td>
                    <td>{domain.screenshotCount ?? 0}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {domain.lastScrapedAt ? new Date(domain.lastScrapedAt).toLocaleString() : 'Never'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-sm btn-primary" onClick={(e) => handleScrape(domain.id, e)} title="Scrape now">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={(e) => handleDelete(domain.id, e)} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Domain Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Domain</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddModal(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Domain Name</label>
                <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
                  placeholder="example.com" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Domains;

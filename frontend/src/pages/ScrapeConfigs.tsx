import { useState, useEffect } from 'react';
import { scrapeConfigsApi, domainsApi, scraperApi, ScrapeConfig, Domain } from '../api/client';

function ScrapeConfigs() {
  const [configs, setConfigs] = useState<ScrapeConfig[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ScrapeConfig | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    name: '', enabled: true, intervalMinutes: 60,
    enableWhois: true, enableDns: true, enableSubdomains: true, enableScreenshots: true,
    domainIds: '', dnsRecordTypes: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configsRes, domainsRes] = await Promise.all([
        scrapeConfigsApi.getAll(),
        domainsApi.getAll(),
      ]);
      setConfigs(configsRes.data);
      setDomains(domainsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreateModal = () => {
    setEditingConfig(null);
    setForm({
      name: '', enabled: true, intervalMinutes: 60,
      enableWhois: true, enableDns: true, enableSubdomains: true, enableScreenshots: true,
      domainIds: '', dnsRecordTypes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (config: ScrapeConfig) => {
    setEditingConfig(config);
    setForm({
      name: config.name, enabled: config.enabled, intervalMinutes: config.intervalMinutes,
      enableWhois: config.enableWhois, enableDns: config.enableDns,
      enableSubdomains: config.enableSubdomains, enableScreenshots: config.enableScreenshots,
      domainIds: config.domainIds || '', dnsRecordTypes: config.dnsRecordTypes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingConfig) {
        await scrapeConfigsApi.update(editingConfig.id, form);
        setMessage({ type: 'success', text: 'Config updated' });
      } else {
        await scrapeConfigsApi.create(form);
        setMessage({ type: 'success', text: 'Config created' });
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save config' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await scrapeConfigsApi.delete(id);
      setMessage({ type: 'success', text: 'Config deleted' });
      fetchData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete config' });
    }
  };

  const handleTrigger = async (configId: number) => {
    try {
      const res = await scraperApi.trigger(configId);
      setMessage({ type: res.data.success ? 'success' : 'error', text: res.data.message });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to trigger scrape' });
    }
  };

  if (loading) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Scrape Configurations</h1>
        <button className="btn btn-primary" onClick={openCreateModal}>New Config</button>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: message.type === 'success' ? 'var(--success)' : 'var(--error)', color: 'white'
        }}>{message.text}</div>
      )}

      {configs.length === 0 ? (
        <div className="empty-state">
          <p>No scrape configs yet. The default schedule will scrape all active domains. Create a config for custom schedules.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {configs.map(config => (
            <div key={config.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginBottom: '0.5rem' }}>
                    {config.name}
                    <span className={`badge ${config.enabled ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '0.5rem' }}>
                      {config.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <span>Interval: {config.intervalMinutes} min</span>
                    <span>WHOIS: {config.enableWhois ? 'Yes' : 'No'}</span>
                    <span>DNS: {config.enableDns ? 'Yes' : 'No'}</span>
                    <span>Subdomains: {config.enableSubdomains ? 'Yes' : 'No'}</span>
                    <span>Screenshots: {config.enableScreenshots ? 'Yes' : 'No'}</span>
                  </div>
                  {config.domainIds && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Domains: {config.domainIds.split(',').map(id => {
                        const d = domains.find(dom => dom.id === parseInt(id.trim()));
                        return d?.name || `#${id.trim()}`;
                      }).join(', ')}
                    </div>
                  )}
                  {config.lastRunAt && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Last run: {new Date(config.lastRunAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => handleTrigger(config.id)} title="Run now">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(config)} title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(config.id)} title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{editingConfig ? 'Edit Config' : 'New Config'}</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowModal(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My scrape config" />
              </div>
              <div className="form-group">
                <label>Interval (minutes)</label>
                <input type="number" value={form.intervalMinutes} onChange={e => setForm({ ...form, intervalMinutes: parseInt(e.target.value) || 60 })} />
              </div>
              <div className="form-group">
                <label>Domain IDs (comma-separated, leave empty for all)</label>
                <input type="text" value={form.domainIds} onChange={e => setForm({ ...form, domainIds: e.target.value })} placeholder="1,2,3" />
                <small style={{ color: 'var(--text-muted)' }}>
                  Available: {domains.map(d => `${d.id}=${d.name}`).join(', ')}
                </small>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                {[
                  { key: 'enabled', label: 'Enabled' },
                  { key: 'enableWhois', label: 'WHOIS' },
                  { key: 'enableDns', label: 'DNS' },
                  { key: 'enableSubdomains', label: 'Subdomains' },
                  { key: 'enableScreenshots', label: 'Screenshots' },
                ].map(item => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form[item.key as keyof typeof form] as boolean}
                      onChange={e => setForm({ ...form, [item.key]: e.target.checked })}
                      style={{ width: 'auto', minHeight: 'auto' }} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScrapeConfigs;

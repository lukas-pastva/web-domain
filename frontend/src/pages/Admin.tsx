import { useState, useEffect } from 'react';
import { settingsApi, scrapeConfigsApi, scraperApi, domainsApi, Setting, ScrapeConfig, Domain } from '../api/client';

const SETTING_LABELS: Record<string, { label: string; unit?: string; type: 'number' | 'text' | 'boolean' }> = {
  scrape_interval_min: { label: 'Scrape interval min', unit: 'min', type: 'number' },
  scrape_interval_max: { label: 'Scrape interval max', unit: 'min', type: 'number' },
  screenshot_width: { label: 'Screenshot width', unit: 'px', type: 'number' },
  screenshot_height: { label: 'Screenshot height', unit: 'px', type: 'number' },
  screenshot_timeout: { label: 'Screenshot timeout', unit: 'ms', type: 'number' },
  delay_between_domains_min: { label: 'Delay between domains min', unit: 'ms', type: 'number' },
  delay_between_domains_max: { label: 'Delay between domains max', unit: 'ms', type: 'number' },
  whois_timeout: { label: 'WHOIS timeout', unit: 'ms', type: 'number' },
  dns_record_types: { label: 'DNS record types', type: 'text' },
  max_subdomains_per_domain: { label: 'Max subdomains', type: 'number' },
  screenshot_subdomains: { label: 'Screenshot subdomains', type: 'boolean' },
  cleanup_days: { label: 'Cleanup after', unit: 'days', type: 'number' },
};

function Admin() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [configs, setConfigs] = useState<ScrapeConfig[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ScrapeConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    name: '', enabled: true, intervalMinutes: 60,
    enableWhois: true, enableDns: true, enableSubdomains: true, enableScreenshots: true,
    domainIds: '', dnsRecordTypes: '',
  });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [settingsRes, configsRes, domainsRes] = await Promise.all([
        settingsApi.getAll(),
        scrapeConfigsApi.getAll(),
        domainsApi.getAll(),
      ]);
      setSettings(settingsRes.data);
      const values: Record<string, string> = {};
      settingsRes.data.forEach(s => { values[s.key] = s.value; });
      setEditedValues(values);
      setConfigs(configsRes.data);
      setDomains(domainsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSettingChange = (key: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const updates = Object.entries(editedValues).map(([key, value]) => ({ key, value: String(value) }));
      await settingsApi.updateBulk(updates);
      setMessage({ type: 'success', text: 'Settings saved' });
      await fetchAll();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => settings.some(s => editedValues[s.key] !== s.value);

  const openCreateConfig = () => {
    setEditingConfig(null);
    setConfigForm({
      name: '', enabled: true, intervalMinutes: 60,
      enableWhois: true, enableDns: true, enableSubdomains: true, enableScreenshots: true,
      domainIds: '', dnsRecordTypes: '',
    });
    setShowConfigModal(true);
  };

  const openEditConfig = (config: ScrapeConfig) => {
    setEditingConfig(config);
    setConfigForm({
      name: config.name, enabled: config.enabled, intervalMinutes: config.intervalMinutes,
      enableWhois: config.enableWhois, enableDns: config.enableDns,
      enableSubdomains: config.enableSubdomains, enableScreenshots: config.enableScreenshots,
      domainIds: config.domainIds || '', dnsRecordTypes: config.dnsRecordTypes || '',
    });
    setShowConfigModal(true);
  };

  const handleSaveConfig = async () => {
    try {
      if (editingConfig) {
        await scrapeConfigsApi.update(editingConfig.id, configForm);
      } else {
        await scrapeConfigsApi.create(configForm);
      }
      setShowConfigModal(false);
      setMessage({ type: 'success', text: editingConfig ? 'Config updated' : 'Config created' });
      fetchAll();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save config' });
    }
  };

  const handleDeleteConfig = async (id: number) => {
    try {
      await scrapeConfigsApi.delete(id);
      setMessage({ type: 'success', text: 'Config deleted' });
      fetchAll();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete config' });
    }
  };

  const handleTriggerConfig = async (configId: number) => {
    try {
      const res = await scraperApi.trigger(configId);
      setMessage({ type: res.data.success ? 'success' : 'error', text: res.data.message });
    } catch {
      setMessage({ type: 'error', text: 'Failed to trigger scrape' });
    }
  };

  const handleTriggerAll = async () => {
    try {
      const res = await scraperApi.trigger();
      setMessage({ type: res.data.success ? 'success' : 'error', text: res.data.message });
    } catch {
      setMessage({ type: 'error', text: 'Failed to trigger scrape' });
    }
  };

  if (loading) return <div className="empty-state">Loading...</div>;

  const renderSetting = (setting: Setting) => {
    const config = SETTING_LABELS[setting.key] || { label: setting.key, type: 'text' };
    const isBoolean = config.type === 'boolean';
    const boolValue = editedValues[setting.key] === 'true';

    return (
      <div key={setting.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '32px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500, minWidth: '180px' }}>{config.label}</span>
        {isBoolean ? (
          <div onClick={() => handleSettingChange(setting.key, boolValue ? 'false' : 'true')}
            style={{
              width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer', position: 'relative',
              background: boolValue ? 'var(--accent)' : 'var(--bg-tertiary)', transition: 'background 0.2s', flexShrink: 0,
            }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute',
              top: '2px', left: boolValue ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }} />
          </div>
        ) : (
          <input
            type={config.type === 'number' ? 'number' : 'text'}
            value={editedValues[setting.key] || ''}
            onChange={e => handleSettingChange(setting.key, e.target.value)}
            style={{
              padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem',
              width: config.type === 'number' ? '90px' : '200px'
            }}
          />
        )}
        {config.unit && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{config.unit}</span>}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>Admin</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleTriggerAll}>Run Scrape</button>
          <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving || !hasChanges()}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem',
          background: message.type === 'success' ? 'var(--success)' : 'var(--error)', color: 'white'
        }}>{message.text}</div>
      )}

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        {/* Settings */}
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {settings.map(renderSetting)}
          </div>
        </div>

        {/* Scrape Configs */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>Scrape Configs</h3>
            <button className="btn btn-sm btn-primary" onClick={openCreateConfig}>New</button>
          </div>
          {configs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No custom configs. Default schedule scrapes all active domains.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {configs.map(config => (
                <div key={config.id} style={{
                  padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)', fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{config.name}</span>
                      <span className={`badge ${config.enabled ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                        {config.enabled ? 'On' : 'Off'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{config.intervalMinutes}min</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleTriggerConfig(config.id)} title="Run">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEditConfig(config)} title="Edit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteConfig(config.id)} title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {[
                      config.enableWhois && 'WHOIS',
                      config.enableDns && 'DNS',
                      config.enableSubdomains && 'Subs',
                      config.enableScreenshots && 'Screenshots',
                    ].filter(Boolean).join(' · ')}
                    {config.domainIds && ` · Domains: ${config.domainIds.split(',').map(id => {
                      const d = domains.find(dom => dom.id === parseInt(id.trim()));
                      return d?.name || `#${id.trim()}`;
                    }).join(', ')}`}
                    {config.lastRunAt && ` · Last: ${new Date(config.lastRunAt).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{editingConfig ? 'Edit Config' : 'New Config'}</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowConfigModal(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={configForm.name} onChange={e => setConfigForm({ ...configForm, name: e.target.value })} placeholder="Config name" />
              </div>
              <div className="form-group">
                <label>Interval (minutes)</label>
                <input type="number" value={configForm.intervalMinutes} onChange={e => setConfigForm({ ...configForm, intervalMinutes: parseInt(e.target.value) || 60 })} />
              </div>
              <div className="form-group">
                <label>Domain IDs (comma-separated, empty = all)</label>
                <input type="text" value={configForm.domainIds} onChange={e => setConfigForm({ ...configForm, domainIds: e.target.value })} placeholder="1,2,3" />
                <small style={{ color: 'var(--text-muted)' }}>
                  {domains.map(d => `${d.id}=${d.name}`).join(', ')}
                </small>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                {[
                  { key: 'enabled', label: 'Enabled' },
                  { key: 'enableWhois', label: 'WHOIS' },
                  { key: 'enableDns', label: 'DNS' },
                  { key: 'enableSubdomains', label: 'Subdomains' },
                  { key: 'enableScreenshots', label: 'Screenshots' },
                ].map(item => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={configForm[item.key as keyof typeof configForm] as boolean}
                      onChange={e => setConfigForm({ ...configForm, [item.key]: e.target.checked })}
                      style={{ width: 'auto', minHeight: 'auto' }} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfigModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveConfig}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;

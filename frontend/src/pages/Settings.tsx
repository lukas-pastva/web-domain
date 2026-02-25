import { useState, useEffect } from 'react';
import { settingsApi, Setting } from '../api/client';

const SETTING_LABELS: Record<string, { label: string; unit?: string; type: 'number' | 'text' | 'boolean'; help: string }> = {
  scrape_interval_min: { label: 'Scrape interval minimum', unit: 'minutes', type: 'number', help: 'Minimum time between automatic scraper runs' },
  scrape_interval_max: { label: 'Scrape interval maximum', unit: 'minutes', type: 'number', help: 'Maximum time between automatic scraper runs' },
  screenshot_width: { label: 'Screenshot width', unit: 'px', type: 'number', help: 'Browser viewport width for screenshots' },
  screenshot_height: { label: 'Screenshot height', unit: 'px', type: 'number', help: 'Browser viewport height for screenshots' },
  screenshot_timeout: { label: 'Screenshot timeout', unit: 'ms', type: 'number', help: 'Page load timeout for screenshots' },
  delay_between_domains_min: { label: 'Delay between domains (min)', unit: 'ms', type: 'number', help: 'Minimum delay between scraping each domain' },
  delay_between_domains_max: { label: 'Delay between domains (max)', unit: 'ms', type: 'number', help: 'Maximum delay between scraping each domain' },
  whois_timeout: { label: 'WHOIS timeout', unit: 'ms', type: 'number', help: 'Timeout for WHOIS lookups' },
  dns_record_types: { label: 'DNS record types', type: 'text', help: 'Comma-separated list of DNS record types to query' },
  max_subdomains_per_domain: { label: 'Max subdomains per domain', type: 'number', help: 'Maximum number of subdomains to discover per domain' },
  screenshot_subdomains: { label: 'Screenshot subdomains', type: 'boolean', help: 'Also take screenshots of discovered subdomains' },
  cleanup_days: { label: 'Cleanup old data after', unit: 'days', type: 'number', help: 'Delete old scrape data older than this many days' },
};

function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.getAll();
      setSettings(res.data);
      const values: Record<string, string> = {};
      res.data.forEach(s => { values[s.key] = s.value; });
      setEditedValues(values);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleChange = (key: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const updates = Object.entries(editedValues).map(([key, value]) => ({ key, value: String(value) }));
      await settingsApi.updateBulk(updates);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      await fetchSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => settings.some(s => editedValues[s.key] !== s.value);

  if (loading) return <div className="empty-state">Loading...</div>;

  const schedulerSettings = settings.filter(s => s.key.includes('scrape_interval') || s.key.includes('delay'));
  const screenshotSettings = settings.filter(s => s.key.includes('screenshot'));
  const otherSettings = settings.filter(s =>
    !s.key.includes('scrape_interval') && !s.key.includes('delay') && !s.key.includes('screenshot')
  );

  const renderSetting = (setting: Setting) => {
    const config = SETTING_LABELS[setting.key] || { label: setting.key, type: 'text', help: '' };
    const isBoolean = config.type === 'boolean';
    const boolValue = editedValues[setting.key] === 'true';

    return (
      <div key={setting.key}>
        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
          {config.label}
        </label>
        {setting.description && (
          <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>{setting.description}</small>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isBoolean ? (
            <div onClick={() => handleChange(setting.key, boolValue ? 'false' : 'true')}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative',
                background: boolValue ? 'var(--accent)' : 'var(--bg-tertiary)', transition: 'background 0.2s'
              }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: 'white', position: 'absolute',
                top: '2px', left: boolValue ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
              }} />
            </div>
          ) : (
            <input
              type={config.type === 'number' ? 'number' : 'text'}
              value={editedValues[setting.key] || ''}
              onChange={e => handleChange(setting.key, e.target.value)}
              style={{
                padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                width: config.type === 'number' ? '120px' : '300px'
              }}
            />
          )}
          {config.unit && <span style={{ color: 'var(--text-muted)' }}>{config.unit}</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !hasChanges()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: message.type === 'success' ? 'var(--success)' : 'var(--error)', color: 'white'
        }}>{message.text}</div>
      )}

      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Scheduler & Delays</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {schedulerSettings.map(renderSetting)}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Screenshot Settings</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {screenshotSettings.map(renderSetting)}
          </div>
        </div>
      </div>

      {otherSettings.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Other Settings</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {otherSettings.map(renderSetting)}
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;

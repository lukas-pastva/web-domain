import { useState, useRef, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';
import DomainDetail from './pages/DomainDetail';
import ScrapeConfigs from './pages/ScrapeConfigs';
import ScrapeHistory from './pages/ScrapeHistory';
import Settings from './pages/Settings';
import './styles/App.css';

function ThemeToggle() {
  const { mode, cycleTheme } = useTheme();

  const labels: Record<string, string> = {
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
    ocean: 'Ocean',
  };

  return (
    <button
      className="theme-toggle"
      onClick={cycleTheme}
      title={`Theme: ${labels[mode]} (click to change)`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
      </svg>
      <span className="theme-toggle-label">{labels[mode]}</span>
    </button>
  );
}

function AdminDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isAdminRoute = location.pathname === '/settings' || location.pathname.startsWith('/scrape-configs');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <div className="nav-dropdown" ref={dropdownRef}>
      <button
        className={`nav-link nav-dropdown-trigger ${isAdminRoute ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        Admin
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: '0.25rem', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="nav-dropdown-menu">
          <NavLink to="/scrape-configs" className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}>
            Scrape Configs
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}>
            Settings
          </NavLink>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="container navbar-content">
          <div className="navbar-brand">
            <span className="logo">Domain</span>
            <span className="logo-accent">Monitor</span>
          </div>
          <div className="navbar-links">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Dashboard
            </NavLink>
            <NavLink to="/domains" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Domains
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              History
            </NavLink>
            <AdminDropdown />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/domains" element={<Domains />} />
            <Route path="/domains/:id" element={<DomainDetail />} />
            <Route path="/scrape-configs" element={<ScrapeConfigs />} />
            <Route path="/history" element={<ScrapeHistory />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;

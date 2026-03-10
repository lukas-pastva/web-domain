import { Routes, Route, NavLink } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';
import Domains from './pages/Domains';
import DomainDetail from './pages/DomainDetail';
import Admin from './pages/Admin';
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
              Domains
            </NavLink>
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Admin
            </NavLink>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div className="container">
          <Routes>
            <Route path="/" element={<Domains />} />
            <Route path="/domains/:id" element={<DomainDetail />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;

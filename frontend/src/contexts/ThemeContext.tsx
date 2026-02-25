import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeMode = 'auto' | 'light' | 'dark' | 'ocean';

interface ThemeContextType {
  mode: ThemeMode;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ mode: 'auto', cycleTheme: () => {} });

const MODES: ThemeMode[] = ['auto', 'light', 'dark', 'ocean'];

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    return (saved as ThemeMode) || 'auto';
  });

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
    const theme = mode === 'auto' ? getSystemTheme() : mode;
    document.documentElement.setAttribute('data-theme', theme);
  }, [mode]);

  const cycleTheme = () => {
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  return (
    <ThemeContext.Provider value={{ mode, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

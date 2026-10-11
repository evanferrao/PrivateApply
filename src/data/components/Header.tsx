import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, RefreshCw, Download, Upload,
  Database, GitBranch, TrendingUp, Share2,
  ChevronDown, Sun, Moon,
} from 'lucide-react';

export type TabId = 'profile' | 'graph' | 'rl' | 'relationships';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabs: TabDef[];
  onRefresh: () => void;
  onExport: (format: 'json' | 'csv-answers' | 'csv-patterns') => void;
  onImport: () => void;
  isRefreshing?: boolean;
}

export function Header({
  activeTab,
  onTabChange,
  tabs,
  onRefresh,
  onExport,
  onImport,
  isRefreshing,
}: HeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleDarkMode = () => {
    const nextDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', nextDark);
    setIsDark(nextDark);
    try {
      localStorage.setItem('ofl-dark-mode', nextDark ? 'dark' : 'light');
    } catch (_) {}
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="de-header">
      {/* Left: back + title */}
      <div className="de-header-left">
        <a href="../home/home.html" className="de-back-btn" title="Back to Home">
          <ChevronLeft size={14} />
        </a>
        <div className="de-title-group">
          <div className="de-title">Data Explorer</div>
          <div className="de-subtitle">Private Apply</div>
        </div>
      </div>

      {/* Center: tabs */}
      <nav className="de-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`de-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="de-tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Right: actions */}
      <div className="de-header-right">
        <button
          className="btn btn-icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh data"
          style={isRefreshing ? { animation: 'spin 0.7s linear infinite' } : undefined}
        >
          <RefreshCw size={13} />
        </button>

        {/* Export dropdown */}
        <div className="de-dropdown" ref={exportRef}>
          <button
            className="btn"
            onClick={() => setExportOpen(o => !o)}
            title="Export data"
          >
            <Download size={13} />
            Export
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          {exportOpen && (
            <div className="de-dropdown-menu">
              <button className="de-dropdown-item" onClick={() => { onExport('json'); setExportOpen(false); }}>
                <Database size={13} />
                Full Export (JSON)
              </button>
              <div className="de-dropdown-divider" />
              <button className="de-dropdown-item" onClick={() => { onExport('csv-answers'); setExportOpen(false); }}>
                <GitBranch size={13} />
                Answers (CSV)
              </button>
              <button className="de-dropdown-item" onClick={() => { onExport('csv-patterns'); setExportOpen(false); }}>
                <TrendingUp size={13} />
                RL Patterns (CSV)
              </button>
            </div>
          )}
        </div>

        <button
          className="btn"
          onClick={onImport}
          title="Import data"
        >
          <Upload size={13} />
          Import
        </button>

        <button
          className="btn btn-icon"
          onClick={toggleDarkMode}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle dark mode"
          style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </header>
  );
}

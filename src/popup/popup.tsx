import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './components/Dashboard';
import { OpenItem }  from './components/OpenItem';
import { History }   from './components/History';
import { Settings }  from './components/Settings';
import { Login }     from './components/Login';
import { useAuth }   from '../cloud/useAuth';
import { authService } from '../cloud/authService';
import './index.css';

type Tab = 'dashboard' | 'open-item' | 'history' | 'settings';
const TABS = [
  { id: 'dashboard' as Tab, label: 'Generate',  icon: '📄' },
  { id: 'open-item' as Tab, label: 'Open Item', icon: '🔍' },
  { id: 'history'   as Tab, label: 'History',   icon: '📋' },
  { id: 'settings'  as Tab, label: 'Settings',  icon: '⚙️' },
];

export const Popup: React.FC = () => {
  const { loading, user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const version = chrome.runtime?.getManifest?.().version ?? '';

  if (loading) {
    return (
      <div className="w-[400px] min-h-[520px] flex items-center justify-center bg-white text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) return <Login />;

  // Signed in but no team profile (e.g. signed in with a provider that didn't
  // go through team sign-up). Can't scope catalogs without a team.
  if (!profile) {
    return (
      <div className="w-[400px] min-h-[520px] flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-sm font-medium text-gray-700">Your account isn’t linked to a team yet.</p>
        <p className="text-[11px] text-gray-500">Sign out and use “New Team” or “Join Team” with email &amp; password to set one up.</p>
        <button onClick={() => authService.signOut()}
          className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="w-[400px] min-h-[520px] flex flex-col bg-white select-none">
      <header className="bg-gradient-to-r from-blue-700 to-blue-500 px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-sm tracking-wide">🛒 Catalog Generator</h1>
          <p className="text-blue-200 text-[10px]">{profile?.displayName ?? user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {version && <span className="text-blue-100 text-[10px] font-mono bg-blue-800/40 px-1.5 py-0.5 rounded">v{version}</span>}
          <button onClick={() => authService.signOut()} title="Sign out"
            className="text-blue-100 hover:text-white text-[10px] bg-blue-800/40 hover:bg-blue-800/70 px-1.5 py-0.5 rounded transition-colors">
            Sign out
          </button>
        </div>
      </header>
      <nav className="flex bg-gray-50 border-b border-gray-200">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-[10px] font-medium flex flex-col items-center gap-0.5 transition-all ${activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="text-[14px] leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'open-item' && <OpenItem />}
        {activeTab === 'history'   && <History />}
        {activeTab === 'settings'  && <Settings />}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) createRoot(container).render(<React.StrictMode><Popup /></React.StrictMode>);
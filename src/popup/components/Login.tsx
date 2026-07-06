// Login / account-creation screen shown when no rep is signed in.
import React, { useState } from 'react';
import { authService } from '../../cloud/authService';

type Mode = 'signin' | 'new-team' | 'join-team';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await authService.signIn(email, password);
      } else if (mode === 'new-team') {
        await authService.signUpNewTeam(email, password, displayName, teamName);
      } else {
        await authService.signUpJoinTeam(email, password, displayName, joinCode);
      }
      // On success the auth listener swaps the UI automatically.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="w-[400px] min-h-[520px] flex flex-col bg-white">
      <header className="bg-gradient-to-r from-blue-700 to-blue-500 px-4 py-3">
        <h1 className="text-white font-bold text-sm tracking-wide">🛒 Catalog Generator</h1>
        <p className="text-blue-200 text-[10px]">Sign in to access your team's catalogs</p>
      </header>

      <div className="flex border-b border-gray-200 text-[11px] font-medium">
        <TabBtn active={mode === 'signin'} onClick={() => setMode('signin')}>Sign In</TabBtn>
        <TabBtn active={mode === 'new-team'} onClick={() => setMode('new-team')}>New Team</TabBtn>
        <TabBtn active={mode === 'join-team'} onClick={() => setMode('join-team')}>Join Team</TabBtn>
      </div>

      <form onSubmit={submit} className="flex-1 p-4 flex flex-col gap-3">
        {mode !== 'signin' && (
          <div>
            <label className="text-[11px] font-medium text-gray-600">Your name</label>
            <input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              required autoComplete="name" placeholder="Jane Rep" />
          </div>
        )}

        {mode === 'new-team' && (
          <div>
            <label className="text-[11px] font-medium text-gray-600">Team / company name</label>
            <input className={input} value={teamName} onChange={(e) => setTeamName(e.target.value)}
              required placeholder="CodeLab" />
          </div>
        )}

        {mode === 'join-team' && (
          <div>
            <label className="text-[11px] font-medium text-gray-600">Team code</label>
            <input className={`${input} uppercase tracking-widest font-mono`} value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())} required
              maxLength={6} placeholder="ABC123" />
            <p className="text-[10px] text-gray-400 mt-1">Ask your team owner for this 6-character code.</p>
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-gray-600">Email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoComplete="email" placeholder="you@company.com" />
        </div>

        <div>
          <label className="text-[11px] font-medium text-gray-600">Password</label>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••" />
          {mode !== 'signin' && <p className="text-[10px] text-gray-400 mt-1">At least 6 characters.</p>}
        </div>

        {error && <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

        <button type="submit" disabled={busy}
          className="mt-1 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded transition-colors">
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : mode === 'new-team' ? 'Create Team' : 'Join Team'}
        </button>
      </form>
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`flex-1 py-2 transition-colors ${active ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}>
    {children}
  </button>
);

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return (err as Error)?.message || 'Something went wrong. Please try again.';
  }
}

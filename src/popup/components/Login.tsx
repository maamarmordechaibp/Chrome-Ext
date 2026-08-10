// Login screen shown when no rep is signed in. Sign-in only — accounts are
// provisioned by an admin on the admin web app, not created here.
import React, { useState } from 'react';
import { authService } from '../../cloud/authService';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authService.signIn(email, password);
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

      <form onSubmit={submit} className="flex-1 p-4 flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-medium text-gray-600">Email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoComplete="email" placeholder="you@company.com" />
        </div>

        <div>
          <label className="text-[11px] font-medium text-gray-600">Password</label>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required autoComplete="current-password" placeholder="••••••••" />
        </div>

        {error && <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

        <button type="submit" disabled={busy}
          className="mt-1 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded transition-colors">
          {busy ? 'Please wait…' : 'Sign In'}
        </button>

        <p className="text-[10px] text-gray-400 text-center mt-1">
          No account? Ask your administrator to create one for you.
        </p>
      </form>
    </div>
  );
};

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return (err as Error)?.message || 'Something went wrong. Please try again.';
  }
}

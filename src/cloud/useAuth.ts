// React hook exposing the current auth state + team profile to the UI.
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { authService } from './authService';
import type { UserProfile } from '../types';

export interface AuthState {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, profile: null });

  useEffect(() => {
    return authService.onChange(async (user) => {
      if (!user) {
        setState({ loading: false, user: null, profile: null });
        return;
      }
      const profile = await authService.getProfile(user.uid);
      setState({ loading: false, user, profile });
    });
  }, []);

  return state;
}

// React hook exposing the current auth state + team profile to the UI.
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { authService } from './authService';
import { session } from './session';
import { storageManager } from '../storage/StorageManager';
import type { Team, UserProfile } from '../types';

export interface AuthState {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
}

/** Applies the company's admin-set name + logo to this rep's PDF branding so
 *  catalogs are branded with the company automatically after sign-in. */
async function syncBrandingFromTeam(team: Team | null): Promise<void> {
  if (!team) return;
  const settings = await storageManager.getSettings();
  const next = { ...settings };
  if (team.name && team.name !== settings.companyName) next.companyName = team.name;
  if (team.logo && team.logo !== settings.companyLogo) {
    next.companyLogo = team.logo;
    next.showLogo = true;
  }
  if (next.companyName !== settings.companyName
    || next.companyLogo !== settings.companyLogo
    || next.showLogo !== settings.showLogo) {
    await storageManager.saveSettings(next);
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, profile: null });

  useEffect(() => {
    return authService.onChange(async (user) => {
      if (!user) {
        await session.setTeamId(null);
        setState({ loading: false, user: null, profile: null });
        return;
      }
      const profile = await authService.getProfile(user.uid);
      await session.setTeamId(profile?.teamId ?? null);
      setState({ loading: false, user, profile });
      if (profile?.teamId) {
        const team = await authService.getTeam(profile.teamId);
        await syncBrandingFromTeam(team);
      }
    });
  }, []);

  return state;
}

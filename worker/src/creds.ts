// Per-company delivery credentials (Resend + SignalWire), stored in the
// Firestore collection team_secrets/{teamId}. Clients can never read this
// collection (firestore.rules deny it); only the Worker's service account,
// whose reads bypass rules, loads it here to override the global defaults.
import type { Env } from './index';
import { getDoc } from './firestore';
import type { EmailOverrides } from './email';
import type { FaxOverrides } from './fax';

export interface TeamSecrets {
  emailFrom?: string;
  resendApiKey?: string;
  signalwireProjectId?: string;
  signalwireSpace?: string;
  signalwireFaxFrom?: string;
  signalwireToken?: string;
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};

/** Loads a team's saved credentials, or an empty object when none are set. */
export async function loadTeamSecrets(env: Env, teamId?: string): Promise<TeamSecrets> {
  if (!teamId) return {};
  try {
    const doc = await getDoc(env, 'team_secrets', teamId);
    if (!doc) return {};
    return {
      emailFrom: str(doc.emailFrom),
      resendApiKey: str(doc.resendApiKey),
      signalwireProjectId: str(doc.signalwireProjectId),
      signalwireSpace: str(doc.signalwireSpace),
      signalwireFaxFrom: str(doc.signalwireFaxFrom),
      signalwireToken: str(doc.signalwireToken),
    };
  } catch {
    return {};
  }
}

export function emailOverrides(s: TeamSecrets): EmailOverrides {
  return { from: s.emailFrom, apiKey: s.resendApiKey };
}

export function faxOverrides(s: TeamSecrets): FaxOverrides {
  return {
    space: s.signalwireSpace,
    projectId: s.signalwireProjectId,
    token: s.signalwireToken,
    faxFrom: s.signalwireFaxFrom,
  };
}

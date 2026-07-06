// Caches the signed-in rep's teamId in chrome.storage.local so non-React modules
// (StorageManager, background worker) can scope cloud data without importing the
// auth React hook. Set on login, cleared on logout.
const TEAM_KEY = 'session.teamId';

export const session = {
  async setTeamId(teamId: string | null): Promise<void> {
    return new Promise((resolve) => {
      if (teamId) chrome.storage.local.set({ [TEAM_KEY]: teamId }, () => resolve());
      else chrome.storage.local.remove(TEAM_KEY, () => resolve());
    });
  },

  async getTeamId(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(TEAM_KEY, (d) => resolve((d[TEAM_KEY] as string) ?? null));
    });
  },
};

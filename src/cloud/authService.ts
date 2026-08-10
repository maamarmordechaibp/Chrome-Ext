// Authentication + team membership on top of Firebase.
//
// A representative signs in with email/password. Their profile (users/{uid})
// records which team they belong to, so all catalog data can be scoped to that
// team — any rep on the team can look up any catalog the team created.
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { logUsage } from './faxService';
import type { UserProfile, Team } from '../types';

export const authService = {
  /** Subscribe to sign-in state. Fires with the Firebase user or null. */
  onChange(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, cb);
  },

  currentUser(): User | null {
    return auth.currentUser;
  },

  async getProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  },

  async getTeam(teamId: string): Promise<Team | null> {
    const snap = await getDoc(doc(db, 'teams', teamId));
    return snap.exists() ? (snap.data() as Team) : null;
  },

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    void logUsage('logins');
  },

  async signOut(): Promise<void> {
    await fbSignOut(auth);
  },
};

// Authentication + team membership on top of Firebase.
//
// A representative signs in with email/password. Their profile (users/{uid})
// records which team they belong to, so all catalog data can be scoped to that
// team — any rep on the team can look up any catalog the team created.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { UserProfile, Team } from '../types';

/** Six-character, easy-to-read join code (no ambiguous chars). */
function makeJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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
  },

  async signOut(): Promise<void> {
    await fbSignOut(auth);
  },

  /** Creates a brand-new team and its owner account. */
  async signUpNewTeam(
    email: string, password: string, displayName: string, teamName: string,
  ): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName });

    const teamId = crypto.randomUUID();
    const team: Team = {
      id: teamId,
      name: teamName.trim(),
      joinCode: makeJoinCode(),
      ownerUid: uid,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'teams', teamId), team);

    const profile: UserProfile = {
      uid, email: email.trim(), displayName: displayName.trim(),
      teamId, role: 'owner', createdAt: Date.now(),
    };
    await setDoc(doc(db, 'users', uid), profile);
  },

  /** Creates a rep account that joins an existing team via its join code. */
  async signUpJoinTeam(
    email: string, password: string, displayName: string, joinCode: string,
  ): Promise<void> {
    // Find the team by its join code before creating the account.
    const teamsQ = query(
      collection(db, 'teams'),
      where('joinCode', '==', joinCode.trim().toUpperCase()),
      limit(1),
    );
    const teamSnap = await getDocs(teamsQ);
    if (teamSnap.empty) throw new Error('Invalid team code. Check with your team owner.');
    const teamId = teamSnap.docs[0].id;

    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName });

    const profile: UserProfile = {
      uid, email: email.trim(), displayName: displayName.trim(),
      teamId, role: 'member', createdAt: Date.now(),
    };
    await setDoc(doc(db, 'users', uid), profile);
  },
};

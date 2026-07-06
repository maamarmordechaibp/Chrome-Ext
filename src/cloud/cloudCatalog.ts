// Team-scoped catalog storage in Firestore (free Spark plan — no Cloud Storage).
//
// Only the catalog *record* is stored in the cloud: metadata, item mappings
// (item number -> product URL) and a small thumbnail. Heavy assets are NOT
// uploaded — PDFs are regenerated on demand and full product images are
// re-fetched from their saved marketplace URLs. This keeps documents well under
// Firestore's 1 MB limit and avoids the paid Storage plan.
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { session } from './session';
import type { CatalogRecord } from '../types';

function catalogsCol(teamId: string) {
  return collection(db, 'teams', teamId, 'catalogs');
}

/** Firestore rejects `undefined` field values; strip them before writing. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const cloudCatalog = {
  /** True when a rep is signed in and we know their team. */
  async isEnabled(): Promise<boolean> {
    return (await session.getTeamId()) !== null;
  },

  async save(record: CatalogRecord): Promise<void> {
    const teamId = await session.getTeamId();
    if (!teamId) return; // Not signed in / no team — cloud sync is a no-op.
    await setDoc(doc(catalogsCol(teamId), record.id), clean({ ...record }));
  },

  async list(): Promise<CatalogRecord[]> {
    const teamId = await session.getTeamId();
    if (!teamId) return [];
    const snap = await getDocs(query(catalogsCol(teamId), orderBy('generationDate', 'desc')));
    return snap.docs.map((d) => d.data() as CatalogRecord);
  },

  async get(id: string): Promise<CatalogRecord | undefined> {
    const teamId = await session.getTeamId();
    if (!teamId) return undefined;
    const snap = await getDoc(doc(catalogsCol(teamId), id));
    return snap.exists() ? (snap.data() as CatalogRecord) : undefined;
  },

  async remove(id: string): Promise<void> {
    const teamId = await session.getTeamId();
    if (!teamId) return;
    await deleteDoc(doc(catalogsCol(teamId), id));
  },
};

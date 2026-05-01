import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UserDocShape {
  email?: string;
  displayName?: string;
  activeBrandId?: string;
  apiKeys?: { anthropic?: string; metaGraph?: string };
}

export function useUserDoc(uid: string | null): { data: UserDocShape | null; loading: boolean } {
  const [data, setData] = useState<UserDocShape | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) { setData(null); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setData((snap.data() as UserDocShape) ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);
  return { data, loading };
}

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Post } from '../../../shared/schemas/post';

export interface PublishedPostWithId extends Post {
  id: string;
}

export interface UsePublishedPosts {
  posts: PublishedPostWithId[];
  loading: boolean;
  error: string | null;
}

export function usePublishedPosts(brandId: string | null): UsePublishedPosts {
  const [posts, setPosts] = useState<PublishedPostWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid || !brandId) {
      setPosts([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        const items: PublishedPostWithId[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Post),
        }));
        setPosts(items);
        setLoading(false);
      },
      (err: FirestoreError) => {
        if (cancelled) return;
        setError(
          err.code === 'permission-denied'
            ? 'Statistiken konnten nicht geladen werden (permission denied).'
            : err.code === 'failed-precondition'
              ? 'Firestore-Index fehlt. Migration evtl. nicht angewendet.'
              : 'Statistiken konnten nicht geladen werden: ' + err.message,
        );
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid, brandId]);

  return { posts, loading, error };
}

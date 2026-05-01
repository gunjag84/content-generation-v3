import { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../lib/firebase';
import { uploadPhoto } from '../lib/uploadPhoto';

export interface PhotoPoolItem {
  id: string;
  storagePath: string;
  downloadUrl: string;
  label: string;
  createdAt: Timestamp | null;
}

export interface UsePhotoPool {
  photos: PhotoPoolItem[];
  loading: boolean;
  upload: (file: File, label: string) => Promise<PhotoPoolItem>;
  remove: (id: string) => Promise<void>;
  updateLabel: (id: string, label: string) => Promise<void>;
}

export function usePhotoPool(brandId: string | null): UsePhotoPool {
  const [photos, setPhotos] = useState<PhotoPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid || !brandId) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const col = collection(db, 'users', uid, 'brands', brandId, 'photos');
    const q = query(col, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items: PhotoPoolItem[] = snap.docs.map((d) => {
        const data = d.data() as Omit<PhotoPoolItem, 'id'>;
        return {
          id: d.id,
          storagePath: data.storagePath,
          downloadUrl: data.downloadUrl,
          label: data.label,
          createdAt: data.createdAt ?? null,
        };
      });
      setPhotos(items);
      setLoading(false);
    });
    return () => unsub();
  }, [uid, brandId]);

  async function upload(file: File, label: string): Promise<PhotoPoolItem> {
    if (!uid || !brandId) throw new Error('No active brand');
    const { url, path } = await uploadPhoto(file, uid, brandId, 'photos');
    const col = collection(db, 'users', uid, 'brands', brandId, 'photos');
    const ref = await addDoc(col, {
      storagePath: path,
      downloadUrl: url,
      label,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, storagePath: path, downloadUrl: url, label, createdAt: null };
  }

  async function remove(id: string): Promise<void> {
    if (!uid || !brandId) throw new Error('No active brand');
    const item = photos.find((p) => p.id === id);
    if (item) {
      try {
        await deleteObject(storageRef(storage, item.storagePath));
      } catch (err) {
        console.warn('storage delete failed (continuing):', err);
      }
    }
    await deleteDoc(doc(db, 'users', uid, 'brands', brandId, 'photos', id));
  }

  async function updateLabel(id: string, label: string): Promise<void> {
    if (!uid || !brandId) throw new Error('No active brand');
    await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'photos', id), { label });
  }

  return { photos, loading, upload, remove, updateLabel };
}

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { resizeToMaxWidth } from './resizeImage';

export interface UploadOptions {
  resize?: boolean;
  maxWidth?: number;
}

export async function uploadPhoto(
  file: File,
  uid: string,
  brandId: string,
  subpath?: string,
  options: UploadOptions = {},
): Promise<{ url: string; path: string }> {
  const { resize = true, maxWidth = 1080 } = options;
  const sub = subpath && subpath.length > 0 ? subpath : 'photos';
  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `users/${uid}/brands/${brandId}/${sub}/${id}.jpg`;
  const blob = resize ? await resizeToMaxWidth(file, maxWidth) : file;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

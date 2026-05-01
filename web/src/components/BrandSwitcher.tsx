import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useUserDoc } from '../auth/useUserDoc';

interface BrandRow { id: string; name: string; }

export function BrandSwitcher() {
  const user = useAuthStore((s) => s.user);
  const { data: userDoc } = useUserDoc(user?.uid ?? null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'brands'), (snap) => {
      setBrands(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '(unbenannt)' })));
    });
    return () => unsub();
  }, [user]);
  if (!user || brands.length === 0) return null;
  return (
    <select
      value={userDoc?.activeBrandId ?? brands[0].id}
      onChange={async (e) => {
        await setDoc(doc(db, 'users', user.uid), { activeBrandId: e.target.value }, { merge: true });
      }}
      className="border rounded px-2 py-1 text-sm"
      aria-label="Marke wählen"
    >
      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

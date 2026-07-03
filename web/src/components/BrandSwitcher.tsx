import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useUserDoc } from '../auth/useUserDoc';
import { BrandSetupWizard } from './BrandSetupWizard';

interface BrandRow { id: string; name: string; }

export function BrandSwitcher() {
  const user = useAuthStore((s) => s.user);
  const { data: userDoc } = useUserDoc(user?.uid ?? null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'brands'), (snap) => {
      setBrands(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '(unbenannt)' })));
    });
    return () => unsub();
  }, [user]);

  if (!user || brands.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <select
        value={userDoc?.activeBrandId ?? brands[0].id}
        onChange={async (e) => {
          await setDoc(doc(db, 'users', user.uid), { activeBrandId: e.target.value }, { merge: true });
        }}
        className="border border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-800 text-zinc-100"
        aria-label="Marke wählen"
      >
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-800"
        aria-label="Neue Marke anlegen"
        title="Neue Marke anlegen"
      >+</button>
      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <header>
              <h2 className="text-lg font-semibold text-zinc-100">Neue Marke anlegen</h2>
            </header>
            <BrandSetupWizard
              uid={user.uid}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

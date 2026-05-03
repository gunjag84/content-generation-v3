import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { api } from '../lib/api';

interface Props {
  uid: string;
  userEmail: string;
  userDisplayName: string | null;
  existingActiveBrandId?: string;
}

export function OnboardingModal({ uid, userEmail, userDisplayName, existingActiveBrandId }: Props) {
  const [brandName, setBrandName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState<'idle' | 'saving' | 'retry-key'>('idle');
  const [savedBrandId, setSavedBrandId] = useState<string | null>(existingActiveBrandId ?? null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = brandName.trim().length >= 1 && apiKey.startsWith('sk-');

  async function executeSteps1to3(): Promise<string> {
    // Step 1: user doc
    await setDoc(doc(db, 'users', uid), {
      email: userEmail,
      displayName: userDisplayName ?? userEmail,
      createdAt: serverTimestamp(),
    }, { merge: true });
    // Step 2: brand doc with auto-id (D-21)
    const brandRef = doc(collection(db, 'users', uid, 'brands'));
    await setDoc(brandRef, { name: brandName.trim(), createdAt: serverTimestamp() });
    // Step 3: activeBrandId on user doc
    await setDoc(doc(db, 'users', uid), { activeBrandId: brandRef.id }, { merge: true });
    return brandRef.id;
  }

  async function executeStep4(): Promise<void> {
    const res = await api('/api/settings/api-keys', {
      method: 'POST',
      body: JSON.stringify({ anthropic: apiKey }),
    });
    if (!res.ok) throw new Error(`API key save failed: ${res.status}`);
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setStep('saving');
    try {
      let brandId = savedBrandId;
      if (!brandId) brandId = await executeSteps1to3();
      setSavedBrandId(brandId);
      await executeStep4();
      // Success: AuthGuard re-snapshot will detect apiKeys.anthropic + activeBrandId and unmount this modal.
    } catch {
      if (savedBrandId) {
        setStep('retry-key');
        setError('API-Schlüssel konnte nicht gespeichert werden. Bitte erneut versuchen.');
      } else {
        setStep('idle');
        setError('Marke konnte nicht angelegt werden. Bitte erneut versuchen.');
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-8 space-y-6">
        <header>
          <h2 className="text-xl font-semibold">Willkommen bei Content-Generation</h2>
          <p className="text-sm text-gray-600 mt-1">Zwei Eingaben und du bist startklar.</p>
        </header>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Markenname</label>
            <input type="text" required value={brandName} onChange={(e) => setBrandName(e.target.value)}
              placeholder="z. B. Meine Marke" disabled={!!savedBrandId}
              className="mt-1 w-full border rounded px-3 py-2" />
            <p className="text-xs text-gray-500 mt-1">Du kannst später weitere Marken anlegen.</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Anthropic API-Schlüssel</label>
            <input type="password" required value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..." className="mt-1 w-full border rounded px-3 py-2" />
            <p className="text-xs text-gray-500 mt-1">
              Hol dir deinen Schlüssel auf{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
                 className="underline">console.anthropic.com</a>{' '}(öffnet in neuem Tab).
            </p>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={!canSubmit || step === 'saving'}
            className="w-full bg-black text-white rounded px-4 py-2 disabled:opacity-40">
            {step === 'saving' ? 'Speichere…' : 'Loslegen'}
          </button>
        </form>
        <div className="text-right">
          <button onClick={() => signOut(auth)} className="text-xs text-gray-500 hover:underline">Abmelden</button>
        </div>
      </div>
    </div>
  );
}

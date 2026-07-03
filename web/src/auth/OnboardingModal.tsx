import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { api } from '../lib/api';
import { BrandSetupWizard } from '../components/BrandSetupWizard';
import { useUserDoc } from './useUserDoc';

interface Props {
  uid: string;
  userEmail: string;
  userDisplayName: string | null;
  existingActiveBrandId?: string;
}

export function OnboardingModal({ uid, userEmail, userDisplayName }: Props) {
  // Live snapshot — once apiKeys.anthropic + activeBrandId are both set,
  // AuthGuard unmounts this modal automatically. We re-read here so the
  // wizard is shown immediately after the key step succeeds.
  const { data: userDoc } = useUserDoc(uid);
  const hasAnthropic = !!userDoc?.apiKeys?.anthropic;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg w-full max-w-md p-8 space-y-6">
        <header>
          <h2 className="text-xl font-semibold text-zinc-100">Willkommen bei Content-Generation</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {hasAnthropic
              ? 'Lege deine erste Marke an.'
              : 'Anthropic API-Schlüssel und erste Marke einrichten.'}
          </p>
        </header>

        {!hasAnthropic ? (
          <AnthropicKeyStep uid={uid} userEmail={userEmail} userDisplayName={userDisplayName} />
        ) : (
          <BrandSetupWizard uid={uid} onDone={() => { /* AuthGuard re-snapshot unmounts */ }} />
        )}

        <div className="text-right">
          <button onClick={() => signOut(auth)} className="text-xs text-zinc-400 hover:underline">
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

function AnthropicKeyStep({
  uid,
  userEmail,
  userDisplayName,
}: {
  uid: string;
  userEmail: string;
  userDisplayName: string | null;
}) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = apiKey.startsWith('sk-') && apiKey.length >= 20;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!canSubmit || saving) return;
    setError(null);
    setSaving(true);
    try {
      // Ensure user-doc exists before the API key write. The /api-keys
      // endpoint merges into it but we keep the email + displayName fresh.
      await setDoc(
        doc(db, 'users', uid),
        {
          email: userEmail,
          displayName: userDisplayName ?? userEmail,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      const res = await api('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify({ anthropic: apiKey }),
      });
      if (!res.ok) throw new Error(`API key save failed: ${res.status}`);
      // useUserDoc snapshot will flip hasAnthropic and reveal the wizard.
    } catch {
      setSaving(false);
      setError('API-Schlüssel konnte nicht gespeichert werden. Bitte erneut versuchen.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300">Anthropic API-Schlüssel</label>
        <input
          type="password"
          required
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 bg-zinc-800 text-zinc-100"
        />
        <p className="text-xs text-zinc-400 mt-1">
          Hol dir deinen Schlüssel auf{' '}
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-cyan-400 hover:text-cyan-300"
          >
            console.anthropic.com
          </a>{' '}
          (öffnet in neuem Tab).
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={!canSubmit || saving}
        className="w-full bg-black text-white rounded px-4 py-2 disabled:opacity-40"
      >
        {saving ? 'Speichere…' : 'Weiter'}
      </button>
    </form>
  );
}

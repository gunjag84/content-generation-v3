import { useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';

// Multi-brand migration (2026-05-06): shared wizard for both add-brand
// (BrandSwitcher) and initial onboarding (OnboardingModal). Steps:
//   name -> ig (skippable) -> identity (skippable) -> done
//
// Abandon paths: every step persists what it has so far. Even the bare
// step='name' submit creates the brand-doc + sets activeBrandId so the
// AuthGuard gate passes. Missing IG/identity surface as Settings banners,
// not forced re-entry.

export interface BrandSetupWizardProps {
  uid: string;
  // Caller invoked from add-brand flow; the user already passed AuthGuard,
  // and the parent presents this wizard inside its own modal/host.
  onDone: (brandId: string) => void;
  // Cancel handler; null for the onboarding case (user is gated until done).
  onCancel?: () => void;
}

type Step = 'name' | 'ig' | 'identity' | 'done';

interface IgState {
  token: string;
  igUserId: string;
  saving: boolean;
  error: string | null;
}

interface IdentityState {
  voice: string;
  persona: string;
  saving: boolean;
  error: string | null;
}

export function BrandSetupWizard({ uid, onDone, onCancel }: BrandSetupWizardProps) {
  const [step, setStep] = useState<Step>('name');
  const [brandId, setBrandId] = useState<string | null>(null);

  // Step 1: name
  const [name, setName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmitName(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim() || nameSaving) return;
    setNameError(null);
    setNameSaving(true);
    try {
      const brandRef = doc(collection(db, 'users', uid, 'brands'));
      await setDoc(brandRef, { name: name.trim(), createdAt: serverTimestamp() });
      await setDoc(doc(db, 'users', uid), { activeBrandId: brandRef.id }, { merge: true });
      setBrandId(brandRef.id);
      setStep('ig');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
    } finally {
      setNameSaving(false);
    }
  }

  // Step 2: ig
  const [ig, setIg] = useState<IgState>({ token: '', igUserId: '', saving: false, error: null });

  async function handleSubmitIg(ev: React.FormEvent) {
    ev.preventDefault();
    if (!brandId || ig.saving) return;
    if (ig.token.length < 20 || !/^\d{5,30}$/.test(ig.igUserId)) return;
    setIg((p) => ({ ...p, saving: true, error: null }));
    try {
      const res = await api('/api/settings/brand-ig', {
        method: 'POST',
        body: JSON.stringify({ brandId, token: ig.token, igUserId: ig.igUserId }),
      });
      const body = (await res.json().catch(() => ({}))) as
        | { ok: true; username?: string }
        | { ok: false; error?: string; step?: string };
      if (!res.ok || !body.ok) {
        const msg = ('error' in body && body.error) || `HTTP ${res.status}`;
        setIg((p) => ({ ...p, saving: false, error: msg }));
        return;
      }
      setIg((p) => ({ ...p, saving: false, error: null }));
      setStep('identity');
    } catch (err) {
      setIg((p) => ({
        ...p,
        saving: false,
        error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen',
      }));
    }
  }

  // Step 3: identity
  const [identity, setIdentity] = useState<IdentityState>({
    voice: '',
    persona: '',
    saving: false,
    error: null,
  });

  async function handleSubmitIdentity(ev: React.FormEvent) {
    ev.preventDefault();
    if (!brandId || identity.saving) return;
    setIdentity((p) => ({ ...p, saving: true, error: null }));
    try {
      await setDoc(
        doc(db, 'users', uid, 'brands', brandId),
        {
          identity: {
            voice: identity.voice.trim(),
            persona: identity.persona.trim(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setStep('done');
      onDone(brandId);
    } catch (err) {
      setIdentity((p) => ({
        ...p,
        saving: false,
        error: err instanceof Error ? err.message : 'Speichern fehlgeschlagen',
      }));
    }
  }

  function skipIg() {
    if (!brandId) return;
    setStep('identity');
  }

  function skipIdentity() {
    if (!brandId) return;
    setStep('done');
    onDone(brandId);
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === 'name' && (
        <form onSubmit={handleSubmitName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Markenname</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. LEBEN.LIEBEN"
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 bg-zinc-800 text-zinc-100"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Eine Marke ist ein eigener Workspace mit eigener Identität, Fotos und Instagram-Account.
            </p>
          </div>
          {nameError && <p className="text-sm text-red-400">{nameError}</p>}
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-zinc-300">
                Abbrechen
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim() || nameSaving}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
            >
              {nameSaving ? 'Speichere…' : 'Weiter'}
            </button>
          </div>
        </form>
      )}

      {step === 'ig' && (
        <form onSubmit={handleSubmitIg} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Instagram verbinden</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Meta Access Token + Instagram Business Account. Kannst du auch später in den Einstellungen pflegen.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Meta Access Token</label>
            <input
              type="password"
              value={ig.token}
              onChange={(e) => setIg((p) => ({ ...p, token: e.target.value }))}
              placeholder="EAA..."
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 text-sm bg-zinc-800 text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Instagram Business Account ID</label>
            <input
              type="text"
              value={ig.igUserId}
              onChange={(e) => setIg((p) => ({ ...p, igUserId: e.target.value }))}
              placeholder="17841..."
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 text-sm bg-zinc-800 text-zinc-100"
            />
          </div>
          {ig.error && <p className="text-sm text-red-400">{ig.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={skipIg} className="px-4 py-2 text-sm text-zinc-300">
              Später
            </button>
            <button
              type="submit"
              disabled={ig.token.length < 20 || !/^\d{5,30}$/.test(ig.igUserId) || ig.saving}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
            >
              {ig.saving ? 'Verbinde…' : 'Verbinden'}
            </button>
          </div>
        </form>
      )}

      {step === 'identity' && (
        <form onSubmit={handleSubmitIdentity} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Markenidentität</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Voice und Persona steuern später die Generierung. Optional – kann jederzeit nachgepflegt werden.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Voice</label>
            <textarea
              value={identity.voice}
              onChange={(e) => setIdentity((p) => ({ ...p, voice: e.target.value }))}
              placeholder="Wie spricht die Marke? (Tonalität, Stil)"
              rows={3}
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 text-sm bg-zinc-800 text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Persona</label>
            <textarea
              value={identity.persona}
              onChange={(e) => setIdentity((p) => ({ ...p, persona: e.target.value }))}
              placeholder="Wer steht hinter der Marke? Wer ist die Zielgruppe?"
              rows={3}
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 text-sm bg-zinc-800 text-zinc-100"
            />
          </div>
          {identity.error && <p className="text-sm text-red-400">{identity.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={skipIdentity} className="px-4 py-2 text-sm text-zinc-300">
              Später
            </button>
            <button
              type="submit"
              disabled={identity.saving}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
            >
              {identity.saving ? 'Speichere…' : 'Fertig'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="text-sm text-zinc-400">Marke angelegt. Du kannst loslegen.</div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'ig', label: 'Instagram' },
    { key: 'identity', label: 'Identität' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-xs text-zinc-400">
      {steps.map((s, idx) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              idx < currentIdx
                ? 'text-green-400'
                : idx === currentIdx
                  ? 'font-semibold text-zinc-100'
                  : 'text-zinc-500'
            }
          >
            {idx + 1}. {s.label}
          </span>
          {idx < steps.length - 1 && <span className="text-zinc-600">›</span>}
        </li>
      ))}
    </ol>
  );
}

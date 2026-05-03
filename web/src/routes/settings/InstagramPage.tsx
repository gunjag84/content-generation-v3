import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { api } from '../../lib/api';
import { useActiveBrand } from '../../store/activeBrand';
import {
  validateMetaToken,
  saveMetaToken,
  validateIgUserId,
  saveIgUserId,
} from '../../lib/instagramSettings';

export function InstagramPage() {
  const { uid, brandId } = useActiveBrand();

  // Section A state
  const [metaConfigured, setMetaConfigured] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [lastValidated, setLastValidated] = useState<{ name?: string; id?: string } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSavedAt, setTokenSavedAt] = useState<number | null>(null);

  // Section B state
  const [brandName, setBrandName] = useState<string | null>(null);
  const [currentIgUserId, setCurrentIgUserId] = useState<string | null>(null);
  const [igInput, setIgInput] = useState('');
  const [igValidating, setIgValidating] = useState(false);
  const [igUsername, setIgUsername] = useState<string | null>(null);
  const [igError, setIgError] = useState<string | null>(null);
  const [igSavedAt, setIgSavedAt] = useState<number | null>(null);

  async function refreshApiKeys() {
    try {
      const res = await api('/api/settings/api-keys');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { metaGraph: { configured: boolean } };
      setMetaConfigured(data.metaGraph.configured);
    } catch {
      setMetaConfigured(false);
    }
  }

  useEffect(() => {
    refreshApiKeys();
  }, []);

  useEffect(() => {
    if (!uid || !brandId) return;
    let alive = true;
    getDoc(doc(db, 'users', uid, 'brands', brandId)).then((snap) => {
      if (!alive) return;
      const data = snap.data();
      setBrandName(data?.name ?? null);
      setCurrentIgUserId(data?.instagramUserId ?? null);
    });
    return () => {
      alive = false;
    };
  }, [uid, brandId]);

  async function handleTokenConnect() {
    setTokenError(null);
    setLastValidated(null);
    setValidating(true);
    try {
      const result = await validateMetaToken(tokenInput);
      if (!result.ok) {
        setTokenError(result.error);
        return;
      }
      setLastValidated({ name: result.name, id: result.id });
      await saveMetaToken(tokenInput);
      setTokenSavedAt(Date.now());
      setTokenInput('');
      await refreshApiKeys();
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Fehler beim Verbinden');
    } finally {
      setValidating(false);
    }
  }

  async function handleIgConnect() {
    if (!brandId) return;
    setIgError(null);
    setIgUsername(null);
    setIgValidating(true);
    try {
      const result = await validateIgUserId(brandId, igInput);
      if (!result.ok) {
        setIgError(result.error);
        return;
      }
      setIgUsername(result.username);
      await saveIgUserId(brandId, igInput);
      setCurrentIgUserId(igInput);
      setIgSavedAt(Date.now());
      setIgInput('');
    } catch (err) {
      setIgError(err instanceof Error ? err.message : 'Fehler beim Verbinden');
    } finally {
      setIgValidating(false);
    }
  }

  const igButtonDisabled =
    !metaConfigured || igInput.length < 5 || !/^\d+$/.test(igInput) || !brandId || igValidating;

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Instagram</h1>
        <p className="text-sm text-gray-500">
          Meta Access Token und Instagram Business Account konfigurieren.
        </p>
      </header>

      <section className="border border-gray-200 rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Meta Access Token</h2>
        <p className="text-sm text-gray-600">
          Status:{' '}
          {metaConfigured == null
            ? 'Lade ...'
            : metaConfigured
              ? <span className="text-green-700">konfiguriert</span>
              : <span className="text-amber-700">noch nicht konfiguriert</span>}
        </p>
        {lastValidated?.name && (
          <p className="text-sm text-green-700">Verbunden mit Page: {lastValidated.name}</p>
        )}
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="EAA..."
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTokenConnect}
            disabled={tokenInput.length < 20 || validating}
            className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Verbinden & speichern
          </button>
          {tokenError && <span className="text-sm text-red-600">{tokenError}</span>}
          {!tokenError && tokenSavedAt && <span className="text-sm text-green-600">Gespeichert</span>}
        </div>
      </section>

      <section className="border border-gray-200 rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Instagram Business Account</h2>
        {brandName && (
          <p className="text-sm text-gray-600">Aktive Brand: {brandName}</p>
        )}
        {currentIgUserId && (
          <p className="text-sm text-gray-600">Aktuell: {currentIgUserId}</p>
        )}
        {igUsername && (
          <p className="text-sm text-green-700">Verbunden mit @{igUsername}</p>
        )}
        <input
          type="text"
          value={igInput}
          onChange={(e) => setIgInput(e.target.value)}
          placeholder="17841..."
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleIgConnect}
            disabled={igButtonDisabled}
            className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Verbinden & speichern
          </button>
          {igError && <span className="text-sm text-red-600">{igError}</span>}
          {!igError && igSavedAt && <span className="text-sm text-green-600">Gespeichert</span>}
        </div>
        {!metaConfigured && metaConfigured !== null && (
          <p className="text-xs text-gray-500">Erst Meta Token oben konfigurieren.</p>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { saveBrandIgToken } from '../../lib/instagramSettings';
import type { IgFeedSyncStatusDoc } from '../../../../shared/schemas/post';

interface BrandShape {
  name?: string;
  instagramUserId?: string | null;
  metaGraphCiphertext?: string | null;
}

function relativeTime(ts: unknown): string | null {
  if (!ts) return null;
  let d: Date | null = null;
  if (ts instanceof Timestamp) d = ts.toDate();
  else if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    d = (ts as { toDate(): Date }).toDate();
  }
  if (!d) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `vor ${diffD} Tagen`;
}

function FeedSyncBanner({ status }: { status: IgFeedSyncStatusDoc | null }) {
  if (!status) return null;

  const ts = relativeTime(status.lastSync);

  // Token expired = blocking (no posts can be sync'd until re-auth).
  if (status.status === 'token_expired') {
    return (
      <div className="border border-red-300 bg-red-50 rounded p-3 text-sm text-red-900">
        <div className="font-semibold">Meta Token abgelaufen</div>
        <p className="mt-1">
          Verbinde den Account neu, sonst werden keine neuen IG-Posts mehr eingelesen.
        </p>
        {status.error && <p className="mt-1 text-xs text-red-700">{status.error}</p>}
      </div>
    );
  }

  // Token-expiry warning when < 7d left.
  if (
    typeof status.tokenExpiresInDays === 'number' &&
    status.tokenExpiresInDays >= 0 &&
    status.tokenExpiresInDays < 7
  ) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded p-3 text-sm text-amber-900">
        Meta Token läuft in {status.tokenExpiresInDays} Tag(en) ab. Bitte rechtzeitig neu verbinden.
      </div>
    );
  }

  if (status.status === 'rate_limited') {
    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded p-3 text-sm text-yellow-900">
        Meta Rate-Limit erreicht. Der nächste 6h-Sync versucht es erneut.
      </div>
    );
  }

  if (status.status === 'parse_error' || status.status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded p-3 text-sm text-red-800">
        IG-Feed-Sync fehlgeschlagen.
        {status.error && <span className="block text-xs mt-1">{status.error}</span>}
      </div>
    );
  }

  if (status.status === 'ok') {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded p-3 text-xs text-gray-600">
        IG-Feed-Sync OK. {typeof status.itemCount === 'number' ? `${status.itemCount} Posts` : ''}
        {ts ? ` · ${ts}` : ''}
      </div>
    );
  }

  if (status.status === 'syncing') {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded p-3 text-xs text-gray-600">
        IG-Feed-Sync läuft …
      </div>
    );
  }

  // not_configured: no banner (the fully-not-configured banner above
  // already covers this).
  return null;
}

export function InstagramPage() {
  const { uid, brandId } = useActiveBrand();

  const [brand, setBrand] = useState<BrandShape | null>(null);
  const [feedStatus, setFeedStatus] = useState<IgFeedSyncStatusDoc | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [igInput, setIgInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !brandId) return;
    const unsub = onSnapshot(doc(db, 'users', uid, 'brands', brandId), (snap) => {
      setBrand((snap.data() as BrandShape | undefined) ?? null);
    });
    return () => unsub();
  }, [uid, brandId]);

  useEffect(() => {
    if (!uid || !brandId) return;
    const unsub = onSnapshot(
      doc(db, 'users', uid, 'brands', brandId, 'igFeedSyncStatus', 'current'),
      (snap) => {
        setFeedStatus((snap.data() as IgFeedSyncStatusDoc | undefined) ?? null);
      },
    );
    return () => unsub();
  }, [uid, brandId]);

  const tokenConfigured = !!brand?.metaGraphCiphertext;
  const igConfigured = !!brand?.instagramUserId;
  const fullyConfigured = tokenConfigured && igConfigured;

  async function handleSave() {
    if (!brandId) return;
    if (tokenInput.length < 20 || !/^\d{5,30}$/.test(igInput)) return;
    setError(null);
    setSavedAt(null);
    setSavedUsername(null);
    setSaving(true);
    try {
      const result = await saveBrandIgToken(brandId, tokenInput, igInput);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedUsername(result.username ?? null);
      setSavedAt(Date.now());
      setTokenInput('');
      setIgInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Verbinden');
    } finally {
      setSaving(false);
    }
  }

  const buttonDisabled =
    !brandId || tokenInput.length < 20 || !/^\d{5,30}$/.test(igInput) || saving;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Instagram</h1>
        <p className="text-sm text-gray-500">
          Meta Access Token und Instagram Business Account pro Marke konfigurieren.
        </p>
      </header>

      {!fullyConfigured && (
        <div className="border border-amber-300 bg-amber-50 rounded p-3 text-sm text-amber-900">
          IG-Token fehlt für <span className="font-semibold">{brand?.name ?? 'diese Marke'}</span>.
          Bis du Token + Account-ID hinterlegst, kann diese Marke keine Posts veröffentlichen.
        </div>
      )}

      {fullyConfigured && <FeedSyncBanner status={feedStatus} />}

      <section className="border border-gray-200 rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Status</h2>
        {brand?.name && (
          <p className="text-sm text-gray-600">Aktive Marke: {brand.name}</p>
        )}
        <p className="text-sm text-gray-600">
          Meta Token:{' '}
          {tokenConfigured ? (
            <span className="text-green-700">konfiguriert</span>
          ) : (
            <span className="text-amber-700">fehlt</span>
          )}
        </p>
        <p className="text-sm text-gray-600">
          Instagram Account:{' '}
          {igConfigured ? (
            <span className="text-green-700">{brand?.instagramUserId}</span>
          ) : (
            <span className="text-amber-700">fehlt</span>
          )}
        </p>
      </section>

      <section className="border border-gray-200 rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">
          {fullyConfigured ? 'Account neu verbinden' : 'Account verbinden'}
        </h2>
        <p className="text-sm text-gray-600">
          Beide Felder gemeinsam validieren und speichern. Der Token wird KMS-verschlüsselt im
          Marken-Dokument abgelegt.
        </p>

        <div>
          <label className="block text-sm font-medium">Meta Access Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="EAA..."
            className="mt-1 w-full border border-gray-300 rounded p-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Instagram Business Account ID</label>
          <input
            type="text"
            value={igInput}
            onChange={(e) => setIgInput(e.target.value)}
            placeholder="17841..."
            className="mt-1 w-full border border-gray-300 rounded p-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={buttonDisabled}
            className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Verbinde…' : 'Verbinden & speichern'}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
          {!error && savedAt && (
            <span className="text-sm text-green-600">
              Gespeichert{savedUsername ? ` (@${savedUsername})` : ''}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function ApiKeysPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function refresh() {
    try {
      const res = await api('/api/settings/api-keys');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { anthropic: { configured: boolean } };
      setConfigured(data.anthropic.configured);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setError(null);
    try {
      const res = await api('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify({ anthropic: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
      setValue('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">API Keys</h1>
        <p className="text-sm text-zinc-400">
          Anthropic-Schlüssel zur Generierung. Wird verschlüsselt im Profil abgelegt.
        </p>
      </header>

      <section className="border border-zinc-700 rounded p-4 space-y-3">
        <h2 className="text-lg font-medium text-zinc-100">Anthropic</h2>
        <p className="text-sm text-zinc-300">
          Status:{' '}
          {configured == null
            ? 'Lade ...'
            : configured
              ? <span className="text-green-400">konfiguriert</span>
              : <span className="text-amber-400">noch nicht konfiguriert</span>}
        </p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!value.startsWith('sk-') || value.length < 20}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Speichern
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
          {!error && savedAt && <span className="text-sm text-green-400">Gespeichert</span>}
        </div>
      </section>

    </div>
  );
}

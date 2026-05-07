// Form fields for GenerateRequest inputs. Pure UI; the parent owns
// the brand/situations/methods data and the submit handler.
import { useEffect, useMemo, useState } from 'react';
import type { GenerateRequest } from '../../../../shared/schemas/generateRequest';
import type { LengthKey, MethodMode } from '../../../../shared/schemas/method';
import { PhotoPicker, type PickedPhoto } from './PhotoPicker';

export interface SituationOption {
  id: string;
  text: string;
}

export interface MethodOption {
  id: string;
  slug: string;
  name: string;
  mode: MethodMode;
  lengths: {
    short: { slideCount: number };
    medium: { slideCount: number };
    long: { slideCount: number };
  };
}

const LENGTHS: Array<{ value: LengthKey; label: string }> = [
  { value: 'short', label: 'Kurz' },
  { value: 'medium', label: 'Mittel' },
  { value: 'long', label: 'Lang' },
];

interface CreateFormProps {
  brandId: string;
  situations: SituationOption[];
  methods: MethodOption[];
  submitting: boolean;
  onSubmit: (req: GenerateRequest) => void;
  onCancel?: () => void;
}

const MODES: Array<{ value: MethodMode; label: string }> = [
  { value: 'create-demand', label: 'Create Demand' },
  { value: 'convert-demand', label: 'Convert Demand' },
];

export function CreateForm({
  brandId, situations, methods, submitting, onSubmit, onCancel,
}: CreateFormProps) {
  const [mode, setMode] = useState<MethodMode>('create-demand');
  const [methodSlug, setMethodSlug] = useState<string>('story');
  const [length, setLength] = useState<LengthKey>('medium');
  const [situationId, setSituationId] = useState<string | null>(null);
  const [situationText, setSituationText] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [author, setAuthor] = useState('');

  // Methods filtered by current mode.
  const filteredMethods = useMemo(
    () => methods.filter((m) => m.mode === mode),
    [methods, mode],
  );

  // When mode changes, reset methodSlug to first method of the new mode if current doesn't fit.
  useEffect(() => {
    const currentInMode = filteredMethods.some((m) => m.slug === methodSlug);
    if (!currentInMode && filteredMethods.length > 0) {
      setMethodSlug(filteredMethods[0].slug);
    }
  }, [mode, filteredMethods, methodSlug]);

  // slideCount comes from the selected method + chosen length.
  const selectedMethod = methods.find((m) => m.slug === methodSlug);
  const slideCount = selectedMethod?.lengths[length]?.slideCount ?? 7;

  // Prefill situationText when a stored situation is picked.
  useEffect(() => {
    if (!situationId) return;
    const s = situations.find((x) => x.id === situationId);
    if (s) setSituationText(s.text);
  }, [situationId, situations]);

  const situationError = situationText.trim().length < 10 ? 'Mindestens 10 Zeichen.' : null;

  const canSubmit = useMemo(
    () => !submitting && !situationError && !!selectedMethod,
    [submitting, situationError, selectedMethod],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const req: GenerateRequest = {
      brandId,
      mode,
      method: methodSlug,
      length,
      situationId,
      situationText: situationText.trim(),
      photos,
      ...(methodSlug === 'zitat' && author.trim() ? { author: author.trim() } : {}),
    };
    onSubmit(req);
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl">
      {/* Mode */}
      <div>
        <Label>Mode</Label>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`py-1.5 text-sm border ${
                mode === m.value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-500'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Method */}
      <div>
        <Label>Method</Label>
        {filteredMethods.length === 0 ? (
          <p className="mt-1 text-sm text-gray-400">Methoden werden initialisiert ...</p>
        ) : (
          <div className="grid grid-cols-4 gap-1 mt-1">
            {filteredMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethodSlug(m.slug)}
                className={`py-1.5 text-sm border ${
                  methodSlug === m.slug
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-700 hover:border-gray-500'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Length */}
      <div>
        <Label>Länge</Label>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {LENGTHS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLength(l.value)}
              className={`py-1.5 text-sm border ${
                length === l.value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-500'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Situation */}
      <div>
        <Label>Situation</Label>
        <select
          value={situationId ?? ''}
          onChange={(e) => setSituationId(e.target.value || null)}
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">Free text</option>
          {situations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.text.slice(0, 80)}
            </option>
          ))}
        </select>
        <textarea
          value={situationText}
          onChange={(e) => {
            setSituationText(e.target.value);
            // Editing the text drops the situation link.
            if (situationId) setSituationId(null);
          }}
          rows={4}
          placeholder="Situation beschreiben (>= 10 Zeichen)"
          className="mt-2 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
        {situationError && <p className="text-xs text-red-600 mt-1">{situationError}</p>}
      </div>

      {/* Photos */}
      <div>
        <Label>Photos</Label>
        <div className="mt-1">
          <PhotoPicker brandId={brandId} slideCount={slideCount} value={photos} onChange={setPhotos} />
        </div>
      </div>

      {/* Author (only zitat) */}
      {methodSlug === 'zitat' && (
        <div>
          <Label>Author (optional)</Label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {submitting ? 'Generiere…' : 'Generate'}
        </button>
        {submitting && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium uppercase tracking-wider text-gray-600">{children}</span>;
}

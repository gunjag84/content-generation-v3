// Form fields for GenerateRequest inputs. Pure UI; the parent owns
// the brand/situations/methods data and the submit handler.
import { useEffect, useMemo, useState } from 'react';
import type { GenerateRequest } from '../../../../shared/schemas/generateRequest';
import type { LengthKey, MethodMode } from '../../../../shared/schemas/method';
import { parseManualSlides } from '../../../../shared/lib/parseManualSlides';
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
  onSubmitManual: (req: GenerateRequest) => void;
  onCancel?: () => void;
}

const MODES: Array<{ value: MethodMode; label: string }> = [
  { value: 'create-demand', label: 'Create Demand' },
  { value: 'convert-demand', label: 'Convert Demand' },
];

export function CreateForm({
  brandId, situations, methods, submitting, onSubmit, onSubmitManual, onCancel,
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

  // Live parse to drive the "Detected: N slides" badge and the manual-button gate.
  const manualSlideCount = useMemo(() => {
    try {
      return parseManualSlides(situationText).slides.length;
    } catch {
      return 0;
    }
  }, [situationText]);

  const canSubmit = useMemo(
    () => !submitting && !situationError && !!selectedMethod,
    [submitting, situationError, selectedMethod],
  );
  const canSubmitManual = canSubmit && manualSlideCount > 0;

  function buildRequest(): GenerateRequest {
    return {
      brandId,
      mode,
      method: methodSlug,
      length,
      situationId,
      situationText: situationText.trim(),
      photos,
      ...(methodSlug === 'zitat' && author.trim() ? { author: author.trim() } : {}),
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(buildRequest());
  }

  function submitManual() {
    if (!canSubmitManual) return;
    onSubmitManual(buildRequest());
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
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
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
          <p className="mt-1 text-sm text-zinc-500">Methoden werden initialisiert ...</p>
        ) : (
          <div className="grid grid-cols-4 gap-1 mt-1">
            {filteredMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethodSlug(m.slug)}
                className={`py-1.5 text-sm border ${
                  methodSlug === m.slug
                    ? 'border-cyan-600 bg-cyan-600 text-white'
                    : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
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
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
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
          className="mt-1 w-full border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm"
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
          className="mt-2 w-full border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded px-2 py-1.5 text-sm"
        />
        {situationError && <p className="text-xs text-red-400 mt-1">{situationError}</p>}
        <p className="text-xs text-zinc-400 mt-1">
          Detected: {manualSlideCount} {manualSlideCount === 1 ? 'slide' : 'slides'}
          {manualSlideCount === 0 && ' (Format: "Slide 1: ...")'}
        </p>
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
            className="mt-1 w-full border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {submitting ? 'Generiere…' : 'Generate with AI'}
        </button>
        <button
          type="button"
          onClick={submitManual}
          disabled={!canSubmitManual}
          title={manualSlideCount === 0 ? 'Format: "Slide 1: ..."' : undefined}
          className="border border-cyan-500 text-cyan-400 px-4 py-2 rounded text-sm hover:bg-zinc-800 disabled:opacity-50 disabled:border-zinc-700 disabled:text-zinc-500"
        >
          Use my text
        </button>
        {submitting && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium uppercase tracking-wider text-zinc-400">{children}</span>;
}

// Form fields for the 8 GenerateRequestSchema inputs. Pure UI; the parent owns
// the brand/situations/methods data and the submit handler.
import { useEffect, useMemo, useState } from 'react';
import type { GenerateRequest } from '../../../../shared/schemas/generateRequest';
import type { FocusArea } from '../../../../shared/schemas/focusArea';
import { PhotoPicker, type PickedPhoto } from './PhotoPicker';

export interface SituationOption {
  id: string;
  text: string;
}

export interface MethodOption {
  id: string;
  slug: 'story' | 'liste' | 'vorher-nachher' | 'zitat';
  name: string;
}

interface CreateFormProps {
  brandId: string;
  focusAreas: FocusArea[];
  situations: SituationOption[];
  methods: MethodOption[];
  submitting: boolean;
  onSubmit: (req: GenerateRequest) => void;
  onCancel?: () => void;
}

const MODES = [
  { value: 'create-demand', label: 'Create Demand' },
  { value: 'convert-demand', label: 'Convert Demand' },
] as const;

export function CreateForm({
  brandId, focusAreas, situations, methods, submitting, onSubmit, onCancel,
}: CreateFormProps) {
  const [mode, setMode] = useState<GenerateRequest['mode']>('create-demand');
  const [methodSlug, setMethodSlug] = useState<MethodOption['slug']>('story');
  const [focusAreaId, setFocusAreaId] = useState<string | null>(null);
  const [situationId, setSituationId] = useState<string | null>(null);
  const [situationText, setSituationText] = useState('');
  const [slideCount, setSlideCount] = useState(7);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [author, setAuthor] = useState('');

  // Prefill situationText when a stored situation is picked.
  useEffect(() => {
    if (!situationId) return;
    const s = situations.find((x) => x.id === situationId);
    if (s) setSituationText(s.text);
  }, [situationId, situations]);

  const situationError = situationText.trim().length < 10 ? 'Mindestens 10 Zeichen.' : null;

  const canSubmit = useMemo(
    () => !submitting && !situationError && slideCount >= 1 && slideCount <= 10,
    [submitting, situationError, slideCount],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const req: GenerateRequest = {
      brandId,
      mode,
      method: methodSlug,
      focusAreaId,
      situationId,
      situationText: situationText.trim(),
      slideCount,
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
        <div className="grid grid-cols-4 gap-1 mt-1">
          {methods.map((m) => (
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
      </div>

      {/* Focus area */}
      <div>
        <Label>Focus Area</Label>
        <select
          value={focusAreaId ?? ''}
          onChange={(e) => setFocusAreaId(e.target.value || null)}
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">System pick</option>
          {focusAreas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
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

      {/* Slide count */}
      <div>
        <Label>Slides ({slideCount})</Label>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={slideCount}
          onChange={(e) => setSlideCount(parseInt(e.target.value, 10))}
          className="mt-1 w-full"
        />
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

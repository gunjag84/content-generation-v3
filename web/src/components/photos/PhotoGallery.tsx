// Settings sub-page UI: 4-col thumbnail grid with label edit + delete.
// Reads/writes via usePhotoPool; per-tile label is debounced 500ms.
import { useEffect, useRef, useState } from 'react';
import { usePhotoPool, type PhotoPoolItem } from '../../hooks/usePhotoPool';

interface PhotoGalleryProps {
  uid: string;
  brandId: string;
}

export function PhotoGallery({ brandId }: PhotoGalleryProps) {
  const { photos, loading, upload, remove, updateLabel } = usePhotoPool(brandId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        await upload(file, 'all');
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Photos</h1>
          <p className="text-sm text-zinc-400">Brand-spezifischer Foto-Pool für Generate.</p>
        </div>
        <label
          className={`px-3 py-1.5 rounded text-sm cursor-pointer ${
            uploading ? 'bg-zinc-800 text-zinc-500' : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
        >
          {uploading ? 'Lade hoch…' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={uploading}
            onChange={onFile}
            className="hidden"
          />
        </label>
      </header>

      {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}

      {loading && <p className="text-sm text-zinc-400">Lade Fotos…</p>}

      {!loading && photos.length === 0 && (
        <p className="text-sm text-zinc-400">No photos yet. Upload your first.</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((p) => (
            <PhotoTile
              key={p.id}
              photo={p}
              onLabelChange={(label) => updateLabel(p.id, label)}
              onDelete={() => {
                if (confirm('Foto löschen?')) void remove(p.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PhotoTileProps {
  photo: PhotoPoolItem;
  onLabelChange: (label: string) => void | Promise<void>;
  onDelete: () => void;
}

function PhotoTile({ photo, onLabelChange, onDelete }: PhotoTileProps) {
  const [label, setLabel] = useState(photo.label);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External-doc updates beat local edits unless the user is mid-typing.
  useEffect(() => {
    if (timer.current === null) setLabel(photo.label);
  }, [photo.label]);

  function commit(next: string) {
    setLabel(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void onLabelChange(next);
    }, 500);
  }

  return (
    <div className="border border-zinc-700 rounded overflow-hidden bg-zinc-900">
      <div
        className="aspect-square bg-zinc-800 bg-center bg-cover"
        style={{ backgroundImage: `url(${photo.downloadUrl})` }}
      />
      <div className="p-2 space-y-2">
        <input
          type="text"
          value={label}
          onChange={(e) => commit(e.target.value)}
          placeholder="label (z.B. all, 1, 2)"
          className="w-full border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={onDelete}
          className="w-full text-xs text-red-400 hover:underline"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

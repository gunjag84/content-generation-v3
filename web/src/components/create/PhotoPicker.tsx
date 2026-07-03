// Inline photo picker for the Create form. Sources from usePhotoPool, lets the user
// toggle photos in/out of the request and assign a per-photo label ('all' | '1'..N).
import { useMemo, useState } from 'react';
import { usePhotoPool } from '../../hooks/usePhotoPool';

export interface PickedPhoto {
  url: string;
  label: string;
}

interface PhotoPickerProps {
  brandId: string;
  slideCount: number;
  value: PickedPhoto[];
  onChange: (v: PickedPhoto[]) => void;
}

export function PhotoPicker({ brandId, slideCount, value, onChange }: PhotoPickerProps) {
  const { photos, loading, upload } = usePhotoPool(brandId);
  const [uploading, setUploading] = useState(false);

  const labelOptions = useMemo(() => {
    const opts = ['all'];
    for (let i = 1; i <= Math.max(1, slideCount); i++) opts.push(String(i));
    return opts;
  }, [slideCount]);

  const selectedByUrl = useMemo(() => {
    const map = new Map<string, PickedPhoto>();
    for (const p of value) map.set(p.url, p);
    return map;
  }, [value]);

  function toggle(url: string) {
    if (selectedByUrl.has(url)) {
      onChange(value.filter((p) => p.url !== url));
    } else {
      onChange([...value, { url, label: 'all' }]);
    }
  }

  function setLabel(url: string, label: string) {
    onChange(value.map((p) => (p.url === url ? { ...p, label } : p)));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const item = await upload(file, 'all');
        onChange([...value, { url: item.downloadUrl, label: 'all' }]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const overSelectedWarning =
    value.length > slideCount &&
    value.every((p) => p.label === 'all') &&
    `Du hast ${value.length} Fotos für ${slideCount} Slides ohne pro-Slide-Label gewählt.`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {value.length} ausgewählt {loading ? '· lade Pool…' : `· ${photos.length} im Pool`}
        </span>
        <label
          className={`px-2 py-1 rounded text-xs cursor-pointer ${
            uploading ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-700 text-white hover:bg-zinc-600'
          }`}
        >
          {uploading ? 'Upload…' : '+ Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={uploading}
            onChange={onUpload}
            className="hidden"
          />
        </label>
      </div>

      {photos.length === 0 && !loading && (
        <p className="text-xs text-zinc-400">No photos yet. Upload one to start.</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {photos.map((p) => {
            const picked = selectedByUrl.get(p.downloadUrl);
            return (
              <div key={p.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggle(p.downloadUrl)}
                  className={`relative block aspect-square w-full bg-center bg-cover border-2 ${
                    picked ? 'border-amber-500' : 'border-transparent hover:border-zinc-600'
                  }`}
                  style={{ backgroundImage: `url(${p.downloadUrl})` }}
                >
                  {picked && (
                    <span className="absolute inset-0 bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                      ✓
                    </span>
                  )}
                </button>
                {picked && (
                  <select
                    value={picked.label}
                    onChange={(e) => setLabel(p.downloadUrl, e.target.value)}
                    className="w-full text-xs border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-1 py-0.5"
                  >
                    {labelOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {overSelectedWarning && (
        <p className="text-xs text-amber-400">{overSelectedWarning}</p>
      )}
    </div>
  );
}

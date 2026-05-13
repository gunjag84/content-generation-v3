// /editor/:postId - 3-column zone editor with debounced auto-save.
// Auto-save writes ONLY {slides, caption, updatedAt}; aiSnapshot is server-authored
// and immutable per Firestore rules + the DraftPatch type guard.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useActiveBrand } from '../store/activeBrand';
import { useDebouncedAutoSave } from '../hooks/useDebouncedAutoSave';
import { usePhotoPool } from '../hooks/usePhotoPool';
import { saveDraftDebounced } from '../lib/saveDraftDebounced';
import { updateZone } from '../lib/zoneOps';
import { useRenderJob } from '../lib/useRenderJob';
import { api } from '../lib/api';
import {
  EditorPreview,
  SlidePanel,
  SlideStrip,
  ZonePanel,
} from '../components/editor';
import { ConfirmModal } from '../components/ConfirmModal';
import { SchedulePostModal } from '../components/SchedulePostModal';
import { publishNow } from '../lib/postActions';
import type { Format, SocialSlide, Zone } from '../../../shared/types/slide';
import { FORMAT_HEIGHTS, REF_W } from '../../../shared/types/slide';
import type { BrandDesign } from '../../../shared/schemas/brand';

// Load natural pixel dimensions of an image URL.
function loadImageDims(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

// Scale factor that turns object-fit:contain into cover for the given canvas.
// = max(photoRatio, canvasRatio) / min(photoRatio, canvasRatio).
function coverScale(imgW: number, imgH: number, canvasW: number, canvasH: number): number {
  if (imgW <= 0 || imgH <= 0 || canvasW <= 0 || canvasH <= 0) return 1;
  const arP = imgW / imgH;
  const arC = canvasW / canvasH;
  return Math.max(arP, arC) / Math.min(arP, arC);
}

interface PostShape {
  slides: SocialSlide[];
  caption: string;
  aiSnapshot: { slides: SocialSlide[]; caption: string };
  photoUrls?: Record<string, string>;
}

const FORMATS: Format[] = ['portrait', 'post', 'story'];

export default function Editor() {
  const { postId } = useParams<{ postId: string }>();
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();

  const [slides, setSlides] = useState<SocialSlide[]>([]);
  const [caption, setCaption] = useState('');
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('portrait');
  const [loading, setLoading] = useState(true);
  const [photoPool, setPhotoPool] = useState<{ id: string; url: string }[]>([]);
  const [photoTransforms, setPhotoTransforms] = useState<Record<string, { rotation: number; scale: number }>>({});
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [rightTab, setRightTab] = useState<'slide' | 'zones' | 'caption'>('slide');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // 'now' = trigger publishNow once renderJob.status flips to 'done'.
  // null = no publish pending. Schedule path uses SchedulePostModal and
  // bypasses this state since the scheduled-publish worker handles render.
  const [pendingPublishMode, setPendingPublishMode] = useState<'now' | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const renderJob = useRenderJob(brandId, renderJobId);
  const [brandBgColor, setBrandBgColor] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteSlideIdx, setDeleteSlideIdx] = useState<number | null>(null);
  const { upload: uploadToBrandPool } = usePhotoPool(brandId);

  // Load the brand's configured background color so canvas + thumbnails reflect it.
  useEffect(() => {
    if (!uid || !brandId) return;
    let cancelled = false;
    void getDoc(doc(db, 'users', uid, 'brands', brandId)).then((snap) => {
      if (cancelled) return;
      const design = (snap.data()?.design ?? {}) as Partial<BrandDesign>;
      setBrandBgColor(design.backgroundColor);
    });
    return () => { cancelled = true; };
  }, [uid, brandId]);

  // Snapshot of aiSnapshot at load time, used by the dev-only invariance guard.
  const aiSnapshotAtLoad = useRef<PostShape['aiSnapshot'] | null>(null);

  // Initial single-doc load.
  useEffect(() => {
    if (!uid || !brandId || !postId) return;
    let cancelled = false;
    setLoading(true);
    void getDoc(doc(db, 'users', uid, 'brands', brandId, 'posts', postId)).then((snap) => {
      if (cancelled || !snap.exists()) {
        setLoading(false);
        return;
      }
      const data = snap.data() as PostShape & { source?: string };
      // ig-native posts have no aiSnapshot/slides to edit. Bounce back to
      // the History view; the dashboard widgets already redirect IG links
      // to the IG permalink, but a deep-link could still land here.
      if (data.source === 'ig-native') {
        navigate('/posts', { replace: true });
        return;
      }
      aiSnapshotAtLoad.current = data.aiSnapshot;
      setSlides(data.slides ?? []);
      setCaption(data.caption ?? '');
      // Seed an ephemeral photo pool from the post's photoUrls map.
      if (data.photoUrls) {
        const pool = Object.entries(data.photoUrls).map(([label, url]) => ({
          id: label,
          url,
        }));
        setPhotoPool(pool);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, brandId, postId]);

  // Debounced auto-save - ONLY {slides, caption} per the DraftPatch type.
  const draft = useMemo(() => ({ slides, caption }), [slides, caption]);
  useDebouncedAutoSave(draft, (state) => {
    if (!uid || !brandId || !postId) return;
    if (import.meta.env.DEV && aiSnapshotAtLoad.current) {
      // Defensive guard: state must not include aiSnapshot.
      console.assert(
        !('aiSnapshot' in (state as object)),
        'auto-save state leaked aiSnapshot',
      );
    }
    saveDraftDebounced(uid, brandId, postId, state);
  });

  const activeSlide = slides[activeSlideIdx];

  function changeZone(z: Zone) {
    setSlides((prev) => updateZone(prev, activeSlideIdx, z));
  }

  // Used by SlideStrip thumbnails so the auto-grow pass can persist y/h
  // corrections for any slide, not just the active one.
  function changeZoneAt(slideIdx: number, z: Zone) {
    setSlides((prev) => updateZone(prev, slideIdx, z));
  }

  function changeSlide(s: SocialSlide) {
    setSlides((prev) =>
      prev.map((x, i) => {
        if (i !== activeSlideIdx) return x;
        // If the caller changed the image transform (Zoom/X/Y), mark this slide
        // as manually adjusted so the auto-fit no longer touches it.
        const transformChanged =
          s.imageScale !== x.imageScale || s.imageX !== x.imageX || s.imageY !== x.imageY;
        return transformChanged ? { ...s, imageManualAdjust: true } : s;
      }),
    );
  }

  function confirmDeleteSlide() {
    const idx = deleteSlideIdx;
    if (idx === null) return;
    if (slides.length <= 1) { setDeleteSlideIdx(null); return; }
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    setActiveSlideIdx((prev) => {
      const newLen = slides.length - 1;
      if (idx < prev) return prev - 1;
      if (idx === prev) return Math.min(prev, newLen - 1);
      return prev;
    });
    setSelectedZoneId(null);
    setDeleteSlideIdx(null);
  }

  function reorderSlides(from: number, to: number) {
    if (from === to) return;
    setSlides((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setActiveSlideIdx((prev) => {
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
  }

  function applyImageToAll() {
    if (!activeSlide) return;
    const { imageScale, imageX, imageY, imageUrl, imageManualAdjust } = activeSlide;
    setSlides((prev) =>
      prev.map((s) => ({
        ...s,
        imageScale,
        imageX,
        imageY,
        imageUrl,
        // Propagating values from a manually adjusted slide is itself a manual act.
        imageManualAdjust: imageManualAdjust ?? false,
      })),
    );
  }

  // Compute cover-fit scale for a given slide+url and apply it unless the slide
  // has been manually adjusted in the meantime.
  async function autoFitSlide(slideIdx: number, imageUrl: string, fmt: Format) {
    try {
      const { w, h } = await loadImageDims(imageUrl);
      const scale = coverScale(w, h, REF_W, FORMAT_HEIGHTS[fmt]);
      setSlides((prev) =>
        prev.map((s, i) => {
          if (i !== slideIdx) return s;
          if (s.imageManualAdjust) return s;
          return { ...s, imageScale: scale, imageX: 50, imageY: 50 };
        }),
      );
    } catch {
      // ignore image load failures; slide just keeps its current values
    }
  }

  async function assignPhoto(photoId: string | null) {
    if (!activeSlide) return;
    const url = photoId ? photoPool.find((p) => p.id === photoId)?.url : undefined;
    // Reset the manual flag on photo change so auto-fit can take over again.
    // Update directly via setSlides to bypass the transform-change detection in changeSlide.
    const idx = activeSlideIdx;
    setSlides((prev) =>
      prev.map((s, i) =>
        i !== idx
          ? s
          : { ...s, imageUrl: url, photo: photoId ?? undefined, imageManualAdjust: false },
      ),
    );
    if (url) await autoFitSlide(idx, url, format);
  }

  function rotatePhoto(photoId: string, dir: 90 | -90) {
    setPhotoTransforms((prev) => {
      const cur = prev[photoId] ?? { rotation: 0, scale: 1 };
      return { ...prev, [photoId]: { ...cur, rotation: (cur.rotation + dir + 360) % 360 } };
    });
  }

  function scalePhoto(photoId: string, scale: number) {
    setPhotoTransforms((prev) => {
      const cur = prev[photoId] ?? { rotation: 0, scale: 1 };
      return { ...prev, [photoId]: { ...cur, scale } };
    });
  }

  function applyGradientToAll() {
    if (!activeSlide?.gradientColor) return;
    const color = activeSlide.gradientColor;
    setSlides((prev) => prev.map((s) => ({ ...s, gradientColor: color })));
  }

  // Click "Jetzt veröffentlichen" — if already rendered, publish immediately.
  // Else mark pending and kick render; the renderJob.status effect below
  // will fire publishNow when status flips to 'done'.
  async function requestPublishNow() {
    if (!brandId || !postId || publishing) return;
    setPublishError(null);
    if (renderJob.status === 'done') {
      setPublishing(true);
      try {
        await publishNow(brandId, postId);
        navigate('/posts');
      } catch (err) {
        setPublishError((err as Error).message);
      } finally {
        setPublishing(false);
      }
      return;
    }
    setPendingPublishMode('now');
    await startRender();
  }

  async function startRender() {
    if (!brandId || !postId || rendering) return;
    setRenderError(null);
    setRendering(true);
    try {
      const res = await api(`/api/render-jobs`, {
        method: 'POST',
        body: JSON.stringify({ brandId, postId, format }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Fehler ${res.status}`);
      setRenderJobId((body as { jobId: string }).jobId);
    } catch (err) {
      setRenderError((err as Error).message);
      setRendering(false);
    }
  }

  // Reset rendering flag when the job lands on a terminal state.
  // On success: either chain into pending publishNow (if user clicked
  // "Jetzt veröffentlichen") or navigate to /posts so they see the result.
  // On error: keep the user in the editor with an inline message.
  useEffect(() => {
    if (renderJob.status === 'done') {
      setRendering(false);
      if (pendingPublishMode === 'now' && brandId && postId) {
        setPendingPublishMode(null);
        setPublishing(true);
        void (async () => {
          try {
            await publishNow(brandId, postId);
            navigate('/posts');
          } catch (err) {
            setPublishError((err as Error).message);
          } finally {
            setPublishing(false);
          }
        })();
        return;
      }
      navigate('/posts');
    } else if (renderJob.status === 'error') {
      setRendering(false);
      if (renderJob.error) setRenderError(renderJob.error);
      if (pendingPublishMode !== null) {
        setPublishError(renderJob.error ?? 'Render fehlgeschlagen vor Publish.');
        setPendingPublishMode(null);
      }
    }
  }, [renderJob.status, renderJob.error, navigate, pendingPublishMode, brandId, postId]);

  // Recompute auto-fit for every slide that hasn't been manually adjusted
  // whenever the canvas format changes. Slides with imageManualAdjust=true keep
  // the user's Zoom/X/Y values as-is.
  const slidesRef = useRef<SocialSlide[]>(slides);
  useEffect(() => {
    slidesRef.current = slides;
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const refH = FORMAT_HEIGHTS[format];
      const current = slidesRef.current;
      const updates: { idx: number; scale: number }[] = [];
      for (let i = 0; i < current.length; i++) {
        const s = current[i];
        if (!s.imageUrl) continue;
        try {
          const { w, h } = await loadImageDims(s.imageUrl);
          const scale = coverScale(w, h, REF_W, refH);
          updates.push({ idx: i, scale });
        } catch {
          // skip failed image loads
        }
      }
      if (cancelled || updates.length === 0) return;
      // Format change overrides manual adjustments per Tim's correction:
      // every slide is re-fitted and the manual flag is reset so the user can
      // re-adjust within the new format without persisting stale values.
      setSlides((prev) =>
        prev.map((s, i) => {
          const u = updates.find((x) => x.idx === i);
          if (!u) return s;
          return {
            ...s,
            imageScale: u.scale,
            imageX: 50,
            imageY: 50,
            imageManualAdjust: false,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [format]);

  // Upload directly from the editor side panel into the brand-wide photo pool.
  // The new entries appear in the local photoPool immediately so the user can
  // pick them in the same session, AND they persist via Firestore so they show
  // up in Settings → Photos and on future Generate runs.
  async function realUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const item = await uploadToBrandPool(file, 'all');
        setPhotoPool((prev) => [...prev, { id: item.id, url: item.downloadUrl }]);
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Lade Editor …</div>;
  if (!uid || !brandId || !postId) return <div className="p-8 text-gray-500">Brand wird geladen …</div>;
  if (slides.length === 0) return <div className="p-8 text-gray-500">Kein Post gefunden.</div>;

  const slidePhotoId = typeof activeSlide?.photo === 'string' ? activeSlide.photo : undefined;

  return (
    <div className="grid grid-cols-[200px_1fr_320px] grid-rows-[auto_1fr_auto] h-full bg-zinc-900 text-zinc-100">
      {/* Format selector toolbar spanning all columns */}
      <div className="col-span-3 flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Format</span>
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`px-2 py-1 font-mono text-[10px] uppercase tracking-widest border ${
              format === f ? 'border-amber-500 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => setShowGrid((v) => !v)}
          className={`ml-2 px-2 py-1 font-mono text-[10px] uppercase tracking-widest border ${
            showGrid ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Grid
        </button>
        <span className="ml-4 font-mono text-[10px] text-zinc-600">
          Slide {activeSlideIdx + 1} / {slides.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {renderJob.status === 'rendering' && (
            <span className="font-mono text-[10px] text-amber-400">
              Rendere {renderJob.completedSlides} / {slides.length} …
            </span>
          )}
          {renderJob.status === 'done' && (
            <span className="font-mono text-[10px] text-emerald-400">
              ✓ Render fertig ({renderJob.slideUrls.length} PNGs)
            </span>
          )}
          {renderError && (
            <span className="font-mono text-[10px] text-red-400" title={renderError}>
              Fehler beim Rendern
            </span>
          )}
          <button
            onClick={startRender}
            disabled={rendering || renderJob.status === 'rendering'}
            className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest border border-amber-500 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {renderJob.status === 'done' ? 'Erneut rendern' : 'Rendern'}
          </button>
        </div>
      </div>

      {/* Left rail */}
      <SlideStrip
        slides={slides}
        format={format}
        activeIdx={activeSlideIdx}
        onSelect={(i) => { setActiveSlideIdx(i); setSelectedZoneId(null); }}
        onDelete={(i) => setDeleteSlideIdx(i)}
        onReorder={reorderSlides}
        onZoneChangeAt={changeZoneAt}
        backgroundColor={brandBgColor}
      />

      {/* Canvas */}
      <EditorPreview
        slide={activeSlide}
        format={format}
        selectedZoneId={selectedZoneId}
        onSelectZone={setSelectedZoneId}
        onZoneChange={changeZone}
        backgroundColor={brandBgColor}
        showGrid={showGrid}
      />

      {/* Right rail: tabbed Slide / Zones / Caption. Conditional render
          (not display-toggle) so the Caption tab's auto-grow ref fires on
          mount and any active panels re-init cleanly on tab switch. */}
      <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
        <div className="flex border-b border-zinc-800 flex-shrink-0">
          {(['slide', 'zones', 'caption'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRightTab(t)}
              className={`flex-1 py-2 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                rightTab === t
                  ? 'text-amber-400 border-b-2 border-amber-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'slide' ? 'Slide' : t === 'zones' ? 'Zones' : 'Caption'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {rightTab === 'slide' && activeSlide && (
            <SlidePanel
              slide={activeSlide}
              onChange={changeSlide}
              onApplyImageToAll={applyImageToAll}
              photoPool={photoPool}
              slidePhotoId={slidePhotoId}
              photoTransforms={photoTransforms}
              onAssignPhoto={assignPhoto}
              onRotatePhoto={rotatePhoto}
              onScalePhoto={scalePhoto}
              onUpload={realUpload}
              uploading={uploading}
              uploadError={uploadError}
              onApplyGradientToAll={applyGradientToAll}
            />
          )}
          {rightTab === 'zones' && activeSlide && (
            <ZonePanel
              zones={activeSlide.zones}
              selectedId={selectedZoneId}
              onSelect={setSelectedZoneId}
              onZoneChange={changeZone}
              onAdd={() => {
                const z: Zone = {
                  id: crypto.randomUUID(),
                  label: `Text ${activeSlide.zones.length + 1}`,
                  x: 100, y: 100, w: 600, h: 200,
                  text: 'Neuer Text', fontSize: 64, fontFamily: 'Inter',
                  fontWeight: 400, color: '#ffffff',
                  alignH: 'left', alignV: 'top',
                  italic: false, lineHeight: 1.2, letterSpacing: 0, rotation: 0,
                };
                changeSlide({ ...activeSlide, zones: [...activeSlide.zones, z] });
                setSelectedZoneId(z.id);
              }}
              onAddLogo={() => {
                const z: Zone = {
                  id: crypto.randomUUID(),
                  label: 'Logo',
                  x: 60, y: 60, w: 200, h: 80,
                  text: 'LOGO', fontSize: 48, fontFamily: 'Inter',
                  fontWeight: 700, color: '#ffffff',
                  alignH: 'center', alignV: 'middle',
                  italic: false, lineHeight: 1.0, letterSpacing: 0, rotation: 0,
                  isLogo: true,
                };
                changeSlide({ ...activeSlide, zones: [...activeSlide.zones, z] });
                setSelectedZoneId(z.id);
              }}
              onDelete={(id) => {
                changeSlide({ ...activeSlide, zones: activeSlide.zones.filter((z) => z.id !== id) });
                if (selectedZoneId === id) setSelectedZoneId(null);
              }}
              onDuplicate={(id) => {
                const src = activeSlide.zones.find((z) => z.id === id);
                if (!src) return;
                const dup: Zone = { ...src, id: crypto.randomUUID(), x: src.x + 20, y: src.y + 20, label: `${src.label} copy` };
                changeSlide({ ...activeSlide, zones: [...activeSlide.zones, dup] });
                setSelectedZoneId(dup.id);
              }}
            />
          )}
          {rightTab === 'caption' && (
            <div className="p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">Caption</span>
              <textarea
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                ref={(el) => {
                  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                }}
                rows={6}
                className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-200 text-[12px] resize-none overflow-hidden focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}
        </div>
      </aside>

      {/* Bottom publish bar — IG only (v3 backend doesn't wire FB). */}
      <div className="col-span-3 flex items-center gap-3 px-4 py-2 border-t border-zinc-800 bg-zinc-950">
        <button
          onClick={() => navigate('/posts')}
          className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest border border-zinc-700 text-zinc-400 hover:text-zinc-100"
        >
          Zurück
        </button>
        {publishError && (
          <span className="ml-2 font-mono text-[10px] text-red-400" title={publishError}>
            {publishError}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setScheduleModalOpen(true)}
            disabled={publishing || rendering || renderJob.status === 'rendering'}
            className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Einplanen
          </button>
          <button
            onClick={requestPublishNow}
            disabled={publishing || rendering || renderJob.status === 'rendering'}
            className="px-4 py-1 font-mono text-[10px] uppercase tracking-widest bg-amber-500 text-zinc-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing
              ? 'Wird veröffentlicht …'
              : pendingPublishMode === 'now'
              ? 'Rendere für Publish …'
              : 'Jetzt veröffentlichen'}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={deleteSlideIdx !== null}
        title="Slide löschen?"
        message="Diese Slide wird endgültig aus dem Beitrag entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
        onConfirm={confirmDeleteSlide}
        onClose={() => setDeleteSlideIdx(null)}
      />

      <SchedulePostModal
        open={scheduleModalOpen}
        postId={postId}
        brandId={brandId}
        onClose={() => setScheduleModalOpen(false)}
        onScheduled={() => { setScheduleModalOpen(false); navigate('/posts'); }}
      />
    </div>
  );
}

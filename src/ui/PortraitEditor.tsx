import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { PORTRAITS } from '../assets/portraits';
import { Nation } from '../game/types';
import { CommanderPortrait } from './CommanderPortrait';
import { removePortrait, savePortrait, useCustomPortrait } from './customPortraits';

/** The saved portrait's size, as the game's own portraits. */
const OUT = 256;
const MAX_ZOOM = 4;
const MAX_FILE = 20 * 1024 * 1024;

interface Source { url: string; w: number; h: number; image: HTMLImageElement }

/**
 * Gives a general a portrait of the player's choosing: pick or drop a picture, drag it and
 * zoom to frame the head and shoulders in the circle, and save. It is kept in this browser
 * under the general's name, and replaces the game's portrait or silhouette everywhere.
 */
export function PortraitEditor({ name, nation, onClose }: { name: string; nation: Nation; onClose: () => void }) {
  const custom = useCustomPortrait(name);
  const [source, setSource] = useState<Source | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // The crop circle: as large as fits on a phone.
  const frame = Math.min(240, (typeof window === 'undefined' ? 240 : window.innerWidth) - 96);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The picture covers the circle at zoom 1; this is its size on screen.
  const scale = source ? (frame / Math.min(source.w, source.h)) * zoom : 1;
  const clamp = (o: { x: number; y: number }, s = scale) => {
    if (!source) return o;
    const mx = Math.max(0, (source.w * s - frame) / 2), my = Math.max(0, (source.h * s - frame) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  const open = (file: File | undefined) => {
    setError('');
    setNotice('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('That is not a picture. Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_FILE) return setError('That picture is over 20 MB. Choose a smaller one.');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const w = image.naturalWidth, h = image.naturalHeight;
      setSource({ url, w, h, image });
      setZoom(1);
      // Start near the top of a tall picture, where a portrait's head usually is.
      const s = frame / Math.min(w, h);
      setOffset({ x: 0, y: Math.max(0, (h * s - frame) / 2) * 0.6 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError('This browser could not read that picture. Try a JPEG or PNG.');
    };
    image.src = url;
  };

  const setZoomKeepingCentre = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setOffset(o => clamp({ x: o.x * (next / zoom), y: o.y * (next / zoom) }, source ? (frame / Math.min(source.w, source.h)) * next : 1));
    setZoom(next);
  };

  const save = () => {
    if (!source) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return setError('This browser could not make the portrait.');
    const k = OUT / frame;
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.image, (frame / 2 + offset.x - (source.w * scale) / 2) * k, (frame / 2 + offset.y - (source.h * scale) / 2) * k, source.w * scale * k, source.h * scale * k);
    let image: string;
    try {
      image = canvas.toDataURL('image/jpeg', 0.86);
    } catch {
      return setError('This browser would not let the game use that picture. Try saving it as a JPEG or PNG first.');
    }
    const kept = savePortrait(name, nation, image);
    setSource(null);
    if (kept) onClose();
    else setNotice('The browser has no room to keep this portrait, so it lasts only until you close the page.');
  };

  const fallback = PORTRAITS[name] ? 'the original portrait' : 'the silhouette';

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); open(e.dataTransfer?.files?.[0]); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Portrait of ${name}`}
        className="bg-[#E4E3E0] border-2 border-[#141414] shadow-2xl w-full max-w-sm max-h-full overflow-y-auto p-5 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#141414] pb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-mono opacity-60">Portrait</p>
            <h2 className="font-serif italic text-2xl leading-tight break-words">{name}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 shrink-0 flex items-center justify-center hover:rotate-90 transition-transform" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {source ? (
          <>
            <div
              className="relative mx-auto overflow-hidden bg-[#141414] cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-[#141414] focus-visible:ring-offset-2"
              style={{ width: frame, height: frame, touchAction: 'none' }}
              tabIndex={0}
              role="img"
              aria-label="Drag to move the picture; arrow keys move it, plus and minus zoom"
              onPointerDown={e => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
              }}
              onPointerMove={e => {
                const d = drag.current;
                if (d) setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
              }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onWheel={e => setZoomKeepingCentre(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
              onKeyDown={e => {
                const step = 10;
                const move: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                if (move[e.key]) {
                  e.preventDefault();
                  setOffset(o => clamp({ x: o.x + move[e.key][0], y: o.y + move[e.key][1] }));
                } else if (e.key === '+' || e.key === '=') setZoomKeepingCentre(zoom * 1.1);
                else if (e.key === '-') setZoomKeepingCentre(zoom / 1.1);
              }}
            >
              <img
                src={source.url}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none pointer-events-none"
                style={{
                  width: source.w * scale,
                  height: source.h * scale,
                  left: frame / 2 + offset.x - (source.w * scale) / 2,
                  top: frame / 2 + offset.y - (source.h * scale) / 2,
                }}
              />
              {/* The circle the portrait shows through; the rest is dimmed. */}
              <span className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: '0 0 0 9999px rgba(20,20,20,0.6)', border: '2px solid rgba(255,255,255,0.85)' }} aria-hidden />
            </div>
            <label className="flex items-center gap-3 text-[10px] uppercase font-bold">
              <span className="opacity-60">Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={e => setZoomKeepingCentre(Number(e.target.value))}
                className="flex-1 accent-[#141414]"
                aria-label="Zoom"
              />
            </label>
            <p className="text-[10px] font-mono opacity-60 leading-snug text-center">Drag the picture to frame the head and shoulders in the circle.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={save} className="flex-1 min-w-[8rem] py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:bg-[#2a2a2a]">
                Save portrait
              </button>
              <button onClick={() => fileRef.current?.click()} className="px-4 py-3 border border-[#141414] text-xs font-bold uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0]">
                Another
              </button>
              <button onClick={() => setSource(null)} className="px-4 py-3 border border-[#141414]/30 text-xs font-bold uppercase tracking-widest hover:border-[#141414]">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center py-2">
              <CommanderPortrait name={name} nation={nation} size={Math.min(160, frame)} className="shadow-xl" />
            </div>
            <p className="text-[11px] font-mono leading-snug opacity-70 text-center">
              {custom ? 'Your portrait of this general.' : PORTRAITS[name] ? 'The game\'s portrait of this commander.' : 'No portrait yet: the silhouette stands in.'}{' '}
              Choose or drop a picture, a painting or a photo, to give {name} your own.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#2a2a2a]"
            >
              <ImagePlus size={16} /> {custom ? 'Choose another picture' : 'Choose a picture'}
            </button>
            {custom && (
              <button
                onClick={() => removePortrait(name)}
                className="w-full py-2.5 border border-[#141414]/30 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-[#141414]/70 hover:border-red-700 hover:text-red-700"
              >
                <Trash2 size={14} /> Remove, back to {fallback}
              </button>
            )}
          </>
        )}
        {error && <p role="alert" className="text-[11px] font-mono text-red-700 leading-snug">{error}</p>}
        {notice && <p role="status" className="text-[11px] font-mono text-[#141414]/80 leading-snug">{notice}</p>}
        <p className="text-[9px] font-mono uppercase opacity-50 leading-snug">Kept in this browser only, under the name {name}.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { open(e.target.files?.[0]); e.target.value = ''; }}
          aria-label="Picture file"
        />
      </motion.div>
    </div>
  );
}

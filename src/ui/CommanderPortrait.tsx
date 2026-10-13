import { PORTRAITS } from '../assets/portraits';
import { Nation } from '../game/types';

const RING: Record<Nation, string> = { british: '#b91c1c', french: '#1d4ed8' };
const COAT: Record<Nation, { coat: string; facing: string; field: string }> = {
  british: { coat: '#9f1d1d', facing: '#f5d76e', field: '#3b1414' },
  french: { coat: '#1e3a8a', facing: '#e5e7eb', field: '#101b3d' },
};

/**
 * A commander's bust: their portrait when the game has one, otherwise an officer's
 * silhouette in the colours of their army (bicorne, high collar, epaulettes).
 */
export function CommanderPortrait({ name, nation, size = 48, className = '' }: { name: string; nation: Nation; size?: number; className?: string }) {
  const src = PORTRAITS[name];
  const ring = Math.max(2, Math.round(size / 24));
  const style = { width: size, height: size, boxShadow: `0 0 0 ${ring}px ${RING[nation]}` };
  if (src) {
    return <img src={src} alt={name} title={name} width={size} height={size} draggable={false} className={'rounded-full object-cover shrink-0 bg-[#141414] ' + className} style={style} />;
  }
  const c = COAT[nation];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={name} className={'rounded-full shrink-0 ' + className} style={style}>
      <title>{name}</title>
      <rect width="64" height="64" fill={c.field} />
      {/* coat, collar and epaulettes */}
      <path d="M8 64c1-12 9-19 24-19s23 7 24 19z" fill={c.coat} />
      <path d="M24 45l8 9 8-9-3-3h-10z" fill={c.facing} />
      <path d="M10 53c3-4 8-6 12-6l-1 4c-4 0-8 1-11 2z M54 53c-3-4-8-6-12-6l1 4c4 0 8 1 11 2z" fill="#d4a017" />
      {/* head */}
      <ellipse cx="32" cy="32" rx="8.5" ry="10" fill="#e8c9a8" />
      <path d="M26 39c2 4 10 4 12 0v6h-12z" fill="#e8c9a8" />
      {/* bicorne */}
      <path d="M11 25c6-2 12-12 21-12s15 10 21 12c-6 1-13 0-21 0s-15 1-21 0z" fill="#111" />
      <circle cx="44" cy="20" r="2.4" fill={nation === 'french' ? '#dc2626' : '#111'} stroke={nation === 'french' ? '#fff' : '#555'} strokeWidth="1" />
    </svg>
  );
}

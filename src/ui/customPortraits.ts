import { useSyncExternalStore } from 'react';
import { Nation } from '../game/types';

/** A portrait a player made for a general, kept in this browser under the general's name. */
export interface CustomPortrait {
  name: string;
  /** The army the general was made for, to offer the name again for that army. */
  nation: Nation;
  /** A 256×256 JPEG as a data URL. */
  image: string;
  savedAt: number;
}

const KEY = 'regiments.portraits';
/** About 25 KB each, so a couple of dozen fit easily beside the battle records. */
export const PORTRAIT_LIMIT = 24;

const valid = (p: any): p is CustomPortrait =>
  !!p && typeof p.name === 'string' && p.name.length <= 40 && (p.nation === 'british' || p.nation === 'french') &&
  typeof p.image === 'string' && p.image.length < 400_000 && /^data:image\/(jpeg|png|webp);base64,/.test(p.image);

let cache: CustomPortrait[] | null = null;
const listeners = new Set<() => void>();

/** The custom portraits, newest first. Empty if storage is unavailable. */
export const loadPortraits = (): CustomPortrait[] => {
  if (cache) return cache;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(list) ? list.filter(valid).slice(0, PORTRAIT_LIMIT) : [];
  } catch {
    cache = [];
  }
  return cache;
};

/** Replaces the list; false if the browser would not keep it (it still lasts for this session). */
const store = (list: CustomPortrait[]) => {
  cache = list;
  listeners.forEach(l => l());
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

/** Keeps a portrait for a general, replacing any earlier one; the oldest go beyond the limit. */
export const savePortrait = (name: string, nation: Nation, image: string) =>
  store([{ name, nation, image, savedAt: Date.now() }, ...loadPortraits().filter(p => p.name !== name)].slice(0, PORTRAIT_LIMIT));

export const removePortrait = (name: string) => store(loadPortraits().filter(p => p.name !== name));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

export const useCustomPortraits = (): CustomPortrait[] => useSyncExternalStore(subscribe, loadPortraits);

/** A general's custom portrait, if the player made one. */
export const useCustomPortrait = (name: string) => useCustomPortraits().find(p => p.name === name)?.image;

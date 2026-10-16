// Bakes material textures on demand and caches them by parameter hash.

import { bakeBark } from './bark.js';
import { bakeLeaf } from './leaf.js';
import { dataTexture } from './gpu.js';
import { materialDefaults, withDefaults } from '../tree/schema.js';

const cache = new Map(); // materialId -> { hash, entry }

function makeTextures(raw, repeat) {
  return {
    albedo: dataTexture(raw.albedo, raw.size, { srgb: true, repeat }),
    normal: dataTexture(raw.normal, raw.size, { repeat }),
    orm: dataTexture(raw.orm, raw.size, { repeat }),
    translucency: raw.translucency ? dataTexture(raw.translucency, raw.size, { repeat }) : null,
  };
}

function disposeEntry(entry) {
  for (const t of Object.values(entry.maps)) t?.dispose();
}

/** Returns { maps, raw, layout, version } — rebakes only when params changed. */
export function getMaterialTextures(material) {
  const params = withDefaults(material.params, materialDefaults(material.kind));
  const hash = material.kind + JSON.stringify(params);
  const hit = cache.get(material.id);
  if (hit && hit.hash === hash) return hit.entry;

  const t0 = performance.now();
  const raw = material.kind === 'bark' ? bakeBark(params) : bakeLeaf(params);
  const entry = {
    raw,
    maps: makeTextures(raw, material.kind === 'bark'),
    layout: raw.layout ?? null,
    version: (hit?.entry.version ?? 0) + 1,
    ms: Math.round(performance.now() - t0),
  };
  if (hit) disposeEntry(hit.entry);
  cache.set(material.id, { hash, entry });
  return entry;
}

export function pruneTextureCache(liveIds) {
  for (const [id, { entry }] of cache) {
    if (!liveIds.has(id)) {
      disposeEntry(entry);
      cache.delete(id);
    }
  }
}

/** RGBA bytes -> PNG data URL / Blob (row 0 = image top). */
export function rgbaToCanvas(data, size, { opaque = false, channel = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  if (channel != null) {
    for (let i = 0; i < size * size; i++) {
      const v = data[i * 4 + channel];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
  } else {
    img.data.set(data);
    if (opaque) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function previewUrl(raw, map, size = 256) {
  const full = rgbaToCanvas(raw[map], raw.size, { opaque: map !== 'albedo' });
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, size, size);
  return c.toDataURL('image/png');
}


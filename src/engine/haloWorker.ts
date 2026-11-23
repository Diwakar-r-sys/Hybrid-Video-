/// <reference lib="webworker" />

export interface HaloWorkerRequest {
  id: number;
  width: number;
  height: number;
  radius: number;
  rgbaBuffer: ArrayBuffer;
}

export interface HaloWorkerResponse {
  id: number;
  width: number;
  height: number;
  outBuffer: ArrayBuffer;
}

export function computeWhiteHaloPixels(
  srcData: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const rSq = radius * radius;
  const softR = radius + 1.5;
  const softRSq = softR * softR;
  const ceilSoft = Math.ceil(softR);

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - ceilSoft);
    const y1 = Math.min(h - 1, y + ceilSoft);
    for (let x = 0; x < w; x++) {
      let minDistSq = Infinity;
      const x0 = Math.max(0, x - ceilSoft);
      const x1 = Math.min(w - 1, x + ceilSoft);

      for (let ny = y0; ny <= y1; ny++) {
        const dy = ny - y;
        const rowOffset = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          const dx = nx - x;
          const dSq = dx * dx + dy * dy;
          if (dSq <= softRSq && dSq < minDistSq) {
            const a = srcData[(rowOffset + nx) * 4 + 3];
            if (a > 120) {
              minDistSq = dSq;
              if (minDistSq <= rSq) break;
            }
          }
        }
        if (minDistSq <= rSq) break;
      }

      if (minDistSq <= softRSq) {
        const idx = (y * w + x) * 4;
        const dist = Math.sqrt(minDistSq);
        const alpha =
          dist <= radius
            ? 255
            : Math.max(0, Math.round(255 * (1 - (dist - radius) / 1.5)));
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
        out[idx + 3] = alpha;
      }
    }
  }

  return out;
}

if (typeof self !== 'undefined' && typeof (self as DedicatedWorkerGlobalScope).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<HaloWorkerRequest>) => {
    const { id, width, height, radius, rgbaBuffer } = event.data;
    const src = new Uint8ClampedArray(rgbaBuffer);
    const out = computeWhiteHaloPixels(src, width, height, radius);
    const response: HaloWorkerResponse = {
      id,
      width,
      height,
      outBuffer: out.buffer as ArrayBuffer
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response, [out.buffer]);
  };
}

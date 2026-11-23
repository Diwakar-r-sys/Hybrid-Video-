import { KnownPartBox } from '../data/presets';
import { CutPiece, PieceRole } from '../types/studio';
import {
  computeWhiteHaloPixels,
  HaloWorkerRequest,
  HaloWorkerResponse
} from './haloWorker';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

export function getDefaultPivotForRole(role: PieceRole): { x: number; y: number } {
  switch (role) {
    case 'Head':
      return { x: 0.5, y: 0.88 };
    case 'Torso':
      return { x: 0.5, y: 0.5 };
    case 'LeftUpperArm':
    case 'LeftArm':
      return { x: 0.55, y: 0.14 };
    case 'RightUpperArm':
    case 'RightArm':
      return { x: 0.45, y: 0.14 };
    case 'LeftForearm':
    case 'RightForearm':
      return { x: 0.5, y: 0.14 };
    case 'LeftLeg':
      return { x: 0.5, y: 0.1 };
    case 'RightLeg':
      return { x: 0.5, y: 0.1 };
    case 'PropNeedles':
      return { x: 0.5, y: 0.5 };
    case 'PropScarf':
      return { x: 0.5, y: 0.08 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

/**
 * Computes joint pivot directly from the piece's actual opaque pixel geometry:
 * - Head: neck = bottom center of head's opaque pixels
 * - Arm / UpperArm: shoulder = top center of arm's opaque pixels
 * - Forearm: elbow = top center of forearm's opaque pixels
 * - Leg: hip = top center of leg's opaque pixels
 * - PropScarf: top center suspension anchor
 * - Torso / PropNeedles: opaque center of mass
 */
export function computeGeometryPivot(
  buffer: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  role: PieceRole,
  isRgba = false
): { x: number; y: number } {
  if (width <= 0 || height <= 0) {
    return getDefaultPivotForRole(role);
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  const isOpaque = (x: number, y: number): boolean => {
    const idx = y * width + x;
    return isRgba ? buffer[idx * 4 + 3] > 80 : buffer[idx] > 0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isOpaque(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0 || maxX < minX || maxY < minY) {
    return getDefaultPivotForRole(role);
  }

  const spanY = Math.max(1, maxY - minY + 1);
  const bandCenterX = (yFrom: number, yTo: number): number => {
    let bSum = 0;
    let bCount = 0;
    const y0 = Math.max(minY, Math.floor(yFrom));
    const y1 = Math.min(maxY, Math.ceil(yTo));
    for (let y = y0; y <= y1; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isOpaque(x, y)) {
          bSum += x;
          bCount++;
        }
      }
    }
    return bCount > 0 ? bSum / bCount : sumX / count;
  };

  let px: number;
  let py: number;

  switch (role) {
    case 'Head': {
      // Bottom neck center
      const cx = bandCenterX(maxY - spanY * 0.14, maxY);
      px = (cx + 0.5) / width;
      py = (maxY - Math.max(2, spanY * 0.06) + 0.5) / height;
      break;
    }
    case 'LeftUpperArm':
    case 'RightUpperArm':
    case 'LeftArm':
    case 'RightArm': {
      // Top shoulder center
      const cx = bandCenterX(minY, minY + spanY * 0.18);
      px = (cx + 0.5) / width;
      py = (minY + Math.max(2, spanY * 0.1) + 0.5) / height;
      break;
    }
    case 'LeftForearm':
    case 'RightForearm': {
      // Top elbow center
      const cx = bandCenterX(minY, minY + spanY * 0.16);
      px = (cx + 0.5) / width;
      py = (minY + Math.max(2, spanY * 0.09) + 0.5) / height;
      break;
    }
    case 'LeftLeg':
    case 'RightLeg': {
      // Top hip center
      const cx = bandCenterX(minY, minY + spanY * 0.15);
      px = (cx + 0.5) / width;
      py = (minY + Math.max(2, spanY * 0.09) + 0.5) / height;
      break;
    }
    case 'PropScarf': {
      const cx = bandCenterX(minY, minY + spanY * 0.12);
      px = (cx + 0.5) / width;
      py = (minY + Math.max(2, spanY * 0.08) + 0.5) / height;
      break;
    }
    default: {
      px = (sumX / count + 0.5) / width;
      py = (sumY / count + 0.5) / height;
      break;
    }
  }

  return {
    x: Number(Math.max(0.05, Math.min(0.95, px)).toFixed(4)),
    y: Number(Math.max(0.05, Math.min(0.95, py)).toFixed(4))
  };
}

export function computePivotFromCanvas(
  pieceCanvas: HTMLCanvasElement,
  role: PieceRole
): { x: number; y: number } {
  const ctx = pieceCanvas.getContext('2d');
  if (!ctx) return getDefaultPivotForRole(role);
  const { width, height } = pieceCanvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  return computeGeometryPivot(imgData.data, width, height, role, true);
}

// Shared Web Worker instance for buildWhiteStickerHaloAsync
let haloWorkerInstance: Worker | null = null;
let haloJobSeq = 0;
const haloPending = new Map<
  number,
  { resolve: (buf: Uint8ClampedArray) => void; reject: (err: unknown) => void }
>();

function getHaloWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (haloWorkerInstance) return haloWorkerInstance;
  try {
    const worker = new Worker(new URL('./haloWorker.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (event: MessageEvent<HaloWorkerResponse>) => {
      const entry = haloPending.get(event.data.id);
      if (!entry) return;
      haloPending.delete(event.data.id);
      entry.resolve(new Uint8ClampedArray(event.data.outBuffer));
    };
    worker.onerror = (err) => {
      for (const [, pending] of haloPending) {
        pending.reject(err);
      }
      haloPending.clear();
      haloWorkerInstance = null;
    };
    haloWorkerInstance = worker;
    return worker;
  } catch {
    return null;
  }
}

export function buildWhiteStickerHalo(
  pieceCanvas: HTMLCanvasElement,
  radius: number
): HTMLCanvasElement {
  const w = pieceCanvas.width;
  const h = pieceCanvas.height;
  const srcCtx = pieceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;
  const haloPixels = computeWhiteHaloPixels(srcData, w, h, radius);

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = w;
  haloCanvas.height = h;
  const hCtx = haloCanvas.getContext('2d')!;
  const outData = new ImageData(new Uint8ClampedArray(haloPixels), w, h);
  hCtx.putImageData(outData, 0, 0);
  hCtx.drawImage(pieceCanvas, 0, 0);
  return haloCanvas;
}

export async function buildWhiteStickerHaloAsync(
  pieceCanvas: HTMLCanvasElement,
  radius: number
): Promise<HTMLCanvasElement> {
  const w = pieceCanvas.width;
  const h = pieceCanvas.height;
  const srcCtx = pieceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const worker = getHaloWorker();
  if (!worker) {
    return buildWhiteStickerHalo(pieceCanvas, radius);
  }

  try {
    const id = ++haloJobSeq;
    const copy = new Uint8ClampedArray(srcData);
    const haloPixels = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      haloPending.set(id, { resolve, reject });
      const req: HaloWorkerRequest = {
        id,
        width: w,
        height: h,
        radius,
        rgbaBuffer: copy.buffer as ArrayBuffer
      };
      worker.postMessage(req, [copy.buffer]);
    });

    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = w;
    haloCanvas.height = h;
    const hCtx = haloCanvas.getContext('2d')!;
    const outData = new ImageData(new Uint8ClampedArray(haloPixels), w, h);
    hCtx.putImageData(outData, 0, 0);
    hCtx.drawImage(pieceCanvas, 0, 0);
    return haloCanvas;
  } catch {
    return buildWhiteStickerHalo(pieceCanvas, radius);
  }
}

function chromaKeyBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    const dist = Math.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2);
    if (a < 30 || dist <= tolerance) {
      data[idx + 3] = 0;
      mask[i] = 0;
    } else {
      // Magenta spill suppression on semi-transparent fringe pixels
      if (dist < tolerance + 34) {
        const factor = Math.min(1, (dist - tolerance) / 34);
        data[idx + 3] = Math.round(a * factor);
        if (r > g + 25 && b > g + 25) {
          const avg = Math.round((r + g + b) / 3);
          data[idx] = Math.round(r * factor + avg * (1 - factor));
          data[idx + 2] = Math.round(b * factor + avg * (1 - factor));
        }
      }
      mask[i] = 1;
    }
  }
  return mask;
}

function inferRoleHeuristic(
  centerX: number,
  centerY: number,
  width: number,
  height: number
): PieceRole {
  const aspect = width / Math.max(1, height);
  if (centerY < 0.48) {
    if (centerX < 0.34) return 'Head';
    if (centerX < 0.67) return 'Torso';
    return centerX < 0.86 ? 'LeftArm' : 'RightArm';
  }
  if (centerX < 0.27 && aspect < 0.65) return 'PropNeedles';
  if (centerX < 0.48) return 'PropScarf';
  return centerX < 0.72 ? 'LeftLeg' : 'RightLeg';
}

export async function runAutoCutPipeline(
  sheetDataUrl: string,
  tolerance = 95,
  haloRadius = 6,
  knownBoxes?: KnownPartBox[]
): Promise<CutPiece[]> {
  const img = await loadImage(sheetDataUrl);
  const w = img.width;
  const h = img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const imgData = srcCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const mask = chromaKeyBuffer(data, w, h, tolerance);
  srcCtx.putImageData(imgData, 0, 0);

  // If we have exact knownBoxes (e.g., from built-in sheet or Gemini SVG sheet), extract deterministically
  if (knownBoxes && knownBoxes.length > 0) {
    const pieces: CutPiece[] = [];
    for (let idx = 0; idx < knownBoxes.length; idx++) {
      const box = knownBoxes[idx];
      const pad = haloRadius + 10;
      const sx = Math.max(0, Math.floor(box.x));
      const sy = Math.max(0, Math.floor(box.y));
      const sw = Math.min(w - sx, Math.ceil(box.w));
      const sh = Math.min(h - sy, Math.ceil(box.h));

      let minX = sw;
      let maxX = -1;
      let minY = sh;
      let maxY = -1;
      for (let py = 0; py < sh; py++) {
        for (let px = 0; px < sw; px++) {
          const gi = (sy + py) * w + (sx + px);
          if (mask[gi] === 1) {
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
      }
      if (maxX < minX || maxY < minY) continue;

      const tightW = maxX - minX + 1;
      const tightH = maxY - minY + 1;
      const cw = tightW + pad * 2;
      const ch = tightH + pad * 2;

      const pieceCanvas = document.createElement('canvas');
      pieceCanvas.width = cw;
      pieceCanvas.height = ch;
      const pCtx = pieceCanvas.getContext('2d')!;
      pCtx.drawImage(
        srcCanvas,
        sx + minX,
        sy + minY,
        tightW,
        tightH,
        pad,
        pad,
        tightW,
        tightH
      );

      const haloCanvas = await buildWhiteStickerHaloAsync(pieceCanvas, haloRadius);
      const geomPivot = computePivotFromCanvas(pieceCanvas, box.role);

      pieces.push({
        id: `piece_${idx + 1}`,
        role: box.role,
        imageDataUrl: pieceCanvas.toDataURL('image/png'),
        haloDataUrl: haloCanvas.toDataURL('image/png'),
        width: cw,
        height: ch,
        pivotX: geomPivot.x,
        pivotY: geomPivot.y,
        bbox: {
          minX: sx + minX,
          minY: sy + minY,
          width: tightW,
          height: tightH
        }
      });
    }
    return pieces;
  }

  // BFS connected components for generated image / uploaded #FF00FF sheets
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  interface Comp {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    pixels: number[];
  }
  const components: Comp[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const startIdx = y * w + x;
      if (mask[startIdx] === 1 && visited[startIdx] === 0) {
        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        visited[startIdx] = 1;

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        const pixels: number[] = [];

        while (head < tail) {
          const curr = queue[head++];
          const cx = curr % w;
          const cy = (curr - cx) / w;
          pixels.push(curr);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [curr - 1, curr + 1, curr - w, curr + w];
          for (let n = 0; n < 4; n++) {
            const nIdx = neighbors[n];
            if (nIdx >= 0 && nIdx < w * h && visited[nIdx] === 0 && mask[nIdx] === 1) {
              const nx = nIdx % w;
              if (Math.abs(nx - cx) <= 1) {
                visited[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        if (pixels.length >= 260) {
          components.push({
            minX,
            maxX,
            minY,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            centerX: (minX + maxX) / 2 / w,
            centerY: (minY + maxY) / 2 / h,
            pixels
          });
        }
      }
    }
  }

  components.sort((a, b) => {
    const rowDiff = Math.floor(a.centerY * 3) - Math.floor(b.centerY * 3);
    return rowDiff !== 0 ? rowDiff : a.centerX - b.centerX;
  });

  const pad = haloRadius + 10;
  const results: CutPiece[] = [];
  for (let idx = 0; idx < components.length; idx++) {
    const comp = components[idx];
    const role = inferRoleHeuristic(comp.centerX, comp.centerY, comp.width, comp.height);
    const cw = comp.width + pad * 2;
    const ch = comp.height + pad * 2;

    const pieceCanvas = document.createElement('canvas');
    pieceCanvas.width = cw;
    pieceCanvas.height = ch;
    const pCtx = pieceCanvas.getContext('2d')!;
    const pieceImg = pCtx.createImageData(cw, ch);

    for (let i = 0; i < comp.pixels.length; i++) {
      const globalIdx = comp.pixels[i];
      const gx = globalIdx % w;
      const gy = (globalIdx - gx) / w;
      const lx = gx - comp.minX + pad;
      const ly = gy - comp.minY + pad;
      const lIdx = (ly * cw + lx) * 4;
      const gByte = globalIdx * 4;

      pieceImg.data[lIdx] = data[gByte];
      pieceImg.data[lIdx + 1] = data[gByte + 1];
      pieceImg.data[lIdx + 2] = data[gByte + 2];
      pieceImg.data[lIdx + 3] = data[gByte + 3];
    }
    pCtx.putImageData(pieceImg, 0, 0);

    const haloCanvas = await buildWhiteStickerHaloAsync(pieceCanvas, haloRadius);
    const geomPivot = computePivotFromCanvas(pieceCanvas, role);

    results.push({
      id: `piece_${idx + 1}`,
      role,
      imageDataUrl: pieceCanvas.toDataURL('image/png'),
      haloDataUrl: haloCanvas.toDataURL('image/png'),
      width: cw,
      height: ch,
      pivotX: geomPivot.x,
      pivotY: geomPivot.y,
      bbox: {
        minX: comp.minX,
        minY: comp.minY,
        width: comp.width,
        height: comp.height
      }
    });
  }
  return results;
}

/**
 * Re-computes geometry pivot for an existing CutPiece imageDataUrl when its role changes.
 */
export async function recomputePiecePivotForRole(
  imageDataUrl: string,
  role: PieceRole
): Promise<{ x: number; y: number }> {
  try {
    const img = await loadImage(imageDataUrl);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return getDefaultPivotForRole(role);
    ctx.drawImage(img, 0, 0);
    return computePivotFromCanvas(c, role);
  } catch {
    return getDefaultPivotForRole(role);
  }
}

/**
 * Converts a Gemini-generated SVG parts dictionary (last-resort fallback)
 * onto a 1024x1024 #FF00FF sheet with exact bounding boxes.
 */
export async function renderSvgPartsToSheet(
  partsSvgMap: Partial<Record<PieceRole, string>>
): Promise<{ sheetDataUrl: string; knownBoxes: KnownPartBox[] }> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FF00FF';
  ctx.fillRect(0, 0, 1024, 1024);

  const slots: Array<{
    role: PieceRole;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [
    { role: 'Head', x: 30, y: 30, w: 290, h: 350 },
    { role: 'Torso', x: 360, y: 30, w: 320, h: 430 },
    { role: 'LeftArm', x: 710, y: 40, w: 135, h: 340 },
    { role: 'RightArm', x: 865, y: 40, w: 135, h: 340 },
    { role: 'PropNeedles', x: 50, y: 520, w: 190, h: 420 },
    { role: 'PropScarf', x: 280, y: 520, w: 180, h: 420 },
    { role: 'LeftLeg', x: 520, y: 540, w: 180, h: 400 },
    { role: 'RightLeg', x: 750, y: 540, w: 180, h: 400 }
  ];

  const knownBoxes: KnownPartBox[] = [];

  for (const slot of slots) {
    const svgCode = partsSvgMap[slot.role];
    if (!svgCode || !svgCode.trim()) continue;
    const blob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const scale = Math.min(slot.w / Math.max(1, img.width), slot.h / Math.max(1, img.height));
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = slot.x + (slot.w - dw) / 2;
      const dy = slot.y + (slot.h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      const pivot = getDefaultPivotForRole(slot.role);
      knownBoxes.push({
        role: slot.role,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        pivotX: pivot.x,
        pivotY: pivot.y
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    sheetDataUrl: canvas.toDataURL('image/png'),
    knownBoxes
  };
}

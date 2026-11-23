import { KnownPartBox } from '../data/presets';
import { CutPiece, PieceRole } from '../types/studio';

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
    case 'LeftArm':
      return { x: 0.65, y: 0.14 };
    case 'RightArm':
      return { x: 0.35, y: 0.14 };
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

export function buildWhiteStickerHalo(
  pieceCanvas: HTMLCanvasElement,
  radius: number
): HTMLCanvasElement {
  const w = pieceCanvas.width;
  const h = pieceCanvas.height;
  const srcCtx = pieceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = w;
  haloCanvas.height = h;
  const hCtx = haloCanvas.getContext('2d')!;
  const outData = hCtx.createImageData(w, h);

  const rSq = radius * radius;
  const softR = radius + 1.5;
  const softRSq = softR * softR;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minDistSq = Infinity;
      const y0 = Math.max(0, y - Math.ceil(softR));
      const y1 = Math.min(h - 1, y + Math.ceil(softR));
      const x0 = Math.max(0, x - Math.ceil(softR));
      const x1 = Math.min(w - 1, x + Math.ceil(softR));

      for (let ny = y0; ny <= y1; ny++) {
        const dy = ny - y;
        for (let nx = x0; nx <= x1; nx++) {
          const dx = nx - x;
          const dSq = dx * dx + dy * dy;
          if (dSq <= softRSq && dSq < minDistSq) {
            const a = srcData[(ny * w + nx) * 4 + 3];
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
        outData.data[idx] = 255;
        outData.data[idx + 1] = 255;
        outData.data[idx + 2] = 255;
        outData.data[idx + 3] = alpha;
      }
    }
  }

  hCtx.putImageData(outData, 0, 0);
  hCtx.drawImage(pieceCanvas, 0, 0);
  return haloCanvas;
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

  // If we have exact knownBoxes (e.g., from built-in sheet or Gemini SVG sheet), extract deterministically!
  if (knownBoxes && knownBoxes.length > 0) {
    const pieces: CutPiece[] = [];
    for (let idx = 0; idx < knownBoxes.length; idx++) {
      const box = knownBoxes[idx];
      const pad = haloRadius + 10;
      const sx = Math.max(0, Math.floor(box.x));
      const sy = Math.max(0, Math.floor(box.y));
      const sw = Math.min(w - sx, Math.ceil(box.w));
      const sh = Math.min(h - sy, Math.ceil(box.h));

      // Tighten crop to actual non-transparent pixels inside box
      let minX = sw,
        maxX = -1,
        minY = sh,
        maxY = -1;
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

      const haloCanvas = buildWhiteStickerHalo(pieceCanvas, haloRadius);

      pieces.push({
        id: `piece_${idx + 1}`,
        role: box.role,
        imageDataUrl: pieceCanvas.toDataURL('image/png'),
        haloDataUrl: haloCanvas.toDataURL('image/png'),
        width: cw,
        height: ch,
        pivotX: box.pivotX,
        pivotY: box.pivotY,
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

  // Fallback for arbitrary uploaded sheets: BFS connected components
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

        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
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
  return components.map((comp, idx) => {
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

    const haloCanvas = buildWhiteStickerHalo(pieceCanvas, haloRadius);
    const pivot = getDefaultPivotForRole(role);

    return {
      id: `piece_${idx + 1}`,
      role,
      imageDataUrl: pieceCanvas.toDataURL('image/png'),
      haloDataUrl: haloCanvas.toDataURL('image/png'),
      width: cw,
      height: ch,
      pivotX: pivot.x,
      pivotY: pivot.y,
      bbox: {
        minX: comp.minX,
        minY: comp.minY,
        width: comp.width,
        height: comp.height
      }
    };
  });
}

/**
 * Converts a Gemini-generated SVG parts dictionary (one SVG per role or one
 * multi-group SVG) onto a 1024x1024 #FF00FF sheet with exact bounding boxes.
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

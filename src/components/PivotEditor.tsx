import React, { useEffect, useRef, useState } from 'react';
import { loadImage } from '../engine/cutoutPipeline';
import { CutPiece } from '../types/studio';

interface PivotEditorProps {
  piece: CutPiece | null;
  onChangePivot: (pieceId: string, pivotX: number, pivotY: number) => void;
}

export const PivotEditor: React.FC<PivotEditorProps> = ({ piece, onChangePivot }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boundsRef = useRef({ dx: 0, dy: 0, dw: 1, dh: 1 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !piece) return;
    let cancelled = false;

    const draw = async () => {
      const img = await loadImage(piece.haloDataUrl);
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(
        (canvas.width - 36) / Math.max(1, img.width),
        (canvas.height - 36) / Math.max(1, img.height)
      );
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      boundsRef.current = { dx, dy, dw, dh };

      ctx.drawImage(img, dx, dy, dw, dh);

      const px = dx + piece.pivotX * dw;
      const py = dy + piece.pivotY * dh;

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 22, py);
      ctx.lineTo(px + 22, py);
      ctx.moveTo(px, py - 22);
      ctx.lineTo(px, py + 22);
      ctx.stroke();

      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    draw();
    return () => {
      cancelled = true;
    };
  }, [piece]);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !piece) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((clientY - rect.top) / rect.height) * canvas.height;
    const { dx, dy, dw, dh } = boundsRef.current;
    const nx = Math.max(0, Math.min(1, (cx - dx) / dw));
    const ny = Math.max(0, Math.min(1, (cy - dy) / dh));
    onChangePivot(piece.id, nx, ny);
  };

  if (!piece) {
    return (
      <div className="h-72 flex items-center justify-center text-xs text-slate-500">
        Select a cutout piece to edit its joint pivot anchor.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">
          Joint Pivot · {piece.role}
        </span>
        <span className="font-mono text-slate-400">
          {(piece.pivotX * 100).toFixed(0)}%, {(piece.pivotY * 100).toFixed(0)}%
        </span>
      </div>
      <div className="checkerboard-bg rounded-xl border border-slate-800 p-3 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={290}
          height={290}
          className="cursor-crosshair max-w-full"
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging) updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => setDragging(false)}
        />
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        Click or drag the crosshair to set where this piece rotates in Three.js (neck base for Head, shoulder top for Arms, hip top for Legs).
      </p>
    </div>
  );
};

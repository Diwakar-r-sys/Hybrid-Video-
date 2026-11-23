import React from 'react';
import { Download, Film, ImageDown } from 'lucide-react';
import { AspectMode, ShotSpec, TimelineConfig } from '../types/studio';
import { ExportProgress, ExportResult } from '../engine/mp4Exporter';

interface ExportStudioProps {
  aspectMode: AspectMode;
  timelineConfig: TimelineConfig;
  shots: ShotSpec[];
  timelineSourceLabel: string;
  pendingUploadWarning?: string | null;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  isExporting: boolean;
  onChangeAspect: (mode: AspectMode) => void;
  onChangeTimeline: (updater: (cfg: TimelineConfig) => TimelineConfig) => void;
  onRunExportMp4: () => Promise<void>;
  onSaveFramePng: () => void;
  onGoToStage?: () => void;
}

export const ExportStudio: React.FC<ExportStudioProps> = ({
  aspectMode,
  timelineConfig,
  shots,
  timelineSourceLabel,
  pendingUploadWarning,
  exportProgress,
  exportResult,
  isExporting,
  onChangeAspect,
  onChangeTimeline,
  onRunExportMp4,
  onSaveFramePng,
  onGoToStage
}) => {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100">
          YouTube MP4 &amp; Frame Export
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Render deterministic frame-by-frame H.264 MP4 directly in your browser from Three.js + HTML5 Canvas using WebCodecs &amp; mp4-muxer.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#12151d] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">
            Video Format &amp; Caption Settings
          </div>
          <div className="text-[11px] font-mono text-amber-300">
            {timelineSourceLabel} · {shots.length} shots · {timelineConfig.duration.toFixed(1)}s
          </div>
        </div>

        {pendingUploadWarning && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>{pendingUploadWarning}</span>
            {onGoToStage && (
              <button
                type="button"
                onClick={onGoToStage}
                className="shrink-0 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer"
              >
                Go to 3D Stage
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeAspect('9:16')}
            className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              aspectMode === '9:16'
                ? 'border-amber-400 bg-amber-500/10 text-slate-100'
                : 'border-slate-800 bg-[#0d0f14] text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-xs font-semibold">YouTube Shorts (9:16)</div>
            <div className="text-[11px] font-mono mt-1 opacity-80">720 × 1280 px</div>
          </button>
          <button
            type="button"
            onClick={() => onChangeAspect('16:9')}
            className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              aspectMode === '16:9'
                ? 'border-amber-400 bg-amber-500/10 text-slate-100'
                : 'border-slate-800 bg-[#0d0f14] text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-xs font-semibold">YouTube Landscape (16:9)</div>
            <div className="text-[11px] font-mono mt-1 opacity-80">1280 × 720 px</div>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 block">Frame Rate (FPS)</label>
            <select
              value={timelineConfig.fps}
              onChange={(e) =>
                onChangeTimeline((c) => ({ ...c, fps: Number(e.target.value) }))
              }
              className="w-full bg-[#0d0f14] border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            >
              <option value={24}>24 fps (Cinema)</option>
              <option value={30}>30 fps (YouTube Standard)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Caption Size</span>
              <span className="font-mono text-slate-200">
                {timelineConfig.captionFontSize}px
              </span>
            </div>
            <input
              type="range"
              min={32}
              max={68}
              value={timelineConfig.captionFontSize}
              onChange={(e) =>
                onChangeTimeline((c) => ({
                  ...c,
                  captionFontSize: Number(e.target.value)
                }))
              }
              className="w-full accent-amber-500 mt-2"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={onRunExportMp4}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Film className="w-4 h-4" />
            {isExporting
              ? 'Encoding MP4 Frames...'
              : `Export ${aspectMode} MP4 (${timelineConfig.duration.toFixed(1)}s)`}
          </button>
          <button
            type="button"
            onClick={onSaveFramePng}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 cursor-pointer whitespace-nowrap"
          >
            <ImageDown className="w-4 h-4" />
            Save Frame PNG
          </button>
        </div>

        {exportProgress && (
          <div className="rounded-lg border border-slate-800 bg-[#0d0f14] p-3.5 space-y-2">
            <div className="flex justify-between text-xs text-slate-200">
              <span>{exportProgress.message}</span>
              <span className="font-mono text-amber-400">
                {exportProgress.percent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-150"
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {exportResult && (
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs space-y-0.5">
              <div className="font-semibold text-emerald-300">
                {exportResult.filename}
              </div>
              <div className="text-slate-400 font-mono">
                {exportResult.totalFrames} frames · H.264 MP4
              </div>
            </div>
            <a
              href={exportResult.blobUrl}
              download={exportResult.filename}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download MP4
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

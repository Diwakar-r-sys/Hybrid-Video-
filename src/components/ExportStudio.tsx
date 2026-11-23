import React, { useState } from 'react';
import { Copy, Download, Film, ImageDown, Mic, Upload } from 'lucide-react';
import { AspectMode, ShotSpec, TimelineConfig } from '../types/studio';
import { ExportProgress, ExportResult } from '../engine/mp4Exporter';

interface ExportStudioProps {
  aspectMode: AspectMode;
  timelineConfig: TimelineConfig;
  shots: ShotSpec[];
  timelineSourceLabel: string;
  pendingUploadWarning?: string | null;
  audioDataUrl: string | null;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  isExporting: boolean;
  isGeneratingTts: boolean;
  liveProgressText?: string | null;
  onChangeAspect: (mode: AspectMode) => void;
  onChangeTimeline: (updater: (cfg: TimelineConfig) => TimelineConfig) => void;
  onGenerateTts: (voiceName: string) => Promise<void>;
  onUploadAudio: (dataUrl: string) => void;
  onRunExportMp4: () => Promise<void>;
  onSaveFramePng: () => void;
  onGoToStage?: () => void;
}

const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

export const ExportStudio: React.FC<ExportStudioProps> = ({
  aspectMode,
  timelineConfig,
  shots,
  timelineSourceLabel,
  pendingUploadWarning,
  audioDataUrl,
  exportProgress,
  exportResult,
  isExporting,
  isGeneratingTts,
  liveProgressText,
  onChangeAspect,
  onChangeTimeline,
  onGenerateTts,
  onUploadAudio,
  onRunExportMp4,
  onSaveFramePng,
  onGoToStage
}) => {
  const [voiceName, setVoiceName] = useState('Kore');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const ffmpegCmd = `ffmpeg -i ${
    exportResult?.filename || 'cutoutstage_silent.mp4'
  } -i narration.wav -c:v copy -c:a aac -shortest youtube_final.mp4`;

  const fullNarration = shots
    .map((s) => s.narrationText)
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100">
          YouTube MP4 Render &amp; Voiceover Audio
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Render deterministic frame-by-frame H.264 MP4 directly in your browser using WebCodecs + mp4-muxer, with optional Gemini voiceover narration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Format & Video Settings */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#12151d] p-5 space-y-5">
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
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/25 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-emerald-300">
                    {exportResult.filename}
                  </div>
                  <div className="text-slate-400 font-mono">
                    {exportResult.totalFrames} frames ·{' '}
                    {exportResult.hasEmbeddedAudio
                      ? 'Video + Audio embedded'
                      : 'Silent H.264 video track'}
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
              {exportResult.audioWarning && (
                <div className="rounded-lg border border-amber-700/70 bg-amber-950/35 px-3.5 py-2.5 text-xs text-amber-200 font-medium">
                  {exportResult.audioWarning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Voiceover & Audio Muxing */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#12151d] p-5 space-y-5">
          <div className="text-sm font-semibold text-slate-200">
            Voiceover Narration &amp; Audio Track
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0d0f14] p-3 text-xs text-slate-300 leading-relaxed">
            <span className="text-slate-500 block mb-1">Active Script</span>
            {fullNarration || 'No narration script in storyboard yet.'}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="bg-[#0d0f14] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  Voice: {v}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isGeneratingTts || !fullNarration}
              onClick={() => onGenerateTts(voiceName)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              {isGeneratingTts
                ? liveProgressText || 'Synthesizing...'
                : 'Generate AI Voiceover'}
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              Upload Audio
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      onUploadAudio(reader.result);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>

          {audioDataUrl && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-[#0d0f14] p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Loaded Narration Track</span>
                <a
                  href={audioDataUrl}
                  download="narration.wav"
                  className="text-amber-400 hover:text-amber-300 font-medium"
                >
                  Download WAV
                </a>
              </div>
              <audio src={audioDataUrl} controls className="w-full h-9" />
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-[#0d0f14] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Local FFmpeg Merge Command (Fallback)
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(ffmpegCmd);
                  setCopiedCmd(true);
                  setTimeout(() => setCopiedCmd(false), 2000);
                }}
                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                {copiedCmd ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="font-mono text-[11px] text-slate-400 overflow-x-auto">
              {ffmpegCmd}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

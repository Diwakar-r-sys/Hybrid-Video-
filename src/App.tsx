import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ImageDown,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Video
} from 'lucide-react';
import { CharacterStudio } from './components/CharacterStudio';
import { ExportStudio } from './components/ExportStudio';
import { StoryboardEditor } from './components/StoryboardEditor';
import { TopBar, WorkspaceTab } from './components/TopBar';
import {
  BUILTIN_PRESETS,
  CHANNEL_REFERENCE_ID,
  createKeyedThumbnail,
  generateGrandmaSheetWithLayout,
  generateKingSheetWithLayout,
  generateSoldierSheetWithLayout,
  KnownPartBox
} from './data/presets';
import {
  renderSvgPartsToSheet,
  runAutoCutPipeline
} from './engine/cutoutPipeline';
import { HybridStageEngine } from './engine/HybridStageEngine';
import {
  exportDeterministicMp4,
  ExportProgress,
  ExportResult
} from './engine/mp4Exporter';
import {
  AspectMode,
  CharacterSheetAsset,
  CutPiece,
  KeyframeItem,
  PieceRole,
  ShotSpec,
  TimelineConfig
} from './types/studio';

function extractFramesFromVideoFile(
  objectUrl: string,
  maxFrames = 8
): Promise<{ duration: number; frames: KeyframeItem[] }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const duration = Math.max(1, Number((video.duration || 2).toFixed(2)));
      const count = Math.min(maxFrames, Math.max(2, Math.ceil(duration * 1.5)));
      const frames: KeyframeItem[] = [];
      const canvas = document.createElement('canvas');
      const targetW = 360;
      const ratio = (video.videoHeight || 640) / Math.max(1, video.videoWidth || 360);
      canvas.width = targetW;
      canvas.height = Math.round(targetW * ratio);
      const ctx = canvas.getContext('2d')!;

      for (let i = 0; i < count; i++) {
        const ts = Number(((i / Math.max(1, count - 1)) * Math.max(0.1, duration - 0.05)).toFixed(2));
        await new Promise<void>((resSeek) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push({
              shotId: `extracted-${i + 1}`,
              shotIndex: i,
              timestamp: ts,
              dataUrl: canvas.toDataURL('image/jpeg', 0.82)
            });
            resSeek();
          };
          video.currentTime = ts;
        });
      }
      resolve({ duration, frames });
    };

    video.onerror = () => reject(new Error('Could not decode uploaded video file.'));
  });
}

class ApiRequestError extends Error {
  public readonly retryable: boolean;
  public readonly code: number;

  constructor(message: string, code = 500, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
  onProgress?: (message: string) => void
): Promise<T> {
  const headers = new Headers(init?.headers || undefined);
  if (onProgress && !headers.has('Accept')) {
    headers.set('Accept', 'text/event-stream, application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: T | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }
      const chunks = buffer.split('\n\n');
      buffer = done ? '' : chunks.pop() || '';

      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payloadStr = trimmed.slice(5).trim();
          if (!payloadStr) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(payloadStr) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (evt.type === 'progress' && typeof evt.message === 'string') {
            onProgress?.(evt.message);
          } else if (evt.type === 'error') {
            const code = typeof evt.status === 'number'
              ? evt.status
              : typeof evt.code === 'number'
              ? evt.code
              : 500;
            const baseMsg = typeof evt.error === 'string' ? evt.error : `Server error ${code}`;
            const failed = Array.isArray(evt.failedModels)
              ? (evt.failedModels as Array<{ model?: string; status?: number; reason?: string }>)
                  .map((f) => `${f.model || 'model'} (${f.status ?? code}): ${f.reason || 'failed'}`)
                  .join(' | ')
              : '';
            const msg = failed ? `${baseMsg} [Failed: ${failed}]` : baseMsg;
            const retryable = Boolean(evt.retryable) || code === 503 || code === 429;
            throw new ApiRequestError(msg, code, retryable);
          } else if (evt.type === 'result') {
            finalResult = evt as T;
          }
        }
      }

      if (done) break;
    }

    if (finalResult !== null) {
      return finalResult;
    }
    throw new ApiRequestError(
      `Stream ended without a final response from ${url}.`,
      res.status || 502,
      true
    );
  }

  const rawText = await res.text();

  if (!contentType.includes('application/json')) {
    const trimmed = rawText.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      throw new ApiRequestError(
        `Server returned HTML instead of JSON for ${url} (HTTP ${res.status}). The backend dev server may still be restarting or a proxy fallback intercepted the API route.`,
        res.status,
        true
      );
    }
    throw new ApiRequestError(
      `Expected JSON from ${url} but received "${contentType || 'unknown'}" (HTTP ${res.status}).`,
      res.status,
      res.status >= 500
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new ApiRequestError(
      `Malformed JSON returned from ${url} (HTTP ${res.status}).`,
      res.status,
      res.status >= 500
    );
  }

  if (!res.ok) {
    const baseMsg =
      typeof parsed.error === 'string'
        ? parsed.error
        : `Server error ${res.status}`;
    const failed = Array.isArray(parsed.failedModels)
      ? (parsed.failedModels as Array<{ model?: string; status?: number; reason?: string }>)
          .map((f) => `${f.model || 'model'} (${f.status ?? res.status}): ${f.reason || 'failed'}`)
          .join(' | ')
      : '';
    const msg = failed ? `${baseMsg} [Failed: ${failed}]` : baseMsg;
    throw new ApiRequestError(
      msg,
      typeof parsed.code === 'number' ? parsed.code : res.status,
      Boolean(parsed.retryable) || res.status === 503 || res.status === 429
    );
  }

  return parsed as T;
}

function matchesBuiltinAlias(name: string): 'Grandma' | 'King' | 'Soldier' | null {
  const lower = name.trim().toLowerCase();
  if (/^(grandma|granny|grandmother|dadi|दादी)$/.test(lower)) return 'Grandma';
  if (/^(king|raja|monarch|राजा)$/.test(lower)) return 'King';
  if (/^(soldier|guard|royal guard|knight|सैनिक|senik)$/.test(lower)) return 'Soldier';
  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('stage');
  const [activePresetId, setActivePresetId] = useState<string>(BUILTIN_PRESETS[0].id);
  const [aspectMode, setAspectMode] = useState<AspectMode>('9:16');
  const [shots, setShots] = useState<ShotSpec[]>(BUILTIN_PRESETS[0].shots);
  const [timelineConfig, setTimelineConfig] = useState<TimelineConfig>({
    fps: 30,
    duration: BUILTIN_PRESETS[0].duration,
    globalArmSpeed: 1.0,
    globalHeadTilt: 1.0,
    globalBodyBob: 1.0,
    haloWidthPx: 6,
    chromaTolerance: 95,
    captionFontSize: 52,
    showCaptions: true
  });

  // Source Director State
  const [youtubeUrl, setYoutubeUrl] = useState(
    'https://youtube.com/shorts/PpOm4_2WF_U'
  );
  const [channelId, setChannelId] = useState(CHANNEL_REFERENCE_ID);
  const [promptText, setPromptText] = useState(
    'Recreate the story in 3D diorama environments with 2D paper-cutout characters, white sticker outlines, and dynamic 3D wool scarf growth.'
  );
  const [targetDuration, setTargetDuration] = useState<number>(12);
  const [uploadedVideoName, setUploadedVideoName] = useState<string>('');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [hasUnanalyzedUpload, setHasUnanalyzedUpload] = useState<boolean>(false);
  const [timelineSource, setTimelineSource] = useState<{
    kind: 'preset' | 'ai' | 'manual';
    label: string;
  }>({
    kind: 'preset',
    label: BUILTIN_PRESETS[0].label
  });
  const [keyframes, setKeyframes] = useState<KeyframeItem[]>(() =>
    BUILTIN_PRESETS[0].shots.map((s, idx) => ({
      shotId: s.id,
      shotIndex: idx,
      timestamp: Number(((s.start + s.end) * 0.5).toFixed(2)),
      dataUrl: createKeyedThumbnail(idx, s.title)
    }))
  );

  // Character Rigging State
  const [characters, setCharacters] = useState<CharacterSheetAsset[]>([]);
  const [activeCharName, setActiveCharName] = useState<string>('Grandma');
  const [rigsReady, setRigsReady] = useState(false);

  // Playback & Dock State
  const [currentTime, setCurrentTime] = useState<number>(1.35);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Async & Export State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCharBusy, setIsCharBusy] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [liveProgressText, setLiveProgressText] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    tab: WorkspaceTab;
    type: 'info' | 'error';
    text: string;
    retryAction?: 'analyze' | 'tts' | 'auto-label' | 'generate-sheet';
  } | null>(null);

  const engineRef = useRef<HybridStageEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownLayoutsRef = useRef<Map<string, KnownPartBox[]>>(new Map());
  const activeTabRef = useRef<WorkspaceTab>(activeTab);
  activeTabRef.current = activeTab;

  const lastTtsVoiceRef = useRef<string>('Kore');
  const lastAutoLabelCharRef = useRef<string>('Grandma');
  const lastGenSheetParamsRef = useRef<{ name: string; description: string } | null>(null);

  const showNotice = useCallback(
    (
      text: string,
      type: 'info' | 'error' = 'info',
      retryAction?: 'analyze' | 'tts' | 'auto-label' | 'generate-sheet',
      tabOverride?: WorkspaceTab
    ) => {
      setStatusNotice({
        tab: tabOverride ?? activeTabRef.current,
        type,
        text,
        retryAction
      });
    },
    []
  );

  // Auto-dismiss success/info notices after 6s
  useEffect(() => {
    if (!statusNotice || statusNotice.type !== 'info') return;
    const timer = window.setTimeout(() => {
      setStatusNotice((prev) => (prev === statusNotice ? null : prev));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  const handleSelectTab = useCallback((nextTab: WorkspaceTab) => {
    setStatusNotice(null);
    setActiveTab(nextTab);
  }, []);

  // 1. Initialize built-in Grandma, King & Soldier #FF00FF cutout rigs once on mount
  useEffect(() => {
    let cancelled = false;
    const initRigs = async () => {
      const grandmaGen = generateGrandmaSheetWithLayout();
      const kingGen = generateKingSheetWithLayout();
      const soldierGen = generateSoldierSheetWithLayout();
      knownLayoutsRef.current.set('Grandma', grandmaGen.knownBoxes);
      knownLayoutsRef.current.set('King', kingGen.knownBoxes);
      knownLayoutsRef.current.set('Soldier', soldierGen.knownBoxes);

      const [grandmaPieces, kingPieces, soldierPieces] = await Promise.all([
        runAutoCutPipeline(grandmaGen.sheetDataUrl, 95, 6, grandmaGen.knownBoxes),
        runAutoCutPipeline(kingGen.sheetDataUrl, 95, 6, kingGen.knownBoxes),
        runAutoCutPipeline(soldierGen.sheetDataUrl, 95, 6, soldierGen.knownBoxes)
      ]);
      if (cancelled) return;

      setCharacters([
        {
          name: 'Grandma',
          description: 'Elderly grandmother in teal coat with cream apron and knitting needles',
          sheetDataUrl: grandmaGen.sheetDataUrl,
          source: 'builtin',
          pieces: grandmaPieces
        },
        {
          name: 'King',
          description: 'Royal king in crimson ermine-trimmed robe, jeweled gold crown, and scepter',
          sheetDataUrl: kingGen.sheetDataUrl,
          source: 'builtin',
          pieces: kingPieces
        },
        {
          name: 'Soldier',
          description: 'Armored royal guard with crimson-plumed steel helmet, spear, and heraldic shield',
          sheetDataUrl: soldierGen.sheetDataUrl,
          source: 'builtin',
          pieces: soldierPieces
        }
      ]);
      setRigsReady(true);
    };
    initRigs();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Initialize Three.js HybridStageEngine once
  useEffect(() => {
    const engine = new HybridStageEngine(aspectMode);
    engineRef.current = engine;

    const webglCanvas = engine.renderer.domElement;
    const handleLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      setIsPlaying(false);
    };
    const handleRestored = () => {
      setContextLost(false);
    };
    webglCanvas.addEventListener('webglcontextlost', handleLost);
    webglCanvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      webglCanvas.removeEventListener('webglcontextlost', handleLost);
      webglCanvas.removeEventListener('webglcontextrestored', handleRestored);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // 3. Sync character rigs into Three.js whenever cut pieces change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !rigsReady) return;
    let cancelled = false;

    const uploadRigs = async () => {
      for (const ch of characters) {
        if (cancelled) return;
        await engine.setCharacterRig(ch.name, ch.pieces);
      }
      if (!cancelled && canvasRef.current) {
        engine.renderCompositeFrame(canvasRef.current, currentTime, shots, timelineConfig);
      }
    };
    uploadRigs();
    return () => {
      cancelled = true;
    };
  }, [characters, rigsReady]);

  // 4. Sync aspect mode changes onto engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setDimensionsForAspect(aspectMode, true);
    if (canvasRef.current) {
      engine.renderCompositeFrame(canvasRef.current, currentTime, shots, timelineConfig);
    }
  }, [aspectMode]);

  // 5. Render current frame on state updates
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas || !rigsReady || contextLost) return;
    engine.renderCompositeFrame(canvas, currentTime, shots, timelineConfig);
  }, [currentTime, shots, timelineConfig, rigsReady, contextLost, activeTab]);

  // 6. Deterministic Playback Loop (paced on software WebGL)
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    const engine = engineRef.current;
    if (audioRef.current && audioDataUrl) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.play().catch(() => {});
    }

    let frameId = 0;
    let lastNow: number | null = null;
    const isSoft = engine?.isSoftwareGl ?? false;

    const step = (now: number) => {
      if (lastNow === null) lastNow = now;
      const dt = (now - lastNow) / 1000;
      lastNow = now;

      setCurrentTime((prev) => {
        let next = prev + dt;
        if (next >= timelineConfig.duration) {
          next = 0;
          if (audioRef.current && audioDataUrl) {
            audioRef.current.currentTime = 0;
          }
        }
        return next;
      });

      if (isSoft) {
        frameId = window.setTimeout(() => requestAnimationFrame(step), 45);
      } else {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
  }, [isPlaying, timelineConfig.duration, audioDataUrl]);

  const applyPreset = (presetId: string) => {
    const preset = BUILTIN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setStatusNotice(null);
    setIsPlaying(false);
    setActivePresetId(preset.id);
    setShots(preset.shots);
    setAspectMode(preset.aspectMode);
    setTimelineConfig((c) => ({ ...c, duration: preset.duration }));
    setTimelineSource({ kind: 'preset', label: preset.label });
    setHasUnanalyzedUpload(false);
    setCurrentTime(preset.id === 'grandma-2s-ref' ? 1.35 : 0.4);
    setKeyframes(
      preset.shots.map((s, idx) => ({
        shotId: s.id,
        shotIndex: idx,
        timestamp: Number(((s.start + s.end) * 0.5).toFixed(2)),
        dataUrl: createKeyedThumbnail(idx, s.title)
      }))
    );
    showNotice(`Loaded ${preset.label} across ${preset.shots.length} scene(s).`);
  };

  const handleVideoFileUpload = async (file: File) => {
    const originTab = activeTabRef.current;
    setStatusNotice(null);
    try {
      setIsPlaying(false);
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
      const url = URL.createObjectURL(file);
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);
      showNotice(`Extracting keyframes from ${file.name}...`, 'info', undefined, originTab);
      const { duration, frames } = await extractFramesFromVideoFile(url, 10);
      setKeyframes(frames);
      setTargetDuration(Math.min(66, Math.max(2, Math.round(duration))));
      setHasUnanalyzedUpload(true);
      showNotice(
        `Extracted ${frames.length} keyframes (${duration.toFixed(1)}s) from ${file.name}. Click "Generate 3D Storyboard & Animation" to build the ${Math.round(duration)}s timeline.`,
        'info',
        undefined,
        originTab
      );
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : 'Failed to read video file.',
        'error',
        undefined,
        originTab
      );
    }
  };

  const handleGenerateStoryboard = async () => {
    const originTab = activeTabRef.current;
    setStatusNotice(null);
    setLiveProgressText(null);
    setIsAnalyzing(true);
    setIsPlaying(false);
    try {
      let ytContextTitle = '';
      if (youtubeUrl.trim()) {
        try {
          const ytJson = await safeFetchJson<{ title?: string; author?: string }>(
            '/api/youtube-info',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() })
            }
          );
          if (ytJson.title) ytContextTitle = `${ytJson.title} (${ytJson.author || ''})`;
        } catch {
          // non-fatal oEmbed lookup
        }
      }

      const data = await safeFetchJson<{
        title?: string;
        modelUsed?: string;
        uniqueCharacters?: Array<{ name: string; description: string }>;
        shots?: ShotSpec[];
      }>(
        '/api/analyze',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptText: ytContextTitle
              ? `${promptText}\nYouTube Reference Title: ${ytContextTitle}`
              : promptText,
            youtubeUrl: youtubeUrl.trim(),
            channelId: channelId.trim(),
            duration: targetDuration,
            frames: keyframes.map((k) => k.dataUrl),
            aspectMode
          })
        },
        (msg) => setLiveProgressText(msg)
      );

      if (data.modelUsed) {
        setLastModelUsed(data.modelUsed);
      }

      if (!Array.isArray(data.shots) || data.shots.length === 0) {
        throw new ApiRequestError(
          'Gemini did not return any storyboard shots. Please try again.',
          502,
          true
        );
      }

      setShots(data.shots);
      const maxEnd = Math.max(...data.shots.map((s) => s.end));
      setTimelineConfig((c) => ({ ...c, duration: maxEnd }));
      setTimelineSource({
        kind: 'ai',
        label: data.title || `AI Storyboard (${maxEnd.toFixed(1)}s)`
      });
      setHasUnanalyzedUpload(false);
      setCurrentTime(0);

      // Generate cutout rigs for all detected unique characters (no 2-character cap)
      const existingNames = new Set(characters.map((c) => c.name.toLowerCase()));
      const uniqueChars = data.uniqueCharacters || [];
      const failedChars: string[] = [];

      for (const uc of uniqueChars.slice(0, 6)) {
        const alias = matchesBuiltinAlias(uc.name);
        if (alias || existingNames.has(uc.name.trim().toLowerCase())) {
          continue;
        }
        existingNames.add(uc.name.trim().toLowerCase());
        setLiveProgressText(`Generating cutout sheet for "${uc.name}"...`);
        const ok = await handleGenerateGeminiSheet(uc.name, uc.description, true);
        if (!ok) failedChars.push(uc.name);
      }

      const modelInfo = data.modelUsed ? ` via ${data.modelUsed}` : '';
      if (failedChars.length > 0) {
        showNotice(
          `Generated ${data.shots.length}-scene storyboard (${maxEnd.toFixed(1)}s${modelInfo}), but character sheet generation failed for: ${failedChars.join(', ')}. You can retry them in Cutout Rig.`,
          'error',
          undefined,
          originTab
        );
      } else {
        showNotice(
          `Generated ${data.shots.length}-scene 3D storyboard (${maxEnd.toFixed(1)}s${modelInfo}) in channel ${channelId} style.`,
          'info',
          undefined,
          originTab
        );
      }
    } catch (err: unknown) {
      const retryable = err instanceof ApiRequestError ? err.retryable : false;
      const msg =
        err instanceof Error ? err.message : 'Storyboard generation failed.';
      showNotice(
        `${msg} (Active timeline remained "${timelineSource.label}".)`,
        'error',
        retryable ? 'analyze' : undefined,
        originTab
      );
    } finally {
      setIsAnalyzing(false);
      setLiveProgressText(null);
    }
  };

  const handleChangeCutSettings = async (tolerance: number, haloWidthPx: number) => {
    setTimelineConfig((c) => ({
      ...c,
      chromaTolerance: tolerance,
      haloWidthPx
    }));
    const updated: CharacterSheetAsset[] = [];
    for (const ch of characters) {
      const known = knownLayoutsRef.current.get(ch.name);
      const pieces = await runAutoCutPipeline(
        ch.sheetDataUrl,
        tolerance,
        haloWidthPx,
        known
      );
      updated.push({ ...ch, pieces });
    }
    setCharacters(updated);
  };

  const handleUpdatePiece = (
    charName: string,
    pieceId: string,
    updater: (piece: CutPiece) => CutPiece
  ) => {
    setCharacters((prev) =>
      prev.map((ch) =>
        ch.name === charName
          ? { ...ch, pieces: ch.pieces.map((p) => (p.id === pieceId ? updater(p) : p)) }
          : ch
      )
    );
  };

  const handleUploadCustomSheet = async (charName: string, dataUrl: string) => {
    const originTab = activeTabRef.current;
    setStatusNotice(null);
    setIsCharBusy(true);
    try {
      knownLayoutsRef.current.delete(charName);
      const pieces = await runAutoCutPipeline(
        dataUrl,
        timelineConfig.chromaTolerance,
        timelineConfig.haloWidthPx
      );
      setCharacters((prev) =>
        prev.map((ch) =>
          ch.name === charName
            ? { ...ch, sheetDataUrl: dataUrl, source: 'uploaded', pieces }
            : ch
        )
      );
      showNotice(
        `Segmented ${pieces.length} pieces from custom #FF00FF sheet for ${charName}. Click AI Auto-Label Limbs if any roles need adjustment.`,
        'info',
        undefined,
        originTab
      );
    } finally {
      setIsCharBusy(false);
    }
  };

  const handleAutoLabelPieces = async (charName: string) => {
    const target = characters.find((c) => c.name === charName);
    if (!target || target.pieces.length === 0) return;
    const originTab = activeTabRef.current;
    lastAutoLabelCharRef.current = charName;
    setStatusNotice(null);
    setLiveProgressText(null);
    setIsCharBusy(true);
    try {
      const data = await safeFetchJson<{
        modelUsed?: string;
        assignments?: Array<{ id: string; role: string }>;
      }>(
        '/api/auto-label-parts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pieces: target.pieces.map((p) => ({
              id: p.id,
              imageDataUrl: p.imageDataUrl
            }))
          })
        },
        (msg) => setLiveProgressText(msg)
      );

      if (data.modelUsed) {
        setLastModelUsed(data.modelUsed);
      }

      const map = new Map<string, PieceRole>();
      for (const item of data.assignments || []) {
        map.set(item.id, item.role as PieceRole);
      }

      setCharacters((prev) =>
        prev.map((ch) =>
          ch.name === charName
            ? {
                ...ch,
                pieces: ch.pieces.map((p) => ({
                  ...p,
                  role: map.get(p.id) || p.role
                }))
              }
            : ch
        )
      );
      const modelInfo = data.modelUsed ? ` via ${data.modelUsed}` : '';
      showNotice(
        `AI Vision labeled ${map.size} cutout limbs for ${charName}${modelInfo}.`,
        'info',
        undefined,
        originTab
      );
    } catch (err: unknown) {
      const retryable = err instanceof ApiRequestError ? err.retryable : false;
      showNotice(
        err instanceof Error ? err.message : 'Auto-label request failed.',
        'error',
        retryable ? 'auto-label' : undefined,
        originTab
      );
    } finally {
      setIsCharBusy(false);
      setLiveProgressText(null);
    }
  };

  const handleGenerateGeminiSheet = async (
    charName: string,
    description: string,
    silentError = false
  ): Promise<boolean> => {
    const originTab = activeTabRef.current;
    lastGenSheetParamsRef.current = { name: charName, description };
    if (!silentError) {
      setStatusNotice(null);
    }
    setLiveProgressText(null);
    setIsCharBusy(true);
    try {
      const data = await safeFetchJson<{
        modelUsed?: string;
        partsSvgMap?: Partial<Record<PieceRole, string>>;
      }>(
        '/api/generate-character-sheet',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterName: charName,
            description,
            referenceFrameDataUrl: keyframes[0]?.dataUrl
          })
        },
        (msg) => setLiveProgressText(msg)
      );

      if (data.modelUsed) {
        setLastModelUsed(data.modelUsed);
      }

      const { sheetDataUrl, knownBoxes } = await renderSvgPartsToSheet(
        data.partsSvgMap || {}
      );
      knownLayoutsRef.current.set(charName, knownBoxes);
      const pieces = await runAutoCutPipeline(
        sheetDataUrl,
        timelineConfig.chromaTolerance,
        timelineConfig.haloWidthPx,
        knownBoxes
      );

      setCharacters((prev) => {
        const exists = prev.some((c) => c.name === charName);
        const nextChar: CharacterSheetAsset = {
          name: charName,
          description,
          sheetDataUrl,
          source: 'gemini-svg',
          pieces
        };
        return exists
          ? prev.map((c) => (c.name === charName ? nextChar : c))
          : [...prev, nextChar];
      });
      setActiveCharName(charName);
      if (!silentError) {
        const modelInfo = data.modelUsed ? ` via ${data.modelUsed}` : '';
        showNotice(
          `Generated rigged paper-cutout sheet for ${charName} (${pieces.length} parts${modelInfo}).`,
          'info',
          undefined,
          originTab
        );
      }
      return true;
    } catch (err: unknown) {
      if (!silentError) {
        const retryable = err instanceof ApiRequestError ? err.retryable : false;
        showNotice(
          err instanceof Error ? err.message : 'Character sheet generation failed.',
          'error',
          retryable ? 'generate-sheet' : undefined,
          originTab
        );
      }
      return false;
    } finally {
      setIsCharBusy(false);
      setLiveProgressText(null);
    }
  };

  const handleGenerateTts = async (voiceName: string) => {
    const narration = shots
      .map((s) => s.narrationText)
      .filter(Boolean)
      .join(' ');
    if (!narration) return;
    const originTab = activeTabRef.current;
    lastTtsVoiceRef.current = voiceName;
    setStatusNotice(null);
    setLiveProgressText(null);
    setIsGeneratingTts(true);
    try {
      const data = await safeFetchJson<{ audioDataUrl: string; modelUsed?: string }>(
        '/api/tts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narration, voiceName })
        },
        (msg) => setLiveProgressText(msg)
      );
      if (data.modelUsed) {
        setLastModelUsed(data.modelUsed);
      }
      setAudioDataUrl(data.audioDataUrl);
      const modelInfo = data.modelUsed ? ` via ${data.modelUsed}` : '';
      showNotice(
        `Voiceover WAV generated${modelInfo} and synced to stage playback.`,
        'info',
        undefined,
        originTab
      );
    } catch (err: unknown) {
      const retryable = err instanceof ApiRequestError ? err.retryable : false;
      showNotice(
        err instanceof Error ? err.message : 'TTS generation failed.',
        'error',
        retryable ? 'tts' : undefined,
        originTab
      );
    } finally {
      setIsGeneratingTts(false);
      setLiveProgressText(null);
    }
  };

  const handleSaveFramePng = () => {
    setStatusNotice(null);
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    engine.renderCompositeFrame(canvas, currentTime, shots, timelineConfig);
    const link = document.createElement('a');
    link.download = `cutoutstage_t_${currentTime.toFixed(2)}s.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportMp4 = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const originTab = activeTabRef.current;
    setStatusNotice(null);
    setIsPlaying(false);
    setIsExporting(true);
    setExportResult(null);
    setExportProgress({ percent: 0, message: 'Starting deterministic MP4 render...' });

    try {
      const result = await exportDeterministicMp4(
        engine,
        shots,
        timelineConfig,
        aspectMode,
        audioDataUrl,
        (prog) => setExportProgress(prog)
      );
      setExportResult(result);
      // Automatically trigger download
      const a = document.createElement('a');
      a.href = result.blobUrl;
      a.download = result.filename;
      a.click();
      showNotice(
        `Exported ${result.filename} (${result.totalFrames} frames).`,
        'info',
        undefined,
        originTab
      );
    } catch (err: unknown) {
      setActiveTab('export');
      showNotice(
        err instanceof Error ? err.message : 'MP4 export failed.',
        'error',
        undefined,
        'export'
      );
    } finally {
      setIsExporting(false);
      // Restore preview frame
      if (canvasRef.current && engineRef.current) {
        engineRef.current.renderCompositeFrame(
          canvasRef.current,
          currentTime,
          shots,
          timelineConfig
        );
      }
    }
  };

  const activeShot =
    shots.find((s) => currentTime >= s.start && currentTime <= s.end) || shots[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0f14] text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onQuickExport={handleExportMp4}
        isExporting={isExporting}
        modelUsed={lastModelUsed}
      />

      {audioDataUrl && (
        <audio ref={audioRef} src={audioDataUrl} className="hidden" />
      )}

      {liveProgressText && (
        <div className="mx-auto max-w-[1440px] w-full px-6 pt-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-700/60 bg-amber-950/30 px-4 py-2 text-xs text-amber-200 font-mono">
            <span>{liveProgressText}</span>
          </div>
        </div>
      )}

      {statusNotice && statusNotice.tab === activeTab && (
        <div className="mx-auto max-w-[1440px] w-full px-6 pt-4">
          <div
            className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-2.5 text-xs ${
              statusNotice.type === 'error'
                ? 'border-rose-800/70 bg-rose-950/35 text-rose-200'
                : 'border-slate-800 bg-[#141822] text-slate-200'
            }`}
          >
            <span className="flex-1 min-w-[220px]">{statusNotice.text}</span>
            <div className="flex items-center gap-2 shrink-0">
              {statusNotice.type === 'error' && statusNotice.retryAction && (
                <button
                  type="button"
                  disabled={isAnalyzing || isCharBusy || isGeneratingTts}
                  onClick={() => {
                    const action = statusNotice.retryAction;
                    if (action === 'analyze') {
                      handleGenerateStoryboard();
                    } else if (action === 'tts') {
                      handleGenerateTts(lastTtsVoiceRef.current);
                    } else if (action === 'auto-label') {
                      handleAutoLabelPieces(lastAutoLabelCharRef.current);
                    } else if (action === 'generate-sheet' && lastGenSheetParamsRef.current) {
                      handleGenerateGeminiSheet(
                        lastGenSheetParamsRef.current.name,
                        lastGenSheetParamsRef.current.description,
                        false
                      );
                    }
                  }}
                  className="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 mx-auto max-w-[1440px] w-full px-6 py-6">
        {activeTab === 'stage' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Director Panel: Channel Style, YouTube URL, Video Upload & Prompt */}
            <div className="lg:col-span-4 space-y-5">
              <div className="rounded-xl border border-slate-800 bg-[#12151d] p-5 space-y-4">
                <div className="space-y-1">
                  <h1 className="font-display text-xl font-bold text-slate-100 text-balance">
                    3D Paper-Cutout Video Director
                  </h1>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Convert any YouTube video, Shorts link, or uploaded clip into the 3D diorama + white-halo paper-cutout style.
                  </p>
                </div>

                {/* Reference Presets */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-400">
                    Reference Style Presets
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {BUILTIN_PRESETS.map((preset) => {
                      const active = activePresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.id)}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-amber-400 bg-amber-500/10 text-slate-100'
                              : 'border-slate-800 bg-[#0d0f14] text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-semibold">{preset.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {preset.subtitle}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source Inputs */}
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">
                      Target YouTube Channel Style ID
                    </label>
                    <input
                      type="text"
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-[#0d0f14] px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">
                      YouTube Video or Shorts URL
                    </label>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/shorts/..."
                      className="w-full rounded-lg border border-slate-800 bg-[#0d0f14] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-slate-400 block">
                        Upload Prompt / Reference Video (.mp4, .mov, .webm)
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/assets/aistudio/reconstructed_silent_791f4d6e.mp4');
                            if (!res.ok) throw new Error('Sample clip not found');
                            const blob = await res.blob();
                            const sampleFile = new File([blob], 'reconstructed_silent.mp4', {
                              type: 'video/mp4'
                            });
                            await handleVideoFileUpload(sampleFile);
                          } catch {
                            showNotice('Could not load attached reference video.', 'error');
                          }
                        }}
                        className="text-[11px] text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline cursor-pointer shrink-0"
                      >
                        Load Attached Clip
                      </button>
                    </div>
                    <label className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-700 bg-[#0d0f14] px-3 py-2.5 text-xs text-slate-300 hover:border-slate-500 cursor-pointer">
                      <span className="inline-flex items-center gap-2 truncate">
                        <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">
                          {uploadedVideoName || 'Select video file for frame analysis'}
                        </span>
                      </span>
                      <span className="text-[11px] text-amber-400 shrink-0">Browse</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVideoFileUpload(file);
                        }}
                      />
                    </label>
                  </div>

                  {uploadedVideoUrl && (
                    <div className="rounded-lg border border-slate-800 bg-[#0d0f14] p-2">
                      <video
                        src={uploadedVideoUrl}
                        controls
                        className="w-full max-h-36 rounded object-contain"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">
                      Story / Scene Direction Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      placeholder="Describe the story or scene transitions..."
                      className="w-full rounded-lg border border-slate-800 bg-[#0d0f14] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-slate-400 block">Duration (sec)</label>
                      <input
                        type="number"
                        min={2}
                        max={66}
                        value={targetDuration}
                        onChange={(e) =>
                          setTargetDuration(
                            Math.max(2, Math.min(66, Number(e.target.value) || 12))
                          )
                        }
                        className="w-full rounded-lg border border-slate-800 bg-[#0d0f14] px-3 py-2 font-mono text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 block">YouTube Format</label>
                      <select
                        value={aspectMode}
                        onChange={(e) => setAspectMode(e.target.value as AspectMode)}
                        className="w-full rounded-lg border border-slate-800 bg-[#0d0f14] px-2.5 py-2 text-slate-100"
                      >
                        <option value="9:16">9:16 Shorts</option>
                        <option value="16:9">16:9 Video</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={handleGenerateStoryboard}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isAnalyzing
                      ? liveProgressText || 'Analyzing Frames & Building 3D Scenes...'
                      : 'Generate 3D Storyboard & Animation'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Primary 3D Viewport + Collapsible Bottom Dock */}
            <div className="lg:col-span-8 flex flex-col items-center gap-4">
              <div className="w-full rounded-xl border border-slate-800 bg-[#12151d] p-4 flex flex-col items-center justify-center relative">
                <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-3 text-xs text-slate-400">
                  <span className="font-medium text-slate-200 truncate">
                    {activeShot?.title || '3D Diorama Stage'}
                  </span>
                  <span className="font-mono">
                    {aspectMode} · {aspectMode === '9:16' ? '720×1280' : '1280×720'} ·{' '}
                    {timelineConfig.fps}fps
                  </span>
                </div>

                {contextLost ? (
                  <div className="h-[540px] w-full flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                    <Video className="w-8 h-8 text-slate-500" />
                    <span>WebGL context lost — restoring 3D renderer...</span>
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-center bg-[#090b0f] rounded-xl border border-slate-800/80 p-3">
                    <canvas
                      ref={canvasRef}
                      width={aspectMode === '9:16' ? 720 : 1280}
                      height={aspectMode === '9:16' ? 1280 : 720}
                      className={`rounded-lg shadow-2xl ${
                        aspectMode === '9:16'
                          ? 'max-h-[62vh] w-auto aspect-[9/16]'
                          : 'w-full max-h-[62vh] aspect-[16/9] object-contain'
                      }`}
                    />
                  </div>
                )}

                {/* Collapsible Unified Control Dock */}
                <div className="w-full mt-3">
                  <div className="flex justify-center mb-1.5">
                    <button
                      type="button"
                      onClick={() => setDockExpanded(!dockExpanded)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#171b26] border border-slate-800 text-[11px] text-slate-300 hover:text-slate-100 cursor-pointer"
                    >
                      {dockExpanded ? (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          Hide Controls
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          Show Controls
                        </>
                      )}
                    </button>
                  </div>

                  {dockExpanded && (
                    <div className="rounded-xl border border-slate-800 bg-[#151923] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                Play
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPlaying(false);
                              setCurrentTime(0);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset
                          </button>

                          <button
                            type="button"
                            onClick={handleSaveFramePng}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            <ImageDown className="w-3.5 h-3.5" />
                            Save PNG
                          </button>
                        </div>

                        <div className="font-mono text-xs text-slate-200">
                          {currentTime.toFixed(2)}s / {timelineConfig.duration.toFixed(2)}s
                        </div>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={timelineConfig.duration}
                        step={0.02}
                        value={currentTime}
                        onChange={(e) => {
                          setIsPlaying(false);
                          setCurrentTime(Number(e.target.value));
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                          {shots.map((sh, i) => {
                            const isActive = activeShot?.id === sh.id;
                            return (
                              <button
                                key={sh.id}
                                type="button"
                                onClick={() => {
                                  setIsPlaying(false);
                                  setCurrentTime(sh.start + 0.05);
                                }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                                  isActive
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-[#0d0f14] text-slate-400 border border-slate-800 hover:text-slate-200'
                                }`}
                              >
                                Scene {i + 1}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-4 text-[11px] text-slate-400">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={timelineConfig.showCaptions}
                              onChange={(e) =>
                                setTimelineConfig((c) => ({
                                  ...c,
                                  showCaptions: e.target.checked
                                }))
                              }
                              className="accent-amber-500"
                            />
                            Captions
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span>Rig Speed</span>
                            <input
                              type="range"
                              min={0.4}
                              max={2.0}
                              step={0.1}
                              value={timelineConfig.globalArmSpeed}
                              onChange={(e) =>
                                setTimelineConfig((c) => ({
                                  ...c,
                                  globalArmSpeed: Number(e.target.value)
                                }))
                              }
                              className="w-20 accent-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'storyboard' && (
          <StoryboardEditor
            shots={shots}
            keyframes={keyframes}
            onChangeShots={(nextShots) => {
              setShots(nextShots);
              const maxEnd = Math.max(...nextShots.map((s) => s.end));
              setTimelineConfig((c) => ({ ...c, duration: maxEnd }));
              setTimelineSource({
                kind: 'manual',
                label: `Edited Storyboard (${maxEnd.toFixed(1)}s)`
              });
            }}
            onJumpToTime={(t) => {
              setCurrentTime(t);
              setActiveTab('stage');
            }}
          />
        )}

        {activeTab === 'characters' && (
          <CharacterStudio
            characters={characters}
            activeCharacterName={activeCharName}
            chromaTolerance={timelineConfig.chromaTolerance}
            haloWidthPx={timelineConfig.haloWidthPx}
            onSelectCharacter={setActiveCharName}
            onChangeCutSettings={handleChangeCutSettings}
            onUpdatePiece={handleUpdatePiece}
            onUploadCustomSheet={handleUploadCustomSheet}
            onGenerateGeminiSheet={async (name, desc) => {
              await handleGenerateGeminiSheet(name, desc, false);
            }}
            onAutoLabelPieces={handleAutoLabelPieces}
            isBusy={isCharBusy}
            liveProgressText={liveProgressText}
          />
        )}

        {activeTab === 'export' && (
          <ExportStudio
            aspectMode={aspectMode}
            timelineConfig={timelineConfig}
            shots={shots}
            timelineSourceLabel={timelineSource.label}
            pendingUploadWarning={
              hasUnanalyzedUpload && uploadedVideoName
                ? `Uploaded video "${uploadedVideoName}" (${targetDuration}s) has not been converted into a storyboard yet. Currently exporting "${timelineSource.label}".`
                : null
            }
            audioDataUrl={audioDataUrl}
            exportProgress={exportProgress}
            exportResult={exportResult}
            isExporting={isExporting}
            isGeneratingTts={isGeneratingTts}
            liveProgressText={liveProgressText}
            onChangeAspect={setAspectMode}
            onChangeTimeline={setTimelineConfig}
            onGenerateTts={handleGenerateTts}
            onUploadAudio={setAudioDataUrl}
            onRunExportMp4={handleExportMp4}
            onSaveFramePng={handleSaveFramePng}
            onGoToStage={() => handleSelectTab('stage')}
          />
        )}
      </main>
    </div>
  );
}

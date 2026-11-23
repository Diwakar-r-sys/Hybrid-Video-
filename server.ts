import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvModelList(
  listEnv: string | undefined,
  singleEnv: string | undefined,
  defaults: string[]
): string[] {
  const combined = listEnv || singleEnv;
  if (!combined || !combined.trim()) return defaults;
  return combined
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const HAS_CUSTOM_TEXT_MODELS = Boolean(
  process.env.GEMINI_TEXT_MODELS?.trim() || process.env.GEMINI_TEXT_MODEL?.trim()
);

const BASE_TEXT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
];

const ALL_KNOWN_TEXT_MODELS = [...BASE_TEXT_MODELS, 'gemini-4-hydrogen'];
const BASE_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image'
];
const BASE_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];

const HAS_CUSTOM_IMAGE_MODELS = Boolean(
  process.env.GEMINI_IMAGE_MODELS?.trim() || process.env.GEMINI_IMAGE_MODEL?.trim()
);
const HAS_CUSTOM_TTS_MODELS = Boolean(
  process.env.GEMINI_TTS_MODELS?.trim() || process.env.GEMINI_TTS_MODEL?.trim()
);

export const MODEL_CONFIG = {
  TEXT_MODELS: parseEnvModelList(
    process.env.GEMINI_TEXT_MODELS,
    process.env.GEMINI_TEXT_MODEL,
    BASE_TEXT_MODELS
  ),
  IMAGE_MODELS: parseEnvModelList(
    process.env.GEMINI_IMAGE_MODELS,
    process.env.GEMINI_IMAGE_MODEL,
    ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1']
  ),
  TTS_MODELS: parseEnvModelList(
    process.env.GEMINI_TTS_MODELS,
    process.env.GEMINI_TTS_MODEL,
    BASE_TTS_MODELS
  )
};

let modelsDiscoveredForKey = false;

function syncDiscoveredModels(availableNames: string[]): void {
  const availableSet = new Set(
    availableNames.map((n) => n.replace(/^models\//, '').trim()).filter(Boolean)
  );

  if (!HAS_CUSTOM_TEXT_MODELS) {
    const filteredText = ALL_KNOWN_TEXT_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.TEXT_MODELS.splice(0, MODEL_CONFIG.TEXT_MODELS.length, ...filteredText);
  } else {
    const filteredText = MODEL_CONFIG.TEXT_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.TEXT_MODELS.splice(0, MODEL_CONFIG.TEXT_MODELS.length, ...filteredText);
  }

  if (!HAS_CUSTOM_IMAGE_MODELS) {
    const filteredImg = BASE_IMAGE_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.IMAGE_MODELS.splice(0, MODEL_CONFIG.IMAGE_MODELS.length, ...filteredImg);
  } else {
    const filteredImg = MODEL_CONFIG.IMAGE_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.IMAGE_MODELS.splice(0, MODEL_CONFIG.IMAGE_MODELS.length, ...filteredImg);
  }

  if (!HAS_CUSTOM_TTS_MODELS) {
    const filteredTts = BASE_TTS_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.TTS_MODELS.splice(0, MODEL_CONFIG.TTS_MODELS.length, ...filteredTts);
  } else {
    const filteredTts = MODEL_CONFIG.TTS_MODELS.filter((m) => availableSet.has(m));
    MODEL_CONFIG.TTS_MODELS.splice(0, MODEL_CONFIG.TTS_MODELS.length, ...filteredTts);
  }

  modelsDiscoveredForKey = true;
}

async function listAvailableModelNames(ai: GoogleGenAI): Promise<Array<{ name: string; displayName?: string }>> {
  const pager = await ai.models.list();
  const available: Array<{ name: string; displayName?: string }> = [];
  for await (const m of pager) {
    available.push({
      name: (m.name || '').replace(/^models\//, ''),
      displayName: m.displayName
    });
  }
  syncDiscoveredModels(available.map((m) => m.name));
  return available;
}

const RETRY_BACKOFF_MS = [2000, 5000, 10000, 20000];
const MAX_TOTAL_WAIT_MS = 60_000;
const ATTEMPTS_PER_MODEL = 2;

const app = express();
app.use(express.json({ limit: '35mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to run AI analysis and voice synthesis.'
    );
  }
  const baseUrl = process.env.GOOGLE_GEMINI_BASE_URL?.trim();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(baseUrl ? { baseUrl } : {}),
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

export interface ModelAttemptFailure {
  model: string;
  attempt: string;
  status: number;
  reason: string;
}

interface RetryableError extends Error {
  status?: number;
  code?: number;
  retryable?: boolean;
  failures?: ModelAttemptFailure[];
}

function extractApiErrorInfo(err: unknown, attemptedModel?: string): {
  status: number;
  message: string;
  retryable: boolean;
  failures?: ModelAttemptFailure[];
} {
  const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown API error');
  const existingFailures = (err as RetryableError)?.failures;
  let status = (err as RetryableError)?.status || (err as RetryableError)?.code || 500;
  let cleanMessage = rawMsg;

  const jsonStart = rawMsg.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(rawMsg.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') status = parsed.error.code;
        if (parsed.error.message) cleanMessage = parsed.error.message;
      }
    } catch {
      // keep rawMsg if not valid JSON
    }
  }

  const numericStatus = typeof status === 'number' ? status : 500;

  if (numericStatus === 401 || /API_KEY_INVALID/i.test(rawMsg)) {
    return {
      status: 401,
      message: cleanMessage,
      retryable: false,
      failures: existingFailures
    };
  }

  if (numericStatus === 404 || /NOT_FOUND/i.test(rawMsg)) {
    return {
      status: 404,
      message: attemptedModel
        ? `model not found: ${attemptedModel} (${cleanMessage})`
        : cleanMessage,
      retryable: false,
      failures: existingFailures
    };
  }

  if (numericStatus === 400 || numericStatus === 403 || /PERMISSION_DENIED/i.test(rawMsg)) {
    return {
      status: numericStatus,
      message: cleanMessage,
      retryable: false,
      failures: existingFailures
    };
  }

  const explicitRetryable = (err as RetryableError)?.retryable;
  const retryable =
    typeof explicitRetryable === 'boolean'
      ? explicitRetryable
      : numericStatus === 503 ||
        numericStatus === 429 ||
        numericStatus === 502 ||
        numericStatus === 504 ||
        /503|429|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED|timeout|ECONNRESET|fetch failed/i.test(
          rawMsg
        );

  return {
    status: numericStatus,
    message: cleanMessage,
    retryable,
    failures: existingFailures
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SseResponder {
  isStream: boolean;
  sendProgress: (message: string) => void;
  sendJson: (status: number, body: Record<string, unknown>) => void;
}

function createResponder(req: express.Request, res: express.Response): SseResponder {
  const wantsStream =
    Boolean(req.headers.accept?.includes('text/event-stream')) ||
    req.query.stream === '1';

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  return {
    isStream: wantsStream,
    sendProgress: (message: string) => {
      if (wantsStream && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`);
      }
    },
    sendJson: (status: number, body: Record<string, unknown>) => {
      if (wantsStream) {
        if (!res.writableEnded) {
          const eventType = status >= 400 ? 'error' : 'result';
          res.write(`data: ${JSON.stringify({ type: eventType, status, ...body })}\n\n`);
          res.end();
        }
      } else {
        res.status(status).json(body);
      }
    }
  };
}

export async function generateWithRetry(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  modelsOrder: string[],
  onProgress?: (msg: string) => void
) {
  if (modelsOrder.length === 0) {
    const emptyErr = new Error(
      'No compatible Gemini models are available in /api/models for this API key.'
    ) as RetryableError;
    emptyErr.status = 404;
    emptyErr.retryable = false;
    emptyErr.failures = [];
    throw emptyErr;
  }

  const totalAttempts = Math.max(1, modelsOrder.length * ATTEMPTS_PER_MODEL);
  let globalAttempt = 0;
  let retryIndex = 0;
  let totalWaitMs = 0;
  let budgetExhausted = false;
  const failures: ModelAttemptFailure[] = [];
  let lastError: unknown;
  let lastModel = modelsOrder[0] || '';
  let lastInfo: { status: number; message: string; retryable: boolean } = {
    status: 500,
    message: 'No models configured',
    retryable: false
  };

  outer: for (let mIdx = 0; mIdx < modelsOrder.length; mIdx++) {
    const model = modelsOrder[mIdx];
    lastModel = model;

    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      globalAttempt++;
      try {
        const result = await ai.models.generateContent({
          ...params,
          model
        });
        return { result, modelUsed: model, failures };
      } catch (err: unknown) {
        lastError = err;
        const info = extractApiErrorInfo(err, model);
        lastInfo = info;
        const attemptLabel = `${globalAttempt}/${totalAttempts}`;

        failures.push({
          model,
          attempt: attemptLabel,
          status: info.status,
          reason: info.message
        });

        console.warn(
          `[Gemini] ${model} attempt ${attemptLabel} failed (${info.status}): ${info.message}`
        );

        // Only 401 (bad API key) aborts at once
        if (info.status === 401) {
          const authErr = new Error(info.message) as RetryableError;
          authErr.status = 401;
          authErr.retryable = false;
          authErr.failures = failures;
          throw authErr;
        }

        // 404 / 400 / 403 for ONE model: skip immediately to the NEXT model (no wait)
        if (info.status === 404 || info.status === 400 || info.status === 403) {
          if (mIdx < modelsOrder.length - 1) {
            onProgress?.(
              `${model} failed (${info.status}, attempt ${attemptLabel}); skipping to ${modelsOrder[mIdx + 1]}`
            );
          }
          break;
        }

        const hasMoreAttempts =
          attempt < ATTEMPTS_PER_MODEL || mIdx < modelsOrder.length - 1;
        if (!hasMoreAttempts) {
          break outer;
        }

        const remainingBudget = MAX_TOTAL_WAIT_MS - totalWaitMs;
        if (remainingBudget <= 0) {
          budgetExhausted = true;
          console.warn(
            `[Gemini] Wait budget (${MAX_TOTAL_WAIT_MS}ms) exhausted after attempt ${attemptLabel}; stopping.`
          );
          break outer;
        }

        const baseDelay =
          RETRY_BACKOFF_MS[Math.min(retryIndex, RETRY_BACKOFF_MS.length - 1)];
        const jitter = Math.floor(Math.random() * 450);
        const delayMs = Math.min(baseDelay + jitter, remainingBudget);

        if (delayMs <= 0) {
          budgetExhausted = true;
          break outer;
        }

        retryIndex++;
        totalWaitMs += delayMs;
        const delaySec = Math.max(1, Math.round(delayMs / 1000));
        const nextModel =
          attempt < ATTEMPTS_PER_MODEL ? model : modelsOrder[mIdx + 1];
        onProgress?.(
          `Gemini is busy (${model}), attempt ${attemptLabel} failed — waiting ${delaySec}s before ${nextModel}`
        );
        await sleep(delayMs);
      }
    }
  }

  const finalInfo = lastError ? extractApiErrorInfo(lastError, lastModel) : lastInfo;
  const anyTransient = failures.some(
    (f) => f.status === 503 || f.status === 429 || f.status === 502 || f.status === 504 || f.status >= 500
  );
  const message = budgetExhausted
    ? `Retry wait budget (${Math.round(MAX_TOTAL_WAIT_MS / 1000)}s) exhausted; last error: ${finalInfo.message}`
    : finalInfo.message;
  const finalErr = new Error(message) as RetryableError;
  finalErr.status = finalInfo.status;
  finalErr.retryable = finalInfo.status !== 401 && anyTransient;
  finalErr.failures = failures;
  throw finalErr;
}

app.get('/api/health', async (_req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ok: true,
      hasApiKey: false,
      models: MODEL_CONFIG
    });
    return;
  }

  try {
    const ai = getGeminiClient();
    await listAvailableModelNames(ai);
    res.json({
      ok: true,
      hasApiKey: true,
      modelsDiscovered: modelsDiscoveredForKey,
      models: MODEL_CONFIG
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    res.json({
      ok: true,
      hasApiKey: false,
      apiKeyError: info.message,
      modelsDiscovered: modelsDiscoveredForKey,
      models: MODEL_CONFIG
    });
  }
});

app.get('/api/models', async (_req, res) => {
  try {
    const ai = getGeminiClient();
    const available = await listAvailableModelNames(ai);
    res.json({
      ok: true,
      configured: MODEL_CONFIG,
      available
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
      ok: false,
      error: info.message,
      code: info.status,
      configured: MODEL_CONFIG
    });
  }
});

app.post('/api/youtube-info', async (req, res) => {
  const { youtubeUrl } = req.body as { youtubeUrl?: string };
  if (!youtubeUrl) {
    res.status(400).json({ error: 'youtubeUrl is required', retryable: false });
    return;
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      res.json({
        resolved: false,
        url: youtubeUrl,
        title: 'YouTube Style Reference',
        author: 'Channel UC2h3806SM2tCQL8MR5QQNAQ'
      });
      return;
    }
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    res.json({
      resolved: true,
      url: youtubeUrl,
      title: data.title || 'YouTube Video',
      author: data.author_name || 'YouTube Creator',
      thumbnailUrl: data.thumbnail_url || null
    });
  } catch {
    res.json({
      resolved: false,
      url: youtubeUrl,
      title: 'YouTube Style Reference',
      author: 'Channel UC2h3806SM2tCQL8MR5QQNAQ'
    });
  }
});

interface FrameInput {
  dataUrl: string;
  timestamp: number;
}

interface RawShotLike {
  id?: string;
  title?: string;
  start?: unknown;
  end?: unknown;
  environmentPreset?: string;
  camera?: {
    movement?: string;
    angle?: string;
    startPos?: number[];
    endPos?: number[];
    lookAtStart?: number[];
    lookAtEnd?: number[];
  };
  environment?: {
    surfaces?: string;
    lighting?: string;
    props?: string;
    lanternIntensity?: number;
    flickerAmp?: number;
  };
  props?: {
    scarfGrowthStart?: number;
    scarfGrowthEnd?: number;
    showChair?: boolean;
    showBars?: boolean;
    showPortrait?: boolean;
    showMouseHole?: boolean;
    showVillagers?: boolean;
  };
  characters?: Array<{
    name?: string;
    x?: number;
    scale?: number;
    pose?: string;
    action?: string;
    knittingSpeed?: number;
    armSwingAmp?: number;
    headTiltAmp?: number;
    bodyBobAmp?: number;
    walkCycleAmp?: number;
  }>;
  captions?: Array<{
    word?: string;
    start?: unknown;
    end?: unknown;
  }>;
  narrationText?: string;
}

interface NormalizedCaption {
  word: string;
  start: number;
  end: number;
}

interface NormalizedShot {
  id: string;
  title: string;
  start: number;
  end: number;
  environmentPreset: string;
  camera: {
    movement: string;
    angle: string;
    startPos: [number, number, number];
    endPos: [number, number, number];
    lookAtStart: [number, number, number];
    lookAtEnd: [number, number, number];
  };
  environment: {
    surfaces: string;
    lighting: string;
    props: string;
    lanternIntensity: number;
    flickerAmp: number;
  };
  props: {
    scarfGrowthStart: number;
    scarfGrowthEnd: number;
    showChair: boolean;
    showBars: boolean;
    showPortrait: boolean;
    showMouseHole: boolean;
    showVillagers: boolean;
  };
  characters: Array<{
    name: string;
    x: number;
    scale: number;
    pose: string;
    action: string;
    knittingSpeed: number;
    armSwingAmp: number;
    headTiltAmp: number;
    bodyBobAmp: number;
    walkCycleAmp: number;
  }>;
  captions: NormalizedCaption[];
  narrationText: string;
}

const VALID_ENV_PRESETS = new Set([
  'courtyard',
  'dungeon',
  'village',
  'throne_hall',
  'bare_wall'
]);

const VALID_CHARACTER_ACTIONS = new Set(['idle', 'knit', 'walk', 'point', 'stand_guard']);

function normalizeCharacterAction(rawAction: unknown): 'idle' | 'knit' | 'walk' | 'point' | 'stand_guard' {
  const s = String(rawAction || '').trim().toLowerCase();
  if (VALID_CHARACTER_ACTIONS.has(s)) {
    return s as 'idle' | 'knit' | 'walk' | 'point' | 'stand_guard';
  }
  if (/knit|stitch|needle|yarn|wool/.test(s)) return 'knit';
  if (/walk|march|step|stride|run/.test(s)) return 'walk';
  if (/point|gestur|boast|wave|shout|celebrat/.test(s)) return 'point';
  if (/guard|watch|stand|alert|spear/.test(s)) return 'stand_guard';
  return 'idle';
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toVec3(arr: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(arr) || arr.length < 3) return fallback;
  const x = Number(arr[0]);
  const y = Number(arr[1]);
  const z = Number(arr[2]);
  return [
    Number.isFinite(x) ? x : fallback[0],
    Number.isFinite(y) ? y : fallback[1],
    Number.isFinite(z) ? z : fallback[2]
  ];
}

function cloneShot(s: NormalizedShot): NormalizedShot {
  return {
    ...s,
    camera: {
      ...s.camera,
      startPos: [...s.camera.startPos] as [number, number, number],
      endPos: [...s.camera.endPos] as [number, number, number],
      lookAtStart: [...s.camera.lookAtStart] as [number, number, number],
      lookAtEnd: [...s.camera.lookAtEnd] as [number, number, number]
    },
    environment: { ...s.environment },
    props: { ...s.props },
    characters: s.characters.map((c) => ({ ...c })),
    captions: s.captions.map((cap) => ({ ...cap }))
  };
}

export function normalizeStoryboard(
  rawShots: unknown[],
  duration: number
): { shots: NormalizedShot[]; warnings: string[]; rawCoverage: number } {
  const safeDuration = Math.max(0.5, Number.isFinite(duration) ? duration : 12);
  const warnings: string[] = [];

  // 1. Drop shots with non-finite start/end and sanitize fields
  const parsed: NormalizedShot[] = [];
  let droppedNonFinite = 0;

  for (let idx = 0; idx < (Array.isArray(rawShots) ? rawShots.length : 0); idx++) {
    const raw = rawShots[idx] as RawShotLike | null | undefined;
    if (!raw || typeof raw !== 'object') {
      droppedNonFinite++;
      continue;
    }
    const startNum = Number(raw.start);
    const endNum = Number(raw.end);
    if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
      droppedNonFinite++;
      continue;
    }

    const envPreset = VALID_ENV_PRESETS.has(String(raw.environmentPreset || ''))
      ? String(raw.environmentPreset)
      : 'courtyard';

    const captions: NormalizedCaption[] = Array.isArray(raw.captions)
      ? raw.captions
          .map((c) => ({
            word: String(c?.word || '').trim(),
            start: Number(c?.start),
            end: Number(c?.end)
          }))
          .filter((c) => c.word.length > 0 && Number.isFinite(c.start) && Number.isFinite(c.end))
      : [];

    parsed.push({
      id: String(raw.id || `shot-${idx + 1}`),
      title: String(raw.title || `Scene ${idx + 1}`),
      start: startNum,
      end: endNum,
      environmentPreset: envPreset,
      camera: {
        movement: String(raw.camera?.movement || 'Gentle push-in'),
        angle: String(raw.camera?.angle || 'Eye-level'),
        startPos: toVec3(raw.camera?.startPos, [0, 2.35, 5.45]),
        endPos: toVec3(raw.camera?.endPos, [0, 2.2, 5.0]),
        lookAtStart: toVec3(raw.camera?.lookAtStart, [0, 1.35, 0]),
        lookAtEnd: toVec3(raw.camera?.lookAtEnd, [0, 1.25, 0.2])
      },
      environment: {
        surfaces: String(raw.environment?.surfaces || 'Cobblestone and stone'),
        lighting: String(raw.environment?.lighting || 'Warm storybook lantern'),
        props: String(raw.environment?.props || 'Knitted scarf'),
        lanternIntensity: Number.isFinite(Number(raw.environment?.lanternIntensity))
          ? Number(raw.environment?.lanternIntensity)
          : 2.6,
        flickerAmp: Number.isFinite(Number(raw.environment?.flickerAmp))
          ? Number(raw.environment?.flickerAmp)
          : 0.2
      },
      props: {
        scarfGrowthStart: Number.isFinite(Number(raw.props?.scarfGrowthStart))
          ? Math.max(0, Math.min(1, Number(raw.props?.scarfGrowthStart)))
          : 0,
        scarfGrowthEnd: Number.isFinite(Number(raw.props?.scarfGrowthEnd))
          ? Math.max(0, Math.min(1, Number(raw.props?.scarfGrowthEnd)))
          : 0.5,
        showChair: Boolean(raw.props?.showChair),
        showBars: Boolean(raw.props?.showBars),
        showPortrait: Boolean(raw.props?.showPortrait),
        showMouseHole: Boolean(raw.props?.showMouseHole),
        showVillagers: Boolean(raw.props?.showVillagers)
      },
      characters:
        Array.isArray(raw.characters) && raw.characters.length > 0
          ? raw.characters.map((ch) => ({
              name: String(ch?.name || 'Grandma'),
              x: Number.isFinite(Number(ch?.x)) ? Number(ch?.x) : 0,
              scale: Number.isFinite(Number(ch?.scale)) ? Math.max(0.3, Math.min(2, Number(ch?.scale))) : 1,
              pose: String(ch?.pose || 'Standing'),
              action: normalizeCharacterAction(ch?.action),
              knittingSpeed: Number.isFinite(Number(ch?.knittingSpeed)) ? Number(ch?.knittingSpeed) : 3.5,
              armSwingAmp: Number.isFinite(Number(ch?.armSwingAmp)) ? Number(ch?.armSwingAmp) : 0.2,
              headTiltAmp: Number.isFinite(Number(ch?.headTiltAmp)) ? Number(ch?.headTiltAmp) : 0.05,
              bodyBobAmp: Number.isFinite(Number(ch?.bodyBobAmp)) ? Number(ch?.bodyBobAmp) : 0.03,
              walkCycleAmp: Number.isFinite(Number(ch?.walkCycleAmp)) ? Number(ch?.walkCycleAmp) : 0
            }))
          : [
              {
                name: 'Grandma',
                x: 0,
                scale: 1,
                pose: 'Standing',
                action: 'knit',
                knittingSpeed: 4,
                armSwingAmp: 0.22,
                headTiltAmp: 0.05,
                bodyBobAmp: 0.03,
                walkCycleAmp: 0
              }
            ],
      captions,
      narrationText: String(raw.narrationText || '')
    });
  }

  if (droppedNonFinite > 0) {
    warnings.push(`Dropped ${droppedNonFinite} shot(s) with non-finite timestamps.`);
  }

  if (parsed.length === 0) {
    warnings.push(`Model returned 0 valid shots; synthesized fallback shot across 0.0s–${safeDuration.toFixed(1)}s.`);
    parsed.push({
      id: 'shot-1',
      title: 'Scene 1',
      start: 0,
      end: safeDuration,
      environmentPreset: 'courtyard',
      camera: {
        movement: 'Gentle push-in',
        angle: 'Eye-level',
        startPos: [0, 2.35, 5.45],
        endPos: [0, 2.2, 5.0],
        lookAtStart: [0, 1.35, 0],
        lookAtEnd: [0, 1.25, 0.2]
      },
      environment: {
        surfaces: 'Brick courtyard',
        lighting: 'Warm lantern',
        props: 'Knitted scarf',
        lanternIntensity: 2.6,
        flickerAmp: 0.2
      },
      props: {
        scarfGrowthStart: 0.05,
        scarfGrowthEnd: 0.9,
        showChair: false,
        showBars: false,
        showPortrait: false,
        showMouseHole: false,
        showVillagers: false
      },
      characters: [
        {
          name: 'Grandma',
          x: 0,
          scale: 1,
          pose: 'Standing',
          action: 'knit',
          knittingSpeed: 4,
          armSwingAmp: 0.22,
          headTiltAmp: 0.05,
          bodyBobAmp: 0.03,
          walkCycleAmp: 0
        }
      ],
      captions: [],
      narrationText: ''
    });
  }

  // Sort by start time
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);

  // 2. Detect milliseconds vs seconds
  const maxRawEnd = Math.max(...parsed.map((s) => s.end));
  if (maxRawEnd > safeDuration * 5) {
    for (const s of parsed) {
      s.start /= 1000;
      s.end /= 1000;
      for (const c of s.captions) {
        c.start /= 1000;
        c.end /= 1000;
      }
    }
    warnings.push(
      `Detected millisecond timestamps (max end ${maxRawEnd.toFixed(0)}ms); converted to seconds.`
    );
  }

  // Compute raw coverage before clamping & stretching last end to duration
  const preStretchLastEnd = Math.max(0, Math.min(safeDuration, Math.max(...parsed.map((s) => s.end))));
  const rawCoverage = preStretchLastEnd / safeDuration;

  // 3. Clamp to [0, duration] and fix inverted bounds
  let hadClamped = false;
  for (const s of parsed) {
    const cs = Math.max(0, Math.min(safeDuration, s.start));
    const ce = Math.max(cs, Math.min(safeDuration, s.end));
    if (cs !== s.start || ce !== s.end) hadClamped = true;
    s.start = cs;
    s.end = ce;
  }
  if (hadClamped) {
    warnings.push(`Clamped shot timestamps to [0, ${safeDuration.toFixed(1)}s].`);
  }

  // 4. Force first start = 0, contiguous start[i] = end[i-1], last end = duration
  let hadGapOrOverlap = false;
  if (Math.abs(parsed[0].start) > 0.01) hadGapOrOverlap = true;
  parsed[0].start = 0;
  if (parsed[0].end < 0) parsed[0].end = 0;

  for (let i = 1; i < parsed.length; i++) {
    const prevEnd = parsed[i - 1].end;
    if (Math.abs(parsed[i].start - prevEnd) > 0.01) {
      hadGapOrOverlap = true;
    }
    parsed[i].start = prevEnd;
    if (parsed[i].end < parsed[i].start) {
      parsed[i].end = parsed[i].start;
    }
  }

  const lastShot = parsed[parsed.length - 1];
  if (Math.abs(lastShot.end - safeDuration) > 0.05) {
    warnings.push(
      `Extended final shot end from ${lastShot.end.toFixed(2)}s to ${safeDuration.toFixed(2)}s to match video duration.`
    );
  }
  lastShot.end = safeDuration;

  if (hadGapOrOverlap) {
    warnings.push('Repaired timeline gaps/overlaps so every shot is contiguous (start[i] = end[i-1]).');
  }

  // 5. Remove shots shorter than 0.4s by merging into a neighbour
  let mergedCount = 0;
  if (safeDuration >= 0.4) {
    let idx = 0;
    while (parsed.length > 1 && idx < parsed.length) {
      const span = parsed[idx].end - parsed[idx].start;
      if (span < 0.4 - 1e-6) {
        mergedCount++;
        if (idx > 0) {
          const prev = parsed[idx - 1];
          const cur = parsed[idx];
          prev.end = cur.end;
          prev.captions = [...prev.captions, ...cur.captions];
          if (cur.narrationText) {
            prev.narrationText = [prev.narrationText, cur.narrationText].filter(Boolean).join(' ');
          }
          parsed.splice(idx, 1);
        } else {
          const cur = parsed[0];
          const next = parsed[1];
          next.start = cur.start;
          next.captions = [...cur.captions, ...next.captions];
          if (cur.narrationText) {
            next.narrationText = [cur.narrationText, next.narrationText].filter(Boolean).join(' ');
          }
          parsed.splice(0, 1);
        }
      } else {
        idx++;
      }
    }
  }
  if (mergedCount > 0) {
    warnings.push(`Merged ${mergedCount} short shot(s) (<0.4s) into neighbouring shots.`);
  }

  // 6. Split shots longer than 8s into equal parts with the same content
  const splitShots: NormalizedShot[] = [];
  let splitCount = 0;
  for (const shot of parsed) {
    const span = shot.end - shot.start;
    if (span > 8.0 + 1e-6) {
      const parts = Math.ceil(span / 8.0);
      splitCount += parts - 1;
      for (let p = 0; p < parts; p++) {
        const pStart = shot.start + (p / parts) * span;
        const pEnd = p === parts - 1 ? shot.end : shot.start + ((p + 1) / parts) * span;
        const copy = cloneShot(shot);
        copy.start = pStart;
        copy.end = pEnd;
        copy.title = parts > 1 ? `${shot.title} (${p + 1}/${parts})` : shot.title;

        const g0 = shot.props.scarfGrowthStart;
        const g1 = shot.props.scarfGrowthEnd;
        copy.props.scarfGrowthStart = round3(g0 + (g1 - g0) * (p / parts));
        copy.props.scarfGrowthEnd = round3(g0 + (g1 - g0) * ((p + 1) / parts));

        // Assign captions matching sub-window or clamp proportionally
        const matchingCaps = shot.captions.filter((c) => {
          const mid = (c.start + c.end) * 0.5;
          return mid >= pStart - 0.05 && mid <= pEnd + 0.05;
        });
        copy.captions = (matchingCaps.length > 0 ? matchingCaps : []).map((c) => ({
          word: c.word,
          start: round3(Math.max(pStart, Math.min(pEnd, c.start))),
          end: round3(Math.max(pStart, Math.min(pEnd, Math.max(c.start + 0.08, c.end))))
        }));

        splitShots.push(copy);
      }
    } else {
      splitShots.push(shot);
    }
  }
  if (splitCount > 0) {
    warnings.push(`Split long shot(s) (>8s) into ${splitShots.length} shots of <=8s each.`);
  }

  // 7. Final rounding & exact contiguity pass (0 .. duration) + clamp captions
  for (let i = 0; i < splitShots.length; i++) {
    const s = splitShots[i];
    s.id = `shot-${i + 1}`;
    s.start = i === 0 ? 0 : splitShots[i - 1].end;
    s.end = i === splitShots.length - 1 ? round3(safeDuration) : round3(Math.max(s.start, s.end));
    s.captions = s.captions
      .map((c) => {
        const cs = round3(Math.max(s.start, Math.min(s.end, c.start)));
        const ce = round3(Math.max(cs, Math.min(s.end, c.end)));
        return { word: c.word, start: cs, end: ce };
      })
      .filter((c) => c.word.length > 0);
  }

  return { shots: splitShots, warnings, rawCoverage };
}

function normalizeFrameInputs(
  rawFrames: Array<FrameInput | string>,
  duration: number
): FrameInput[] {
  const valid: FrameInput[] = [];
  const total = Math.max(1, rawFrames.length);
  for (let i = 0; i < rawFrames.length; i++) {
    const item = rawFrames[i];
    if (typeof item === 'string') {
      const fallbackTs = total > 1 ? (i / (total - 1)) * duration : 0;
      valid.push({ dataUrl: item, timestamp: fallbackTs });
    } else if (item && typeof item === 'object' && typeof item.dataUrl === 'string') {
      const ts = Number.isFinite(Number(item.timestamp))
        ? Math.max(0, Math.min(duration, Number(item.timestamp)))
        : total > 1
        ? (i / (total - 1)) * duration
        : 0;
      valid.push({ dataUrl: item.dataUrl, timestamp: ts });
    }
  }
  return valid;
}

const ANALYZE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    uniqueCharacters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ['name', 'description']
      }
    },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          start: { type: Type.NUMBER },
          end: { type: Type.NUMBER },
          environmentPreset: { type: Type.STRING },
          camera: {
            type: Type.OBJECT,
            properties: {
              movement: { type: Type.STRING },
              angle: { type: Type.STRING },
              startPos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              endPos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              lookAtStart: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              lookAtEnd: { type: Type.ARRAY, items: { type: Type.NUMBER } }
            },
            required: ['movement', 'angle', 'startPos', 'endPos', 'lookAtStart', 'lookAtEnd']
          },
          environment: {
            type: Type.OBJECT,
            properties: {
              surfaces: { type: Type.STRING },
              lighting: { type: Type.STRING },
              props: { type: Type.STRING },
              lanternIntensity: { type: Type.NUMBER },
              flickerAmp: { type: Type.NUMBER }
            },
            required: ['surfaces', 'lighting', 'props', 'lanternIntensity', 'flickerAmp']
          },
          props: {
            type: Type.OBJECT,
            properties: {
              scarfGrowthStart: { type: Type.NUMBER },
              scarfGrowthEnd: { type: Type.NUMBER },
              showChair: { type: Type.BOOLEAN },
              showBars: { type: Type.BOOLEAN },
              showPortrait: { type: Type.BOOLEAN },
              showMouseHole: { type: Type.BOOLEAN },
              showVillagers: { type: Type.BOOLEAN }
            },
            required: ['scarfGrowthStart', 'scarfGrowthEnd', 'showChair', 'showBars', 'showPortrait', 'showMouseHole', 'showVillagers']
          },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                x: { type: Type.NUMBER },
                scale: { type: Type.NUMBER },
                pose: { type: Type.STRING },
                action: {
                  type: Type.STRING,
                  enum: ['idle', 'knit', 'walk', 'point', 'stand_guard']
                },
                knittingSpeed: { type: Type.NUMBER },
                armSwingAmp: { type: Type.NUMBER },
                headTiltAmp: { type: Type.NUMBER },
                bodyBobAmp: { type: Type.NUMBER },
                walkCycleAmp: { type: Type.NUMBER }
              },
              required: ['name', 'x', 'scale', 'pose', 'action', 'knittingSpeed', 'armSwingAmp', 'headTiltAmp', 'bodyBobAmp', 'walkCycleAmp']
            }
          },
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER }
              },
              required: ['word', 'start', 'end']
            }
          },
          narrationText: { type: Type.STRING }
        },
        required: [
          'id',
          'title',
          'start',
          'end',
          'environmentPreset',
          'camera',
          'environment',
          'props',
          'characters',
          'captions',
          'narrationText'
        ]
      }
    }
  },
  required: ['title', 'uniqueCharacters', 'shots']
};

function buildFrameParts(
  selectedFrames: FrameInput[],
  totalDuration: number
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const frame of selectedFrames.slice(0, 8)) {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(frame.dataUrl);
    if (match) {
      parts.push({
        text: `Frame at ${frame.timestamp.toFixed(2)}s of ${totalDuration.toFixed(1)}s`
      });
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
    }
  }
  return parts;
}

app.post('/api/analyze', async (req, res) => {
  const responder = createResponder(req, res);
  try {
    const ai = getGeminiClient();
    const {
      promptText = '',
      youtubeUrl = '',
      channelId = 'UC2h3806SM2tCQL8MR5QQNAQ',
      duration = 12,
      frames = [],
      aspectMode = '9:16'
    } = req.body as {
      promptText?: string;
      youtubeUrl?: string;
      channelId?: string;
      duration?: number;
      frames?: Array<FrameInput | string>;
      aspectMode?: string;
    };

    const safeDuration = Math.max(1, Number.isFinite(Number(duration)) ? Number(duration) : 12);
    const normalizedFrames = normalizeFrameInputs(frames, safeDuration);
    const shotTargetCount = Math.max(3, Math.min(24, Math.round(safeDuration / 3)));

    const buildInstruction = (
      rangeStart: number,
      rangeEnd: number,
      targetCount: number,
      correctionNote?: string
    ) => `You are a master 3D storybook diorama + 2D paper-cutout animation director.
Analyze the uploaded timestamped video frames (if provided) and the user's story/YouTube reference, and output a deterministic multi-shot JSON storyboard in the signature style of YouTube channel ${channelId}:
- 3D Three.js miniature diorama environments chosen from ONLY these 5 preset keys: "courtyard", "dungeon", "village", "throne_hall", "bare_wall".
- 2D flat paper-cutout cartoon characters with crisp white sticker outlines. Use exact consistent names across uniqueCharacters and shots[].characters[].name (prefer standard names "Grandma", "King", "Soldier" when those roles appear, plus any extra unique characters such as "Villager", "Mouse", etc. listed in uniqueCharacters).
- Character "action" field must be one of: "idle", "knit", "walk", "point", "stand_guard".
- Dynamic 3D knitted/ribbon prop path growth (scarfGrowthStart -> scarfGrowthEnd in 0..1).
- Smooth camera dolly/pan keyframes (camera coordinates around x: -1..1, y: 1.8..3.2, z: 4.2..6.2 looking at y: 0.8..1.8).
- Concise word-by-word bold burned-in captions (4 to 10 key words per shot) with exact start and end timestamps in SECONDS.

Context from user:
- Target Aspect Ratio: ${aspectMode}
- Total Video Duration: ${safeDuration.toFixed(1)} seconds
- Current Segment Time Range: ${rangeStart.toFixed(2)}s to ${rangeEnd.toFixed(2)}s
- YouTube Link / Channel: ${youtubeUrl || `https://www.youtube.com/channel/${channelId}`}
- Story / Reconstruction Prompt: ${promptText || 'Recreate the story in the 3D diorama + 2D paper-cutout sticker style with continuous deterministic motion.'}

Ensure shots are contiguous in SECONDS covering ${rangeStart.toFixed(2)} to ${rangeEnd.toFixed(2)} (about one shot every 2.5 to 4 seconds: ${targetCount} distinct shots), with exact timed captions.${
      correctionNote ? `\n\nIMPORTANT CORRECTION: ${correctionNote}` : ''
    }`;

    const mergedShots: unknown[] = [];
    const characterMap = new Map<string, { name: string; description: string }>();
    let storyboardTitle = '';
    let lastModelUsed = MODEL_CONFIG.TEXT_MODELS[0];

    if (safeDuration > 30) {
      const numChunks = Math.ceil(safeDuration / 15);
      const chunkLen = safeDuration / numChunks;

      for (let c = 0; c < numChunks; c++) {
        const chunkStart = Number((c * chunkLen).toFixed(2));
        const chunkEnd = Number(
          (c === numChunks - 1 ? safeDuration : (c + 1) * chunkLen).toFixed(2)
        );
        responder.sendProgress(
          `Analyzing chunk ${c + 1}/${numChunks} (${chunkStart.toFixed(1)}s–${chunkEnd.toFixed(1)}s)...`
        );

        let chunkFrames = normalizedFrames.filter(
          (f) => f.timestamp >= chunkStart - 1.5 && f.timestamp <= chunkEnd + 1.5
        );
        if (chunkFrames.length === 0 && normalizedFrames.length > 0) {
          const mid = (chunkStart + chunkEnd) * 0.5;
          chunkFrames = [...normalizedFrames]
            .sort((a, b) => Math.abs(a.timestamp - mid) - Math.abs(b.timestamp - mid))
            .slice(0, 4);
        }

        const chunkShotCount = Math.max(
          2,
          Math.min(8, Math.round((chunkEnd - chunkStart) / 3))
        );
        const parts = [
          ...buildFrameParts(chunkFrames.slice(0, 8), safeDuration),
          { text: buildInstruction(chunkStart, chunkEnd, chunkShotCount) }
        ];

        const { result: response, modelUsed } = await generateWithRetry(
          ai,
          {
            contents: { parts },
            config: {
              responseMimeType: 'application/json',
              responseSchema: ANALYZE_RESPONSE_SCHEMA
            }
          },
          MODEL_CONFIG.TEXT_MODELS,
          responder.sendProgress
        );
        lastModelUsed = modelUsed;
        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          title?: string;
          uniqueCharacters?: Array<{ name: string; description: string }>;
          shots?: unknown[];
        };
        if (!storyboardTitle && parsed.title) storyboardTitle = parsed.title;
        for (const uc of parsed.uniqueCharacters || []) {
          const key = (uc?.name || '').trim().toLowerCase();
          if (key && !characterMap.has(key)) {
            characterMap.set(key, uc);
          }
        }
        if (Array.isArray(parsed.shots)) {
          mergedShots.push(...parsed.shots);
        }
      }
    } else {
      const parts = [
        ...buildFrameParts(normalizedFrames.slice(0, 8), safeDuration),
        { text: buildInstruction(0, safeDuration, shotTargetCount) }
      ];
      const { result: response, modelUsed } = await generateWithRetry(
        ai,
        {
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: ANALYZE_RESPONSE_SCHEMA
          }
        },
        MODEL_CONFIG.TEXT_MODELS,
        responder.sendProgress
      );
      lastModelUsed = modelUsed;
      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        title?: string;
        uniqueCharacters?: Array<{ name: string; description: string }>;
        shots?: unknown[];
      };
      if (parsed.title) storyboardTitle = parsed.title;
      for (const uc of parsed.uniqueCharacters || []) {
        const key = (uc?.name || '').trim().toLowerCase();
        if (key && !characterMap.has(key)) {
          characterMap.set(key, uc);
        }
      }
      if (Array.isArray(parsed.shots)) {
        mergedShots.push(...parsed.shots);
      }
    }

    let normalized = normalizeStoryboard(mergedShots, safeDuration);

    // If raw coverage < 0.8, call the model ONCE more with a correction message, then normalize again
    if (normalized.rawCoverage < 0.8) {
      const coveredEnd = (normalized.rawCoverage * safeDuration).toFixed(2);
      const problem = `Your previous storyboard only covered 0.0s to ${coveredEnd}s out of ${safeDuration.toFixed(1)}s (${Math.round(normalized.rawCoverage * 100)}% coverage, minimum 80% required). Generate ${shotTargetCount} contiguous shots in SECONDS covering the entire 0.0s to ${safeDuration.toFixed(1)}s timeline.`;
      responder.sendProgress(
        `Coverage was only ${Math.round(normalized.rawCoverage * 100)}% (${coveredEnd}s/${safeDuration.toFixed(1)}s); requesting full-duration correction...`
      );
      const corrParts = [
        ...buildFrameParts(normalizedFrames.slice(0, 8), safeDuration),
        { text: buildInstruction(0, safeDuration, shotTargetCount, problem) }
      ];
      const { result: corrResp, modelUsed: corrModel } = await generateWithRetry(
        ai,
        {
          contents: { parts: corrParts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: ANALYZE_RESPONSE_SCHEMA
          }
        },
        MODEL_CONFIG.TEXT_MODELS,
        responder.sendProgress
      );
      lastModelUsed = corrModel;
      const corrParsed = JSON.parse((corrResp.text ?? '{}').trim()) as {
        title?: string;
        uniqueCharacters?: Array<{ name: string; description: string }>;
        shots?: unknown[];
      };
      if (corrParsed.title) storyboardTitle = corrParsed.title;
      for (const uc of corrParsed.uniqueCharacters || []) {
        const key = (uc?.name || '').trim().toLowerCase();
        if (key && !characterMap.has(key)) {
          characterMap.set(key, uc);
        }
      }
      if (Array.isArray(corrParsed.shots) && corrParsed.shots.length > 0) {
        const reNormalized = normalizeStoryboard(corrParsed.shots, safeDuration);
        normalized = {
          shots: reNormalized.shots,
          warnings: [
            `Initial model coverage was ${Math.round(normalized.rawCoverage * 100)}% (${coveredEnd}s/${safeDuration.toFixed(1)}s); ran 1 correction pass.`,
            ...reNormalized.warnings
          ],
          rawCoverage: reNormalized.rawCoverage
        };
      } else {
        normalized.warnings.unshift(
          `Initial model coverage was ${Math.round(normalized.rawCoverage * 100)}% (${coveredEnd}s/${safeDuration.toFixed(1)}s); correction returned no shots so timeline was normalized.`
        );
      }
    }

    responder.sendJson(200, {
      title: storyboardTitle || `AI Storyboard (${safeDuration.toFixed(1)}s)`,
      uniqueCharacters: Array.from(characterMap.values()),
      shots: normalized.shots,
      warnings: normalized.warnings,
      modelUsed: lastModelUsed
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Analyze error:', err);
    const code = info.status >= 400 && info.status < 600 ? info.status : 500;
    responder.sendJson(code, {
      error: info.message,
      code,
      retryable: info.retryable,
      ...(info.failures ? { failedModels: info.failures } : {})
    });
  }
});

app.post('/api/generate-character-sheet', async (req, res) => {
  const responder = createResponder(req, res);
  try {
    const ai = getGeminiClient();
    const {
      characterName = 'Character',
      description = '2D paper-cutout storybook character',
      referenceFrameDataUrl
    } = req.body as {
      characterName?: string;
      description?: string;
      referenceFrameDataUrl?: string;
    };

    const refImageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    if (referenceFrameDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(referenceFrameDataUrl);
      if (match) {
        refImageParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }

    const imagePrompt = `Use the reference as the exact character: "${characterName}" (${description}).
Draw a clean 2D paper-cutout animation character parts kit on a solid #FF00FF magenta background, 1:1 square layout, separated cleanly on an 80px grid with generous #FF00FF empty space between every piece so no pieces touch or overlap.
Include these separate non-overlapping pieces, with all hidden areas (armpits, shoulders, hips, neck) cleanly drawn:
1. HEAD (full head, hair/hat/crown/helmet, face, and short neck stub at bottom center)
2. TORSO without arms (full coat/dress/tunic/armor, no arms attached)
3. LEFT UPPER ARM (shoulder to elbow)
4. LEFT FOREARM+HAND (elbow to hand)
5. RIGHT UPPER ARM (shoulder to elbow)
6. RIGHT FOREARM+HAND (elbow to hand)
7. KNITTING NEEDLES / HAND PROP (if character holds a prop such as knitting needles, scepter, spear, or tool)
8. SCARF STRIP / ACCESSORY (scarf strip, sash, or shield)
9. LEFT LEG+SHOE
10. RIGHT LEG+SHOE

Style rules: flat 2D cartoon storybook illustration, thin dark brown outline (#3a2418), soft paper texture, no white outline, no shadows, no text, no labels, no grid lines drawn, solid #FF00FF chroma background only.`;

    // Primary path: IMAGE_MODELS via generateContent
    if (MODEL_CONFIG.IMAGE_MODELS.length > 0) {
      try {
        responder.sendProgress(`Generating #FF00FF character parts sheet for ${characterName}...`);
        const { result: imgResp, modelUsed } = await generateWithRetry(
          ai,
          {
            contents: {
              parts: [...refImageParts, { text: imagePrompt }]
            },
            config: {
              imageConfig: {
                aspectRatio: '1:1'
              }
            }
          },
          MODEL_CONFIG.IMAGE_MODELS,
          responder.sendProgress
        );

        const partsOut = imgResp.candidates?.[0]?.content?.parts ?? [];
        for (const p of partsOut) {
          if (p.inlineData?.data) {
            const mime = p.inlineData.mimeType || 'image/png';
            responder.sendJson(200, {
              sheetDataUrl: `data:${mime};base64,${p.inlineData.data}`,
              source: 'gemini-image',
              modelUsed
            });
            return;
          }
        }
        console.warn('[CharacterSheet] Image model returned no inlineData part; falling back to low-quality SVG.');
      } catch (imgErr: unknown) {
        const imgInfo = extractApiErrorInfo(imgErr);
        if (imgInfo.status === 401) {
          throw imgErr;
        }
        console.warn('[CharacterSheet] IMAGE_MODELS failed, falling back to low-quality SVG:', imgInfo.message);
        responder.sendProgress(
          `Image model unavailable (${imgInfo.message}); using low quality SVG fallback...`
        );
      }
    }

    // Last-resort fallback: TEXT_MODELS SVG generation labelled "low quality"
    const svgParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      ...refImageParts,
      {
        text: `Create a clean 2D paper-cutout character rig parts kit in SVG format for "${characterName}" (${description}).
Return JSON containing standalone <svg viewBox="0 0 240 240" width="240" height="240" xmlns="http://www.w3.org/2000/svg">...</svg> strings for each anatomical part.
Rules for every SVG part:
- Flat 2D cartoon storybook illustration with rich layered details and uniform dark brown stroke="#3a2418" stroke-width="4" stroke-linejoin="round" stroke-linecap="round".
- NO background rect (transparent background only, NEVER fill magenta or white behind the part).
- NO text, NO labels, NO shadows.
- Proportional anatomical sizing across parts:
  * Head: round expressive head + hair/hat/helmet + facial features + short neck stub at bottom center.
  * Torso: coat/dress/tunic/armor centered in 240x240 with NO arms attached.
  * LeftArm: sleeve + cuff + hand pointing downward, shoulder top near y=25.
  * RightArm: sleeve + cuff + hand pointing downward, shoulder top near y=25.
  * LeftLeg: stocking/trouser + boot facing slightly left, hip top near y=25.
  * RightLeg: stocking/trouser + boot facing slightly right, hip top near y=25.
  * PropNeedles: optional hand prop or empty string if unused.
  * PropScarf: optional front accessory or empty string if unused.`
      }
    ];

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: { parts: svgParts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              Head: { type: Type.STRING },
              Torso: { type: Type.STRING },
              LeftArm: { type: Type.STRING },
              RightArm: { type: Type.STRING },
              LeftLeg: { type: Type.STRING },
              RightLeg: { type: Type.STRING },
              PropNeedles: { type: Type.STRING },
              PropScarf: { type: Type.STRING }
            },
            required: ['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg']
          }
        }
      },
      MODEL_CONFIG.TEXT_MODELS,
      responder.sendProgress
    );

    const parsed = JSON.parse((response.text ?? '{}').trim());
    responder.sendJson(200, {
      partsSvgMap: parsed,
      source: 'gemini-svg-low-quality',
      qualityWarning: 'low quality',
      modelUsed
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Character sheet error:', err);
    const code = info.status >= 400 && info.status < 600 ? info.status : 500;
    responder.sendJson(code, {
      error: info.message,
      code,
      retryable: info.retryable,
      ...(info.failures ? { failedModels: info.failures } : {})
    });
  }
});

app.post('/api/auto-label-parts', async (req, res) => {
  const responder = createResponder(req, res);
  try {
    const ai = getGeminiClient();
    const { pieces } = req.body as {
      pieces: Array<{ id: string; imageDataUrl: string }>;
    };
    if (!pieces || pieces.length === 0) {
      responder.sendJson(400, { error: 'No pieces provided for labeling', retryable: false });
      return;
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        text: `Identify the anatomical rig role of each numbered cutout piece below. Choose each role from: Head, Torso, LeftUpperArm, LeftForearm, RightUpperArm, RightForearm, LeftArm, RightArm, LeftLeg, RightLeg, PropNeedles, PropScarf, Ignore.`
      }
    ];

    pieces.slice(0, 14).forEach((piece, idx) => {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(piece.imageDataUrl);
      if (match) {
        parts.push({ text: `Piece ID: ${piece.id} (item #${idx + 1})` });
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    });

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                role: { type: Type.STRING }
              },
              required: ['id', 'role']
            }
          }
        }
      },
      MODEL_CONFIG.TEXT_MODELS,
      responder.sendProgress
    );

    const assignments = JSON.parse((response.text ?? '[]').trim());
    responder.sendJson(200, { assignments, modelUsed });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Auto-label error:', err);
    const code = info.status >= 400 && info.status < 600 ? info.status : 500;
    responder.sendJson(code, {
      error: info.message,
      code,
      retryable: info.retryable,
      ...(info.failures ? { failedModels: info.failures } : {})
    });
  }
});

export function wrapRawPcm16MonoAsWav(
  rawBuf: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  // If upstream already returned a valid RIFF/WAVE header, do not double-wrap
  if (
    rawBuf.length >= 44 &&
    rawBuf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    rawBuf.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return rawBuf;
  }

  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = rawBuf.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format = 1
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, rawBuf]);
}

app.post('/api/tts', async (req, res) => {
  const responder = createResponder(req, res);
  try {
    const ai = getGeminiClient();
    const {
      text,
      voiceName = 'Kore',
      style = 'expressive storybook narrator voice'
    } = req.body as {
      text: string;
      voiceName?: string;
      style?: string;
    };
    if (!text || !text.trim()) {
      responder.sendJson(400, { error: 'Narration text is required', retryable: false });
      return;
    }

    const cleanStyle = style.trim().replace(/^say in (a|an)\s+/i, '').replace(/:\s*$/, '');
    const styledPrompt = `Say in an ${cleanStyle}: ${text.trim()}`;

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: styledPrompt }]
          }
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      },
      MODEL_CONFIG.TTS_MODELS,
      responder.sendProgress
    );

    const inlineAudio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const base64Audio = inlineAudio?.data;
    if (!base64Audio) {
      responder.sendJson(502, { error: 'No audio returned by TTS model', retryable: true });
      return;
    }

    const rawBytes = Buffer.from(base64Audio, 'base64');
    const wavBuffer = wrapRawPcm16MonoAsWav(rawBytes, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');

    responder.sendJson(200, {
      audioDataUrl: `data:audio/wav;base64,${wavBase64}`,
      modelUsed,
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('TTS error:', err);
    const code = info.status >= 400 && info.status < 600 ? info.status : 500;
    responder.sendJson(code, {
      error: info.message,
      code,
      retryable: info.retryable,
      ...(info.failures ? { failedModels: info.failures } : {})
    });
  }
});

// Return JSON 404 for unknown /api/* routes before SPA fallback
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
    code: 404,
    retryable: false
  });
});

// Ensure /api/* errors always return JSON instead of HTML error pages
app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const info = extractApiErrorInfo(err);
  res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
    error: info.message,
    code: info.status,
    retryable: info.retryable,
    ...(info.failures ? { failedModels: info.failures } : {})
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distPath, 'index.html');
    if (!fs.existsSync(distPath) || !fs.existsSync(distIndex)) {
      throw new Error(
        `Production build missing: ${distIndex} not found. Run "npm run build" before starting in production mode.`
      );
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      await listAvailableModelNames(getGeminiClient());
    } catch (err) {
      const info = extractApiErrorInfo(err);
      console.warn(`[Models] Startup model discovery skipped (${info.status}): ${info.message}`);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CutoutStage 3D studio listening on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();

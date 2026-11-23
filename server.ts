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

const DEFAULT_TEXT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
];

export const MODEL_CONFIG = {
  TEXT_MODELS: parseEnvModelList(
    process.env.GEMINI_TEXT_MODELS,
    process.env.GEMINI_TEXT_MODEL,
    DEFAULT_TEXT_MODELS
  ),
  IMAGE_MODELS: parseEnvModelList(
    process.env.GEMINI_IMAGE_MODELS,
    process.env.GEMINI_IMAGE_MODEL,
    ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image']
  ),
  TTS_MODELS: parseEnvModelList(
    process.env.GEMINI_TTS_MODELS,
    process.env.GEMINI_TTS_MODEL,
    ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']
  )
};

function syncDiscoveredTextModels(availableNames: string[]): void {
  if (HAS_CUSTOM_TEXT_MODELS) return;
  const hasHydrogen = availableNames.includes('gemini-4-hydrogen');
  const next = hasHydrogen
    ? [...DEFAULT_TEXT_MODELS, 'gemini-4-hydrogen']
    : [...DEFAULT_TEXT_MODELS];
  MODEL_CONFIG.TEXT_MODELS.splice(0, MODEL_CONFIG.TEXT_MODELS.length, ...next);
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
    const pager = await ai.models.list();
    const names: string[] = [];
    for await (const m of pager) {
      if (m.name) names.push(m.name.replace(/^models\//, ''));
    }
    syncDiscoveredTextModels(names);
    res.json({
      ok: true,
      hasApiKey: true,
      models: MODEL_CONFIG
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    res.json({
      ok: true,
      hasApiKey: false,
      apiKeyError: info.message,
      models: MODEL_CONFIG
    });
  }
});

app.get('/api/models', async (_req, res) => {
  try {
    const ai = getGeminiClient();
    const pager = await ai.models.list();
    const available: Array<{ name: string; displayName?: string }> = [];
    for await (const m of pager) {
      available.push({
        name: (m.name || '').replace(/^models\//, ''),
        displayName: m.displayName
      });
    }
    syncDiscoveredTextModels(available.map((m) => m.name));
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
      frames?: string[];
      aspectMode?: string;
    };

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    for (const frameUrl of frames.slice(0, 10)) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(frameUrl);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    }

    const shotTargetCount = duration > 30 ? '5 to 7' : duration > 10 ? '3 to 5' : '2 to 4';

    const instructionText = `You are a master 3D storybook diorama + 2D paper-cutout animation director.
Analyze the uploaded video frames (if provided) and the user's story/YouTube reference, and output a deterministic multi-shot JSON storyboard in the signature style of YouTube channel ${channelId}:
- 3D Three.js miniature diorama environments chosen from ONLY these 5 preset keys: "courtyard", "dungeon", "village", "throne_hall", "bare_wall".
- 2D flat paper-cutout cartoon characters with crisp white sticker outlines. Use exact consistent names across uniqueCharacters and shots[].characters[].name (prefer standard names "Grandma", "King", "Soldier" when those roles appear, plus any extra unique characters such as "Villager", "Mouse", etc. listed in uniqueCharacters).
- Dynamic 3D knitted/ribbon prop path growth (scarfGrowthStart -> scarfGrowthEnd in 0..1).
- Smooth camera dolly/pan keyframes (camera coordinates around x: -1..1, y: 1.8..3.2, z: 4.2..6.2 looking at y: 0.8..1.8).
- Concise word-by-word bold burned-in captions (4 to 10 key words per shot) with exact start and end timestamps spanning 0.0 to ${duration} seconds.

Context from user:
- Target Aspect Ratio: ${aspectMode}
- Target Total Duration: ${duration} seconds
- YouTube Link / Channel: ${youtubeUrl || `https://www.youtube.com/channel/${channelId}`}
- Story / Reconstruction Prompt: ${promptText || 'Recreate the story in the 3D diorama + 2D paper-cutout sticker style with continuous deterministic motion.'}

Ensure shots are contiguous from 0.0 to ${duration}, with ${shotTargetCount} distinct shots and exact timed captions.`;

    parts.push({ text: instructionText });

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
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
                          action: { type: Type.STRING },
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
          }
        }
      },
      MODEL_CONFIG.TEXT_MODELS,
      responder.sendProgress
    );

    const jsonStr = (response.text ?? '{}').trim();
    const parsed = JSON.parse(jsonStr);
    responder.sendJson(200, { ...parsed, modelUsed });
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

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (referenceFrameDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(referenceFrameDataUrl);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }

    parts.push({
      text: `Create a clean 2D paper-cutout character rig parts kit in SVG format for "${characterName}" (${description}).
Return JSON containing standalone <svg viewBox="0 0 240 240" width="240" height="240" xmlns="http://www.w3.org/2000/svg">...</svg> strings for each anatomical part.
Rules for every SVG part:
- Flat 2D cartoon storybook illustration with rich layered details and uniform dark brown stroke="#3a2418" stroke-width="4" stroke-linejoin="round" stroke-linecap="round".
- NO background rect (transparent background only, NEVER fill magenta or white behind the part).
- NO text, NO labels, NO shadows.
- Proportional anatomical sizing across parts:
  * Head: round expressive head + hair/hat/helmet + facial features + short neck stub at bottom center (around y=210..230).
  * Torso: coat/dress/tunic/armor centered in 240x240 with NO arms attached.
  * LeftArm: sleeve + cuff + hand pointing downward, shoulder top near y=25.
  * RightArm: sleeve + cuff + hand pointing downward, shoulder top near y=25.
  * LeftLeg: stocking/trouser + boot facing slightly left, hip top near y=25.
  * RightLeg: stocking/trouser + boot facing slightly right, hip top near y=25.
  * PropNeedles: optional hand prop (e.g. wooden sticks/spear/scepter/tool) or empty string if unused.
  * PropScarf: optional front accessory (e.g. scarf/shield/sash/apron ribbon) or empty string if unused.`
    });

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: { parts },
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
    responder.sendJson(200, { partsSvgMap: parsed, modelUsed });
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
        text: `Identify the anatomical rig role of each numbered cutout piece below. Choose each role from: Head, Torso, LeftArm, RightArm, LeftLeg, RightLeg, PropNeedles, PropScarf, Ignore.`
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

app.post('/api/tts', async (req, res) => {
  const responder = createResponder(req, res);
  try {
    const ai = getGeminiClient();
    const { text, voiceName = 'Kore', style = 'Expressive storybook narrator' } = req.body as {
      text: string;
      voiceName?: string;
      style?: string;
    };
    if (!text || !text.trim()) {
      responder.sendJson(400, { error: 'Narration text is required', retryable: false });
      return;
    }

    const { result: response, modelUsed } = await generateWithRetry(
      ai,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
                speechMetadata: { style }
              }
            ]
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

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      responder.sendJson(502, { error: 'No audio returned by TTS model', retryable: true });
      return;
    }

    responder.sendJson(200, {
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      modelUsed
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CutoutStage 3D studio listening on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();

import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '35mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to run AI analysis and voice synthesis.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

interface RetryableError extends Error {
  status?: number;
  code?: number;
}

function extractApiErrorInfo(err: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown API error');
  let status = (err as RetryableError)?.status || (err as RetryableError)?.code || 500;
  let cleanMessage = rawMsg;

  // Handle nested JSON string inside @google/genai Error.message
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

  const retryable =
    status === 503 ||
    status === 429 ||
    status === 502 ||
    status === 504 ||
    /503|429|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED|timeout|ECONNRESET/i.test(
      rawMsg
    );

  return { status: typeof status === 'number' ? status : 500, message: cleanMessage, retryable };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  modelsOrder: string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
) {
  let lastError: unknown;

  for (let mIdx = 0; mIdx < modelsOrder.length; mIdx++) {
    const model = modelsOrder[mIdx];
    const maxAttempts = mIdx === 0 ? 3 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await ai.models.generateContent({
          ...params,
          model
        });
        return { result, modelUsed: model };
      } catch (err: unknown) {
        lastError = err;
        const info = extractApiErrorInfo(err);
        console.warn(
          `[Gemini] ${model} attempt ${attempt}/${maxAttempts} failed (${info.status}): ${info.message}`
        );
        if (!info.retryable) {
          throw err;
        }
        if (attempt < maxAttempts) {
          const jitter = Math.floor(Math.random() * 350);
          await sleep(800 * attempt + jitter);
        }
      }
    }
  }

  throw lastError;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY)
  });
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

    // Attach up to 10 representative video frames to keep payload fast & reliable on long timelines
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
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
    );

    const jsonStr = (response.text ?? '{}').trim();
    const parsed = JSON.parse(jsonStr);
    res.json({ ...parsed, modelUsed });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Analyze error:', err);
    res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
      error: info.message,
      code: info.status,
      retryable: info.retryable
    });
  }
});

app.post('/api/generate-character-sheet', async (req, res) => {
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
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
    );

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ partsSvgMap: parsed, modelUsed });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Character sheet error:', err);
    res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
      error: info.message,
      code: info.status,
      retryable: info.retryable
    });
  }
});

app.post('/api/auto-label-parts', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { pieces } = req.body as {
      pieces: Array<{ id: string; imageDataUrl: string }>;
    };
    if (!pieces || pieces.length === 0) {
      res.status(400).json({ error: 'No pieces provided for labeling', retryable: false });
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
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
    );

    const assignments = JSON.parse((response.text ?? '[]').trim());
    res.json({ assignments, modelUsed });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('Auto-label error:', err);
    res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
      error: info.message,
      code: info.status,
      retryable: info.retryable
    });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { text, voiceName = 'Kore', style = 'Expressive storybook narrator' } = req.body as {
      text: string;
      voiceName?: string;
      style?: string;
    };
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Narration text is required', retryable: false });
      return;
    }

    const { result: response } = await generateWithRetry(
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
      ['gemini-3.8-flash-lite-tts']
    );

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: 'No audio returned by TTS model', retryable: true });
      return;
    }

    res.json({
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`
    });
  } catch (err: unknown) {
    const info = extractApiErrorInfo(err);
    console.error('TTS error:', err);
    res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
      error: info.message,
      code: info.status,
      retryable: info.retryable
    });
  }
});

// Ensure /api/* errors always return JSON instead of HTML error pages
app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const info = extractApiErrorInfo(err);
  res.status(info.status >= 400 && info.status < 600 ? info.status : 500).json({
    error: info.message,
    code: info.status,
    retryable: info.retryable
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
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CutoutStage 3D studio listening on http://localhost:${PORT}`);
  });
}

startServer();

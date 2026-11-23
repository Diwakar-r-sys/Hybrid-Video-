import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { AspectMode, ShotSpec, TimelineConfig } from '../types/studio';
import { HybridStageEngine } from './HybridStageEngine';

export interface ExportProgress {
  percent: number;
  message: string;
}

export interface ExportResult {
  blobUrl: string;
  filename: string;
  totalFrames: number;
  hasEmbeddedAudio: boolean;
}

async function tryEncodeAudioTrack(
  audioDataUrl: string,
  durationSec: number
): Promise<{
  codec: 'aac' | 'opus';
  sampleRate: number;
  numberOfChannels: number;
  chunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }>;
} | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }

  try {
    const res = await fetch(audioDataUrl);
    const arrayBuf = await res.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, Math.ceil(durationSec * 48000), 48000);
    const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));

    // Render onto an offline buffer of exact video length at 48kHz mono
    const src = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(audioCtx.destination);
    src.start(0);
    const rendered = await audioCtx.startRendering();

    let selectedCodec: 'aac' | 'opus' | null = null;
    const aacSupport = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 128_000
    });
    if (aacSupport.supported) {
      selectedCodec = 'aac';
    } else {
      const opusSupport = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 1,
        bitrate: 128_000
      });
      if (opusSupport.supported) {
        selectedCodec = 'opus';
      }
    }

    if (!selectedCodec) return null;

    const encodedChunks: Array<{
      chunk: EncodedAudioChunk;
      meta?: EncodedAudioChunkMetadata;
    }> = [];

    const encoder = new AudioEncoder({
      output: (chunk, meta) => encodedChunks.push({ chunk, meta }),
      error: (err) => console.warn('AudioEncoder warning:', err)
    });

    encoder.configure({
      codec: selectedCodec === 'aac' ? 'mp4a.40.2' : 'opus',
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 128_000
    });

    const channelData = rendered.getChannelData(0);
    const frameSize = 1024;
    for (let offset = 0; offset < channelData.length; offset += frameSize) {
      const slice = channelData.subarray(
        offset,
        Math.min(offset + frameSize, channelData.length)
      );
      const dataCopy = new Float32Array(slice.length);
      dataCopy.set(slice);

      const audioFrame = new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: dataCopy.length,
        numberOfChannels: 1,
        timestamp: Math.round((offset / 48000) * 1_000_000),
        data: dataCopy
      });
      encoder.encode(audioFrame);
      audioFrame.close();
    }

    await encoder.flush();
    encoder.close();

    return {
      codec: selectedCodec,
      sampleRate: 48000,
      numberOfChannels: 1,
      chunks: encodedChunks
    };
  } catch (err) {
    console.warn('Skipping embedded audio encoding:', err);
    return null;
  }
}

export async function exportDeterministicMp4(
  engine: HybridStageEngine,
  shots: ShotSpec[],
  timelineCfg: TimelineConfig,
  aspectMode: AspectMode,
  audioDataUrl: string | null,
  onProgress: (p: ExportProgress) => void
): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'WebCodecs VideoEncoder is not available in this browser. Use Save Frame PNG or switch to Chromium/Chrome.'
    );
  }

  engine.setDimensionsForAspect(aspectMode, true);
  const width = engine.width;
  const height = engine.height;
  const fps = timelineCfg.fps || 30;
  const duration = Math.max(0.5, timelineCfg.duration);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));

  onProgress({ percent: 2, message: 'Preparing MP4 muxer & encoder...' });

  const encodedAudio = audioDataUrl
    ? await tryEncodeAudioTrack(audioDataUrl, duration)
    : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height
    },
    ...(encodedAudio
      ? {
          audio: {
            codec: encodedAudio.codec,
            numberOfChannels: encodedAudio.numberOfChannels,
            sampleRate: encodedAudio.sampleRate
          }
        }
      : {}),
    fastStart: 'in-memory'
  });

  let selectedVideoCodec = 'avc1.4d002a';
  const candidateCodecs = ['avc1.4d002a', 'avc1.42e01f', 'avc1.42001f'];
  for (const codec of candidateCodecs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: width >= 1280 ? 5_500_000 : 4_500_000,
        framerate: fps
      });
      if (support.supported) {
        selectedVideoCodec = codec;
        break;
      }
    } catch {
      // try next H.264 profile
    }
  }

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    }
  });

  videoEncoder.configure({
    codec: selectedVideoCodec,
    width,
    height,
    bitrate: width >= 1280 ? 5_500_000 : 4_500_000,
    framerate: fps
  });

  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = width;
  scratchCanvas.height = height;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (encoderError) throw encoderError;

    const t = frameIdx / fps;
    engine.renderCompositeFrame(scratchCanvas, t, shots, timelineCfg);

    const timestampUs = Math.round((frameIdx / fps) * 1_000_000);
    const frame = new VideoFrame(scratchCanvas, {
      timestamp: timestampUs,
      duration: Math.round(1_000_000 / fps)
    });

    videoEncoder.encode(frame, { keyFrame: frameIdx % fps === 0 });
    frame.close();

    while (videoEncoder.encodeQueueSize > 8) {
      if (encoderError) throw encoderError;
      await new Promise((r) => setTimeout(r, 8));
    }

    if (frameIdx % 4 === 0 || frameIdx === totalFrames - 1) {
      const percent = Math.round(((frameIdx + 1) / totalFrames) * 95);
      onProgress({
        percent,
        message: `Encoding frame ${frameIdx + 1} / ${totalFrames} (${width}×${height} @ ${fps}fps)`
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  if (encoderError) throw encoderError;
  videoEncoder.close();

  if (encodedAudio) {
    onProgress({ percent: 97, message: 'Muxing voiceover audio track into MP4...' });
    for (const item of encodedAudio.chunks) {
      muxer.addAudioChunk(item.chunk, item.meta);
    }
  }

  muxer.finalize();
  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);
  const filename = encodedAudio
    ? `cutoutstage_${aspectMode.replace(':', 'x')}_with_audio.mp4`
    : `cutoutstage_${aspectMode.replace(':', 'x')}_silent.mp4`;

  onProgress({
    percent: 100,
    message: `Ready: ${filename} (${totalFrames} frames @ ${fps}fps)`
  });

  return {
    blobUrl,
    filename,
    totalFrames,
    hasEmbeddedAudio: Boolean(encodedAudio)
  };
}

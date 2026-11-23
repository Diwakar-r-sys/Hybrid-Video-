import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CharacterAction, EnvironmentPreset, KeyframeItem, ShotSpec } from '../types/studio';

interface StoryboardEditorProps {
  shots: ShotSpec[];
  keyframes: KeyframeItem[];
  onChangeShots: (shots: ShotSpec[]) => void;
  onJumpToTime: (t: number) => void;
}

const ACTION_OPTIONS: Array<{ value: CharacterAction; label: string }> = [
  { value: 'idle', label: 'idle' },
  { value: 'knit', label: 'knit' },
  { value: 'walk', label: 'walk' },
  { value: 'point', label: 'point' },
  { value: 'stand_guard', label: 'stand_guard' }
];

const ENV_OPTIONS: Array<{ value: EnvironmentPreset; label: string }> = [
  { value: 'courtyard', label: 'Brick Courtyard & Archway' },
  { value: 'village', label: 'Village Hills & Cottages' },
  { value: 'dungeon', label: 'Dungeon Cell & Iron Bars' },
  { value: 'throne_hall', label: 'Throne Hall & Giant Portrait' },
  { value: 'bare_wall', label: 'Bare Wall & Mouse Hole' }
];

export const StoryboardEditor: React.FC<StoryboardEditorProps> = ({
  shots,
  keyframes,
  onChangeShots,
  onJumpToTime
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawText, setRawText] = useState('');
  const [jsonError, setJsonError] = useState('');

  const toggleJson = () => {
    if (!showRawJson) {
      setRawText(JSON.stringify(shots, null, 2));
      setJsonError('');
    }
    setShowRawJson(!showRawJson);
  };

  const applyRawJson = () => {
    try {
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Storyboard JSON must be a non-empty array of shots.');
      }
      onChangeShots(parsed);
      setShowRawJson(false);
      setJsonError('');
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const updateShot = (idx: number, updater: (shot: ShotSpec) => ShotSpec) => {
    const next = shots.map((s, i) => (i === idx ? updater(s) : s));
    onChangeShots(next);
  };

  const addShot = () => {
    const last = shots[shots.length - 1];
    const start = last ? Number(last.end.toFixed(2)) : 0;
    const end = Number((start + 3.0).toFixed(2));
    const newShot: ShotSpec = {
      id: `shot-${shots.length + 1}`,
      title: `Scene ${shots.length + 1}`,
      start,
      end,
      environmentPreset: 'courtyard',
      camera: {
        movement: 'Gentle push-in',
        angle: 'Eye-level 12 deg',
        startPos: [0, 2.35, 5.45],
        endPos: [0, 2.2, 4.95],
        lookAtStart: [0, 1.35, 0],
        lookAtEnd: [0, 1.2, 0.25]
      },
      environment: {
        surfaces: 'Brick wall & cobblestone floor',
        lighting: 'Warm courtyard lantern',
        props: 'Growing knitted scarf',
        lanternIntensity: 2.7,
        flickerAmp: 0.25
      },
      props: {
        scarfGrowthStart: 0.1,
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
          pose: 'Standing knitting',
          action: 'knit',
          knittingSpeed: 4.8,
          armSwingAmp: 0.24,
          headTiltAmp: 0.05,
          bodyBobAmp: 0.03,
          walkCycleAmp: 0
        }
      ],
      captions: [
        { word: 'and', start: start + 0.1, end: start + 0.8 },
        { word: 'she', start: start + 0.8, end: start + 1.6 },
        { word: 'kept', start: start + 1.6, end: start + 2.3 },
        { word: 'knitting', start: start + 2.3, end }
      ],
      narrationText: 'and she kept knitting'
    };
    onChangeShots([...shots, newShot]);
  };

  const deleteShot = (idx: number) => {
    if (shots.length <= 1) return;
    onChangeShots(shots.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Deterministic Shot List &amp; Word-Level Captions
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Each shot selects a 3D Three.js environment preset, camera dolly coordinates, 3D scarf growth, and timed word captions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addShot}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Scene
          </button>
          <button
            type="button"
            onClick={toggleJson}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 whitespace-nowrap cursor-pointer"
          >
            {showRawJson ? 'Table Editor' : 'Raw JSON'}
          </button>
        </div>
      </div>

      {keyframes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">
            Extracted Source Keyframes
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            {keyframes.map((kf) => (
              <div
                key={kf.shotId}
                className="shrink-0 w-28 rounded-lg border border-slate-800 bg-[#141720] p-1.5 space-y-1"
              >
                <img
                  src={kf.dataUrl}
                  alt={`Keyframe at ${kf.timestamp}s`}
                  className="w-full h-36 object-cover rounded"
                />
                <div className="text-[11px] font-mono text-slate-400 text-center">
                  {kf.timestamp.toFixed(2)}s
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRawJson ? (
        <div className="space-y-3">
          {jsonError && (
            <div className="text-xs text-rose-400 font-medium">{jsonError}</div>
          )}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={18}
            className="w-full rounded-xl border border-slate-800 bg-[#12151d] p-4 font-mono text-xs text-emerald-300 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={applyRawJson}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer"
          >
            Apply JSON Changes
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-[#12151d]">
          {shots.map((shot, idx) => (
            <div key={shot.id} className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onJumpToTime(shot.start)}
                    className="font-mono text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    Shot {idx + 1} · {shot.start.toFixed(2)}s – {shot.end.toFixed(2)}s
                  </button>
                  <input
                    type="text"
                    value={shot.title}
                    onChange={(e) =>
                      updateShot(idx, (s) => ({ ...s, title: e.target.value }))
                    }
                    className="bg-[#0d0f14] border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-100 w-60"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={shot.environmentPreset}
                    onChange={(e) =>
                      updateShot(idx, (s) => ({
                        ...s,
                        environmentPreset: e.target.value as EnvironmentPreset
                      }))
                    }
                    className="bg-[#0d0f14] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    {ENV_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => deleteShot(idx)}
                    disabled={shots.length <= 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                    title="Delete shot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 block">Start / End (sec)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={shot.start}
                      onChange={(e) =>
                        updateShot(idx, (s) => ({
                          ...s,
                          start: Number(e.target.value) || 0
                        }))
                      }
                      className="w-full bg-[#0d0f14] border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={shot.end}
                      onChange={(e) =>
                        updateShot(idx, (s) => ({
                          ...s,
                          end: Number(e.target.value) || 1
                        }))
                      }
                      className="w-full bg-[#0d0f14] border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block">
                    3D Scarf Growth ({Math.round(shot.props.scarfGrowthStart * 100)}% →{' '}
                    {Math.round(shot.props.scarfGrowthEnd * 100)}%)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={shot.props.scarfGrowthStart}
                      onChange={(e) =>
                        updateShot(idx, (s) => ({
                          ...s,
                          props: {
                            ...s.props,
                            scarfGrowthStart: Number(e.target.value)
                          }
                        }))
                      }
                      className="w-full accent-amber-500"
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={shot.props.scarfGrowthEnd}
                      onChange={(e) =>
                        updateShot(idx, (s) => ({
                          ...s,
                          props: {
                            ...s.props,
                            scarfGrowthEnd: Number(e.target.value)
                          }
                        }))
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 block">Active Cast, Action &amp; Chair</label>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {shot.characters.map((ch, cIdx) => (
                      <div
                        key={`${ch.name}-${cIdx}`}
                        className="inline-flex items-center gap-1.5 bg-[#0d0f14] border border-slate-800 rounded-lg px-2 py-1"
                      >
                        <span className="text-slate-200 font-medium">{ch.name}</span>
                        <select
                          value={ch.action}
                          onChange={(e) => {
                            const nextAction = e.target.value as CharacterAction;
                            updateShot(idx, (s) => ({
                              ...s,
                              characters: s.characters.map((c, i) =>
                                i === cIdx ? { ...c, action: nextAction } : c
                              )
                            }));
                          }}
                          className="bg-[#151822] border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300"
                        >
                          {ACTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <label className="inline-flex items-center gap-1.5 text-slate-300 shrink-0 cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={shot.props.showChair}
                        onChange={(e) =>
                          updateShot(idx, (s) => ({
                            ...s,
                            props: { ...s.props, showChair: e.target.checked }
                          }))
                        }
                        className="accent-amber-500"
                      />
                      3D Chair
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block">
                    Word Captions (word@start-end)
                  </label>
                  <input
                    type="text"
                    value={shot.captions
                      .map((c) => `${c.word}@${c.start}-${c.end}`)
                      .join(', ')}
                    onChange={(e) => {
                      const parsed = e.target.value
                        .split(',')
                        .map((tok) => {
                          const [w, range] = tok.trim().split('@');
                          const [st, en] = (range || '').split('-').map(Number);
                          return {
                            word: (w || '').trim(),
                            start: isNaN(st) ? shot.start : st,
                            end: isNaN(en) ? shot.end : en
                          };
                        })
                        .filter((c) => c.word.length > 0);
                      updateShot(idx, (s) => ({
                        ...s,
                        captions: parsed,
                        narrationText: parsed.map((c) => c.word).join(' ')
                      }));
                    }}
                    className="w-full bg-[#0d0f14] border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-emerald-300"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

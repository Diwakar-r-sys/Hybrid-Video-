import React, { useState } from 'react';
import { Sparkles, Upload, Wand2 } from 'lucide-react';
import { CharacterSheetAsset, CutPiece, PieceRole } from '../types/studio';
import { getDefaultPivotForRole, recomputePiecePivotForRole } from '../engine/cutoutPipeline';
import { PivotEditor } from './PivotEditor';

interface CharacterStudioProps {
  characters: CharacterSheetAsset[];
  activeCharacterName: string;
  chromaTolerance: number;
  haloWidthPx: number;
  onSelectCharacter: (name: string) => void;
  onChangeCutSettings: (tolerance: number, haloWidthPx: number) => void;
  onUpdatePiece: (
    charName: string,
    pieceId: string,
    updater: (piece: CutPiece) => CutPiece
  ) => void;
  onUploadCustomSheet: (charName: string, dataUrl: string) => Promise<void>;
  onGenerateGeminiSheet: (charName: string, description: string) => Promise<void>;
  onAutoLabelPieces: (charName: string) => Promise<void>;
  isBusy: boolean;
  liveProgressText?: string | null;
}

const PIECE_ROLES: PieceRole[] = [
  'Head',
  'Torso',
  'LeftUpperArm',
  'LeftForearm',
  'RightUpperArm',
  'RightForearm',
  'LeftArm',
  'RightArm',
  'LeftLeg',
  'RightLeg',
  'PropNeedles',
  'PropScarf',
  'Ignore'
];

export const CharacterStudio: React.FC<CharacterStudioProps> = ({
  characters,
  activeCharacterName,
  chromaTolerance,
  haloWidthPx,
  onSelectCharacter,
  onChangeCutSettings,
  onUpdatePiece,
  onUploadCustomSheet,
  onGenerateGeminiSheet,
  onAutoLabelPieces,
  isBusy,
  liveProgressText
}) => {
  const activeChar =
    characters.find((c) => c.name === activeCharacterName) || characters[0];
  const [selectedPieceId, setSelectedPieceId] = useState<string>(
    activeChar?.pieces[0]?.id || ''
  );
  const [newCharName, setNewCharName] = useState('Villager');
  const [newCharDesc, setNewCharDesc] = useState(
    'Cheerful medieval villager wearing a warm knitted scarf and wool tunic'
  );

  const selectedPiece =
    activeChar?.pieces.find((p) => p.id === selectedPieceId) ||
    activeChar?.pieces[0] ||
    null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Paper-Cutout Character Rig &amp; White Sticker Halo Studio
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Each character is segmented from a flat <code className="text-pink-400">#FF00FF</code> parts sheet, ringed with a die-cut white sticker halo, and anchored to exact joint pivots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {characters.map((ch) => (
            <button
              key={ch.name}
              type="button"
              onClick={() => {
                onSelectCharacter(ch.name);
                setSelectedPieceId(ch.pieces[0]?.id || '');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeChar?.name === ch.name
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-[#141720] text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {ch.name} ({ch.pieces.filter((p) => p.role !== 'Ignore').length})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Parts Sheet, Chroma Controls & New Character AI Generator */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#12151d] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-200">
                Active Sheet · {activeChar?.name}
              </span>
              <span className="font-mono text-slate-400">
                Source: {activeChar?.source}
              </span>
            </div>

            {activeChar?.sheetDataUrl && (
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-[#0d0f14] flex justify-center p-2">
                <img
                  src={activeChar.sheetDataUrl}
                  alt={`${activeChar.name} Parts Sheet`}
                  className="max-h-56 w-auto rounded"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Magenta Tolerance</span>
                  <span className="font-mono text-slate-200">{chromaTolerance}</span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={165}
                  value={chromaTolerance}
                  onChange={(e) =>
                    onChangeCutSettings(Number(e.target.value), haloWidthPx)
                  }
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>White Halo Width</span>
                  <span className="font-mono text-slate-200">{haloWidthPx}px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={14}
                  value={haloWidthPx}
                  onChange={(e) =>
                    onChangeCutSettings(chromaTolerance, Number(e.target.value))
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload #FF00FF Sheet
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file || !activeChar) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        onUploadCustomSheet(activeChar.name, reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>

              {activeChar && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onAutoLabelPieces(activeChar.name)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-200 border border-slate-700 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  AI Auto-Label Limbs
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12151d] p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-200">
              Generate Custom Paper-Cutout Character Rig (SVG / Canvas)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                placeholder="Character name"
                className="bg-[#0d0f14] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100"
              />
              <input
                type="text"
                value={newCharDesc}
                onChange={(e) => setNewCharDesc(e.target.value)}
                placeholder="Visual appearance & outfit"
                className="sm:col-span-2 bg-[#0d0f14] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100"
              />
            </div>
            <button
              type="button"
              disabled={isBusy || !newCharName.trim()}
              onClick={() => onGenerateGeminiSheet(newCharName.trim(), newCharDesc.trim())}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isBusy
                ? liveProgressText || 'Generating Character Parts...'
                : 'Generate Character Parts Sheet'}
            </button>
            {isBusy && liveProgressText && (
              <div className="text-[11px] font-mono text-amber-300">{liveProgressText}</div>
            )}
          </div>
        </div>

        {/* Right: Segmented Cutout Grid + Interactive Pivot Crosshair */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#12151d] p-4 space-y-4">
            <div className="text-xs font-semibold text-slate-200">
              Segmented Cutout Pieces ({activeChar?.pieces.length || 0})
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {activeChar?.pieces.map((piece) => {
                const isSelected = selectedPiece?.id === piece.id;
                return (
                  <div
                    key={piece.id}
                    onClick={() => setSelectedPieceId(piece.id)}
                    className={`rounded-xl p-2 border transition-colors cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-800 bg-[#0d0f14] hover:border-slate-700'
                    }`}
                  >
                    <div className="checkerboard-bg rounded-lg h-24 flex items-center justify-center p-1.5 overflow-hidden">
                      <img
                        src={piece.haloDataUrl}
                        alt={piece.role}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <select
                      value={piece.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const nextRole = e.target.value as PieceRole;
                        const defPivot = getDefaultPivotForRole(nextRole);
                        onUpdatePiece(activeChar.name, piece.id, (p) => ({
                          ...p,
                          role: nextRole,
                          pivotX: defPivot.x,
                          pivotY: defPivot.y
                        }));
                        recomputePiecePivotForRole(piece.imageDataUrl, nextRole).then(
                          (geomPivot) => {
                            onUpdatePiece(activeChar.name, piece.id, (p) =>
                              p.role === nextRole
                                ? { ...p, pivotX: geomPivot.x, pivotY: geomPivot.y }
                                : p
                            );
                          }
                        );
                      }}
                      className="w-full bg-[#151822] border border-slate-700 rounded px-1.5 py-1 text-[11px] font-medium text-slate-100"
                    >
                      {PIECE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12151d] p-4">
            <PivotEditor
              piece={selectedPiece}
              onChangePivot={(pieceId, px, py) => {
                if (!activeChar) return;
                onUpdatePiece(activeChar.name, pieceId, (p) => ({
                  ...p,
                  pivotX: px,
                  pivotY: py
                }));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

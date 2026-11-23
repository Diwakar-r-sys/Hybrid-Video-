import React from 'react';

export type WorkspaceTab = 'stage' | 'storyboard' | 'characters' | 'export';

export interface ServerModelHealth {
  hasApiKey: boolean;
  modelsDiscovered?: boolean;
  models: {
    TEXT_MODELS: string[];
    IMAGE_MODELS: string[];
    TTS_MODELS: string[];
  };
  emptyCategories?: Array<'TEXT_MODELS' | 'IMAGE_MODELS' | 'TTS_MODELS'>;
  warnings?: string[];
  apiKeyError?: string;
}

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onQuickExport: () => void;
  isExporting: boolean;
  modelUsed?: string | null;
  modelHealth?: ServerModelHealth | null;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'stage', label: '3D Stage' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'characters', label: 'Cutout Rig' },
  { id: 'export', label: 'Export MP4' }
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onQuickExport,
  isExporting,
  modelUsed,
  modelHealth
}) => {
  const models = modelHealth?.models;
  const emptyText = Boolean(models && models.TEXT_MODELS.length === 0);
  const emptyImage = Boolean(models && models.IMAGE_MODELS.length === 0);
  const emptyTts = Boolean(models && models.TTS_MODELS.length === 0);
  const hasEmptyList = emptyText || emptyImage || emptyTts;

  return (
    <header className="border-b border-slate-800/90 bg-[#0d0f14] px-6 py-3.5 space-y-2.5">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onSelectTab('stage')}
          className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 hover:text-amber-300 transition-colors cursor-pointer"
        >
          CutoutStage 3D
        </button>

        <nav className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-amber-400 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {modelUsed && (
            <span
              title="Last Gemini model that answered"
              className="hidden md:inline-block font-mono text-[11px] text-slate-400 border border-slate-800 bg-[#141822] px-2.5 py-1 rounded-md"
            >
              Model: {modelUsed}
            </span>
          )}
          <button
            type="button"
            onClick={onQuickExport}
            disabled={isExporting}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            {isExporting ? 'Rendering MP4...' : 'Export MP4'}
          </button>
        </div>
      </div>

      {models && (
        <div className="mx-auto max-w-[1440px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px] font-mono border-t border-slate-800/70 pt-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className={emptyText ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
              TEXT: {models.TEXT_MODELS.length > 0 ? models.TEXT_MODELS.join(', ') : 'EMPTY'}
            </span>
            <span className={emptyImage ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
              IMAGE: {models.IMAGE_MODELS.length > 0 ? models.IMAGE_MODELS.join(', ') : 'EMPTY'}
            </span>
            <span className={emptyTts ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
              TTS: {models.TTS_MODELS.length > 0 ? models.TTS_MODELS.join(', ') : 'EMPTY'}
            </span>
          </div>

          {hasEmptyList && (
            <div className="rounded-md border border-rose-500/70 bg-rose-950/60 px-2.5 py-0.5 text-rose-200 font-sans font-medium">
              Warning: Empty model list ({[
                emptyText ? 'TEXT_MODELS' : null,
                emptyImage ? 'IMAGE_MODELS' : null,
                emptyTts ? 'TTS_MODELS' : null
              ]
                .filter(Boolean)
                .join(', ')})
              {emptyImage ? ' — No image model on this key; using low quality SVG' : ''}
            </div>
          )}
        </div>
      )}
    </header>
  );
};

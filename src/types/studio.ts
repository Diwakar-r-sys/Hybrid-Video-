export type AspectMode = '9:16' | '16:9';

export type EnvironmentPreset =
  | 'courtyard'
  | 'dungeon'
  | 'village'
  | 'throne_hall'
  | 'bare_wall';

export type PieceRole =
  | 'Head'
  | 'Torso'
  | 'LeftUpperArm'
  | 'LeftForearm'
  | 'RightUpperArm'
  | 'RightForearm'
  | 'LeftArm'
  | 'RightArm'
  | 'LeftLeg'
  | 'RightLeg'
  | 'PropNeedles'
  | 'PropScarf'
  | 'Ignore';

export type CharacterAction = 'idle' | 'knit' | 'walk' | 'point' | 'stand_guard';

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface ShotCharacterState {
  name: string;
  x: number; // world X offset (-1.5 to 1.5)
  scale: number;
  pose: string;
  action: CharacterAction;
  knittingSpeed: number;
  armSwingAmp: number;
  headTiltAmp: number;
  bodyBobAmp: number;
  walkCycleAmp: number;
}

export interface ShotSpec {
  id: string;
  title: string;
  start: number;
  end: number;
  environmentPreset: EnvironmentPreset;
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
    scarfGrowthStart: number; // 0..1 at shot start
    scarfGrowthEnd: number;   // 0..1 at shot end
    showChair: boolean;
    showBars: boolean;
    showPortrait: boolean;
    showMouseHole: boolean;
    showVillagers: boolean;
  };
  characters: ShotCharacterState[];
  captions: CaptionWord[];
  narrationText: string;
}

export interface CutPiece {
  id: string;
  role: PieceRole;
  imageDataUrl: string;
  haloDataUrl: string;
  width: number;
  height: number;
  pivotX: number; // normalized 0..1
  pivotY: number; // normalized 0..1
  bbox: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
}

export interface CharacterSheetAsset {
  name: string;
  description: string;
  sheetDataUrl: string;
  source: 'builtin' | 'gemini-svg' | 'uploaded';
  pieces: CutPiece[];
}

export interface KeyframeItem {
  shotId: string;
  shotIndex: number;
  timestamp: number;
  dataUrl: string;
}

export interface TimelineConfig {
  fps: number;
  duration: number;
  globalArmSpeed: number;
  globalHeadTilt: number;
  globalBodyBob: number;
  haloWidthPx: number;
  chromaTolerance: number;
  captionFontSize: number;
  showCaptions: boolean;
}

export interface ProjectPreset {
  id: string;
  label: string;
  subtitle: string;
  channelId: string;
  aspectMode: AspectMode;
  duration: number;
  shots: ShotSpec[];
}

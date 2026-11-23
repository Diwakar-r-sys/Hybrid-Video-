import { CutPiece, PieceRole, ProjectPreset, ShotSpec } from '../types/studio';

export const CHANNEL_REFERENCE_ID = 'UC2h3806SM2tCQL8MR5QQNAQ';

export const SHEET_CANVAS_SIZE = 1024;
export const CHROMA_BG_COLOR = '#FF00FF';

export const KING_PALETTE = {
  outline: '#2b160e',
  skin: '#f4b58f',
  skinShadow: '#df946e',
  cheek: 'rgba(229, 98, 108, 0.45)',
  crownGold: '#f4c542',
  crownGoldDeep: '#c7921e',
  crownVelvet: '#9e1c2b',
  ruby: '#e11d48',
  emerald: '#10b981',
  sapphire: '#2563eb',
  beardWhite: '#f5f1e6',
  beardShade: '#dcd5c4',
  robeCrimson: '#8c1828',
  robeDark: '#5b0e18',
  ermineWhite: '#faf6ec',
  leatherBoot: '#29211d'
};

export const SOLDIER_PALETTE = {
  outline: '#221a17',
  skin: '#eeb58c',
  steelLight: '#cfd6de',
  steelMid: '#94a3b8',
  steelDark: '#64748b',
  chainmail: '#475569',
  plumeRed: '#dc2626',
  plumeDark: '#991b1b',
  tabardCrimson: '#9f1239',
  brassGold: '#eab308',
  leather: '#5c3a21',
  bootDark: '#27201c',
  woodShaft: '#8b5a2b'
};

export const GRANDMA_2S_REF_SHOTS: ShotSpec[] = [
  {
    id: 'shot-1',
    title: 'Courtyard Establishing — Knitting Begins',
    start: 0.0,
    end: 1.0,
    environmentPreset: 'courtyard',
    camera: {
      movement: 'Gentle push-in from establishing courtyard framing',
      angle: 'Eye-level slight downward tilt (12 deg)',
      startPos: [0, 2.35, 5.45],
      endPos: [0, 2.28, 5.25],
      lookAtStart: [0, 1.35, 0],
      lookAtEnd: [0, 1.28, 0.15]
    },
    environment: {
      surfaces: 'Warm tan mortar brick wall with arched doorway; grey-brown radial cobblestone floor',
      lighting: 'Warm courtyard lantern point light + soft daylight spill from archway',
      props: 'Wooden knitting needles with orange ball tips; growing red-and-yellow striped wool scarf',
      lanternIntensity: 2.7,
      flickerAmp: 0.25
    },
    props: {
      scarfGrowthStart: 0.04,
      scarfGrowthEnd: 0.32,
      showChair: false,
      showBars: false,
      showPortrait: false,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: -0.06,
        scale: 1.0,
        pose: 'Standing centered in front of brick wall & arch',
        action: 'knit',
        knittingSpeed: 4.5,
        armSwingAmp: 0.22,
        headTiltAmp: 0.045,
        bodyBobAmp: 0.03,
        walkCycleAmp: 0
      }
    ],
    captions: [
      { word: 'she', start: 0.05, end: 0.42 },
      { word: 'just', start: 0.42, end: 0.98 }
    ],
    narrationText: 'she just'
  },
  {
    id: 'shot-2',
    title: 'Scarf Snakes Across Cobblestones',
    start: 1.0,
    end: 2.0,
    environmentPreset: 'courtyard',
    camera: {
      movement: 'Slow dolly-in toward floor & character',
      angle: 'Eye-level downward tilt (15 deg)',
      startPos: [0, 2.28, 5.25],
      endPos: [0.08, 2.18, 4.95],
      lookAtStart: [0, 1.28, 0.15],
      lookAtEnd: [0.05, 1.12, 0.55]
    },
    environment: {
      surfaces: 'Warm tan mortar brick wall with arched doorway; grey-brown radial cobblestone floor',
      lighting: 'Warm flickering courtyard lantern casting soft shadows beneath character & scarf',
      props: 'Long 3D red-and-yellow striped knitted scarf snaking forward across cobblestones',
      lanternIntensity: 2.8,
      flickerAmp: 0.28
    },
    props: {
      scarfGrowthStart: 0.32,
      scarfGrowthEnd: 1.0,
      showChair: false,
      showBars: false,
      showPortrait: false,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: -0.06,
        scale: 1.0,
        pose: 'Standing centered, arms rhythmically knitting',
        action: 'knit',
        knittingSpeed: 5.5,
        armSwingAmp: 0.25,
        headTiltAmp: 0.05,
        bodyBobAmp: 0.035,
        walkCycleAmp: 0
      }
    ],
    captions: [
      { word: 'just', start: 1.0, end: 1.24 },
      { word: 'keeps', start: 1.24, end: 1.56 },
      { word: 'knitting', start: 1.56, end: 2.0 }
    ],
    narrationText: 'just keeps knitting'
  }
];

export const GRANDMA_STORY_18S_SHOTS: ShotSpec[] = [
  {
    id: 'story-1',
    title: '01 · Courtyard Knitting & The King',
    start: 0.0,
    end: 3.5,
    environmentPreset: 'courtyard',
    camera: {
      movement: 'Slow dolly-in on courtyard',
      angle: 'Eye-level 12 deg tilt',
      startPos: [0, 2.4, 5.8],
      endPos: [0, 2.25, 5.1],
      lookAtStart: [0, 1.35, 0],
      lookAtEnd: [0, 1.25, 0.2]
    },
    environment: {
      surfaces: 'Brick wall with stone archway and cobblestone plaza',
      lighting: 'Warm courtyard lantern with soft daylight fill',
      props: 'Wooden chair, knitting needles, growing red-gold striped scarf',
      lanternIntensity: 2.7,
      flickerAmp: 0.24
    },
    props: {
      scarfGrowthStart: 0.05,
      scarfGrowthEnd: 0.55,
      showChair: true,
      showBars: false,
      showPortrait: false,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: 0.25,
        scale: 1.0,
        pose: 'Seated knitting calmly',
        action: 'knit',
        knittingSpeed: 4.5,
        armSwingAmp: 0.24,
        headTiltAmp: 0.05,
        bodyBobAmp: 0.03,
        walkCycleAmp: 0
      },
      {
        name: 'King',
        x: -0.78,
        scale: 1.02,
        pose: 'Gesturing angrily from the left',
        action: 'point',
        knittingSpeed: 3.2,
        armSwingAmp: 0.34,
        headTiltAmp: 0.08,
        bodyBobAmp: 0.06,
        walkCycleAmp: 0.1
      },
      {
        name: 'Soldier',
        x: 0.92,
        scale: 0.98,
        pose: 'Standing guard on the right with spear',
        action: 'stand_guard',
        knittingSpeed: 2.4,
        armSwingAmp: 0.12,
        headTiltAmp: 0.04,
        bodyBobAmp: 0.025,
        walkCycleAmp: 0.05
      }
    ],
    captions: [
      { word: 'This', start: 0.1, end: 0.4 },
      { word: 'grandma', start: 0.4, end: 0.9 },
      { word: 'will', start: 0.9, end: 1.2 },
      { word: 'not', start: 1.2, end: 1.5 },
      { word: 'stop', start: 1.5, end: 1.9 },
      { word: 'knitting', start: 1.9, end: 2.5 },
      { word: 'no', start: 2.5, end: 2.8 },
      { word: 'matter', start: 2.8, end: 3.1 },
      { word: 'what', start: 3.1, end: 3.5 }
    ],
    narrationText: 'This grandma will not stop knitting no matter what.'
  },
  {
    id: 'story-2',
    title: '02 · Standing Up — Scarf Out the Gate',
    start: 3.5,
    end: 7.0,
    environmentPreset: 'village',
    camera: {
      movement: 'Panoramic track over hillside path',
      angle: 'Elevated 18 deg storybook diorama',
      startPos: [-0.4, 2.7, 5.9],
      endPos: [0.35, 2.45, 5.2],
      lookAtStart: [-0.1, 1.1, 0.2],
      lookAtEnd: [0.15, 0.95, 0.8]
    },
    environment: {
      surfaces: 'Rolling mossy hills, cobblestone road, miniature cottages',
      lighting: 'Golden hour sun with crisp soft shadows',
      props: 'Endless striped wool scarf winding down the village road',
      lanternIntensity: 2.1,
      flickerAmp: 0.12
    },
    props: {
      scarfGrowthStart: 0.25,
      scarfGrowthEnd: 1.0,
      showChair: false,
      showBars: false,
      showPortrait: false,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: -0.35,
        scale: 0.95,
        pose: 'Standing on hilltop knitting',
        action: 'knit',
        knittingSpeed: 5.5,
        armSwingAmp: 0.26,
        headTiltAmp: 0.05,
        bodyBobAmp: 0.04,
        walkCycleAmp: 0
      }
    ],
    captions: [
      { word: 'It', start: 3.6, end: 3.9 },
      { word: 'runs', start: 3.9, end: 4.3 },
      { word: 'out', start: 4.3, end: 4.6 },
      { word: 'the', start: 4.6, end: 4.9 },
      { word: 'gate', start: 4.9, end: 5.4 },
      { word: 'through', start: 5.4, end: 5.9 },
      { word: 'the', start: 5.9, end: 6.2 },
      { word: 'whole', start: 6.2, end: 6.5 },
      { word: 'village', start: 6.5, end: 7.0 }
    ],
    narrationText: 'It runs out the gate through the whole village.'
  },
  {
    id: 'story-3',
    title: '03 · Locked in the Dungeon',
    start: 7.0,
    end: 10.8,
    environmentPreset: 'dungeon',
    camera: {
      movement: 'Creeping zoom toward iron dungeon bars',
      angle: 'Low-angle dramatic tilt',
      startPos: [0, 2.15, 5.6],
      endPos: [0, 2.0, 4.75],
      lookAtStart: [0, 1.3, 0],
      lookAtEnd: [0, 1.15, 0.3]
    },
    environment: {
      surfaces: 'Dark hewn stone blocks, iron prison bars, damp cobble floor',
      lighting: 'Flickering warm dungeon torchlight',
      props: 'Iron bars with red-gold scarf pouring right between the bars',
      lanternIntensity: 3.1,
      flickerAmp: 0.42
    },
    props: {
      scarfGrowthStart: 0.2,
      scarfGrowthEnd: 1.0,
      showChair: false,
      showBars: true,
      showPortrait: false,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: 0.0,
        scale: 0.96,
        pose: 'Behind iron bars still knitting',
        action: 'knit',
        knittingSpeed: 5.2,
        armSwingAmp: 0.24,
        headTiltAmp: 0.04,
        bodyBobAmp: 0.03,
        walkCycleAmp: 0
      },
      {
        name: 'Soldier',
        x: 0.88,
        scale: 0.98,
        pose: 'Guarding dungeon cell with spear',
        action: 'stand_guard',
        knittingSpeed: 2.2,
        armSwingAmp: 0.14,
        headTiltAmp: 0.04,
        bodyBobAmp: 0.02,
        walkCycleAmp: 0
      }
    ],
    captions: [
      { word: 'Lock', start: 7.1, end: 7.5 },
      { word: 'her', start: 7.5, end: 7.8 },
      { word: 'up', start: 7.8, end: 8.2 },
      { word: 'yet', start: 8.2, end: 8.6 },
      { word: 'wool', start: 8.6, end: 9.1 },
      { word: 'pours', start: 9.1, end: 9.6 },
      { word: 'between', start: 9.6, end: 10.2 },
      { word: 'the', start: 10.2, end: 10.4 },
      { word: 'bars', start: 10.4, end: 10.8 }
    ],
    narrationText: 'Lock her up, yet wool pours between the bars.'
  },
  {
    id: 'story-4',
    title: '04 · The King’s Giant Portrait',
    start: 10.8,
    end: 14.4,
    environmentPreset: 'throne_hall',
    camera: {
      movement: 'Slow reveal pan upward toward golden portrait frame',
      angle: 'Heroic upward tilt',
      startPos: [-0.25, 2.0, 5.4],
      endPos: [0.15, 2.35, 5.0],
      lookAtStart: [0, 1.35, -0.3],
      lookAtEnd: [0, 1.75, -0.8]
    },
    environment: {
      surfaces: 'Palace stone walls, crimson carpet runner, ornate gilded frame',
      lighting: 'Royal chandelier amber glow',
      props: 'Giant gold-framed portrait woven from stolen wool',
      lanternIntensity: 2.9,
      flickerAmp: 0.18
    },
    props: {
      scarfGrowthStart: 0.0,
      scarfGrowthEnd: 0.0,
      showChair: false,
      showBars: false,
      showPortrait: true,
      showMouseHole: false,
      showVillagers: false
    },
    characters: [
      {
        name: 'King',
        x: 0.0,
        scale: 1.05,
        pose: 'Boasting proudly beneath giant portrait',
        action: 'point',
        knittingSpeed: 4.0,
        armSwingAmp: 0.36,
        headTiltAmp: 0.08,
        bodyBobAmp: 0.07,
        walkCycleAmp: 0.12
      }
    ],
    captions: [
      { word: 'The', start: 10.9, end: 11.2 },
      { word: 'king', start: 11.2, end: 11.6 },
      { word: 'shows', start: 11.6, end: 12.1 },
      { word: 'off', start: 12.1, end: 12.4 },
      { word: 'his', start: 12.4, end: 12.8 },
      { word: 'giant', start: 12.8, end: 13.4 },
      { word: 'woven', start: 13.4, end: 13.9 },
      { word: 'portrait', start: 13.9, end: 14.4 }
    ],
    narrationText: 'The king shows off his giant woven portrait.'
  },
  {
    id: 'story-5',
    title: '05 · Bare Wall & Mouse Hole Twist',
    start: 14.4,
    end: 18.0,
    environmentPreset: 'bare_wall',
    camera: {
      movement: 'Slow close-in toward nail, thread, and mouse hole',
      angle: 'Downward reveal angle',
      startPos: [0, 2.35, 5.4],
      endPos: [0.12, 1.9, 4.4],
      lookAtStart: [0, 1.35, -0.4],
      lookAtEnd: [0.15, 0.75, -0.2]
    },
    environment: {
      surfaces: 'Bare plaster wall, iron nail, wooden baseboard, dark mouse hole',
      lighting: 'Moody cool-warm contrast spotlight',
      props: 'Single red wool thread hanging from nail into mouse hole',
      lanternIntensity: 2.3,
      flickerAmp: 0.15
    },
    props: {
      scarfGrowthStart: 0.15,
      scarfGrowthEnd: 1.0,
      showChair: false,
      showBars: false,
      showPortrait: false,
      showMouseHole: true,
      showVillagers: false
    },
    characters: [
      {
        name: 'Grandma',
        x: -0.68,
        scale: 0.92,
        pose: 'Quietly smiling beside the unraveling thread',
        action: 'knit',
        knittingSpeed: 2.5,
        armSwingAmp: 0.14,
        headTiltAmp: 0.04,
        bodyBobAmp: 0.02,
        walkCycleAmp: 0
      }
    ],
    captions: [
      { word: 'One', start: 14.5, end: 14.9 },
      { word: 'last', start: 14.9, end: 15.3 },
      { word: 'thread', start: 15.3, end: 15.8 },
      { word: 'slips', start: 15.8, end: 16.4 },
      { word: 'into', start: 16.4, end: 16.9 },
      { word: 'a', start: 16.9, end: 17.1 },
      { word: 'mouse', start: 17.1, end: 17.5 },
      { word: 'hole', start: 17.5, end: 18.0 }
    ],
    narrationText: 'One last thread slips into a mouse hole.'
  }
];

export const BUILTIN_PRESETS: ProjectPreset[] = [
  {
    id: 'grandma-2s-ref',
    label: 'Reference Clip (2.0s)',
    subtitle: 'Exact courtyard, archway, cobblestones & growing scarf Short',
    channelId: CHANNEL_REFERENCE_ID,
    aspectMode: '9:16',
    duration: 2.0,
    shots: GRANDMA_2S_REF_SHOTS
  },
  {
    id: 'grandma-18s-story',
    label: 'Full Multi-Scene Story (18.0s)',
    subtitle: '5 3D worlds: Courtyard · Village · Dungeon · Throne Hall · Mouse Hole',
    channelId: CHANNEL_REFERENCE_ID,
    aspectMode: '9:16',
    duration: 18.0,
    shots: GRANDMA_STORY_18S_SHOTS
  }
];

/**
 * Generates a pristine 1024x1024 #FF00FF character parts sheet with exact
 * pixel-accurate bounding boxes for every anatomical piece, eliminating any
 * limb scrambling during Stage 5 Auto-Cut.
 */
export interface KnownPartBox {
  role: PieceRole;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
}

export function generateGrandmaSheetWithLayout(): {
  sheetDataUrl: string;
  knownBoxes: KnownPartBox[];
} {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FF00FF';
  ctx.fillRect(0, 0, 1024, 1024);

  const outline = '#3a2418';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const strokeFill = (fill: string, lw = 4.5) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // 1. HEAD (top-left: center 190, 205)
  ctx.save();
  ctx.translate(190, 205);
  ctx.beginPath();
  ctx.moveTo(-26, 95);
  ctx.lineTo(-24, 134);
  ctx.bezierCurveTo(-24, 148, 24, 148, 24, 134);
  ctx.lineTo(26, 95);
  ctx.closePath();
  strokeFill('#f6c39c', 4.5);

  ctx.beginPath();
  ctx.ellipse(0, -124, 52, 38, 0, 0, Math.PI * 2);
  strokeFill('#e8e7e3', 4.5);
  ctx.beginPath();
  ctx.moveTo(-22, -148);
  ctx.quadraticCurveTo(-10, -124, -18, -96);
  ctx.moveTo(20, -148);
  ctx.quadraticCurveTo(10, -124, 18, -96);
  ctx.strokeStyle = '#b9b7b0';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-114, 6, 16, 22, -0.15, 0, Math.PI * 2);
  strokeFill('#f6c39c', 4.5);
  ctx.beginPath();
  ctx.ellipse(114, 6, 16, 22, 0.15, 0, Math.PI * 2);
  strokeFill('#f6c39c', 4.5);

  ctx.beginPath();
  ctx.ellipse(0, 6, 112, 102, 0, 0, Math.PI * 2);
  strokeFill('#fbd0ae', 5);

  ctx.beginPath();
  ctx.moveTo(-110, 4);
  ctx.bezierCurveTo(-116, -72, -56, -104, 0, -104);
  ctx.bezierCurveTo(56, -104, 116, -72, 110, 4);
  ctx.bezierCurveTo(96, -34, 42, -52, 0, -68);
  ctx.bezierCurveTo(-42, -52, -96, -34, -110, 4);
  ctx.closePath();
  strokeFill('#e8e7e3', 4.5);

  ctx.beginPath();
  ctx.ellipse(-46, -34, 16, 6, -0.15, 0, Math.PI * 2);
  strokeFill('#e8e7e3', 3);
  ctx.beginPath();
  ctx.ellipse(46, -34, 16, 6, 0.15, 0, Math.PI * 2);
  strokeFill('#e8e7e3', 3);

  [-44, 44].forEach((ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, -8, 22, 18, 0, 0, Math.PI * 2);
    strokeFill('#ffffff', 3.5);
    ctx.beginPath();
    ctx.arc(ex, -5, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2418';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex, -13, 22, 11, 0, Math.PI, 0, false);
    ctx.closePath();
    strokeFill('#f5be95', 3.2);
  });

  ctx.fillStyle = 'rgba(240, 120, 120, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-68, 26, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(68, 26, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c89b2b';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(-24, 14, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(24, 14, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 12);
  ctx.quadraticCurveTo(0, 7, 8, 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 18, 9, 0.15 * Math.PI, 0.95 * Math.PI);
  strokeFill('#f2b185', 3.5);
  ctx.beginPath();
  ctx.moveTo(-30, 44);
  ctx.quadraticCurveTo(0, 62, 30, 44);
  ctx.strokeStyle = '#7c4734';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();

  // 2. TORSO (top-center: center 530, 255)
  ctx.save();
  ctx.translate(530, 255);
  ctx.beginPath();
  ctx.moveTo(-72, -195);
  ctx.bezierCurveTo(-105, -145, -135, 35, -142, 175);
  ctx.quadraticCurveTo(0, 202, 142, 175);
  ctx.bezierCurveTo(135, 35, 105, -145, 72, -195);
  ctx.quadraticCurveTo(0, -162, -72, -195);
  ctx.closePath();
  strokeFill('#3b7c6d', 5);

  ctx.beginPath();
  ctx.moveTo(-140, 156);
  ctx.quadraticCurveTo(0, 182, 140, 156);
  ctx.lineTo(142, 175);
  ctx.quadraticCurveTo(0, 202, -142, 175);
  ctx.closePath();
  strokeFill('#d4ab42', 4);

  ctx.beginPath();
  ctx.moveTo(-88, -28);
  ctx.bezierCurveTo(-104, 42, -104, 112, -88, 142);
  ctx.quadraticCurveTo(0, 158, 88, 142);
  ctx.bezierCurveTo(104, 112, 104, 42, 88, -28);
  ctx.closePath();
  strokeFill('#f3eedc', 4.5);

  ctx.beginPath();
  ctx.moveTo(-94, -36);
  ctx.quadraticCurveTo(0, -24, 94, -36);
  ctx.lineTo(90, -20);
  ctx.quadraticCurveTo(0, -8, -90, -20);
  ctx.closePath();
  strokeFill('#f3eedc', 4);

  ctx.fillStyle = '#d4ab42';
  ctx.fillRect(-6, -172, 12, 140);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(-6, -172, 12, 140);

  ctx.beginPath();
  ctx.moveTo(-72, -192);
  ctx.quadraticCurveTo(0, -155, 72, -192);
  ctx.strokeStyle = '#d4ab42';
  ctx.lineWidth = 9;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-11, -172, 11, 7, -0.2, 0, Math.PI * 2);
  strokeFill('#d4ab42', 3.5);
  ctx.beginPath();
  ctx.ellipse(11, -172, 11, 7, 0.2, 0, Math.PI * 2);
  strokeFill('#d4ab42', 3.5);

  ctx.strokeStyle = '#d4ab42';
  ctx.lineWidth = 3.5;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(dir * 20, -110);
    ctx.bezierCurveTo(dir * 62, -112, dir * 72, -148, dir * 48, -152);
    ctx.moveTo(dir * 24, -92);
    ctx.bezierCurveTo(dir * 75, -90, dir * 82, -120, dir * 64, -125);
    ctx.stroke();
  });
  ctx.restore();

  // 3. LEFT ARM (top-right: center 790, 215)
  ctx.save();
  ctx.translate(790, 215);
  ctx.beginPath();
  ctx.moveTo(18, -125);
  ctx.bezierCurveTo(-36, -90, -45, 25, -18, 92);
  ctx.lineTo(24, 84);
  ctx.bezierCurveTo(8, 22, 16, -65, 42, -108);
  ctx.closePath();
  strokeFill('#3b7c6d', 4.5);
  ctx.beginPath();
  ctx.rect(-20, 82, 46, 15);
  strokeFill('#d4ab42', 4);
  ctx.beginPath();
  ctx.ellipse(6, 114, 24, 20, 0.1, 0, Math.PI * 2);
  strokeFill('#fbd0ae', 4.5);
  ctx.restore();

  // 4. RIGHT ARM (far top-right: center 935, 215)
  ctx.save();
  ctx.translate(935, 215);
  ctx.beginPath();
  ctx.moveTo(-18, -125);
  ctx.bezierCurveTo(36, -90, 45, 25, 18, 92);
  ctx.lineTo(-24, 84);
  ctx.bezierCurveTo(-8, 22, -16, -65, -42, -108);
  ctx.closePath();
  strokeFill('#3b7c6d', 4.5);
  ctx.beginPath();
  ctx.rect(-26, 82, 46, 15);
  strokeFill('#d4ab42', 4);
  ctx.beginPath();
  ctx.ellipse(-6, 114, 24, 20, -0.1, 0, Math.PI * 2);
  strokeFill('#fbd0ae', 4.5);
  ctx.restore();

  // 5. PROP NEEDLES (bottom-left: center 150, 730)
  ctx.save();
  ctx.translate(150, 730);
  [-34, 34].forEach((nx) => {
    ctx.fillStyle = '#c88c46';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(nx - 5, -145, 10, 290, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx, -152, 16, 0, Math.PI * 2);
    strokeFill('#e57a1c', 4);
    ctx.beginPath();
    ctx.arc(nx, 152, 13, 0, Math.PI * 2);
    strokeFill('#e57a1c', 4);
  });
  ctx.restore();

  // 6. PROP SCARF (bottom-center-left: center 375, 730)
  ctx.save();
  ctx.translate(375, 730);
  ctx.beginPath();
  ctx.moveTo(-32, -165);
  ctx.bezierCurveTo(-24, -40, -40, 60, -34, 150);
  ctx.lineTo(34, 150);
  ctx.bezierCurveTo(28, 60, 42, -40, 32, -165);
  ctx.closePath();
  strokeFill('#c82b2b', 4.5);
  ctx.fillStyle = '#e5b82e';
  ctx.fillRect(-33, 98, 66, 11);
  ctx.fillRect(-34, 120, 68, 11);
  ctx.strokeStyle = '#7e1717';
  ctx.lineWidth = 2.5;
  for (let sy = -140; sy <= 80; sy += 22) {
    ctx.beginPath();
    ctx.moveTo(-14, sy);
    ctx.lineTo(-14, sy + 10);
    ctx.moveTo(0, sy + 6);
    ctx.lineTo(0, sy + 16);
    ctx.moveTo(14, sy);
    ctx.lineTo(14, sy + 10);
    ctx.stroke();
  }
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3.5;
  for (let fx = -26; fx <= 26; fx += 10) {
    ctx.beginPath();
    ctx.moveTo(fx, 150);
    ctx.lineTo(fx, 174);
    ctx.stroke();
  }
  ctx.restore();

  // 7. LEFT LEG + SHOE (bottom-center-right: center 615, 755)
  ctx.save();
  ctx.translate(615, 755);
  ctx.beginPath();
  ctx.moveTo(-26, -155);
  ctx.bezierCurveTo(-34, -175, 34, -175, 26, -155);
  ctx.lineTo(22, 125);
  ctx.lineTo(-22, 125);
  ctx.closePath();
  strokeFill('#7c6e5b', 4.5);
  ctx.beginPath();
  ctx.moveTo(22, 125);
  ctx.lineTo(24, 148);
  ctx.quadraticCurveTo(-20, 154, -56, 148);
  ctx.quadraticCurveTo(-58, 130, -22, 125);
  ctx.closePath();
  strokeFill('#3f3d36', 4.5);
  ctx.restore();

  // 8. RIGHT LEG + SHOE (bottom-right: center 805, 755)
  ctx.save();
  ctx.translate(805, 755);
  ctx.beginPath();
  ctx.moveTo(-26, -155);
  ctx.bezierCurveTo(-34, -175, 34, -175, 26, -155);
  ctx.lineTo(22, 125);
  ctx.lineTo(-22, 125);
  ctx.closePath();
  strokeFill('#7c6e5b', 4.5);
  ctx.beginPath();
  ctx.moveTo(-22, 125);
  ctx.lineTo(-24, 148);
  ctx.quadraticCurveTo(20, 154, 56, 148);
  ctx.quadraticCurveTo(58, 130, 22, 125);
  ctx.closePath();
  strokeFill('#3f3d36', 4.5);
  ctx.restore();

  const knownBoxes: KnownPartBox[] = [
    { role: 'Head', x: 40, y: 20, w: 300, h: 350, pivotX: 0.5, pivotY: 0.88 },
    { role: 'Torso', x: 370, y: 40, w: 320, h: 430, pivotX: 0.5, pivotY: 0.5 },
    { role: 'LeftArm', x: 720, y: 60, w: 140, h: 320, pivotX: 0.65, pivotY: 0.14 },
    { role: 'RightArm', x: 870, y: 60, w: 145, h: 320, pivotX: 0.35, pivotY: 0.14 },
    { role: 'PropNeedles', x: 70, y: 530, w: 165, h: 400, pivotX: 0.5, pivotY: 0.5 },
    { role: 'PropScarf', x: 305, y: 530, w: 145, h: 400, pivotX: 0.5, pivotY: 0.08 },
    { role: 'LeftLeg', x: 530, y: 560, w: 160, h: 380, pivotX: 0.5, pivotY: 0.1 },
    { role: 'RightLeg', x: 730, y: 560, w: 160, h: 380, pivotX: 0.5, pivotY: 0.1 }
  ];

  return { sheetDataUrl: canvas.toDataURL('image/png'), knownBoxes };
}

export function generateKingSheetWithLayout(): {
  sheetDataUrl: string;
  knownBoxes: KnownPartBox[];
} {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_CANVAS_SIZE;
  canvas.height = SHEET_CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = CHROMA_BG_COLOR;
  ctx.fillRect(0, 0, SHEET_CANVAS_SIZE, SHEET_CANVAS_SIZE);

  const P = KING_PALETTE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const strokeFill = (fill: string, lw = 4.5) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // 1. HEAD + ROYAL CROWN + BEARD (center 190, 215)
  ctx.save();
  ctx.translate(190, 215);

  // Neck stub
  ctx.beginPath();
  ctx.moveTo(-24, 82);
  ctx.lineTo(-22, 128);
  ctx.bezierCurveTo(-22, 142, 22, 142, 22, 128);
  ctx.lineTo(24, 82);
  ctx.closePath();
  strokeFill(P.skinShadow, 4.5);

  // Ears
  [-102, 102].forEach((ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, 12, 15, 22, ex < 0 ? -0.15 : 0.15, 0, Math.PI * 2);
    strokeFill(P.skinShadow, 4.5);
  });

  // Hair tuft sides
  [-88, 88].forEach((hx) => {
    ctx.beginPath();
    ctx.ellipse(hx, -18, 22, 34, hx < 0 ? 0.2 : -0.2, 0, Math.PI * 2);
    strokeFill(P.beardShade, 4);
  });

  // Face base
  ctx.beginPath();
  ctx.ellipse(0, 8, 96, 86, 0, 0, Math.PI * 2);
  strokeFill(P.skin, 5);

  // Rosy cheeks
  ctx.fillStyle = P.cheek;
  ctx.beginPath();
  ctx.ellipse(-56, 22, 20, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(56, 22, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Royal Full White Beard
  ctx.beginPath();
  ctx.moveTo(-84, 24);
  ctx.bezierCurveTo(-92, 92, -36, 122, 0, 126);
  ctx.bezierCurveTo(36, 122, 92, 92, 84, 24);
  ctx.quadraticCurveTo(0, 56, -84, 24);
  ctx.closePath();
  strokeFill(P.beardWhite, 4.5);

  // Expressive Royal Eyes & Furrowed Brows
  [-36, 36].forEach((ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, -8, 18, 15, 0, 0, Math.PI * 2);
    strokeFill('#ffffff', 3.5);
    ctx.beginPath();
    ctx.arc(ex, -6, 6.8, 0, Math.PI * 2);
    ctx.fillStyle = P.outline;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - 2.2, -8.5, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });

  // Bushy expressive brows
  ctx.beginPath();
  ctx.moveTo(-60, -28);
  ctx.quadraticCurveTo(-36, -38, -14, -22);
  ctx.moveTo(60, -28);
  ctx.quadraticCurveTo(36, -38, 14, -22);
  ctx.strokeStyle = P.beardWhite;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Nose
  ctx.beginPath();
  ctx.ellipse(0, 12, 13, 10, 0, 0, Math.PI * 2);
  strokeFill(P.skinShadow, 3.5);

  // Curled Imperial Mustache
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.bezierCurveTo(-24, 14, -68, 22, -62, 46);
  ctx.bezierCurveTo(-48, 52, -22, 44, 0, 36);
  ctx.bezierCurveTo(22, 44, 48, 52, 62, 46);
  ctx.bezierCurveTo(68, 22, 24, 14, 0, 24);
  ctx.closePath();
  strokeFill(P.beardWhite, 4);

  // Crimson Velvet Crown Cap
  ctx.beginPath();
  ctx.ellipse(0, -82, 68, 44, 0, Math.PI, 0, false);
  ctx.closePath();
  strokeFill(P.crownVelvet, 4.5);

  // Ornate Golden Crown Spikes & Band
  ctx.beginPath();
  ctx.moveTo(-82, -52);
  ctx.lineTo(-96, -124);
  ctx.lineTo(-46, -86);
  ctx.lineTo(0, -144);
  ctx.lineTo(46, -86);
  ctx.lineTo(96, -124);
  ctx.lineTo(82, -52);
  ctx.closePath();
  strokeFill(P.crownGold, 4.8);

  // Crown base band + gems
  ctx.beginPath();
  ctx.roundRect(-84, -68, 168, 22, 6);
  strokeFill(P.crownGoldDeep, 4);

  // Jewels on band & tips
  [
    { x: 0, y: -57, c: P.ruby, r: 8 },
    { x: -46, y: -57, c: P.emerald, r: 6.5 },
    { x: 46, y: -57, c: P.sapphire, r: 6.5 },
    { x: 0, y: -146, c: P.ruby, r: 7 },
    { x: -96, y: -126, c: P.ermineWhite, r: 6 },
    { x: 96, y: -126, c: P.ermineWhite, r: 6 }
  ].forEach((gem) => {
    ctx.beginPath();
    ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2);
    strokeFill(gem.c, 2.8);
  });
  ctx.restore();

  // 2. ROYAL ROBE + ERMINE MANTLE TORSO (center 530, 255)
  ctx.save();
  ctx.translate(530, 255);

  // Outer crimson royal cape silhouette
  ctx.beginPath();
  ctx.moveTo(-84, -182);
  ctx.bezierCurveTo(-142, -70, -158, 95, -146, 188);
  ctx.quadraticCurveTo(0, 212, 146, 188);
  ctx.bezierCurveTo(158, 95, 142, -70, 84, -182);
  ctx.closePath();
  strokeFill(P.robeDark, 5);

  // Front royal tunic panel
  ctx.beginPath();
  ctx.moveTo(-64, -174);
  ctx.bezierCurveTo(-96, -60, -104, 85, -96, 186);
  ctx.quadraticCurveTo(0, 204, 96, 186);
  ctx.bezierCurveTo(104, 85, 96, -60, 64, -174);
  ctx.closePath();
  strokeFill(P.robeCrimson, 4.5);

  // Gold center brocade trim
  ctx.beginPath();
  ctx.roundRect(-14, -130, 28, 312, 4);
  strokeFill(P.crownGold, 3.5);

  // Gold bottom hem
  ctx.beginPath();
  ctx.moveTo(-144, 166);
  ctx.quadraticCurveTo(0, 192, 144, 166);
  ctx.lineTo(146, 188);
  ctx.quadraticCurveTo(0, 212, -146, 188);
  ctx.closePath();
  strokeFill(P.crownGold, 4);

  // Spotted Ermine Fur Shoulder Mantle
  ctx.beginPath();
  ctx.moveTo(-98, -178);
  ctx.bezierCurveTo(-128, -110, -86, -64, 0, -68);
  ctx.bezierCurveTo(86, -64, 128, -110, 98, -178);
  ctx.quadraticCurveTo(0, -148, -98, -178);
  ctx.closePath();
  strokeFill(P.ermineWhite, 4.5);

  // Ermine black spots
  ctx.fillStyle = P.outline;
  [
    [-72, -128],
    [-38, -102],
    [0, -96],
    [38, -102],
    [72, -128],
    [-58, -150],
    [58, -150]
  ].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.ellipse(sx, sy, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Royal Gold Medallion Clasp
  ctx.beginPath();
  ctx.arc(0, -114, 22, 0, Math.PI * 2);
  strokeFill(P.crownGold, 4);
  ctx.beginPath();
  ctx.arc(0, -114, 10, 0, Math.PI * 2);
  strokeFill(P.ruby, 2.5);

  // Jeweled Golden Belt
  ctx.beginPath();
  ctx.roundRect(-114, 6, 228, 30, 6);
  strokeFill(P.crownGoldDeep, 4);
  ctx.beginPath();
  ctx.roundRect(-24, 0, 48, 42, 8);
  strokeFill(P.crownGold, 4);
  ctx.beginPath();
  ctx.arc(0, 21, 9, 0, Math.PI * 2);
  strokeFill(P.emerald, 2.5);
  ctx.restore();

  // 3 & 4. PUFFED ROYAL SLEEVES + HANDS
  [
    { cx: 790, dir: -1 },
    { cx: 935, dir: 1 }
  ].forEach(({ cx, dir }) => {
    ctx.save();
    ctx.translate(cx, 220);

    // Puffed shoulder
    ctx.beginPath();
    ctx.ellipse(0, -82, 34, 44, dir * 0.12, 0, Math.PI * 2);
    strokeFill(P.robeCrimson, 4.5);

    // Gold sleeve stripes
    ctx.beginPath();
    ctx.moveTo(-12, -118);
    ctx.lineTo(-12, -48);
    ctx.moveTo(12, -118);
    ctx.lineTo(12, -48);
    ctx.strokeStyle = P.crownGold;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Forearm sleeve
    ctx.beginPath();
    ctx.roundRect(-24, -54, 48, 134, 16);
    strokeFill(P.robeDark, 4.5);

    // White ermine wrist cuff
    ctx.beginPath();
    ctx.roundRect(-28, 66, 56, 22, 8);
    strokeFill(P.ermineWhite, 4);

    // Hand
    ctx.beginPath();
    ctx.ellipse(0, 106, 22, 19, 0, 0, Math.PI * 2);
    strokeFill(P.skin, 4.5);
    ctx.restore();
  });

  // 5. PROP SCEPTER (slot PropNeedles: center 150, 730)
  ctx.save();
  ctx.translate(150, 730);
  ctx.beginPath();
  ctx.roundRect(-7, -115, 14, 275, 6);
  strokeFill(P.crownGoldDeep, 4);
  // Orb & crown finial
  ctx.beginPath();
  ctx.arc(0, -134, 26, 0, Math.PI * 2);
  strokeFill(P.crownGold, 4.5);
  ctx.beginPath();
  ctx.arc(0, -134, 12, 0, Math.PI * 2);
  strokeFill(P.ruby, 3);
  ctx.beginPath();
  ctx.moveTo(0, -182);
  ctx.lineTo(0, -158);
  ctx.moveTo(-12, -172);
  ctx.lineTo(12, -172);
  ctx.strokeStyle = P.crownGold;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  // 6. PROP ROYAL CHAIN / SASH (slot PropScarf: center 375, 730)
  ctx.save();
  ctx.translate(375, 730);
  ctx.beginPath();
  ctx.moveTo(-48, -110);
  ctx.quadraticCurveTo(0, -40, 48, -110);
  ctx.strokeStyle = P.crownGold;
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  [-34, 0, 34].forEach((lx, idx) => {
    ctx.beginPath();
    ctx.arc(lx, idx === 1 ? -72 : -92, 10, 0, Math.PI * 2);
    strokeFill(idx === 1 ? P.sapphire : P.crownGold, 3);
  });
  ctx.restore();

  // 7 & 8. ROYAL BREECHES + CUFFED BOOTS
  [
    { cx: 585, bootDir: -1 },
    { cx: 790, bootDir: 1 }
  ].forEach(({ cx, bootDir }) => {
    ctx.save();
    ctx.translate(cx, 755);
    // Leg breeches
    ctx.beginPath();
    ctx.roundRect(-24, -145, 48, 175, 14);
    strokeFill('#4a3b32', 4.5);
    // Cuffed leather boot
    ctx.beginPath();
    ctx.roundRect(-27, 15, 54, 105, 10);
    strokeFill(P.leatherBoot, 4.5);
    ctx.beginPath();
    ctx.roundRect(-30, 8, 60, 22, 6);
    strokeFill(P.crownGoldDeep, 3.8);
    // Toe
    ctx.beginPath();
    ctx.ellipse(bootDir * 16, 122, 38, 17, 0, 0, Math.PI * 2);
    strokeFill(P.leatherBoot, 4.5);
    ctx.restore();
  });

  const knownBoxes: KnownPartBox[] = [
    { role: 'Head', x: 65, y: 40, w: 250, h: 330, pivotX: 0.5, pivotY: 0.88 },
    { role: 'Torso', x: 355, y: 40, w: 340, h: 440, pivotX: 0.5, pivotY: 0.5 },
    { role: 'LeftArm', x: 730, y: 75, w: 120, h: 280, pivotX: 0.55, pivotY: 0.14 },
    { role: 'RightArm', x: 875, y: 75, w: 120, h: 280, pivotX: 0.45, pivotY: 0.14 },
    { role: 'PropNeedles', x: 95, y: 525, w: 110, h: 390, pivotX: 0.5, pivotY: 0.5 },
    { role: 'PropScarf', x: 300, y: 580, w: 150, h: 170, pivotX: 0.5, pivotY: 0.12 },
    { role: 'LeftLeg', x: 510, y: 585, w: 150, h: 330, pivotX: 0.55, pivotY: 0.1 },
    { role: 'RightLeg', x: 715, y: 585, w: 150, h: 330, pivotX: 0.45, pivotY: 0.1 }
  ];

  return { sheetDataUrl: canvas.toDataURL('image/png'), knownBoxes };
}

export function generateSoldierSheetWithLayout(): {
  sheetDataUrl: string;
  knownBoxes: KnownPartBox[];
} {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_CANVAS_SIZE;
  canvas.height = SHEET_CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = CHROMA_BG_COLOR;
  ctx.fillRect(0, 0, SHEET_CANVAS_SIZE, SHEET_CANVAS_SIZE);

  const P = SOLDIER_PALETTE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const strokeFill = (fill: string, lw = 4.5) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // 1. HEAD + STEEL HELMET & CRIMSON PLUME (center 190, 215)
  ctx.save();
  ctx.translate(190, 215);

  // Neck stub + chainmail collar
  ctx.beginPath();
  ctx.roundRect(-26, 78, 52, 46, 10);
  strokeFill(P.chainmail, 4.5);

  // Plume crest
  ctx.beginPath();
  ctx.moveTo(-14, -95);
  ctx.bezierCurveTo(-48, -162, 54, -172, 68, -96);
  ctx.quadraticCurveTo(22, -108, -14, -95);
  ctx.closePath();
  strokeFill(P.plumeRed, 4.5);

  // Face base
  ctx.beginPath();
  ctx.ellipse(0, 12, 86, 78, 0, 0, Math.PI * 2);
  strokeFill(P.skin, 5);

  // Helmet dome
  ctx.beginPath();
  ctx.ellipse(0, -18, 96, 86, 0, Math.PI, 0, false);
  ctx.lineTo(96, 4);
  ctx.quadraticCurveTo(44, -22, 0, -26);
  ctx.quadraticCurveTo(-44, -22, -96, 4);
  ctx.closePath();
  strokeFill(P.steelLight, 5);

  // Helmet nasal guard & brass rim
  ctx.beginPath();
  ctx.roundRect(-10, -56, 20, 62, 6);
  strokeFill(P.steelMid, 4);
  ctx.beginPath();
  ctx.moveTo(-94, -12);
  ctx.quadraticCurveTo(0, -34, 94, -12);
  ctx.strokeStyle = P.brassGold;
  ctx.lineWidth = 7;
  ctx.stroke();

  // Stern eyes & thick guard mustache
  [-32, 32].forEach((ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, 6, 15, 11, 0, 0, Math.PI * 2);
    strokeFill('#ffffff', 3.2);
    ctx.beginPath();
    ctx.arc(ex, 7, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = P.outline;
    ctx.fill();
  });
  ctx.beginPath();
  ctx.moveTo(-42, -10);
  ctx.lineTo(-14, -2);
  ctx.moveTo(42, -10);
  ctx.lineTo(14, -2);
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.bezierCurveTo(-24, 24, -52, 36, -48, 52);
  ctx.quadraticCurveTo(-18, 46, 0, 40);
  ctx.quadraticCurveTo(18, 46, 48, 52);
  ctx.bezierCurveTo(52, 36, 24, 24, 0, 32);
  strokeFill('#5c3a21', 3.5);
  ctx.restore();

  // 2. ARMORED BREASTPLATE + TABARD TORSO (center 530, 255)
  ctx.save();
  ctx.translate(530, 255);

  // Crimson tabard skirt base
  ctx.beginPath();
  ctx.moveTo(-88, 25);
  ctx.lineTo(-112, 184);
  ctx.quadraticCurveTo(0, 204, 112, 184);
  ctx.lineTo(88, 25);
  ctx.closePath();
  strokeFill(P.tabardCrimson, 4.5);

  // Gold center heraldic stripe
  ctx.beginPath();
  ctx.roundRect(-16, 28, 32, 158, 4);
  strokeFill(P.brassGold, 3.5);

  // Steel Breastplate
  ctx.beginPath();
  ctx.moveTo(-86, -172);
  ctx.bezierCurveTo(-116, -90, -106, 20, -90, 48);
  ctx.quadraticCurveTo(0, 72, 90, 48);
  ctx.bezierCurveTo(106, 20, 116, -90, 86, -172);
  ctx.quadraticCurveTo(0, -142, -86, -172);
  ctx.closePath();
  strokeFill(P.steelLight, 5);

  // Breastplate center ridge & rivets
  ctx.beginPath();
  ctx.moveTo(0, -150);
  ctx.lineTo(0, 56);
  ctx.strokeStyle = P.steelDark;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Diagonal leather baldric strap
  ctx.beginPath();
  ctx.moveTo(-80, -160);
  ctx.lineTo(86, 26);
  ctx.strokeStyle = P.leather;
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Waist belt + brass buckle
  ctx.beginPath();
  ctx.roundRect(-98, 24, 196, 28, 6);
  strokeFill(P.leather, 4);
  ctx.beginPath();
  ctx.roundRect(-22, 18, 44, 40, 6);
  strokeFill(P.brassGold, 3.8);
  ctx.restore();

  // 3 & 4. PAULDRON ARMS + GAUNTLETS
  [
    { cx: 790, dir: -1 },
    { cx: 935, dir: 1 }
  ].forEach(({ cx, dir }) => {
    ctx.save();
    ctx.translate(cx, 220);

    // Steel shoulder pauldron
    ctx.beginPath();
    ctx.ellipse(0, -86, 36, 38, dir * 0.15, 0, Math.PI * 2);
    strokeFill(P.steelLight, 4.5);

    // Chainmail sleeve
    ctx.beginPath();
    ctx.roundRect(-22, -52, 44, 130, 14);
    strokeFill(P.chainmail, 4.5);

    // Steel gauntlet cuff & fist
    ctx.beginPath();
    ctx.roundRect(-25, 62, 50, 26, 8);
    strokeFill(P.steelMid, 4);
    ctx.beginPath();
    ctx.ellipse(0, 106, 21, 18, 0, 0, Math.PI * 2);
    strokeFill(P.steelLight, 4.5);
    ctx.restore();
  });

  // 5. PROP HALBERD / SPEAR (slot PropNeedles: center 150, 730)
  ctx.save();
  ctx.translate(150, 730);
  ctx.beginPath();
  ctx.roundRect(-7, -110, 14, 290, 5);
  strokeFill(P.woodShaft, 4);
  // Steel spear tip
  ctx.beginPath();
  ctx.moveTo(0, -188);
  ctx.lineTo(-24, -115);
  ctx.lineTo(0, -124);
  ctx.lineTo(24, -115);
  ctx.closePath();
  strokeFill(P.steelLight, 4);
  // Brass collar
  ctx.beginPath();
  ctx.roundRect(-14, -118, 28, 16, 4);
  strokeFill(P.brassGold, 3.5);
  ctx.restore();

  // 6. PROP HERALDIC SHIELD (slot PropScarf: center 375, 730)
  ctx.save();
  ctx.translate(375, 730);
  ctx.beginPath();
  ctx.moveTo(-64, -95);
  ctx.lineTo(64, -95);
  ctx.lineTo(60, 10);
  ctx.bezierCurveTo(56, 72, 16, 104, 0, 114);
  ctx.bezierCurveTo(-16, 104, -56, 72, -60, 10);
  ctx.closePath();
  strokeFill(P.steelLight, 5);
  ctx.beginPath();
  ctx.moveTo(-48, -78);
  ctx.lineTo(48, -78);
  ctx.lineTo(44, 6);
  ctx.bezierCurveTo(40, 56, 12, 82, 0, 92);
  ctx.bezierCurveTo(-12, 82, -40, 56, -44, 6);
  ctx.closePath();
  strokeFill(P.tabardCrimson, 4);
  // Gold cross emblem
  ctx.fillStyle = P.brassGold;
  ctx.fillRect(-10, -68, 20, 130);
  ctx.fillRect(-40, -24, 80, 20);
  ctx.restore();

  // 7 & 8. STEEL GREAVES + LEATHER BOOTS
  [
    { cx: 585, bootDir: -1 },
    { cx: 790, bootDir: 1 }
  ].forEach(({ cx, bootDir }) => {
    ctx.save();
    ctx.translate(cx, 755);
    ctx.beginPath();
    ctx.roundRect(-24, -145, 48, 180, 12);
    strokeFill(P.steelMid, 4.5);
    // Knee poleyn
    ctx.beginPath();
    ctx.ellipse(0, -45, 28, 20, 0, 0, Math.PI * 2);
    strokeFill(P.steelLight, 4);
    // Boot
    ctx.beginPath();
    ctx.roundRect(-26, 22, 52, 98, 10);
    strokeFill(P.bootDark, 4.5);
    ctx.beginPath();
    ctx.ellipse(bootDir * 16, 122, 38, 17, 0, 0, Math.PI * 2);
    strokeFill(P.bootDark, 4.5);
    ctx.restore();
  });

  const knownBoxes: KnownPartBox[] = [
    { role: 'Head', x: 65, y: 40, w: 250, h: 330, pivotX: 0.5, pivotY: 0.88 },
    { role: 'Torso', x: 380, y: 55, w: 295, h: 420, pivotX: 0.5, pivotY: 0.5 },
    { role: 'LeftArm', x: 730, y: 75, w: 120, h: 280, pivotX: 0.55, pivotY: 0.14 },
    { role: 'RightArm', x: 875, y: 75, w: 120, h: 280, pivotX: 0.45, pivotY: 0.14 },
    { role: 'PropNeedles', x: 105, y: 520, w: 90, h: 410, pivotX: 0.5, pivotY: 0.5 },
    { role: 'PropScarf', x: 290, y: 615, w: 170, h: 250, pivotX: 0.5, pivotY: 0.35 },
    { role: 'LeftLeg', x: 510, y: 585, w: 150, h: 330, pivotX: 0.55, pivotY: 0.1 },
    { role: 'RightLeg', x: 715, y: 585, w: 150, h: 330, pivotX: 0.45, pivotY: 0.1 }
  ];

  return { sheetDataUrl: canvas.toDataURL('image/png'), knownBoxes };
}

export function createKeyedThumbnail(shotIdx: number, title: string): string {
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#a78349';
  ctx.fillRect(0, 0, 360, 420);
  ctx.strokeStyle = '#654b25';
  ctx.lineWidth = 2;
  for (let row = 0; row < 16; row++) {
    const y = row * 26;
    const offset = (row % 2) * 28;
    for (let col = -1; col < 8; col++) {
      ctx.strokeRect(col * 56 + offset, y, 56, 26);
    }
  }
  const archGrad = ctx.createLinearGradient(170, 90, 320, 420);
  archGrad.addColorStop(0, '#c8d1db');
  archGrad.addColorStop(1, '#e8edf2');
  ctx.fillStyle = archGrad;
  ctx.beginPath();
  ctx.moveTo(175, 420);
  ctx.lineTo(175, 195);
  ctx.arc(248, 195, 73, Math.PI, 0, false);
  ctx.lineTo(321, 420);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8b837c';
  ctx.fillRect(0, 420, 360, 220);
  ctx.fillStyle = 'rgba(13, 15, 20, 0.78)';
  ctx.fillRect(14, 14, 332, 34);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
  ctx.fillText(`Shot ${shotIdx + 1}: ${title.slice(0, 32)}`, 24, 35);
  return c.toDataURL('image/png');
}

export function createDefaultPiecePlaceholder(): CutPiece[] {
  return [];
}

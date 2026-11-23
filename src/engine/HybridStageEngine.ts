import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AspectMode,
  CutPiece,
  EnvironmentPreset,
  PieceRole,
  ShotSpec,
  TimelineConfig
} from '../types/studio';

interface CharacterRigInstance {
  root: THREE.Group;
  torso?: THREE.Group;
  head?: THREE.Group;
  leftArm?: THREE.Group;
  rightArm?: THREE.Group;
  leftLeg?: THREE.Group;
  rightLeg?: THREE.Group;
  needles?: THREE.Group;
  scarfProp?: THREE.Group;
  baseTorsoY: number;
}

const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class HybridStageEngine {
  public readonly isSoftwareGl: boolean;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public width = 720;
  public height = 1280;

  private maxAnisotropy = 4;
  private envGroups: Record<EnvironmentPreset, THREE.Group>;
  private characterRigs = new Map<string, CharacterRigInstance>();
  private chairGroup: THREE.Group;
  private scarfMesh: THREE.Mesh | null = null;
  private scarfMat: THREE.MeshStandardMaterial;
  private lastScarfKey = '';

  private warmLight: THREE.PointLight;
  private keyDirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private shadowTex: THREE.CanvasTexture;
  private disposed = false;

  constructor(aspectMode: AspectMode = '9:16') {
    this.isSoftwareGl = detectSoftwareWebGL();
    this.setDimensionsForAspect(aspectMode, false);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1916);
    this.scene.fog = new THREE.FogExp2(0x1f1c18, 0.028);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 80);
    this.camera.position.set(0, 2.35, 5.4);
    this.camera.lookAt(0, 1.35, 0);

    // Three-point + lantern lighting
    this.hemiLight = new THREE.HemisphereLight(0xf6eedc, 0x3b332c, 1.05);
    this.scene.add(this.hemiLight);

    this.warmLight = new THREE.PointLight(0xffb454, 2.7, 22, 1.35);
    this.warmLight.position.set(-1.35, 3.85, 2.2);
    this.warmLight.castShadow = !this.isSoftwareGl;
    this.warmLight.shadow.mapSize.set(1024, 1024);
    this.warmLight.shadow.bias = -0.0005;
    this.scene.add(this.warmLight);

    this.keyDirLight = new THREE.DirectionalLight(0xdfe9f7, 1.15);
    this.keyDirLight.position.set(1.6, 4.6, 2.2);
    this.keyDirLight.castShadow = !this.isSoftwareGl;
    this.keyDirLight.shadow.mapSize.set(1024, 1024);
    this.keyDirLight.shadow.camera.left = -4;
    this.keyDirLight.shadow.camera.right = 4;
    this.keyDirLight.shadow.camera.top = 4;
    this.keyDirLight.shadow.camera.bottom = -4;
    this.keyDirLight.shadow.bias = -0.0004;
    this.keyDirLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyDirLight);

    this.shadowTex = this._createContactShadowTexture();
    this.scarfMat = new THREE.MeshStandardMaterial({
      map: this._createScarfStripeTexture(),
      roughness: 0.84,
      metalness: 0.03
    });

    this.chairGroup = this._buildWoodenChair();
    this.chairGroup.visible = false;
    this.scene.add(this.chairGroup);

    this.envGroups = {
      courtyard: this._buildCourtyardEnv(),
      dungeon: this._buildDungeonEnv(),
      village: this._buildVillageEnv(),
      throne_hall: this._buildThroneHallEnv(),
      bare_wall: this._buildBareWallEnv()
    };

    (Object.values(this.envGroups) as THREE.Group[]).forEach((g) => {
      g.visible = false;
      this.scene.add(g);
    });
    this.envGroups.courtyard.visible = true;

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public setDimensionsForAspect(aspectMode: AspectMode, updateRenderer = true): void {
    if (aspectMode === '16:9') {
      this.width = 1280;
      this.height = 720;
    } else {
      this.width = 720;
      this.height = 1280;
    }
    if (updateRenderer && this.renderer && this.camera) {
      this.renderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / this.height;
      this.camera.fov = aspectMode === '16:9' ? 35 : 40;
      this.camera.updateProjectionMatrix();
    }
  }

  private _createContactShadowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 32, 6, 64, 32, 58);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private _createBrickTextures(): { colorTex: THREE.CanvasTexture; bumpTex: THREE.CanvasTexture } {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const b = document.createElement('canvas');
    b.width = 512;
    b.height = 512;
    const bCtx = b.getContext('2d')!;

    ctx.fillStyle = '#47341c';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 6;
    const rh = 512 / rows;
    const cw = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * 0.5);
      for (let col = -1; col <= cols; col++) {
        const bx = col * cw + offset + 3;
        const by = r * rh + 3;
        const bw = cw - 6;
        const bh = rh - 6;
        const shade = ((r * 7 + col * 13) % 5) * 5;
        ctx.fillStyle = `rgb(${156 + shade}, ${122 + shade}, ${64 + Math.floor(shade * 0.6)})`;
        ctx.fillRect(bx, by, bw, bh);
        bCtx.fillStyle = '#dcdcdc';
        bCtx.fillRect(bx, by, bw, bh);
      }
    }

    const colorTex = new THREE.CanvasTexture(c);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(2.4, 2.2);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = this.maxAnisotropy;

    const bumpTex = new THREE.CanvasTexture(b);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2.4, 2.2);
    return { colorTex, bumpTex };
  }

  private _createCobblestoneTextures(): { colorTex: THREE.CanvasTexture; bumpTex: THREE.CanvasTexture } {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const b = document.createElement('canvas');
    b.width = 512;
    b.height = 512;
    const bCtx = b.getContext('2d')!;

    ctx.fillStyle = '#3a342f';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#181818';
    bCtx.fillRect(0, 0, 512, 512);

    const grid = 12;
    const step = 512 / grid;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const jx = Math.sin(gx * 12.9898 + gy * 78.233) * 6;
        const jy = Math.cos(gx * 39.346 + gy * 11.135) * 6;
        const cx = (gx + 0.5) * step + jx;
        const cy = (gy + 0.5) * step + jy;
        const rx = step * 0.39;
        const ry = step * 0.33;
        const tone = 114 + ((gx * 17 + gy * 31) % 38);
        ctx.fillStyle = `rgb(${tone + 10}, ${tone + 4}, ${tone - 2})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, (gx + gy) * 0.2, 0, Math.PI * 2);
        ctx.fill();

        bCtx.fillStyle = '#e4e4e4';
        bCtx.beginPath();
        bCtx.ellipse(cx, cy, rx * 0.92, ry * 0.92, (gx + gy) * 0.2, 0, Math.PI * 2);
        bCtx.fill();
      }
    }

    const colorTex = new THREE.CanvasTexture(c);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(4, 5);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = this.maxAnisotropy;

    const bumpTex = new THREE.CanvasTexture(b);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(4, 5);
    return { colorTex, bumpTex };
  }

  private _createStoneBlockTextures(): { colorTex: THREE.CanvasTexture; bumpTex: THREE.CanvasTexture } {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const b = document.createElement('canvas');
    b.width = 512;
    b.height = 512;
    const bCtx = b.getContext('2d')!;

    ctx.fillStyle = '#1b1d22';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#151515';
    bCtx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 4;
    const rh = 512 / rows;
    const cw = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let col = -1; col <= cols; col++) {
        const shade = 52 + ((r * 11 + col * 19) % 24);
        ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
        ctx.fillRect(col * cw + off + 4, r * rh + 4, cw - 8, rh - 8);
        bCtx.fillStyle = '#d4d4d4';
        bCtx.fillRect(col * cw + off + 4, r * rh + 4, cw - 8, rh - 8);
      }
    }

    const colorTex = new THREE.CanvasTexture(c);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(2, 2);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = this.maxAnisotropy;

    const bumpTex = new THREE.CanvasTexture(b);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2, 2);
    return { colorTex, bumpTex };
  }

  private _createScarfStripeTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c82424';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#e7b928';
    ctx.fillRect(0, 42, 256, 15);
    ctx.fillRect(0, 71, 256, 15);

    ctx.strokeStyle = 'rgba(85, 10, 10, 0.48)';
    ctx.lineWidth = 3;
    for (let x = 0; x < 256; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 6, 128);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  private _buildWoodenChair(): THREE.Group {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6e4726,
      roughness: 0.78,
      metalness: 0.04
    });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.68), woodMat);
    seat.position.set(0, 0.62, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    group.add(seat);

    const legGeo = new THREE.CylinderGeometry(0.035, 0.028, 0.62, 10);
    [
      [-0.31, 0.31, -0.26],
      [0.31, 0.31, -0.26],
      [-0.31, 0.31, 0.26],
      [0.31, 0.31, 0.26]
    ].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      group.add(leg);
    });

    const postGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.78, 10);
    [-0.31, 0.31].forEach((px) => {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(px, 1.02, -0.28);
      post.castShadow = true;
      group.add(post);
    });

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.06), woodMat);
    rail.position.set(0, 1.32, -0.28);
    rail.castShadow = true;
    group.add(rail);

    return group;
  }

  private _buildCourtyardEnv(): THREE.Group {
    const group = new THREE.Group();
    const { colorTex: brickColor, bumpTex: brickBump } = this._createBrickTextures();
    const { colorTex: cobbleColor, bumpTex: cobbleBump } = this._createCobblestoneTextures();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({
        map: cobbleColor,
        bumpMap: cobbleBump,
        bumpScale: 0.08,
        roughness: 0.86,
        metalness: 0.04
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 2);
    floor.receiveShadow = true;
    group.add(floor);

    // Brick wall with extruded arched doorway
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-6, 0);
    wallShape.lineTo(6, 0);
    wallShape.lineTo(6, 6.5);
    wallShape.lineTo(-6, 6.5);
    wallShape.closePath();

    const archHole = new THREE.Path();
    const ax = 0.72;
    const aw = 0.92;
    const archSpringY = 2.55;
    archHole.moveTo(ax - aw, 0);
    archHole.lineTo(ax - aw, archSpringY);
    archHole.absarc(ax, archSpringY, aw, Math.PI, 0, true);
    archHole.lineTo(ax + aw, 0);
    archHole.closePath();
    wallShape.holes.push(archHole);

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: 0.45, bevelEnabled: false });
    const pos = wallGeo.attributes.position;
    const uv = wallGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + 6) / 12, pos.getY(i) / 6.5);
    }

    const wallMesh = new THREE.Mesh(
      wallGeo,
      new THREE.MeshStandardMaterial({
        map: brickColor,
        bumpMap: brickBump,
        bumpScale: 0.06,
        roughness: 0.82
      })
    );
    wallMesh.position.set(0, 0, -1.15);
    wallMesh.receiveShadow = true;
    wallMesh.castShadow = true;
    group.add(wallMesh);

    // Stone arch trim frame
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x6f5e48, roughness: 0.75 });
    const archRing = new THREE.Mesh(
      new THREE.TorusGeometry(aw + 0.04, 0.08, 10, 24, Math.PI),
      trimMat
    );
    archRing.position.set(ax, archSpringY, -0.7);
    group.add(archRing);

    // Soft daylight gradient behind archway
    const skyC = document.createElement('canvas');
    skyC.width = 256;
    skyC.height = 512;
    const sCtx = skyC.getContext('2d')!;
    const grad = sCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#9eb0c4');
    grad.addColorStop(0.6, '#d2dce6');
    grad.addColorStop(1, '#eef2f6');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 512);
    const skyTex = new THREE.CanvasTexture(skyC);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 5.2),
      new THREE.MeshBasicMaterial({ map: skyTex })
    );
    backdrop.position.set(0.72, 2.3, -1.4);
    group.add(backdrop);

    // Hanging iron lantern sconce on left wall
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(-1.35, 3.2, -0.62);
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x26282e, metalness: 0.7, roughness: 0.35 });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), ironMat);
    bracket.position.set(0, 0.2, 0.14);
    lanternGroup.add(bracket);
    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 6), ironMat);
    lanternCap.position.set(0, 0.12, 0.28);
    lanternGroup.add(lanternCap);
    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.22, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffd27d,
        emissive: 0xff9e30,
        emissiveIntensity: 1.8,
        roughness: 0.2
      })
    );
    lanternGlass.position.set(0, -0.05, 0.28);
    lanternGroup.add(lanternGlass);
    group.add(lanternGroup);

    return group;
  }

  private _buildDungeonEnv(): THREE.Group {
    const group = new THREE.Group();
    const { colorTex: stoneColor, bumpTex: stoneBump } = this._createStoneBlockTextures();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({
        map: stoneColor,
        bumpMap: stoneBump,
        bumpScale: 0.07,
        roughness: 0.9,
        color: 0x8e929b
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(12, 7, 0.4),
      new THREE.MeshStandardMaterial({
        map: stoneColor,
        bumpMap: stoneBump,
        bumpScale: 0.08,
        roughness: 0.88
      })
    );
    backWall.position.set(0, 3.5, -1.6);
    backWall.receiveShadow = true;
    group.add(backWall);

    // Iron prison bars in front of character at z = 0.65
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x3b4048,
      metalness: 0.82,
      roughness: 0.32
    });
    const barGeo = new THREE.CylinderGeometry(0.036, 0.036, 4.4, 12);
    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(barGeo, ironMat);
      bar.position.set(i * 0.44, 2.2, 0.65);
      bar.castShadow = true;
      group.add(bar);
    }
    [0.85, 2.35, 3.8].forEach((cy) => {
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.07, 0.08), ironMat);
      crossbar.position.set(0, cy, 0.65);
      crossbar.castShadow = true;
      group.add(crossbar);
    });

    // Torch sconce
    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xff6a00,
        emissiveIntensity: 2.2
      })
    );
    torch.position.set(-1.3, 2.75, -1.32);
    group.add(torch);

    return group;
  }

  private _buildVillageEnv(): THREE.Group {
    const group = new THREE.Group();

    // Rolling grassy hillside extending to horizon (no boxy walls!)
    const hillGeo = new THREE.PlaneGeometry(36, 36, 48, 48);
    const pos = hillGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h =
        Math.sin(x * 0.35) * 0.45 +
        Math.cos(y * 0.25) * 0.35 -
        Math.max(0, y) * 0.04;
      // Keep center road flatter
      const roadFactor = Math.min(1, Math.abs(x) / 1.8);
      pos.setZ(i, Math.max(-0.2, h * roadFactor));
    }
    hillGeo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x3b6e3f,
      roughness: 0.92,
      metalness: 0.0
    });
    const terrain = new THREE.Mesh(hillGeo, grassMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(0, -0.02, 0);
    terrain.receiveShadow = true;
    group.add(terrain);

    // Winding dirt/cobble road
    const { colorTex: cobbleTex } = this._createCobblestoneTextures();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 22),
      new THREE.MeshStandardMaterial({
        map: cobbleTex,
        roughness: 0.88,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, 2.0);
    road.receiveShadow = true;
    group.add(road);

    // Stylized cottages on hillside
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xa63a2a, roughness: 0.72 });
    const housePositions: Array<[number, number, number, number]> = [
      [-2.4, 0.4, -2.5, 0.25],
      [2.3, 0.35, -3.2, -0.3],
      [-2.9, 0.25, -5.8, 0.15]
    ];
    housePositions.forEach(([hx, hy, hz, ry]) => {
      const cottage = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.0), wallMat);
      body.position.y = 0.45;
      body.castShadow = true;
      cottage.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.7, 4), roofMat);
      roof.position.y = 1.22;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      cottage.add(roof);
      cottage.position.set(hx, hy, hz);
      cottage.rotation.y = ry;
      group.add(cottage);
    });

    // Golden-hour sky dome plane behind hills
    const skyC = document.createElement('canvas');
    skyC.width = 256;
    skyC.height = 256;
    const sCtx = skyC.getContext('2d')!;
    const grad = sCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5a8ab8');
    grad.addColorStop(0.65, '#f2c794');
    grad.addColorStop(1, '#fbe4c4');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);
    const skyTex = new THREE.CanvasTexture(skyC);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 18),
      new THREE.MeshBasicMaterial({ map: skyTex })
    );
    skyPlane.position.set(0, 7, -14);
    group.add(skyPlane);

    return group;
  }

  private _buildThroneHallEnv(): THREE.Group {
    const group = new THREE.Group();
    const { colorTex: stoneTex, bumpTex: stoneBump } = this._createStoneBlockTextures();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x4b4642, roughness: 0.6, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 12),
      new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, 2.0);
    carpet.receiveShadow = true;
    group.add(carpet);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(12, 7.5, 0.4),
      new THREE.MeshStandardMaterial({
        map: stoneTex,
        bumpMap: stoneBump,
        bumpScale: 0.05,
        color: 0xb6a997,
        roughness: 0.78
      })
    );
    backWall.position.set(0, 3.75, -1.5);
    backWall.receiveShadow = true;
    group.add(backWall);

    // Ornate golden portrait frame
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe2b33c,
      metalness: 0.78,
      roughness: 0.25
    });
    const frameGroup = new THREE.Group();
    frameGroup.position.set(0, 2.7, -1.24);
    const frameBorder = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.75, 0.14), goldMat);
    frameBorder.castShadow = true;
    frameGroup.add(frameBorder);

    // Woven King Portrait Canvas inside frame
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 256;
    pCanvas.height = 320;
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.fillStyle = '#25354a';
    pCtx.fillRect(0, 0, 256, 320);
    // King silhouette woven in wool
    pCtx.fillStyle = '#7c2d12';
    pCtx.beginPath();
    pCtx.ellipse(128, 255, 84, 95, 0, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#e25175';
    pCtx.beginPath();
    pCtx.arc(128, 138, 48, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#2eb872';
    pCtx.beginPath();
    pCtx.moveTo(85, 102);
    pCtx.lineTo(80, 52);
    pCtx.lineTo(110, 80);
    pCtx.lineTo(128, 44);
    pCtx.lineTo(146, 80);
    pCtx.lineTo(176, 52);
    pCtx.lineTo(171, 102);
    pCtx.closePath();
    pCtx.fill();
    const portraitTex = new THREE.CanvasTexture(pCanvas);
    portraitTex.colorSpace = THREE.SRGBColorSpace;
    const canvasMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.98, 2.38),
      new THREE.MeshStandardMaterial({ map: portraitTex, roughness: 0.85 })
    );
    canvasMesh.position.z = 0.08;
    frameGroup.add(canvasMesh);
    group.add(frameGroup);

    return group;
  }

  private _buildBareWallEnv(): THREE.Group {
    const group = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x5c4734, roughness: 0.78 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(12, 7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x9b8e7b, roughness: 0.88 })
    );
    wall.position.set(0, 3.5, -1.3);
    wall.receiveShadow = true;
    group.add(wall);

    // Baseboard
    const baseboard = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.45, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.7 })
    );
    baseboard.position.set(0, 0.22, -1.04);
    group.add(baseboard);

    // Iron nail high on wall
    const nail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.85, roughness: 0.25 })
    );
    nail.rotation.x = Math.PI / 2;
    nail.position.set(0.25, 2.85, -0.98);
    group.add(nail);

    // Curved 3D Mouse hole on right side of baseboard
    const holeRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.04, 10, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2e2116, roughness: 0.8 })
    );
    holeRim.position.set(0.65, 0.02, -0.96);
    group.add(holeRim);

    const holeInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 20, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x050608 })
    );
    holeInner.position.set(0.65, 0.02, -0.95);
    group.add(holeInner);

    return group;
  }

  public async setCharacterRig(name: string, pieces: CutPiece[]): Promise<void> {
    const existing = this.characterRigs.get(name);
    if (existing) {
      existing.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          if (mat && mat !== (this.scarfMat as unknown)) {
            if ('map' in mat && mat.map && mat.map !== this.shadowTex) {
              mat.map.dispose();
            }
            mat.dispose();
          }
        }
      });
      this.scene.remove(existing.root);
      this.characterRigs.delete(name);
    }

    const root = new THREE.Group();
    root.visible = false;
    this.scene.add(root);

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.32, 0.54),
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        depthWrite: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.01, 0.02);
    root.add(contactShadow);

    const byRole: Partial<Record<PieceRole, CutPiece>> = {};
    for (const p of pieces) {
      if (p.role !== 'Ignore' && !byRole[p.role]) {
        byRole[p.role] = p;
      }
    }

    // Proportional world scaling based on Torso height (1.38m world units) so all pieces fit naturally!
    const torsoPiece = byRole.Torso;
    const unitsPerPixel = torsoPiece ? 1.38 / Math.max(100, torsoPiece.height) : 0.0034;

    const buildPartGroup = async (
      piece: CutPiece | undefined,
      fallbackHeight: number,
      zOffset: number
    ): Promise<THREE.Group | undefined> => {
      if (!piece) return undefined;
      const tex = await new THREE.TextureLoader().loadAsync(piece.haloDataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.anisotropy = this.maxAnisotropy;

      const worldH = torsoPiece ? piece.height * unitsPerPixel : fallbackHeight;
      const aspect = piece.width / Math.max(1, piece.height);
      const worldW = worldH * aspect;

      const geo = new THREE.PlaneGeometry(worldW, worldH);
      const offsetX = (0.5 - piece.pivotX) * worldW;
      const offsetY = (piece.pivotY - 0.5) * worldH;
      geo.translate(offsetX, offsetY, 0);

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.14,
        roughness: 0.72,
        metalness: 0.02,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !this.isSoftwareGl;
      const g = new THREE.Group();
      g.position.z = zOffset;
      g.add(mesh);
      return g;
    };

    const rig: CharacterRigInstance = {
      root,
      baseTorsoY: 1.24
    };

    const torso = await buildPartGroup(byRole.Torso, 1.38, 0.0);
    if (torso) {
      torso.position.set(0, rig.baseTorsoY, 0);
      root.add(torso);
      rig.torso = torso;
    }

    const hub = torso || root;
    const hubOffset = torso ? 0 : rig.baseTorsoY;

    const head = await buildPartGroup(byRole.Head, 1.05, 0.035);
    if (head) {
      head.position.set(0, 0.56 + hubOffset, 0.035);
      hub.add(head);
      rig.head = head;
    }

    const leftLeg = await buildPartGroup(byRole.LeftLeg, 0.92, -0.025);
    if (leftLeg) {
      leftLeg.position.set(-0.22, -0.44 + hubOffset, -0.025);
      hub.add(leftLeg);
      rig.leftLeg = leftLeg;
    }

    const rightLeg = await buildPartGroup(byRole.RightLeg, 0.92, -0.025);
    if (rightLeg) {
      rightLeg.position.set(0.22, -0.44 + hubOffset, -0.025);
      hub.add(rightLeg);
      rig.rightLeg = rightLeg;
    }

    const leftArm = await buildPartGroup(byRole.LeftArm, 0.88, 0.025);
    if (leftArm) {
      leftArm.position.set(-0.34, 0.42 + hubOffset, 0.025);
      leftArm.rotation.z = 0.25;
      hub.add(leftArm);
      rig.leftArm = leftArm;
    }

    const rightArm = await buildPartGroup(byRole.RightArm, 0.88, 0.025);
    if (rightArm) {
      rightArm.position.set(0.34, 0.42 + hubOffset, 0.025);
      rightArm.rotation.z = -0.25;
      hub.add(rightArm);
      rig.rightArm = rightArm;
    }

    const lowerName = name.toLowerCase();
    const isGrandma = /grandma|granny|dadi|दादी/.test(lowerName);
    const isSoldier = /soldier|guard|knight|सैनिक|senik/.test(lowerName);

    const needles = await buildPartGroup(byRole.PropNeedles, 0.85, 0.05);
    if (needles) {
      if (isGrandma) {
        needles.position.set(-0.02, -0.06 + hubOffset, 0.05);
        needles.rotation.z = 0.1;
      } else {
        // Scepter / Spear held cleanly at right side
        needles.position.set(0.5, 0.12 + hubOffset, 0.055);
        needles.rotation.z = -0.1;
      }
      hub.add(needles);
      rig.needles = needles;
    }

    const scarfProp = await buildPartGroup(byRole.PropScarf, 0.85, 0.045);
    if (scarfProp) {
      if (isSoldier) {
        // Heraldic shield held on left arm
        scarfProp.position.set(-0.48, 0.02 + hubOffset, 0.06);
      } else if (!isGrandma) {
        // Royal sash / collar chain
        scarfProp.position.set(0, 0.36 + hubOffset, 0.045);
      } else {
        scarfProp.position.set(-0.04, -0.05 + hubOffset, 0.045);
      }
      hub.add(scarfProp);
      rig.scarfProp = scarfProp;
    }

    this.characterRigs.set(name, rig);
  }

  private _update3DScarf(preset: EnvironmentPreset, progress: number, anchorX: number): void {
    const clampedP = Math.max(0, Math.min(1, progress));
    const key = `${preset}:${anchorX.toFixed(2)}:${Math.round(clampedP * 120)}`;
    if (key === this.lastScarfKey) return;
    this.lastScarfKey = key;

    if (this.scarfMesh) {
      this.scene.remove(this.scarfMesh);
      this.scarfMesh.geometry.dispose();
      this.scarfMesh = null;
    }
    if (clampedP <= 0.015) return;

    let fullPoints: THREE.Vector3[];
    let radius = 0.105;

    if (preset === 'dungeon') {
      fullPoints = [
        new THREE.Vector3(anchorX, 0.42, 0.12),
        new THREE.Vector3(anchorX + 0.02, 0.18, 0.55),
        new THREE.Vector3(0.05, 0.06, 0.95),
        new THREE.Vector3(-0.18, 0.055, 1.75),
        new THREE.Vector3(0.16, 0.055, 2.55),
        new THREE.Vector3(-0.08, 0.055, 3.45)
      ];
    } else if (preset === 'village') {
      fullPoints = [
        new THREE.Vector3(anchorX, 0.4, 0.15),
        new THREE.Vector3(anchorX + 0.1, 0.06, 0.65),
        new THREE.Vector3(-0.22, 0.055, 1.45),
        new THREE.Vector3(0.28, 0.055, 2.35),
        new THREE.Vector3(-0.14, 0.055, 3.25),
        new THREE.Vector3(0.32, 0.055, 4.15)
      ];
    } else if (preset === 'bare_wall') {
      radius = 0.045;
      fullPoints = [
        new THREE.Vector3(0.25, 2.85, -0.94),
        new THREE.Vector3(0.26, 1.55, -0.92),
        new THREE.Vector3(0.32, 0.12, -0.82),
        new THREE.Vector3(0.46, 0.04, -0.55),
        new THREE.Vector3(0.65, 0.05, -0.94)
      ];
    } else {
      fullPoints = [
        new THREE.Vector3(anchorX - 0.04, 0.36, 0.14),
        new THREE.Vector3(anchorX - 0.05, 0.07, 0.44),
        new THREE.Vector3(-0.22, 0.055, 1.05),
        new THREE.Vector3(0.16, 0.055, 1.85),
        new THREE.Vector3(-0.14, 0.055, 2.75),
        new THREE.Vector3(0.26, 0.055, 3.65),
        new THREE.Vector3(0.58, 0.055, 4.45)
      ];
    }

    const fullCurve = new THREE.CatmullRomCurve3(fullPoints);
    const sampleCount = Math.max(8, Math.round(48 * clampedP));
    const subPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= sampleCount; i++) {
      subPoints.push(fullCurve.getPoint((i / sampleCount) * clampedP));
    }

    const activeCurve = new THREE.CatmullRomCurve3(subPoints);
    const tubeGeo = new THREE.TubeGeometry(activeCurve, Math.max(8, sampleCount * 2), radius, 12, false);
    tubeGeo.scale(1.25, 0.44, 1.0);

    this.scarfMesh = new THREE.Mesh(tubeGeo, this.scarfMat);
    this.scarfMesh.castShadow = !this.isSoftwareGl;
    this.scarfMesh.receiveShadow = true;
    this.scene.add(this.scarfMesh);
  }

  private _resolveRig(requestedName: string): CharacterRigInstance | undefined {
    const exact = this.characterRigs.get(requestedName);
    if (exact) return exact;

    const lower = requestedName.trim().toLowerCase();
    for (const [key, rig] of this.characterRigs.entries()) {
      if (key.toLowerCase() === lower) return rig;
    }

    if (/soldier|guard|knight|सैनिक|senik/.test(lower)) {
      return this.characterRigs.get('Soldier');
    }
    if (/king|raja|monarch|राजा/.test(lower)) {
      return this.characterRigs.get('King');
    }
    if (/grandma|granny|grandmother|dadi|दादी/.test(lower)) {
      return this.characterRigs.get('Grandma');
    }
    return undefined;
  }

  public evaluateAtTime(
    t: number,
    shots: ShotSpec[],
    timelineCfg: TimelineConfig
  ): HTMLCanvasElement {
    const clampedT = Math.max(0, Math.min(timelineCfg.duration, t));
    const shot =
      shots.find((s) => clampedT >= s.start && clampedT <= s.end) ||
      shots[shots.length - 1];

    if (!shot) {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement;
    }

    const span = Math.max(0.001, shot.end - shot.start);
    const localP = Math.max(0, Math.min(1, (clampedT - shot.start) / span));
    const smoothP = localP < 0.5 ? 2 * localP * localP : 1 - Math.pow(-2 * localP + 2, 2) / 2;

    // 1. Activate environment preset
    (Object.keys(this.envGroups) as EnvironmentPreset[]).forEach((presetKey) => {
      this.envGroups[presetKey].visible = presetKey === shot.environmentPreset;
    });

    // 2. Deterministic warm lantern flicker
    const flicker =
      Math.sin(clampedT * 11.3) * 0.6 + Math.sin(clampedT * 23.7 + 1.1) * 0.4;
    this.warmLight.intensity =
      shot.environment.lanternIntensity + flicker * shot.environment.flickerAmp;

    // 3. Camera keyframe interpolation
    _camPos.set(
      THREE.MathUtils.lerp(shot.camera.startPos[0], shot.camera.endPos[0], smoothP),
      THREE.MathUtils.lerp(shot.camera.startPos[1], shot.camera.endPos[1], smoothP),
      THREE.MathUtils.lerp(shot.camera.startPos[2], shot.camera.endPos[2], smoothP)
    );
    _camLook.set(
      THREE.MathUtils.lerp(shot.camera.lookAtStart[0], shot.camera.lookAtEnd[0], smoothP),
      THREE.MathUtils.lerp(shot.camera.lookAtStart[1], shot.camera.lookAtEnd[1], smoothP),
      THREE.MathUtils.lerp(shot.camera.lookAtStart[2], shot.camera.lookAtEnd[2], smoothP)
    );
    this.camera.position.copy(_camPos);
    this.camera.lookAt(_camLook);

    // 4. Hide all rigs first, then activate & animate shot's characters
    this.characterRigs.forEach((rig) => {
      rig.root.visible = false;
    });

    let primaryAnchorX = -0.06;
    shot.characters.forEach((charState, idx) => {
      const rig =
        this._resolveRig(charState.name) ||
        this.characterRigs.values().next().value;
      if (!rig) return;

      if (idx === 0) primaryAnchorX = charState.x;
      rig.root.visible = true;
      rig.root.position.set(charState.x, 0, idx * 0.08);
      rig.root.scale.setScalar(charState.scale);

      const speed = charState.knittingSpeed * timelineCfg.globalArmSpeed;
      const headAmp = charState.headTiltAmp * timelineCfg.globalHeadTilt;
      const bobAmp = charState.bodyBobAmp * timelineCfg.globalBodyBob;

      if (rig.torso) {
        rig.torso.position.y =
          rig.baseTorsoY + Math.sin(clampedT * Math.PI * 2 * 2.0) * bobAmp;
      }
      if (rig.head) {
        rig.head.rotation.z = Math.sin(clampedT * Math.PI * 2 * 1.8 + idx) * headAmp;
      }
      if (rig.leftArm) {
        rig.leftArm.rotation.z =
          0.25 + Math.sin(clampedT * Math.PI * 2 * speed) * charState.armSwingAmp;
      }
      if (rig.rightArm) {
        rig.rightArm.rotation.z =
          -0.25 +
          Math.sin(clampedT * Math.PI * 2 * speed + Math.PI) * charState.armSwingAmp;
      }
      if (rig.needles) {
        rig.needles.rotation.z =
          0.1 + Math.sin(clampedT * Math.PI * 2 * speed) * (charState.armSwingAmp * 0.35);
      }
      if (rig.leftLeg && rig.rightLeg) {
        const walk =
          Math.sin(clampedT * Math.PI * 2 * 2.5) * charState.walkCycleAmp;
        rig.leftLeg.rotation.z = walk;
        rig.rightLeg.rotation.z = -walk;
      }
    });

    // 5. Optional 3D wooden chair behind primary character
    this.chairGroup.visible = Boolean(shot.props.showChair);
    if (this.chairGroup.visible) {
      this.chairGroup.position.set(primaryAnchorX, 0, -0.22);
    }

    // 6. Dynamic 3D knitted scarf growth
    const easedP = 1 - Math.pow(1 - localP, 2.4);
    const scarfP = THREE.MathUtils.lerp(
      shot.props.scarfGrowthStart,
      shot.props.scarfGrowthEnd,
      easedP
    );
    this._update3DScarf(shot.environmentPreset, scarfP, primaryAnchorX);

    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  public renderCompositeFrame(
    targetCanvas: HTMLCanvasElement,
    t: number,
    shots: ShotSpec[],
    timelineCfg: TimelineConfig
  ): void {
    const webglCanvas = this.evaluateAtTime(t, shots, timelineCfg);
    if (targetCanvas.width !== this.width || targetCanvas.height !== this.height) {
      targetCanvas.width = this.width;
      targetCanvas.height = this.height;
    }

    const ctx = targetCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(webglCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    if (!timelineCfg.showCaptions) return;

    const activeShot =
      shots.find((s) => t >= s.start && t <= s.end) || shots[shots.length - 1];
    if (!activeShot || !activeShot.captions || activeShot.captions.length === 0) return;

    // Show phrase chunk (max 3-4 words sliding window like viral Shorts)
    const spoken = activeShot.captions.filter((w) => t >= w.start);
    if (spoken.length === 0) return;

    const recentWords = spoken.slice(-3).map((w) => w.word);
    const captionText = recentWords.join(' ').trim();
    if (!captionText) return;

    ctx.save();
    const fontSize =
      this.width > this.height
        ? Math.round(timelineCfg.captionFontSize * 0.92)
        : timelineCfg.captionFontSize;
    ctx.font = `800 ${fontSize}px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = targetCanvas.width / 2;
    const y =
      this.width > this.height
        ? targetCanvas.height - 92
        : targetCanvas.height - 230;

    ctx.shadowColor = 'rgba(0,0,0,0.88)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.round(fontSize * 0.24);
    ctx.lineJoin = 'round';
    ctx.strokeText(captionText, x, y);

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(captionText, x, y);
    ctx.restore();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.shadowTex.dispose();
    this.renderer.dispose();
  }
}

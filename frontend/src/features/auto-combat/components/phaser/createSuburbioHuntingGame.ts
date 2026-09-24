import Phaser from "phaser";
import {
  chooseRandomHuntingDestination,
  createHuntingAreaFromTiledMap,
  findHuntingCombatFormation,
  findHuntingPath,
  getHuntingNavigationPoint,
  getHuntingPortal,
  huntingTileCenter,
  HUNTING_AREA_IDS,
  HUNTING_TILED_LAYER_NAMES,
  HUNTING_TILE_LAYER_NAMES,
  isHuntingPointWalkable,
  isHuntingSegmentWalkable,
  resolveHuntingStartingPoint,
  type HuntingAreaId,
  type HuntingCoordinate,
  type HuntingTiledMapSource,
  type HuntingWorldArea,
  type HuntingWorldPortal,
} from "../../utils/hunting-scene";
import {
  advanceHuntingVisualMachine,
  createHuntingVisualMachineState,
  type HuntingVisualMachineState,
  type HuntingVisualPhase,
} from "../../utils/hunting-visual-state";
import {
  getPerformanceDiagnostics,
  getPerformanceExperiment,
} from "../../../performance/performanceDiagnostics";
import {
  getHuntingCombatAnimationTimeScale,
  getHuntingCombatVisualStep,
  getHuntingMobDeathPresentationDuration,
  normalizeHuntingMobName,
  shouldReplaceHuntingThreat,
  shouldPresentHuntingMobDeath,
} from "../../utils/hunting-combat-visual";

const HUNTING_STATE_EVENT = "hunting-scene:state";
const HUNTING_XP_GAIN_EVENT = "hunting-scene:xp-gain";
const HUNTING_SNAPSHOT_BEGIN_EVENT = "hunting-scene:snapshot-begin";
const HUNTING_SNAPSHOT_APPLY_EVENT = "hunting-scene:snapshot-apply";
const INTERIOR_PROPS_TEXTURE = "suburbio-hunting-interior-props";
const OUTDOOR_TILEMAP = "suburbio-hunting-exterior-tiled";
const INTERIOR_TILEMAP = "suburbio-hunting-interior-tiled";
const SURVIVOR_TEXTURE = "suburbio-hunting-leon";
const SURVIVOR_INVESTIGATE_TEXTURE = "suburbio-hunting-leon-investigate";
const SURVIVOR_ATTACK_TEXTURE = "suburbio-hunting-leon-attack";
const SURVIVOR_HURT_TEXTURE = "suburbio-hunting-leon-hurt";
const SURVIVOR_DEATH_TEXTURE = "suburbio-hunting-leon-death";
const INFECTED_TEXTURE = "suburbio-hunting-infected-gba";
const SURVIVOR_SPEED = 96;
const SURVIVOR_FRAME_WIDTH = 112;
const SURVIVOR_FRAME_HEIGHT = 96;
const INFECTED_FRAME_WIDTH = 32;
const INFECTED_FRAME_HEIGHT = 48;
const HUNTING_TILE_SIZE = 32;
const SURVIVOR_DISPLAY_WIDTH = 88;
const SURVIVOR_DISPLAY_HEIGHT = 80;
const SURVIVOR_SHADOW_WIDTH = 26;
const SURVIVOR_SHADOW_HEIGHT = 7;
const SURVIVOR_NAME_OFFSET_Y = 78;
const CARD_MIN_ZOOM = 0.7;
const LOCAL_NAME_FONT_SIZE = 11;
const REMOTE_NAME_FONT_SIZE = 10;
const MIN_NAME_SCREEN_SIZE = 11;
const CAMERA_FOLLOW_LERP_AT_60_FPS = 0.12;
const CAMERA_MAX_DELTA_MS = 50;
const IMMERSIVE_SUPERSAMPLE_MIN_WIDTH = 1200;
const IMMERSIVE_RENDER_SCALE = 1.5;
const IMMERSIVE_MAX_RENDER_WIDTH = 3200;
const IMMERSIVE_MAX_RENDER_HEIGHT = 1800;
const ACTOR_DEPTH_BASE = 1000;
const WORLD_OVERLAY_DEPTH = 8000;
const NAVIGATION_DEBUG_DEPTH = 9000;
const DEBUG_QUERY = "huntingNavDebug";
const VISUAL_MACHINE_INTERVAL_MS = 50;
const SCAN_DRAW_INTERVAL_MS = 1000 / 30;
const COMBAT_DISTANCE = 62;
const COMBAT_APPROACH_DISTANCE = 126;
const TILED_GID_MASK = 0x1fffffff;
const TILED_FLIP_MASK = 0xe0000000;
const STATIC_BASE_LAYER_NAMES = new Set<string>([
  HUNTING_TILED_LAYER_NAMES.ground,
  HUNTING_TILED_LAYER_NAMES.groundDetails,
]);

const OUTDOOR_TILESET_DEFINITIONS = [
  {
    assetKey: "terrain",
    textureKey: "suburbio-pilot-terrain-texture",
    tiledName: "suburbio-pilot-terrain",
  },
  {
    assetKey: "props",
    textureKey: "suburbio-pilot-props-texture",
    tiledName: "suburbio-pilot-props",
  },
  {
    assetKey: "environment",
    textureKey: "suburbio-pilot-environment-texture",
    tiledName: "suburbio-pilot-environment",
  },
  {
    assetKey: "houseOne",
    textureKey: "suburbio-pilot-house-one-texture",
    tiledName: "suburbio-pilot-house-one",
  },
  {
    assetKey: "houseTwo",
    textureKey: "suburbio-pilot-house-two-texture",
    tiledName: "suburbio-pilot-house-two",
  },
] as const;

const INTERIOR_TILESET_DEFINITIONS = [
  {
    assetKey: "terrain",
    textureKey: "suburbio-interior-terrain-texture",
    tiledName: "suburbio-interior-terrain",
  },
  {
    assetKey: "walls",
    textureKey: "suburbio-interior-walls-texture",
    tiledName: "suburbio-interior-walls",
  },
] as const;

type MovementDirection = "down" | "left" | "right" | "up";
type MobCombatAnimation = "walk" | "attack" | "hurt" | "death";
type HuntingVisualPresenceState = HuntingVisualPhase | "combat";
type HuntingVisualCombatEventType =
  | "MOB_SPAWNED"
  | "MOB_HIT"
  | "PLAYER_HIT"
  | "DODGE"
  | "POTION_USED"
  | "MOB_DEFEATED"
  | "PLAYER_DEFEATED";

export type MobCombatSpriteAssets = Readonly<{
  key: string;
  mobNameKey: string;
  attack: string;
  death: string;
  hurt: string;
  walk: string;
}>;

export type HuntingVisualPlayer = Readonly<{
  id: string;
  displayName: string;
  worldX?: number;
  worldY?: number;
  areaId: HuntingAreaId;
  direction: MovementDirection;
  visualState: HuntingVisualPresenceState;
  moving: boolean;
  updatedAt: number;
  idle: boolean;
  combatMobName?: string | null;
  combatCycleKey?: string | null;
  combatEventType?: HuntingVisualCombatEventType | null;
  combatEventKey?: string | null;
}>;

export type LocalHuntingPose = Readonly<{
  areaId: HuntingAreaId;
  tileX: number;
  tileY: number;
  direction: MovementDirection;
  visualState: HuntingVisualPresenceState;
  moving: boolean;
  combatMobName?: string | null;
  combatCycleKey?: string | null;
  combatEventType?: HuntingVisualCombatEventType | null;
  combatEventKey?: string | null;
}>;

export type SuburbioHuntingState = Readonly<{
  characterName: string;
  battleCycleKey?: string | null;
  battleDurationMs: number;
  battleProgressPercent: number;
  combatEventKey?: string | null;
  combatEventType?: string | null;
  isCombatActive: boolean;
  isImmersive: boolean;
  isSynchronizing: boolean;
  isThreatReady: boolean;
  mobCurrentHp: number;
  mobMaxHp: number;
  mobName?: string | null;
  mobPortraitUrl?: string | null;
  playerCurrentHp: number;
  playerMaxHp: number;
  progressPercent: number;
  prefersReducedMotion: boolean;
  otherPlayers: readonly HuntingVisualPlayer[];
}>;

export type HuntingXpGain = Readonly<{
  amount: number;
  kind: "character" | "hunting";
}>;

type SuburbioHuntingAssets = Readonly<{
  interiorProps: Readonly<{
    atlasUrl: string;
    texture: string;
  }>;
  interiorTilesets: Readonly<{
    terrain: string;
    walls: string;
  }>;
  outdoorTilesets: Readonly<{
    environment: string;
    houseOne: string;
    houseTwo: string;
    props: string;
    terrain: string;
  }>;
  outdoorTilemapUrl: string;
  outdoorTilemapSource: HuntingTiledMapSource;
  interiorTilemapUrl: string;
  interiorTilemapSource: HuntingTiledMapSource;
  survivor: string;
  survivorAttack: string;
  survivorDeath: string;
  survivorHurt: string;
  survivorInvestigate: string;
  infected: string;
  mobs: readonly MobCombatSpriteAssets[];
}>;

type HuntingTilemapLayer = Phaser.Tilemaps.TilemapLayer;

type AreaVisual = Readonly<{
  tilemap: Phaser.Tilemaps.Tilemap;
  layers: ReadonlyMap<string, HuntingTilemapLayer>;
  staticBase: Phaser.GameObjects.Image | null;
  preRenderedLayerCount: number;
  depthObjects: readonly Phaser.GameObjects.Image[];
}>;

type RemotePlayerEntity = {
  areaId: HuntingAreaId;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  nameLabel: Phaser.GameObjects.Text;
  idleLabel: Phaser.GameObjects.Text;
  combatMobSprite: Phaser.GameObjects.Sprite | null;
  combatMobAsset: MobCombatSpriteAssets | null;
  combatMobName: string | null;
  combatCycleKey: string | null;
  combatEventType: HuntingVisualCombatEventType | null;
  combatEventKey: string | null;
  lastPresentedCombatEventKey: string | null;
  combatDeathPresentationUntil: number;
  combatEventPresentationUntil: number;
  lastCombatAnimationAt: number;
  targetPoint: HuntingCoordinate;
  lastMovementDirection: MovementDirection;
  visualState: HuntingVisualPresenceState;
  moving: boolean;
  updatedAt: number;
  idle: boolean;
  anchor: HuntingCoordinate;
};

export type SuburbioHuntingController = Readonly<{
  update: (state: SuburbioHuntingState) => void;
  beginSnapshotSynchronization: () => void;
  applySnapshot: (state: SuburbioHuntingState) => void;
  showXpGain: (gain: HuntingXpGain) => void;
  resize: () => void;
  destroy: () => void;
}>;

const clampWorldCoordinate = (value: number, maximum: number) =>
  Math.max(0, Math.min(maximum, Number(value) || 0));

function hashHuntingPlayerId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const layerDepths: Readonly<Record<string, number>> = {
  [HUNTING_TILED_LAYER_NAMES.ground]: 0,
  [HUNTING_TILED_LAYER_NAMES.groundDetails]: 10,
  [HUNTING_TILED_LAYER_NAMES.objectsBelow]: 20,
  [HUNTING_TILED_LAYER_NAMES.collision]: NAVIGATION_DEBUG_DEPTH - 2,
  [HUNTING_TILED_LAYER_NAMES.wallsAndFences]: 30,
  [HUNTING_TILED_LAYER_NAMES.doors]: 40,
  [HUNTING_TILED_LAYER_NAMES.objectsAbove]: 5000,
  [HUNTING_TILED_LAYER_NAMES.roofsAndOcclusion]: 6000,
};

class SuburbioHuntingPhaserScene extends Phaser.Scene {
  private readonly diagnostics = getPerformanceDiagnostics();
  private readonly performanceExperiment = getPerformanceExperiment();
  private lastDiagnosticsAt = -Infinity;
  private lastVisualMachineAt = -Infinity;
  private lastScanDrawAt = -Infinity;
  private renderStartedAt = 0;
  private scanEffectCleared = false;
  private state: SuburbioHuntingState;
  private readonly assets: SuburbioHuntingAssets;
  private readonly onReady: () => void;
  private readonly onAreaChange: (areaLabel: string) => void;
  private readonly onVisualPhaseChange: (phase: HuntingVisualPhase) => void;
  private readonly onPoseChange: (pose: LocalHuntingPose) => void;
  private readonly initialPose: Pick<LocalHuntingPose, "areaId" | "tileX" | "tileY" | "direction"> | null;
  private visualMachineState: HuntingVisualMachineState;
  private reportedVisualPhase: HuntingVisualPhase | null = null;
  private activeAreaId: HuntingAreaId = HUNTING_AREA_IDS.outdoor;
  private readonly areas = new Map<HuntingAreaId, HuntingWorldArea>();
  private readonly areaVisuals = new Map<HuntingAreaId, AreaVisual>();
  private actorBody: Phaser.GameObjects.Zone | null = null;
  private actorSprite: Phaser.GameObjects.Sprite | null = null;
  private actorShadow: Phaser.GameObjects.Ellipse | null = null;
  private actorNameLabel: Phaser.GameObjects.Text | null = null;
  private playerMarker: Phaser.GameObjects.Ellipse | null = null;
  private scanGraphics: Phaser.GameObjects.Graphics | null = null;
  private navigationDebug: Phaser.GameObjects.Graphics | null = null;
  private currentNodeId = "";
  private activeDestinationId: string | null = null;
  private targetPoint: HuntingCoordinate | null = null;
  private routeQueue: HuntingCoordinate[] = [];
  private currentRoute: HuntingCoordinate[] = [];
  private lastMovementDirection: MovementDirection = "down";
  private lastFootstepAt = 0;
  private completedRoutesInArea = 0;
  private isChangingArea = false;
  private isDoorTraversal = false;
  private threatSprite: Phaser.GameObjects.Sprite | null = null;
  private threatMarker: Phaser.GameObjects.Rectangle | null = null;
  private threatNameLabel: Phaser.GameObjects.Text | null = null;
  private combatHudGraphics: Phaser.GameObjects.Graphics | null = null;
  private threatDirection: MovementDirection = "left";
  private actorCombatAnimationLocked = false;
  private threatCombatAnimationLocked = false;
  private playerDefeated = false;
  private threatDefeated = false;
  private lastCombatEventKey: string | null = null;
  private combatCycleKey: string | null = null;
  private combatCycleStartedAt = 0;
  private lastCombatVisualStepKey = "";
  private combatTargetPoint: HuntingCoordinate | null = null;
  private actorCombatOffsetX = 0;
  private actorCombatOffsetY = 0;
  private actorCombatAnimationToken = 0;
  private threatCombatAnimationToken = 0;
  private threatMobSpriteAsset: MobCombatSpriteAssets | null = null;
  private threatMobName: string | null = null;
  private threatDeathPresentationActive = false;
  private threatDeathPresentationTimer: Phaser.Time.TimerEvent | null = null;
  private threatDeathFadeTween: Phaser.Tweens.Tween | null = null;
  private actorLungeTween: Phaser.Tweens.Tween | null = null;
  private threatLungeTween: Phaser.Tweens.Tween | null = null;
  private threatApproachTween: Phaser.Tweens.Tween | null = null;
  private actorHitTween: Phaser.Tweens.Tween | null = null;
  private threatHitTween: Phaser.Tweens.Tween | null = null;
  private actorHitFeedbackActive = false;
  private threatHitFeedbackActive = false;
  private threatPortraitBubble: Phaser.GameObjects.Container | null = null;
  private threatPortraitUrl: string | null = null;
  private threatPortraitLoadToken = 0;
  private isCameraFollowingActor = false;
  private readonly remotePlayers = new Map<string, RemotePlayerEntity>();
  private readonly transientXpFeedback = new Set<Phaser.GameObjects.Text>();
  private lastPoseSignature = "";
  private lastPoseSentAt = 0;
  private snapshotSynchronizing = false;

  constructor(
    state: SuburbioHuntingState,
    assets: SuburbioHuntingAssets,
    onReady: () => void,
    onAreaChange: (areaLabel: string) => void,
    onVisualPhaseChange: (phase: HuntingVisualPhase) => void,
    onPoseChange: (pose: LocalHuntingPose) => void,
    initialPose: Pick<LocalHuntingPose, "areaId" | "tileX" | "tileY" | "direction"> | null,
  ) {
    super({ key: "suburbio-hunting" });
    this.state = state;
    this.snapshotSynchronizing = state.isSynchronizing;
    this.assets = assets;
    this.onReady = onReady;
    this.onAreaChange = onAreaChange;
    this.onVisualPhaseChange = onVisualPhaseChange;
    this.onPoseChange = onPoseChange;
    this.initialPose = initialPose;
    if (initialPose && (initialPose.areaId === HUNTING_AREA_IDS.outdoor ||
      initialPose.areaId === HUNTING_AREA_IDS.abandonedHouse)) {
      this.activeAreaId = initialPose.areaId;
      this.lastMovementDirection = initialPose.direction;
    }
    this.visualMachineState = createHuntingVisualMachineState({
      isThreatReady: state.isThreatReady,
      nowMs: 0,
      progressPercent: state.progressPercent,
    });
    const requestedArea = new URLSearchParams(window.location.search).get(
      "huntingArea",
    );
    if (
      import.meta.env.DEV &&
      requestedArea === HUNTING_AREA_IDS.abandonedHouse
    ) {
      this.activeAreaId = HUNTING_AREA_IDS.abandonedHouse;
    }
  }

  preload() {
    for (const definition of OUTDOOR_TILESET_DEFINITIONS) {
      this.load.image(
        definition.textureKey,
        this.assets.outdoorTilesets[definition.assetKey],
      );
    }
    for (const definition of INTERIOR_TILESET_DEFINITIONS) {
      this.load.image(
        definition.textureKey,
        this.assets.interiorTilesets[definition.assetKey],
      );
    }
    this.load.atlas(
      INTERIOR_PROPS_TEXTURE,
      this.assets.interiorProps.texture,
      this.assets.interiorProps.atlasUrl,
    );
    this.load.tilemapTiledJSON(OUTDOOR_TILEMAP, this.assets.outdoorTilemapUrl);
    this.load.tilemapTiledJSON(
      INTERIOR_TILEMAP,
      this.assets.interiorTilemapUrl,
    );
    this.load.spritesheet(SURVIVOR_TEXTURE, this.assets.survivor, {
      frameWidth: SURVIVOR_FRAME_WIDTH,
      frameHeight: SURVIVOR_FRAME_HEIGHT,
      endFrame: 15,
    });
    this.load.spritesheet(
      SURVIVOR_INVESTIGATE_TEXTURE,
      this.assets.survivorInvestigate,
      {
        frameWidth: SURVIVOR_FRAME_WIDTH,
        frameHeight: SURVIVOR_FRAME_HEIGHT,
        endFrame: 15,
      },
    );
    this.load.spritesheet(SURVIVOR_ATTACK_TEXTURE, this.assets.survivorAttack, {
      frameWidth: SURVIVOR_FRAME_WIDTH,
      frameHeight: SURVIVOR_FRAME_HEIGHT,
      endFrame: 15,
    });
    this.load.spritesheet(SURVIVOR_HURT_TEXTURE, this.assets.survivorHurt, {
      frameWidth: SURVIVOR_FRAME_WIDTH,
      frameHeight: SURVIVOR_FRAME_HEIGHT,
      endFrame: 7,
    });
    this.load.spritesheet(SURVIVOR_DEATH_TEXTURE, this.assets.survivorDeath, {
      frameWidth: SURVIVOR_FRAME_WIDTH,
      frameHeight: SURVIVOR_FRAME_HEIGHT,
      endFrame: 23,
    });
    this.load.spritesheet(INFECTED_TEXTURE, this.assets.infected, {
      frameWidth: INFECTED_FRAME_WIDTH,
      frameHeight: INFECTED_FRAME_HEIGHT,
      endFrame: 11,
    });
    for (const mob of this.assets.mobs) {
      this.load.spritesheet(this.mobTextureKey(mob, "walk"), mob.walk, {
        frameWidth: SURVIVOR_FRAME_WIDTH,
        frameHeight: SURVIVOR_FRAME_HEIGHT,
        endFrame: 15,
      });
      this.load.spritesheet(this.mobTextureKey(mob, "attack"), mob.attack, {
        frameWidth: SURVIVOR_FRAME_WIDTH,
        frameHeight: SURVIVOR_FRAME_HEIGHT,
        endFrame: 15,
      });
      this.load.spritesheet(this.mobTextureKey(mob, "hurt"), mob.hurt, {
        frameWidth: SURVIVOR_FRAME_WIDTH,
        frameHeight: SURVIVOR_FRAME_HEIGHT,
        endFrame: 7,
      });
      this.load.spritesheet(this.mobTextureKey(mob, "death"), mob.death, {
        frameWidth: SURVIVOR_FRAME_WIDTH,
        frameHeight: SURVIVOR_FRAME_HEIGHT,
        endFrame: 23,
      });
    }
  }

  create() {
    this.areas.set(
      HUNTING_AREA_IDS.outdoor,
      createHuntingAreaFromTiledMap(this.assets.outdoorTilemapSource),
    );
    this.areas.set(
      HUNTING_AREA_IDS.abandonedHouse,
      createHuntingAreaFromTiledMap(this.assets.interiorTilemapSource),
    );
    this.areaVisuals.set(
      HUNTING_AREA_IDS.outdoor,
      this.createAreaVisual(
        OUTDOOR_TILEMAP,
        HUNTING_AREA_IDS.outdoor,
        this.assets.outdoorTilemapSource,
      ),
    );
    this.areaVisuals.set(
      HUNTING_AREA_IDS.abandonedHouse,
      this.createAreaVisual(
        INTERIOR_TILEMAP,
        HUNTING_AREA_IDS.abandonedHouse,
        this.assets.interiorTilemapSource,
      ),
    );
    this.createAnimations();

    const area = this.getArea();
    const spawn = getHuntingNavigationPoint(area, area.spawnNodeId);
    if (!spawn)
      throw new Error("Ponto inicial da cena de rastreio nao existe.");
    const start = resolveHuntingStartingPoint(area, this.initialPose);
    this.currentNodeId = spawn.id;
    this.actorBody = this.add.zone(
      start.x,
      start.y,
      area.agentHalfWidth * 2,
      area.agentHalfHeight * 2,
    );
    this.actorShadow = this.add
      .ellipse(
        start.x,
        start.y + 2,
        SURVIVOR_SHADOW_WIDTH,
        SURVIVOR_SHADOW_HEIGHT,
        0x07100d,
        0.58,
      )
      .setDepth(ACTOR_DEPTH_BASE - 2);
    this.actorSprite = this.add
      .sprite(start.x, start.y, SURVIVOR_TEXTURE, { down: 0, left: 4, right: 8, up: 12 }[this.lastMovementDirection])
      .setOrigin(0.5, 1)
      .setDisplaySize(SURVIVOR_DISPLAY_WIDTH, SURVIVOR_DISPLAY_HEIGHT)
      .setDepth(ACTOR_DEPTH_BASE);
    this.playerMarker = this.add
      .ellipse(start.x, start.y + 1, 26, 12)
      .setStrokeStyle(2, 0xc5d66f, 0.9)
      .setFillStyle(0x7f9249, 0.08)
      .setDepth(WORLD_OVERLAY_DEPTH);
    this.actorNameLabel = this.add
      .text(
        start.x,
        start.y - SURVIVOR_NAME_OFFSET_Y,
        this.state.characterName,
        {
          color: "#f2f0df",
          fontFamily: '"Courier New", monospace',
          fontSize: `${LOCAL_NAME_FONT_SIZE}px`,
          fontStyle: "bold",
          stroke: "#07100d",
          strokeThickness: 3,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(WORLD_OVERLAY_DEPTH + 20);
    this.scanGraphics = this.add.graphics().setDepth(WORLD_OVERLAY_DEPTH + 10);
    this.combatHudGraphics = this.add
      .graphics()
      .setDepth(WORLD_OVERLAY_DEPTH + 15);

    this.cameras.main.setBounds(0, 0, area.width, area.height);
    this.fitCameraToWorld();
    this.drawNavigationDebug();
    this.game.events.on(HUNTING_STATE_EVENT, this.applyState, this);
    this.game.events.on(HUNTING_XP_GAIN_EVENT, this.showXpGain, this);
    this.game.events.on(
      HUNTING_SNAPSHOT_BEGIN_EVENT,
      this.beginSnapshotSynchronization,
      this,
    );
    this.game.events.on(
      HUNTING_SNAPSHOT_APPLY_EVENT,
      this.applySnapshot,
      this,
    );
    if (this.diagnostics) {
      this.game.events.on(Phaser.Core.Events.PRE_RENDER, this.startRenderMeasurement, this);
      this.game.events.on(Phaser.Core.Events.POST_RENDER, this.finishRenderMeasurement, this);
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameraToWorld, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(HUNTING_STATE_EVENT, this.applyState, this);
      this.game.events.off(HUNTING_XP_GAIN_EVENT, this.showXpGain, this);
      this.game.events.off(
        HUNTING_SNAPSHOT_BEGIN_EVENT,
        this.beginSnapshotSynchronization,
        this,
      );
      this.game.events.off(
        HUNTING_SNAPSHOT_APPLY_EVENT,
        this.applySnapshot,
        this,
      );
      this.game.events.off(Phaser.Core.Events.PRE_RENDER, this.startRenderMeasurement, this);
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.finishRenderMeasurement, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCameraToWorld, this);
      this.areaVisuals.clear();
    });

    if (this.state.isSynchronizing) {
      this.beginSnapshotSynchronization();
    } else {
      this.applyState(this.state);
      this.updateVisualMachine(this.time.now, true);
    }
    this.onAreaChange(area.label);
    this.publishPose(false, true);
    this.onReady();
  }

  update(time: number, delta: number) {
    if (!this.actorBody || !this.actorSprite || !this.actorShadow) return;
    const updateStartedAt = this.diagnostics ? performance.now() : 0;
    if (this.diagnostics && time - this.lastDiagnosticsAt >= 500) {
      this.lastDiagnosticsAt = time;
      const renderer = this.game.renderer;
      const gl = 'gl' in renderer ? renderer.gl : null;
      this.diagnostics.setMapMetrics({
        renderer: renderer.type === Phaser.CANVAS ? 'Canvas'
          : typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
            ? 'WebGL2' : 'WebGL',
        tweens: this.tweens.getTweens().length,
        visibleObjects: this.children.list.filter((object) =>
          object.active && 'visible' in object && object.visible,
        ).length,
        preRenderedTileLayers: [...this.areaVisuals.values()].reduce(
          (total, visual) => total + (
            visual.staticBase?.visible ? visual.preRenderedLayerCount : 0
          ),
          0,
        ),
        gpuTileLayers: 0,
        cpuTileLayers: [...this.areaVisuals.values()].reduce(
          (total, visual) => total + [...visual.layers.values()].filter(
            (layer) => layer.visible,
          ).length,
          0,
        ),
      });
    }
    if (this.snapshotSynchronizing) {
      this.walkRemotePlayers(delta);
      this.updateCameraSmoothing(delta);
      this.diagnostics?.recordVisualStage(
        "Loop Phaser",
        performance.now() - updateStartedAt,
        performance.now(),
      );
      return;
    }
    this.updateVisualMachine(time);
    const visualPhase = this.visualMachineState.phase;
    const canWalk =
      !this.isChangingArea &&
      !this.threatDeathPresentationActive &&
      !this.state.isThreatReady &&
      !this.state.isCombatActive &&
      visualPhase !== "investigating" &&
      visualPhase !== "alert";
    const speedMultiplier =
      visualPhase === "approaching"
        ? 0.58
        : visualPhase === "continuing"
          ? 0.78
          : 1;
    const isWalking = canWalk
      ? this.walkRoute(delta, speedMultiplier)
      : false;
    this.syncActorVisual(isWalking || this.isDoorTraversal);
    if (this.state.isCombatActive) {
      this.syncCombatTimeline(time);
      this.syncCombatHud();
    }
    this.publishPose(isWalking || this.isDoorTraversal);
    this.walkRemotePlayers(delta);
    this.updateCameraSmoothing(delta);
    if (this.diagnostics && !this.performanceExperiment.scanEffect) {
      if (!this.scanEffectCleared) {
        this.scanGraphics?.clear();
        this.scanEffectCleared = true;
      }
    } else {
      this.scanEffectCleared = false;
      if (time - this.lastScanDrawAt >= SCAN_DRAW_INTERVAL_MS) {
        this.lastScanDrawAt = time;
        this.drawScanPulse(time);
      }
    }
    if (isWalking && time - this.lastFootstepAt >= 360) {
      this.createFootstep();
      this.lastFootstepAt = time;
    }
    this.diagnostics?.recordVisualStage("Loop Phaser", performance.now() - updateStartedAt, performance.now());
  }

  private startRenderMeasurement() {
    this.renderStartedAt = performance.now();
  }

  private finishRenderMeasurement() {
    if (!this.diagnostics || this.renderStartedAt <= 0) return;
    const now = performance.now();
    this.diagnostics.recordVisualStage("Render Phaser", now - this.renderStartedAt, now);
    this.renderStartedAt = 0;
  }

  private getArea(areaId: HuntingAreaId = this.activeAreaId) {
    const area = this.areas.get(areaId);
    if (!area) throw new Error(`Area de caca nao carregada: ${areaId}`);
    return area;
  }

  private publishPose(moving: boolean, force = false) {
    if (!this.actorBody) return;
    const now = Date.now();
    if (!force && now - this.lastPoseSentAt < 200) return;
    const pose: LocalHuntingPose = {
      areaId: this.activeAreaId,
      tileX: Math.round((this.actorBody.x / HUNTING_TILE_SIZE) * 100) / 100,
      tileY: Math.round((this.actorBody.y / HUNTING_TILE_SIZE) * 100) / 100,
      direction: this.lastMovementDirection,
      visualState: this.state.isCombatActive
        ? "combat"
        : this.visualMachineState.phase,
      moving: this.state.isCombatActive ? false : moving,
      combatMobName: this.state.isCombatActive ? this.state.mobName ?? null : null,
      combatCycleKey: this.state.isCombatActive
        ? this.state.combatEventKey ?? this.state.battleCycleKey ?? null
        : null,
      combatEventType:
        this.state.isCombatActive && this.state.combatEventType
          ? (String(this.state.combatEventType).toUpperCase() as HuntingVisualCombatEventType)
          : null,
      combatEventKey: this.state.isCombatActive
        ? this.state.combatEventKey ?? null
        : null,
    };
    const signature = JSON.stringify(pose);
    if (!force && signature === this.lastPoseSignature && now - this.lastPoseSentAt < 2500) return;
    this.lastPoseSignature = signature;
    this.lastPoseSentAt = now;
    this.onPoseChange(pose);
  }

  private createAreaVisual(
    tilemapKey: string,
    areaId: HuntingAreaId,
    source: HuntingTiledMapSource,
  ) {
    const tilemap = this.make.tilemap({ key: tilemapKey });
    const definitions =
      areaId === HUNTING_AREA_IDS.outdoor
        ? OUTDOOR_TILESET_DEFINITIONS
        : INTERIOR_TILESET_DEFINITIONS;
    const tilesets = definitions.map(({ textureKey, tiledName }) => {
      const tileset = tilemap.addTilesetImage(tiledName, textureKey);
      if (!tileset) {
        throw new Error(`Tileset ${tiledName} ausente no mapa ${areaId}.`);
      }
      return tileset;
    });
    const staticBase = this.createStaticBase(areaId, source, definitions);
    const layers = new Map<string, HuntingTilemapLayer>();
    for (const name of HUNTING_TILE_LAYER_NAMES) {
      const sourceLayer = source.layers.find(
        (candidate) => candidate.type === "tilelayer" && candidate.name === name,
      );
      if (sourceLayer?.data && !sourceLayer.data.some(Boolean)) continue;
      if (staticBase && STATIC_BASE_LAYER_NAMES.has(name)) continue;
      const layer = tilemap.createLayer(
        name,
        tilesets,
        0,
        0,
      ) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer)
        throw new Error(`Camada visual ausente no mapa ${areaId}: ${name}`);
      layer
        .setDepth(layerDepths[name] ?? 0)
        .setVisible(
          areaId === this.activeAreaId &&
            (name !== HUNTING_TILED_LAYER_NAMES.collision ||
              this.isDebugEnabled()),
        );
      if (name === HUNTING_TILED_LAYER_NAMES.collision) layer.setAlpha(0.55);
      layers.set(name, layer);
    }
    const depthObjects =
      areaId === HUNTING_AREA_IDS.abandonedHouse
        ? this.createDepthObjects(tilemap, areaId)
        : [];
    return {
      tilemap,
      layers,
      staticBase,
      preRenderedLayerCount: staticBase ? STATIC_BASE_LAYER_NAMES.size : 0,
      depthObjects,
    };
  }

  private createStaticBase(
    areaId: HuntingAreaId,
    source: HuntingTiledMapSource,
    definitions: readonly Readonly<{
      textureKey: string;
      tiledName: string;
    }>[],
  ) {
    const sourceLayers = source.layers.filter(
      (layer) => layer.type === "tilelayer" && STATIC_BASE_LAYER_NAMES.has(layer.name),
    );
    const tilesets = source.tilesets ? [...source.tilesets] : [];
    if (sourceLayers.length !== STATIC_BASE_LAYER_NAMES.size || !tilesets.length) return null;
    if (sourceLayers.some((layer) => layer.data?.some(
      (rawGid) => ((rawGid >>> 0) & TILED_FLIP_MASK) !== 0,
    ))) return null;

    const canvas = document.createElement("canvas");
    canvas.width = source.width * source.tilewidth;
    canvas.height = source.height * source.tileheight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;

    const sortedTilesets = tilesets.sort((left, right) => left.firstgid - right.firstgid);
    for (const layer of sourceLayers) {
      if (!layer.data) return null;
      layer.data.forEach((rawGid, index) => {
        const gid = (rawGid >>> 0) & TILED_GID_MASK;
        if (gid === 0) return;
        const tileset = [...sortedTilesets].reverse().find(
          (candidate) => gid >= candidate.firstgid,
        );
        const definition = definitions.find(
          (candidate) => candidate.tiledName === tileset?.name,
        );
        const columns = tileset?.columns ?? 0;
        if (!tileset || !definition || columns <= 0) return;
        const texture = this.textures.get(definition.textureKey);
        const image = texture.getSourceImage() as CanvasImageSource;
        const tileWidth = tileset.tilewidth ?? source.tilewidth;
        const tileHeight = tileset.tileheight ?? source.tileheight;
        const spacing = tileset.spacing ?? 0;
        const margin = tileset.margin ?? 0;
        const localId = gid - tileset.firstgid;
        const sourceX = margin + (localId % columns) * (tileWidth + spacing);
        const sourceY = margin + Math.floor(localId / columns) * (tileHeight + spacing);
        const destinationX = (index % source.width) * source.tilewidth;
        const destinationY = Math.floor(index / source.width) * source.tileheight;
        context.drawImage(
          image,
          sourceX,
          sourceY,
          tileWidth,
          tileHeight,
          destinationX,
          destinationY,
          source.tilewidth,
          source.tileheight,
        );
      });
    }

    const textureKey = `suburbio-static-base-${areaId}`;
    this.textures.addCanvas(textureKey, canvas);
    return this.add
      .image(0, 0, textureKey)
      .setOrigin(0)
      .setDepth(layerDepths[HUNTING_TILED_LAYER_NAMES.groundDetails])
      .setVisible(areaId === this.activeAreaId);
  }

  private createDepthObjects(
    tilemap: Phaser.Tilemaps.Tilemap,
    areaId: HuntingAreaId,
  ) {
    const objectLayer = tilemap.getObjectLayer("depth-objects");
    if (!objectLayer) return [];
    return objectLayer.objects.flatMap((object) => {
      const properties = Array.isArray(object.properties)
        ? object.properties
        : [];
      const readProperty = (name: string) =>
        properties.find((property) => property.name === name)?.value;
      const frame = String(readProperty("frame") ?? "");
      if (!frame || !this.textures.get(INTERIOR_PROPS_TEXTURE).has(frame)) {
        return [];
      }
      const x = Number(object.x) || 0;
      const y = Number(object.y) || 0;
      const width = Number(object.width) || HUNTING_TILE_SIZE;
      const height = Number(object.height) || HUNTING_TILE_SIZE;
      const depthMode = String(readProperty("depthMode") ?? "y");
      const image = this.add
        .image(x, y, INTERIOR_PROPS_TEXTURE, frame)
        .setName(object.name ?? frame)
        .setOrigin(0.5, 1)
        .setDisplaySize(width, height)
        .setDepth(
          depthMode === "below"
            ? layerDepths[HUNTING_TILED_LAYER_NAMES.objectsBelow]
            : ACTOR_DEPTH_BASE + Math.round(y),
        )
        .setVisible(areaId === this.activeAreaId);
      return [image];
    });
  }

  private createAnimations() {
    const directions: ReadonlyArray<readonly [MovementDirection, number]> = [
      ["down", 0],
      ["left", 4],
      ["right", 8],
      ["up", 12],
    ];
    for (const [direction, start] of directions) {
      const key = this.animationKey(direction);
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(SURVIVOR_TEXTURE, {
            start,
            end: start + 3,
          }),
          frameRate: 12,
          repeat: -1,
        });
      }
      const investigateKey = this.investigateAnimationKey(direction);
      if (!this.anims.exists(investigateKey)) {
        this.anims.create({
          key: investigateKey,
          frames: this.anims.generateFrameNumbers(
            SURVIVOR_INVESTIGATE_TEXTURE,
            {
              start,
              end: start + 3,
            },
          ),
          frameRate: 7,
          repeat: 0,
        });
      }
      this.createDirectionalAnimation(
        this.survivorCombatAnimationKey("attack", direction),
        SURVIVOR_ATTACK_TEXTURE,
        start,
        4,
        10,
      );
      this.createDirectionalAnimation(
        this.survivorCombatAnimationKey("hurt", direction),
        SURVIVOR_HURT_TEXTURE,
        (start / 4) * 2,
        2,
        8,
      );
      this.createDirectionalAnimation(
        this.survivorCombatAnimationKey("death", direction),
        SURVIVOR_DEATH_TEXTURE,
        (start / 4) * 6,
        6,
        8,
      );
      for (const mob of this.assets.mobs) {
        this.createDirectionalAnimation(
          this.mobAnimationKey(mob, "walk", direction),
          this.mobTextureKey(mob, "walk"),
          start,
          4,
          7,
          -1,
        );
        this.createDirectionalAnimation(
          this.mobAnimationKey(mob, "attack", direction),
          this.mobTextureKey(mob, "attack"),
          start,
          4,
          9,
        );
        this.createDirectionalAnimation(
          this.mobAnimationKey(mob, "hurt", direction),
          this.mobTextureKey(mob, "hurt"),
          (start / 4) * 2,
          2,
          8,
        );
        this.createDirectionalAnimation(
          this.mobAnimationKey(mob, "death", direction),
          this.mobTextureKey(mob, "death"),
          (start / 4) * 6,
          6,
          8,
        );
      }
    }
  }

  private createDirectionalAnimation(
    key: string,
    texture: string,
    start: number,
    frameCount: number,
    frameRate: number,
    repeat = 0,
  ) {
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(texture, {
        start,
        end: start + frameCount - 1,
      }),
      frameRate,
      repeat,
    });
  }

  private animationKey(direction: MovementDirection) {
    return `suburbio-survivor-walk-${direction}`;
  }

  private investigateAnimationKey(direction: MovementDirection) {
    return `suburbio-survivor-investigate-${direction}`;
  }

  private survivorCombatAnimationKey(
    animation: "attack" | "hurt" | "death",
    direction: MovementDirection,
  ) {
    return `suburbio-survivor-${animation}-${direction}`;
  }

  private mobTextureKey(
    mob: MobCombatSpriteAssets,
    animation: MobCombatAnimation,
  ) {
    return `suburbio-hunting-mob-${mob.key}-${animation}`;
  }

  private mobAnimationKey(
    mob: MobCombatSpriteAssets,
    animation: MobCombatAnimation,
    direction: MovementDirection,
  ) {
    return `suburbio-mob-${mob.key}-${animation}-${direction}`;
  }

  private isDebugEnabled() {
    return (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has(DEBUG_QUERY)
    );
  }

  private drawNavigationDebug() {
    this.navigationDebug?.destroy();
    this.navigationDebug = null;
    if (!this.isDebugEnabled()) return;
    const area = this.getArea();
    const debug = this.add.graphics().setDepth(NAVIGATION_DEBUG_DEPTH);
    debug.fillStyle(0xdde88b, 0.95);
    for (const point of area.navigationPoints)
      debug.fillCircle(point.x, point.y, 6);
    debug.lineStyle(2, 0x55d878, 0.95);
    if (this.currentRoute.length > 1) {
      debug.beginPath();
      debug.moveTo(this.currentRoute[0].x, this.currentRoute[0].y);
      for (const point of this.currentRoute.slice(1))
        debug.lineTo(point.x, point.y);
      debug.strokePath();
    }
    if (this.actorBody) {
      debug.lineStyle(2, 0x69d8ff, 1);
      debug.strokeRect(
        this.actorBody.x - area.agentHalfWidth,
        this.actorBody.y - area.agentHalfHeight,
        area.agentHalfWidth * 2,
        area.agentHalfHeight * 2,
      );
    }
    this.navigationDebug = debug;
  }

  private setRoute(destination: HuntingCoordinate & { id: string }) {
    if (!this.actorBody) return false;
    const route = findHuntingPath(
      this.getArea(),
      { x: this.actorBody.x, y: this.actorBody.y },
      destination,
    );
    if (route.length < 2) return false;
    this.activeDestinationId = destination.id;
    this.currentRoute = route;
    this.routeQueue = route.slice(1);
    this.targetPoint = this.routeQueue.shift() ?? null;
    this.drawNavigationDebug();
    return true;
  }

  private walkRoute(delta: number, speedMultiplier = 1) {
    if (!this.actorBody) return false;
    if (!this.targetPoint) {
      if (this.routeQueue.length === 0) {
        const area = this.getArea();
        const routesBeforePortal =
          this.activeAreaId === HUNTING_AREA_IDS.outdoor ? 4 : 5;
        const destination =
          this.completedRoutesInArea >= routesBeforePortal
            ? getHuntingNavigationPoint(area, area.portalNodeId)
            : chooseRandomHuntingDestination(
                area,
                { x: this.actorBody.x, y: this.actorBody.y },
                Math.random,
              );
        if (!destination || !this.setRoute(destination)) return false;
      } else {
        this.targetPoint = this.routeQueue.shift() ?? null;
      }
    }
    const target = this.targetPoint;
    if (!target) return false;
    const dx = target.x - this.actorBody.x;
    const dy = target.y - this.actorBody.y;
    const distance = Math.hypot(dx, dy);
    const travelDistance = Math.min(
      distance,
      (SURVIVOR_SPEED * speedMultiplier * Math.min(delta, 80)) / 1000,
    );
    if (distance <= Math.max(2, travelDistance + 0.5)) {
      if (!isHuntingSegmentWalkable(this.getArea(), this.actorBody, target)) {
        this.recalculateActiveRoute();
        return false;
      }
      this.updateMovementDirection(dx, dy);
      this.actorBody.setPosition(target.x, target.y);
      this.targetPoint = null;
      if (this.routeQueue.length === 0) {
        this.currentNodeId = this.activeDestinationId ?? this.currentNodeId;
        this.activeDestinationId = null;
        this.currentRoute = [];
        this.completedRoutesInArea += 1;
        const portal = getHuntingPortal(this.getArea(), this.currentNodeId);
        if (portal) this.transitionToArea(portal);
      }
      return true;
    }
    const direction = { x: dx / distance, y: dy / distance };
    const nextPosition = {
      x: this.actorBody.x + direction.x * travelDistance,
      y: this.actorBody.y + direction.y * travelDistance,
    };
    if (
      !isHuntingSegmentWalkable(this.getArea(), this.actorBody, nextPosition)
    ) {
      this.recalculateActiveRoute();
      return false;
    }
    this.updateMovementDirection(direction.x, direction.y);
    this.actorBody.setPosition(nextPosition.x, nextPosition.y);
    return true;
  }

  private updateMovementDirection(x: number, y: number) {
    if (Math.abs(x) > Math.abs(y))
      this.lastMovementDirection = x < 0 ? "left" : "right";
    else if (Math.abs(y) > 0.01)
      this.lastMovementDirection = y < 0 ? "up" : "down";
  }

  private recalculateActiveRoute() {
    if (!this.actorBody || !this.activeDestinationId) {
      this.clearRoute();
      return;
    }
    const destination = getHuntingNavigationPoint(
      this.getArea(),
      this.activeDestinationId,
    );
    if (!destination || !this.setRoute(destination)) this.clearRoute();
  }

  private clearRoute() {
    this.routeQueue = [];
    this.targetPoint = null;
    this.currentRoute = [];
    this.activeDestinationId = null;
    this.drawNavigationDebug();
  }

  private syncActorVisual(isWalking: boolean) {
    if (
      !this.actorBody ||
      !this.actorSprite ||
      !this.actorShadow ||
      !this.actorNameLabel ||
      !this.playerMarker
    ) {
      return;
    }
    const directionStart = { down: 0, left: 4, right: 8, up: 12 }[
      this.lastMovementDirection
    ];
    if (this.playerDefeated || this.actorCombatAnimationLocked) {
      // A animacao de combate controla a textura ate concluir.
    } else if (this.state.isCombatActive) {
      this.actorSprite
        .stop()
        .setTexture(SURVIVOR_TEXTURE)
        .setFrame(directionStart);
    } else if (
      this.visualMachineState.phase === "investigating" &&
      !this.state.prefersReducedMotion
    ) {
      this.actorSprite.play(
        this.investigateAnimationKey(this.lastMovementDirection),
        true,
      );
    } else if (this.visualMachineState.phase === "investigating") {
      this.actorSprite
        .stop()
        .setTexture(SURVIVOR_INVESTIGATE_TEXTURE)
        .setFrame(directionStart + 2);
    } else if (this.visualMachineState.phase === "alert") {
      this.actorSprite
        .stop()
        .setTexture(SURVIVOR_INVESTIGATE_TEXTURE)
        .setFrame(directionStart + 3);
    } else if (isWalking && !this.state.prefersReducedMotion) {
      this.actorSprite.play(
        this.animationKey(this.lastMovementDirection),
        true,
      );
    } else {
      this.actorSprite
        .stop()
        .setTexture(SURVIVOR_TEXTURE)
        .setFrame(directionStart);
    }
    const actorDepth = ACTOR_DEPTH_BASE + Math.round(this.actorBody.y);
    this.actorSprite.setPosition(
      this.actorBody.x + this.actorCombatOffsetX,
      this.actorBody.y + this.actorCombatOffsetY,
    );
    this.actorSprite.setDepth(actorDepth);
    this.actorShadow
      .setPosition(this.actorBody.x, this.actorBody.y + 2)
      .setDepth(actorDepth - 2);
    this.playerMarker.setPosition(this.actorBody.x, this.actorBody.y + 1);
    this.actorNameLabel.setPosition(
      this.actorBody.x,
      this.actorBody.y - SURVIVOR_NAME_OFFSET_Y,
    );
    this.positionThreatPortraitBubble();
    this.syncCombatHud();
  }

  private drawScanPulse(time: number) {
    if (!this.actorBody || !this.scanGraphics) return;
    this.scanGraphics.clear();
    if (this.state.isThreatReady) {
      if (this.threatSprite) {
        this.scanGraphics.lineStyle(2, 0xc95b4f, 0.72);
        this.scanGraphics.strokeCircle(
          this.threatSprite.x,
          this.threatSprite.y - 4,
          24,
        );
      }
      return;
    }
    const progress =
      Math.max(0, Math.min(100, this.state.progressPercent)) / 100;
    const phaseVisuals: Readonly<
      Record<
        Exclude<HuntingVisualPhase, "found">,
        {
          color: number;
          durationMs: number;
          radius: number;
          radiusRange: number;
        }
      >
    > = {
      walking: {
        color: 0xb9cd70,
        durationMs: 1800,
        radius: 14,
        radiusRange: 34,
      },
      approaching: {
        color: 0xd2b45f,
        durationMs: 1250,
        radius: 13,
        radiusRange: 26,
      },
      investigating: {
        color: 0xebc774,
        durationMs: 850,
        radius: 12,
        radiusRange: 15,
      },
      alert: {
        color: 0xd96f4f,
        durationMs: 620,
        radius: 16,
        radiusRange: 42,
      },
      continuing: {
        color: 0x91bd78,
        durationMs: 1100,
        radius: 11,
        radiusRange: 24,
      },
    };
    const visualPhase = this.visualMachineState.phase;
    if (visualPhase === "found") return;
    const visual = phaseVisuals[visualPhase];
    const pulse = this.state.prefersReducedMotion
      ? 0.45
      : (time % visual.durationMs) / visual.durationMs;
    const radius = visual.radius + pulse * visual.radiusRange;
    const alpha = (1 - pulse) * 0.5 + 0.08;
    this.scanGraphics.lineStyle(2, visual.color, alpha);
    this.scanGraphics.strokeCircle(
      this.actorBody.x,
      this.actorBody.y - 2,
      radius,
    );
    this.scanGraphics.lineStyle(1, visual.color, 0.68);
    this.scanGraphics.beginPath();
    this.scanGraphics.arc(
      this.actorBody.x,
      this.actorBody.y - 2,
      12,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
      false,
    );
    this.scanGraphics.strokePath();

    if (
      this.visualMachineState.phase === "investigating" ||
      this.visualMachineState.phase === "alert"
    ) {
      this.drawInvestigationClues(visual.color);
      const sweep = this.state.prefersReducedMotion
        ? -Math.PI / 4
        : (time / visual.durationMs) * Math.PI * 2;
      this.scanGraphics.lineStyle(2, visual.color, 0.82);
      this.scanGraphics.beginPath();
      this.scanGraphics.arc(
        this.actorBody.x,
        this.actorBody.y - 2,
        18,
        sweep,
        sweep + Math.PI * 0.58,
        false,
      );
      this.scanGraphics.strokePath();
    }
  }

  private drawInvestigationClues(color: number) {
    if (!this.actorBody || !this.scanGraphics) return;
    const forward = {
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      up: { x: 0, y: -1 },
    }[this.lastMovementDirection];
    const perpendicular = { x: -forward.y, y: forward.x };
    this.scanGraphics.fillStyle(color, 0.52);
    for (let index = 0; index < 3; index += 1) {
      const distance = 13 + index * 7;
      const side = index % 2 === 0 ? -2.5 : 2.5;
      this.scanGraphics.fillEllipse(
        this.actorBody.x + forward.x * distance + perpendicular.x * side,
        this.actorBody.y - 2 + forward.y * distance + perpendicular.y * side,
        Math.abs(forward.x) > 0 ? 6 : 3,
        Math.abs(forward.y) > 0 ? 6 : 3,
      );
    }
  }

  private updateVisualMachine(time: number, force = false) {
    if (!force && time - this.lastVisualMachineAt < VISUAL_MACHINE_INTERVAL_MS) return;
    this.lastVisualMachineAt = time;
    this.visualMachineState = advanceHuntingVisualMachine(
      this.visualMachineState,
      {
        isThreatReady: this.state.isThreatReady,
        nowMs: time,
        progressPercent: this.state.progressPercent,
      },
    );
    this.syncThreatPortraitBubble();
    if (this.reportedVisualPhase === this.visualMachineState.phase) return;
    this.reportedVisualPhase = this.visualMachineState.phase;
    this.onVisualPhaseChange(this.visualMachineState.phase);
  }

  private createFootstep() {
    if (!this.actorBody) return;
    const footprint = this.add
      .ellipse(this.actorBody.x, this.actorBody.y + 3, 5, 3, 0x0a100e, 0.42)
      .setDepth(80);
    this.tweens.add({
      targets: footprint,
      alpha: 0,
      duration: 1300,
      onComplete: () => footprint.destroy(),
    });
  }

  private applyState(state: SuburbioHuntingState) {
    const applyStartedAt = this.diagnostics ? performance.now() : 0;
    const wasThreatVisible =
      this.state.isThreatReady || this.state.isCombatActive;
    const wasThreatAnchoredToCombat = Boolean(
      this.threatSprite && this.combatTargetPoint,
    );
    const wasCombatActive = this.state.isCombatActive;
    const previousMobName = this.state.mobName ?? null;
    const previousBattleCycleKey = this.state.battleCycleKey ?? null;
    const immersiveChanged = this.state.isImmersive !== state.isImmersive;
    this.state = state;
    this.updateVisualMachine(this.time.now, true);
    this.actorNameLabel?.setText(state.characterName);
    this.syncRemotePlayers(state.otherPlayers);
    if (immersiveChanged) this.fitCameraToWorld();
    const combatEventType = String(state.combatEventType ?? "")
      .trim()
      .toUpperCase();
    const combatEventKey =
      state.combatEventKey ??
      `${combatEventType}:${state.mobCurrentHp}:${state.playerCurrentHp}`;
    const mobChanged = previousMobName !== (state.mobName ?? null);
    const battleCycleChanged =
      previousBattleCycleKey !== (state.battleCycleKey ?? null);
    const isFreshCombatEvent = combatEventKey !== this.lastCombatEventKey;
    if (
      this.threatSprite &&
      shouldPresentHuntingMobDeath({
        battleCycleChanged,
        eventType: combatEventType,
        isCombatActive: state.isCombatActive,
        isFreshEvent: isFreshCombatEvent,
        mobChanged,
        wasCombatActive,
      })
    ) {
      if (combatEventType === "MOB_DEFEATED") {
        this.lastCombatEventKey = combatEventKey;
      }
      this.playThreatCombatAnimation("death", this.threatDefeated);
    }
    const shouldShowThreat = state.isThreatReady || state.isCombatActive;
    const shouldReplaceThreatForState = shouldReplaceHuntingThreat({
      battleCycleChanged,
      eventType: combatEventType,
      hasThreat: Boolean(this.threatSprite),
      isCombatActive: state.isCombatActive,
      isFreshEvent: isFreshCombatEvent,
      isThreatReady: state.isThreatReady,
      mobChanged,
      wasCombatActive,
    });
    // O snapshot de `isThreatReady` pode chegar imediatamente antes de
    // `COMBAT_ACTIVE`. Se o sprite ja nasceu na formacao de combate, preserve-o
    // para evitar destruir/recriar a mesma ameaca em dois frames consecutivos.
    const combatStartedWithAnchoredThreat =
      state.isCombatActive &&
      !wasCombatActive &&
      wasThreatAnchoredToCombat &&
      !mobChanged;
    const shouldReplaceThreat =
      shouldReplaceThreatForState && !combatStartedWithAnchoredThreat;
    if (this.threatDeathPresentationActive) {
      this.syncCombatHud();
      this.syncThreatPortraitBubble();
      this.diagnostics?.recordVisualStage(
        "Aplicar cena Phaser",
        performance.now() - applyStartedAt,
        performance.now(),
      );
      return;
    }
    if (shouldShowThreat) {
      if (shouldReplaceThreat) {
        this.hideThreat();
      }
      if (!wasThreatVisible || !this.threatSprite) {
        this.revealThreat();
      }
    } else if (wasThreatVisible || this.threatSprite) {
      this.hideThreat();
    }
    if (!state.isCombatActive) {
      this.resetCombatVisualState();
    } else {
      this.syncCombatCycleAnchor(
        !wasCombatActive ||
          battleCycleChanged,
      );
    }
    this.applyCombatEvent();
    this.syncCombatHud();
    this.syncThreatPortraitBubble();
    this.diagnostics?.recordVisualStage("Aplicar cena Phaser", performance.now() - applyStartedAt, performance.now());
  }

  private beginSnapshotSynchronization() {
    this.snapshotSynchronizing = true;
    this.actorCombatAnimationToken += 1;
    this.threatCombatAnimationToken += 1;
    this.clearTransientXpFeedback();
    this.hideThreat();
    this.lastCombatEventKey = null;
    this.lastCombatVisualStepKey = "";
  }

  private applySnapshot(state: SuburbioHuntingState) {
    this.beginSnapshotSynchronization();
    this.state = state;
    this.lastCombatEventKey =
      state.combatEventKey ??
      `${String(state.combatEventType ?? "").toUpperCase()}:${state.mobCurrentHp}:${state.playerCurrentHp}`;
    this.updateVisualMachine(this.time.now, true);
    this.actorNameLabel?.setText(state.characterName);
    this.syncRemotePlayers(state.otherPlayers);

    if (state.isThreatReady || state.isCombatActive) {
      this.revealThreat(false);
      if (state.isCombatActive) this.syncCombatCycleAnchor(true);
    }

    this.syncCombatHud();
    this.syncThreatPortraitBubble();
    this.snapshotSynchronizing = false;
    this.publishPose(false, true);
  }

  private showXpGain(gain: HuntingXpGain) {
    if (!this.actorBody) return;

    const amount = Math.max(0, Math.floor(Number(gain.amount) || 0));
    if (amount <= 0) return;

    const isHuntingXp = gain.kind === "hunting";
    const label = isHuntingXp ? `+${amount} EXP DE CAÇA` : `+${amount} EXP`;
    const startY = this.actorBody.y - (isHuntingXp ? 112 : 90);
    const feedback = this.add
      .text(this.actorBody.x, startY, label, {
        color: isHuntingXp ? "#d9e98b" : "#f0d48b",
        fontFamily: '"Arial Black", Arial, sans-serif',
        fontSize: isHuntingXp ? "12px" : "13px",
        fontStyle: "bold",
        stroke: "#07100d",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(WORLD_OVERLAY_DEPTH + 40);

    this.transientXpFeedback.add(feedback);
    this.tweens.add({
      targets: feedback,
      y: this.state.prefersReducedMotion ? startY : startY - 24,
      alpha: 0,
      duration: this.state.prefersReducedMotion ? 850 : 1250,
      delay: this.state.prefersReducedMotion ? 150 : 450,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.transientXpFeedback.delete(feedback);
        feedback.destroy();
      },
    });
  }

  private clearTransientXpFeedback() {
    for (const feedback of this.transientXpFeedback) {
      this.tweens.killTweensOf(feedback);
      feedback.destroy();
    }
    this.transientXpFeedback.clear();
  }

  private directionStart(direction: MovementDirection, framesPerDirection: number) {
    return { down: 0, left: 1, right: 2, up: 3 }[direction] * framesPerDirection;
  }

  private oppositeDirection(direction: MovementDirection): MovementDirection {
    return {
      down: "up",
      left: "right",
      right: "left",
      up: "down",
    }[direction] as MovementDirection;
  }

  private resolveMobSpriteAsset(mobName?: string | null) {
    const mobNameKey = normalizeHuntingMobName(mobName);
    return (
      this.assets.mobs.find((mob) => mob.mobNameKey === mobNameKey) ?? null
    );
  }

  private resetCombatVisualState() {
    this.actorCombatAnimationToken += 1;
    this.threatCombatAnimationToken += 1;
    this.actorLungeTween?.stop();
    this.threatLungeTween?.stop();
    this.threatApproachTween?.stop();
    this.actorHitTween?.stop();
    this.threatHitTween?.stop();
    this.actorLungeTween = null;
    this.threatLungeTween = null;
    this.threatApproachTween = null;
    this.actorHitTween = null;
    this.threatHitTween = null;
    this.actorHitFeedbackActive = false;
    this.threatHitFeedbackActive = false;
    this.actorCombatOffsetX = 0;
    this.actorCombatOffsetY = 0;
    this.combatTargetPoint = null;
    this.combatCycleKey = null;
    this.combatCycleStartedAt = 0;
    this.lastCombatVisualStepKey = "";
    this.actorCombatAnimationLocked = false;
    this.threatCombatAnimationLocked = false;
    this.playerDefeated = false;
    this.threatDefeated = false;
    this.lastCombatEventKey = null;
    if (this.actorSprite) {
      this.actorSprite
        .stop()
        .clearTint()
        .setAlpha(1)
        .setTexture(SURVIVOR_TEXTURE)
        .setFrame(this.directionStart(this.lastMovementDirection, 4));
      this.actorSprite.anims.timeScale = 1;
    }
    if (this.threatSprite && this.threatMobSpriteAsset) {
      this.threatSprite
        .stop()
        .clearTint()
        .setAlpha(1)
        .setTexture(this.mobTextureKey(this.threatMobSpriteAsset, "walk"))
        .setFrame(this.directionStart(this.threatDirection, 4));
      this.threatSprite.anims.timeScale = 1;
    }
  }

  private syncCombatCycleAnchor(force = false) {
    const durationMs = Math.max(0, Number(this.state.battleDurationMs) || 0);
    const cycleKey =
      this.state.battleCycleKey ??
      `${this.state.mobName ?? "mob"}:${this.state.mobMaxHp}`;
    if (!force && this.combatCycleKey === cycleKey) return;

    const progress = Phaser.Math.Clamp(
      (Number(this.state.battleProgressPercent) || 0) / 100,
      0,
      1,
    );
    this.combatCycleKey = cycleKey;
    this.combatCycleStartedAt = this.time.now - durationMs * progress;
    this.lastCombatVisualStepKey = "";
    this.playerDefeated = false;
    this.threatDefeated = false;
  }

  private syncCombatTimeline(time: number) {
    if (!this.actorSprite || !this.threatSprite) return;
    const durationMs = Math.max(0, Number(this.state.battleDurationMs) || 0);
    if (durationMs <= 0) return;

    this.syncCombatCycleAnchor();
    const snapshotProgress = Phaser.Math.Clamp(
      Number(this.state.battleProgressPercent) || 0,
      0,
      100,
    );
    const localProgress = Phaser.Math.Clamp(
      ((time - this.combatCycleStartedAt) / durationMs) * 100,
      0,
      100,
    );
    const progressPercent = Math.max(snapshotProgress, localProgress);
    const step = getHuntingCombatVisualStep({
      durationMs,
      progressPercent,
      isDefeated: this.state.mobCurrentHp <= 0 || this.threatDefeated,
    });
    const stepKey = `${this.combatCycleKey}:${step.key}`;
    if (stepKey === this.lastCombatVisualStepKey) return;
    this.lastCombatVisualStepKey = stepKey;

    if (step.cue !== "approach") this.finishThreatApproach();
    switch (step.cue) {
      case "player-attack":
      case "finisher":
        this.playActorCombatLunge();
        this.playActorCombatAnimation("attack");
        this.playThreatCombatAnimation("hurt");
        break;
      case "mob-attack":
        this.playThreatCombatLunge();
        this.playThreatCombatAnimation("attack");
        this.playActorCombatAnimation("hurt");
        break;
      case "defeated":
        this.playThreatCombatAnimation("death");
        break;
      case "approach":
        break;
    }
  }

  private finishThreatApproach() {
    if (!this.threatSprite || !this.combatTargetPoint) return;
    this.threatApproachTween?.stop();
    this.threatApproachTween = null;
    this.threatSprite.setPosition(
      this.combatTargetPoint.x,
      this.combatTargetPoint.y,
    );
  }

  private playActorCombatLunge() {
    if (!this.actorBody || !this.threatSprite || this.state.prefersReducedMotion) {
      return;
    }
    const distance = Math.hypot(
      this.threatSprite.x - this.actorBody.x,
      this.threatSprite.y - this.actorBody.y,
    ) || 1;
    const targetX = ((this.threatSprite.x - this.actorBody.x) / distance) * 9;
    const targetY = ((this.threatSprite.y - this.actorBody.y) / distance) * 9;
    const offset = { value: 0 };
    this.actorLungeTween?.stop();
    this.actorCombatOffsetX = 0;
    this.actorCombatOffsetY = 0;
    this.actorLungeTween = this.tweens.add({
      targets: offset,
      value: 1,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeOut",
      onUpdate: () => {
        this.actorCombatOffsetX = targetX * offset.value;
        this.actorCombatOffsetY = targetY * offset.value;
      },
      onComplete: () => {
        this.actorCombatOffsetX = 0;
        this.actorCombatOffsetY = 0;
        this.actorLungeTween = null;
      },
    });
  }

  private playThreatCombatLunge() {
    if (!this.threatSprite || !this.actorBody || this.state.prefersReducedMotion) {
      return;
    }
    this.finishThreatApproach();
    const threat = this.threatSprite;
    const origin = this.combatTargetPoint ?? { x: threat.x, y: threat.y };
    const distance = Math.hypot(
      this.actorBody.x - origin.x,
      this.actorBody.y - origin.y,
    ) || 1;
    this.threatLungeTween?.stop();
    threat.setPosition(origin.x, origin.y);
    this.threatLungeTween = this.tweens.add({
      targets: threat,
      x: origin.x + ((this.actorBody.x - origin.x) / distance) * 10,
      y: origin.y + ((this.actorBody.y - origin.y) / distance) * 10,
      duration: 100,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        threat.setPosition(origin.x, origin.y);
        this.threatLungeTween = null;
      },
    });
  }

  private applyCombatEvent(force = false) {
    if (!this.state.isCombatActive || !this.actorSprite || !this.threatSprite) {
      return;
    }
    const eventType = String(this.state.combatEventType ?? "")
      .trim()
      .toUpperCase();
    const eventKey =
      this.state.combatEventKey ??
      `${eventType}:${this.state.mobCurrentHp}:${this.state.playerCurrentHp}`;
    if (!force && eventKey === this.lastCombatEventKey) return;
    this.lastCombatEventKey = eventKey;

    switch (eventType) {
      case "MOB_SPAWNED":
        this.playerDefeated = false;
        this.threatDefeated = false;
        this.actorCombatAnimationLocked = false;
        this.threatCombatAnimationLocked = false;
        this.setActorCombatIdle();
        this.setThreatCombatIdle();
        break;
      case "PLAYER_HIT":
        this.finishThreatApproach();
        this.playActorCombatLunge();
        this.playActorCombatAnimation("attack");
        this.playThreatCombatAnimation("hurt");
        break;
      case "MOB_HIT":
        this.playThreatCombatLunge();
        this.playThreatCombatAnimation("attack");
        this.playActorCombatAnimation("hurt");
        break;
      case "MOB_DEFEATED":
        this.playThreatCombatAnimation("death");
        break;
      case "PLAYER_DEFEATED":
        this.playActorCombatAnimation("death");
        break;
      default:
        this.setActorCombatIdle();
        this.setThreatCombatIdle();
        break;
    }
  }

  private setActorCombatIdle() {
    if (!this.actorSprite || this.playerDefeated || this.actorCombatAnimationLocked) {
      return;
    }
    this.actorSprite
      .stop()
      .setAlpha(1)
      .setTexture(SURVIVOR_TEXTURE)
      .setFrame(this.directionStart(this.lastMovementDirection, 4));
    if (!this.actorHitFeedbackActive) this.actorSprite.clearTint().setAngle(0);
  }

  private setThreatCombatIdle() {
    if (
      !this.threatSprite ||
      this.threatDefeated ||
      this.threatCombatAnimationLocked
    ) {
      return;
    }
    if (this.threatMobSpriteAsset) {
      this.threatSprite
        .stop()
        .setAlpha(1)
        .setTexture(this.mobTextureKey(this.threatMobSpriteAsset, "walk"))
        .setFrame(this.directionStart(this.threatDirection, 4));
      if (!this.threatHitFeedbackActive) {
        this.threatSprite.clearTint().setAngle(0);
      }
    }
  }

  private playHitFeedback(
    sprite: Phaser.GameObjects.Sprite,
    target: "actor" | "threat",
  ) {
    const isActor = target === "actor";
    if (isActor) {
      this.actorHitTween?.stop();
      this.actorHitFeedbackActive = true;
    } else {
      this.threatHitTween?.stop();
      this.threatHitFeedbackActive = true;
    }
    sprite.setTint(0xffaaa4).setTintMode(Phaser.TintModes.MULTIPLY);
    sprite.setAngle(this.state.prefersReducedMotion ? 0 : -1.5);
    this.createHitSpark(sprite);

    const finish = () => {
      if (!sprite.active) return;
      sprite.clearTint();
      sprite.setAngle(0).setAlpha(1);
      if (isActor) {
        this.actorHitTween = null;
        this.actorHitFeedbackActive = false;
      } else {
        this.threatHitTween = null;
        this.threatHitFeedbackActive = false;
      }
    };
    if (this.state.prefersReducedMotion) {
      this.time.delayedCall(90, finish);
      return;
    }

    const tween = this.tweens.add({
      targets: sprite,
      angle: 1.5,
      alpha: 0.88,
      duration: 42,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: finish,
    });
    if (isActor) this.actorHitTween = tween;
    else this.threatHitTween = tween;
  }

  private createHitSpark(sprite: Phaser.GameObjects.Sprite) {
    if (this.state.prefersReducedMotion) return;
    const spark = this.add.graphics();
    spark.lineStyle(2, 0xffd27a, 0.95);
    spark.beginPath();
    spark.moveTo(-7, 0);
    spark.lineTo(7, 0);
    spark.moveTo(0, -7);
    spark.lineTo(0, 7);
    spark.strokePath();
    spark.lineStyle(1, 0xff746b, 0.8);
    spark.strokeCircle(0, 0, 5);
    spark
      .setPosition(sprite.x, sprite.y - sprite.displayHeight * 0.48)
      .setDepth(sprite.depth + 25)
      .setScale(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: spark,
      alpha: 0,
      scale: 1.35,
      angle: 22,
      duration: 140,
      ease: "Quad.easeOut",
      onComplete: () => spark.destroy(),
    });
  }

  private playActorCombatAnimation(animation: "attack" | "hurt" | "death") {
    if (!this.actorSprite || this.playerDefeated) return;
    const isDeath = animation === "death";
    const animationToken = ++this.actorCombatAnimationToken;
    this.actorCombatAnimationLocked = true;
    if (isDeath) this.playerDefeated = true;
    const frameCount = isDeath ? 6 : animation === "hurt" ? 2 : 4;
    const texture = isDeath
      ? SURVIVOR_DEATH_TEXTURE
      : animation === "hurt"
        ? SURVIVOR_HURT_TEXTURE
        : SURVIVOR_ATTACK_TEXTURE;
    if (animation === "hurt") this.playHitFeedback(this.actorSprite, "actor");

    if (this.state.prefersReducedMotion) {
      this.actorSprite
        .stop()
        .setTexture(texture)
        .setFrame(
          this.directionStart(this.lastMovementDirection, frameCount) +
            frameCount -
            1,
        );
      if (!isDeath) {
        this.actorCombatAnimationLocked = false;
        this.setActorCombatIdle();
      }
      return;
    }

    this.actorSprite.play(
      this.survivorCombatAnimationKey(animation, this.lastMovementDirection),
      true,
    );
    this.actorSprite.anims.timeScale = getHuntingCombatAnimationTimeScale(
      this.state.battleDurationMs,
    );
    this.actorSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (isDeath || animationToken !== this.actorCombatAnimationToken) return;
      this.actorSprite!.anims.timeScale = 1;
      this.actorCombatAnimationLocked = false;
      this.setActorCombatIdle();
    });
  }

  private playThreatCombatAnimation(
    animation: "attack" | "hurt" | "death",
    restartDeath = false,
  ) {
    if (!this.threatSprite || (this.threatDefeated && !restartDeath)) return;
    const isDeath = animation === "death";
    const animationToken = ++this.threatCombatAnimationToken;
    const mobSpriteAsset = this.threatMobSpriteAsset;
    if (!mobSpriteAsset) {
      if (isDeath) {
        this.threatDefeated = true;
        this.tweens.add({
          targets: this.threatSprite,
          alpha: 0,
          duration: this.state.prefersReducedMotion ? 0 : 320,
        });
      } else {
        if (animation === "hurt") {
          this.playHitFeedback(this.threatSprite, "threat");
        }
      }
      return;
    }

    this.threatCombatAnimationLocked = true;
    if (isDeath) {
      this.threatDeathFadeTween?.stop();
      this.threatDeathFadeTween = null;
      this.threatHitTween?.stop();
      this.threatHitTween = null;
      this.threatHitFeedbackActive = false;
      this.threatSprite.clearTint().setAlpha(1).setAngle(0);
      this.threatDefeated = true;
      this.beginThreatDeathPresentation();
    }
    const frameCount = isDeath ? 6 : animation === "hurt" ? 2 : 4;
    const texture = this.mobTextureKey(mobSpriteAsset, animation);
    if (animation === "hurt") {
      this.playHitFeedback(this.threatSprite, "threat");
    }

    if (this.state.prefersReducedMotion) {
      this.threatSprite
        .stop()
        .setTexture(texture)
        .setFrame(
          this.directionStart(this.threatDirection, frameCount) + frameCount - 1,
        );
      if (!isDeath) {
        this.threatCombatAnimationLocked = false;
        this.setThreatCombatIdle();
      }
      return;
    }

    this.threatSprite.play(
      this.mobAnimationKey(mobSpriteAsset, animation, this.threatDirection),
      true,
    );
    this.threatSprite.anims.timeScale = isDeath
      ? 1
      : getHuntingCombatAnimationTimeScale(this.state.battleDurationMs);
    this.threatSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (animationToken !== this.threatCombatAnimationToken) return;
      if (isDeath) {
        this.threatDeathFadeTween = this.tweens.add({
          targets: this.threatSprite,
          alpha: 0,
          duration: 260,
          ease: "Sine.easeIn",
          onComplete: () => {
            this.threatDeathFadeTween = null;
          },
        });
        return;
      }
      this.threatSprite!.anims.timeScale = 1;
      this.threatCombatAnimationLocked = false;
      this.setThreatCombatIdle();
    });
  }

  private beginThreatDeathPresentation(restartTimer = false) {
    if (this.threatDeathPresentationActive && !restartTimer) return;
    this.threatDeathPresentationActive = true;
    this.threatDeathPresentationTimer?.remove(false);
    this.threatDeathPresentationTimer = this.time.delayedCall(
      getHuntingMobDeathPresentationDuration(this.state.prefersReducedMotion),
      () => this.finishThreatDeathPresentation(),
    );
  }

  private finishThreatDeathPresentation() {
    this.threatDeathPresentationTimer = null;
    this.threatDeathPresentationActive = false;
    const shouldShowNextThreat =
      this.state.isThreatReady || this.state.isCombatActive;
    this.hideThreat();
    if (!shouldShowNextThreat) return;
    this.revealCurrentThreat();
  }

  private revealCurrentThreat() {
    this.revealThreat();
    if (this.state.isCombatActive) this.syncCombatCycleAnchor(true);
    this.applyCombatEvent(true);
    this.syncCombatHud();
  }

  private syncCombatHud() {
    const graphics = this.combatHudGraphics;
    if (!graphics) return;
    graphics.clear();
    if (
      !this.state.isCombatActive ||
      !this.actorBody ||
      !this.threatSprite
    ) {
      this.threatNameLabel?.setVisible(false);
      this.threatMarker?.setVisible(Boolean(this.state.isThreatReady));
      return;
    }

    this.threatMarker?.setVisible(false);
    const barY = this.threatSprite.y - this.threatSprite.displayHeight - 9;
    this.threatNameLabel
      ?.setVisible(true)
      .setText(this.threatMobName ?? this.state.mobName ?? "Ameaça")
      .setPosition(this.threatSprite.x, barY - 4);
    const drawBar = (
      x: number,
      y: number,
      current: number,
      maximum: number,
      color: number,
    ) => {
      const width = 54;
      const height = 5;
      const ratio = maximum > 0 ? Phaser.Math.Clamp(current / maximum, 0, 1) : 0;
      graphics.fillStyle(0x07100d, 0.9);
      graphics.fillRoundedRect(x - width / 2 - 1, y - 1, width + 2, height + 2, 2);
      graphics.fillStyle(0x1c2923, 1);
      graphics.fillRect(x - width / 2, y, width, height);
      graphics.fillStyle(color, 1);
      graphics.fillRect(x - width / 2, y, width * ratio, height);
    };
    const durationMs = Math.max(0, Number(this.state.battleDurationMs) || 0);
    const eventType = String(this.state.combatEventType ?? "")
      .trim()
      .toUpperCase();
    const isThreatDefeated =
      this.threatDefeated ||
      this.threatDeathPresentationActive ||
      this.state.mobCurrentHp <= 0 ||
      eventType === "MOB_DEFEATED";
    if (durationMs > 0 && !isThreatDefeated) {
      const elapsedPercent = Phaser.Math.Clamp(
        Math.max(
          Number(this.state.battleProgressPercent) || 0,
          ((this.time.now - this.combatCycleStartedAt) / durationMs) * 100,
        ),
        0,
        100,
      );
      drawBar(
        this.threatSprite.x,
        barY,
        100 - elapsedPercent,
        100,
        0xc9443b,
      );
    }
  }

  private getCombatFormation(area: HuntingWorldArea) {
    if (!this.actorBody) return null;
    return findHuntingCombatFormation(
      area,
      { x: this.actorBody.x, y: this.actorBody.y },
      this.lastMovementDirection,
      COMBAT_DISTANCE,
      COMBAT_APPROACH_DISTANCE,
    );
  }

  private revealThreat(presentCombatEvent = true) {
    if (!this.actorBody || !this.actorSprite) return;
    const area = this.getArea();
    // `isThreatReady` e o snapshot intermediario do encontro. Ele nao deve
    // criar um mob em um navigation point distante para depois reposiciona-lo
    // quando o backend confirmar `COMBAT_ACTIVE`.
    const shouldAnchorToCombatFormation =
      this.state.isThreatReady || this.state.isCombatActive;
    const combatFormation = shouldAnchorToCombatFormation
      ? this.getCombatFormation(area)
      : null;
    const minimumDistance = this.state.isCombatActive
      ? 72
      : this.activeAreaId === HUNTING_AREA_IDS.outdoor
        ? 300
        : 120;
    const maximumDistance = this.state.isCombatActive ? 190 : Infinity;
    const sortedThreatNodes = area.navigationPoints
      .filter(
        (node) => {
          const distance = Math.hypot(
            node.x - this.actorBody!.x,
            node.y - this.actorBody!.y,
          );
          return distance >= minimumDistance && distance <= maximumDistance;
        },
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - this.actorBody!.x, left.y - this.actorBody!.y) -
          Math.hypot(right.x - this.actorBody!.x, right.y - this.actorBody!.y),
      );
    const fallbackThreatNode = area.navigationPoints
      .filter(
        (node) =>
          Math.hypot(
            node.x - this.actorBody!.x,
            node.y - this.actorBody!.y,
          ) >= minimumDistance,
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - this.actorBody!.x, left.y - this.actorBody!.y) -
          Math.hypot(right.x - this.actorBody!.x, right.y - this.actorBody!.y),
      )[0];
    const threatNode = combatFormation?.target ?? sortedThreatNodes[0] ?? fallbackThreatNode;
    if (!threatNode) return;
    this.combatTargetPoint = combatFormation?.target ?? null;
    this.updateMovementDirection(
      (combatFormation?.target.x ?? threatNode.x) - this.actorBody.x,
      (combatFormation?.target.y ?? threatNode.y) - this.actorBody.y,
    );
    this.threatDirection = this.oppositeDirection(this.lastMovementDirection);
    const mobSpriteAsset = this.resolveMobSpriteAsset(this.state.mobName);
    const threatTexture = mobSpriteAsset
      ? this.mobTextureKey(mobSpriteAsset, "walk")
      : INFECTED_TEXTURE;
    const threatFrame = mobSpriteAsset
      ? this.directionStart(this.threatDirection, 4)
      : 0;
    const threat = this.add
      .sprite(threatNode.x, threatNode.y, threatTexture, threatFrame)
      .setOrigin(0.5, 1)
      .setDisplaySize(
        mobSpriteAsset ? SURVIVOR_DISPLAY_WIDTH : 64,
        mobSpriteAsset ? SURVIVOR_DISPLAY_HEIGHT : 96,
      )
      .setAlpha(0)
      .setDepth(ACTOR_DEPTH_BASE + Math.round(threatNode.y));
    const marker = this.add
      .rectangle(threatNode.x, threatNode.y - 82, 16, 16, 0xc84e43, 0.96)
      .setAngle(45)
      .setAlpha(0)
      .setDepth(WORLD_OVERLAY_DEPTH + 5);
    const nameLabel = this.add
      .text(threatNode.x, threatNode.y - 72, this.state.mobName ?? "Ameaça", {
        color: "#f0d48b",
        fontFamily: '"Courier New", monospace',
        fontSize: "10px",
        fontStyle: "bold",
        stroke: "#07100d",
        strokeThickness: 3,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      .setOrigin(0.5, 1)
      .setAlpha(0)
      .setDepth(WORLD_OVERLAY_DEPTH + 20);
    this.threatSprite = threat;
    this.threatMobSpriteAsset = mobSpriteAsset;
    this.threatMobName = this.state.mobName ?? null;
    this.threatMarker = marker;
    this.threatNameLabel = nameLabel;
    this.tweens.add({
      targets: [threat, marker, nameLabel],
      alpha: 1,
      duration: this.state.prefersReducedMotion ? 0 : 220,
    });
    if (presentCombatEvent) this.applyCombatEvent(true);
    this.syncCombatHud();
  }

  private hideThreat() {
    this.threatDeathPresentationTimer?.remove(false);
    this.threatDeathPresentationTimer = null;
    this.threatDeathPresentationActive = false;
    this.threatDeathFadeTween?.stop();
    this.threatDeathFadeTween = null;
    this.threatSprite?.destroy();
    this.threatMarker?.destroy();
    this.threatNameLabel?.destroy();
    this.threatSprite = null;
    this.threatMobSpriteAsset = null;
    this.threatMobName = null;
    this.threatMarker = null;
    this.threatNameLabel = null;
    this.combatHudGraphics?.clear();
    this.resetCombatVisualState();
    this.destroyThreatPortraitBubble();
    this.clearRoute();
  }

  private ensureThreatPortraitBubble() {
    const portraitUrl = this.state.mobPortraitUrl ?? null;
    if (!portraitUrl || !this.actorBody) {
      this.destroyThreatPortraitBubble();
      return;
    }
    if (
      this.threatPortraitBubble &&
      this.threatPortraitUrl === portraitUrl
    ) {
      this.positionThreatPortraitBubble();
      return;
    }

    if (this.threatPortraitUrl && this.threatPortraitUrl !== portraitUrl) {
      return;
    }

    this.threatPortraitUrl = portraitUrl;
    const textureKey = `suburbio-mob-portrait-${hashHuntingPlayerId(
      portraitUrl,
    ).toString(16)}`;
    if (this.textures.exists(textureKey)) {
      this.createThreatPortraitBubble(textureKey);
      return;
    }

    const loadToken = ++this.threatPortraitLoadToken;
    const imageStartedAt = this.diagnostics ? performance.now() : 0;
    const portraitSource = new Image();
    portraitSource.decoding = "async";
    portraitSource.onload = () => {
      const imageLoadedAt = this.diagnostics ? performance.now() : 0;
      this.diagnostics?.recordVisualStage("Imagem do mob", imageLoadedAt - imageStartedAt, imageLoadedAt);
      if (
        loadToken !== this.threatPortraitLoadToken ||
        this.threatPortraitUrl !== portraitUrl ||
        !this.scene.isActive()
      ) {
        return;
      }
      const textureStartedAt = this.diagnostics ? performance.now() : 0;
      if (!this.textures.exists(textureKey)) {
        this.textures.addImage(textureKey, portraitSource);
      }
      this.createThreatPortraitBubble(textureKey);
      this.diagnostics?.recordVisualStage("Criar textura", performance.now() - textureStartedAt, performance.now());
    };
    portraitSource.onerror = () => {
      if (loadToken === this.threatPortraitLoadToken) {
        this.threatPortraitUrl = null;
      }
    };
    portraitSource.src = portraitUrl;
  }

  private syncThreatPortraitBubble() {
    const phase = this.visualMachineState.phase;
    const shouldShow =
      !this.state.isCombatActive &&
      (phase === "investigating" ||
        phase === "alert" ||
        (phase === "found" && this.state.isThreatReady));
    if (shouldShow) {
      this.ensureThreatPortraitBubble();
    } else {
      this.destroyThreatPortraitBubble();
    }
  }

  private createThreatPortraitBubble(textureKey: string) {
    if (!this.actorBody || this.threatPortraitBubble) return;
    const background = this.add.graphics();
    background.fillStyle(0x101715, 0.96);
    background.fillRoundedRect(-28, -28, 56, 56, 7);
    background.fillTriangle(-5, 28, 7, 28, 0, 36);
    const portrait = this.add.image(0, 0, textureKey);
    const source = portrait.texture.getSourceImage() as HTMLImageElement;
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    const cropSize = Math.min(sourceWidth, sourceHeight);
    if (cropSize > 0) {
      portrait.setCrop(
        Math.round((sourceWidth - cropSize) / 2),
        Math.round((sourceHeight - cropSize) / 2),
        cropSize,
        cropSize,
      );
    }
    portrait.setDisplaySize(48, 48);
    const frame = this.add.graphics();
    frame.lineStyle(3, 0xd96f4f, 1);
    frame.strokeRoundedRect(-28, -28, 56, 56, 7);
    frame.lineStyle(1, 0xf0d48b, 0.8);
    frame.strokeRoundedRect(-24, -24, 48, 48, 4);
    const bubble = this.add
      .container(this.actorBody.x, this.actorBody.y - 126, [
        background,
        portrait,
        frame,
      ])
      .setAlpha(0)
      .setDepth(WORLD_OVERLAY_DEPTH + 30);
    this.threatPortraitBubble = bubble;
    this.positionThreatPortraitBubble();
    this.tweens.add({
      targets: bubble,
      alpha: 1,
      duration: this.state.prefersReducedMotion ? 0 : 180,
      ease: "Quad.easeOut",
    });
  }

  private positionThreatPortraitBubble() {
    if (!this.actorBody || !this.threatPortraitBubble) return;
    const zoom = Math.max(0.01, this.cameras.main.zoom);
    const minimumScreenScale = 40 / (56 * zoom);
    this.threatPortraitBubble
      .setPosition(this.actorBody.x, this.actorBody.y - 126)
      .setScale(Math.max(1, minimumScreenScale));
  }

  private destroyThreatPortraitBubble() {
    if (!this.threatPortraitBubble && !this.threatPortraitUrl) return;
    this.threatPortraitLoadToken += 1;
    if (this.threatPortraitBubble) {
      this.threatPortraitBubble.removeAll(true);
      this.threatPortraitBubble.destroy();
    }
    this.threatPortraitBubble = null;
    this.threatPortraitUrl = null;
  }

  private transitionToArea(portal: HuntingWorldPortal) {
    if (this.isChangingArea || !this.actorBody) return;
    this.isChangingArea = true;
    this.isDoorTraversal = true;
    this.clearRoute();
    this.actorSprite?.stop();
    const sourceArea = this.getArea();
    const sourceVisual = this.areaVisuals.get(this.activeAreaId);
    const sourcePosition = { x: this.actorBody.x, y: this.actorBody.y };
    const doorPosition = huntingTileCenter(
      sourceArea,
      portal.doorColumn,
      portal.doorRow,
    );
    const sourceDoor = sourceVisual?.tilemap.getTileAt(
      portal.doorColumn,
      portal.doorRow,
      false,
      HUNTING_TILED_LAYER_NAMES.doors,
    );
    const sourceDoorVisual = sourceVisual?.depthObjects.find(
      (object) => object.name === "porta-entrada",
    );
    const closedDoorIndex = sourceDoor?.index ?? -1;
    const collisionIndex =
      portal.doorRow * sourceArea.columns + portal.doorColumn;
    const collisionTiles = sourceArea.collisionTiles as number[];
    const closedCollisionIndex = collisionTiles[collisionIndex] ?? 0;
    const sourceCollisionTile = sourceVisual?.tilemap.getTileAt(
      portal.doorColumn,
      portal.doorRow,
      false,
      HUNTING_TILED_LAYER_NAMES.collision,
    );
    const closedCollisionTileIndex = sourceCollisionTile?.index ?? -1;

    const restoreDoor = () => {
      collisionTiles[collisionIndex] = closedCollisionIndex;
      if (closedCollisionTileIndex > 0) {
        sourceVisual?.tilemap.putTileAt(
          closedCollisionTileIndex,
          portal.doorColumn,
          portal.doorRow,
          false,
          HUNTING_TILED_LAYER_NAMES.collision,
        );
      }
      if (sourceDoor && closedDoorIndex > 0) {
        sourceVisual?.tilemap.putTileAt(
          closedDoorIndex,
          portal.doorColumn,
          portal.doorRow,
          false,
          HUNTING_TILED_LAYER_NAMES.doors,
        );
      }
      sourceDoorVisual?.setFrame("door-closed");
    };

    if (sourceDoor && closedDoorIndex > 0) {
      sourceVisual?.tilemap.putTileAt(
        closedDoorIndex + 1,
        portal.doorColumn,
        portal.doorRow,
        false,
        HUNTING_TILED_LAYER_NAMES.doors,
      );
    }
    sourceDoorVisual?.setFrame("door-open");
    collisionTiles[collisionIndex] = 0;
    sourceVisual?.tilemap.removeTileAt(
      portal.doorColumn,
      portal.doorRow,
      false,
      false,
      HUNTING_TILED_LAYER_NAMES.collision,
    );
    this.updateMovementDirection(
      doorPosition.x - this.actorBody.x,
      doorPosition.y - this.actorBody.y,
    );
    if (!isHuntingSegmentWalkable(sourceArea, sourcePosition, doorPosition)) {
      restoreDoor();
      this.isChangingArea = false;
      this.isDoorTraversal = false;
      return;
    }

    this.time.delayedCall(this.state.prefersReducedMotion ? 0 : 180, () => {
      if (!this.actorBody) return;
      this.tweens.add({
        targets: this.actorBody,
        x: doorPosition.x,
        y: doorPosition.y,
        duration: this.state.prefersReducedMotion ? 0 : 220,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.cameras.main.fadeOut(
            this.state.prefersReducedMotion ? 0 : 160,
            7,
            12,
            10,
          );
          this.time.delayedCall(
            this.state.prefersReducedMotion ? 0 : 170,
            () => {
              const area = this.getArea(portal.toAreaId);
              const destination = getHuntingNavigationPoint(
                area,
                portal.toNodeId,
              );
              if (!destination || !this.actorBody) {
                restoreDoor();
                this.actorBody?.setPosition(sourcePosition.x, sourcePosition.y);
                this.isChangingArea = false;
                this.isDoorTraversal = false;
                this.cameras.main.fadeIn(120, 7, 12, 10);
                return;
              }
              restoreDoor();
              this.activeAreaId = portal.toAreaId;
              this.areaVisuals.forEach((visual, areaId) => {
                visual.staticBase?.setVisible(areaId === this.activeAreaId);
                visual.layers.forEach((layer, name) => {
                  layer.setVisible(
                    areaId === this.activeAreaId &&
                      (name !== HUNTING_TILED_LAYER_NAMES.collision ||
                        this.isDebugEnabled()),
                  );
                });
                visual.depthObjects.forEach((object) =>
                  object.setVisible(areaId === this.activeAreaId),
                );
              });
              this.currentNodeId = destination.id;
              this.clearRoute();
              this.completedRoutesInArea = 0;
              this.hideThreat();
              this.cameras.main.setBounds(0, 0, area.width, area.height);
              this.actorBody.setSize(
                area.agentHalfWidth * 2,
                area.agentHalfHeight * 2,
              );
              this.actorBody.setPosition(destination.x, destination.y);
              this.syncRemotePlayers(this.state.otherPlayers);
              this.cameras.main.stopFollow();
              this.isCameraFollowingActor = false;
              this.fitCameraToWorld();
              this.drawNavigationDebug();
              this.onAreaChange(area.label);
              this.publishPose(false, true);
              this.isChangingArea = false;
              this.isDoorTraversal = false;
              this.cameras.main.fadeIn(
                this.state.prefersReducedMotion ? 0 : 180,
                7,
                12,
                10,
              );
            },
          );
        },
      });
    });
  }

  private syncRemotePlayers(players: readonly HuntingVisualPlayer[]) {
    const playersInArea = players.filter(
      (player) =>
        player.areaId === this.activeAreaId &&
        typeof player.worldX === "number" &&
        typeof player.worldY === "number" &&
        Number.isFinite(player.worldX) && Number.isFinite(player.worldY) &&
        isHuntingPointWalkable(this.getArea(), { x: player.worldX, y: player.worldY }),
    );
    const activeIds = new Set(playersInArea.map((player) => player.id));
    for (const [playerId, entity] of this.remotePlayers) {
      if (activeIds.has(playerId)) continue;
      entity.sprite.destroy();
      entity.shadow.destroy();
      entity.nameLabel.destroy();
      entity.idleLabel.destroy();
      entity.combatMobSprite?.destroy();
      this.remotePlayers.delete(playerId);
    }
    const area = this.getArea();
    for (const player of playersInArea) {
      let entity = this.remotePlayers.get(player.id);
      if (!entity) {
        const anchor = this.getRemotePlayerSpawn(area, player);
        const spawn = anchor;
        const initialDirection = player.direction;
        entity = {
          areaId: this.activeAreaId,
          shadow: this.add
            .ellipse(
              spawn.x,
              spawn.y + 2,
              SURVIVOR_SHADOW_WIDTH,
              SURVIVOR_SHADOW_HEIGHT,
              0x07100d,
              0.42,
            )
            .setDepth(ACTOR_DEPTH_BASE + Math.round(spawn.y) - 2),
          sprite: this.add
            .sprite(
              spawn.x,
              spawn.y,
              SURVIVOR_TEXTURE,
              initialDirection === "left" ? 4 : 8,
            )
            .setOrigin(0.5, 1)
            .setDisplaySize(SURVIVOR_DISPLAY_WIDTH, SURVIVOR_DISPLAY_HEIGHT)
            .setAlpha(0.84)
            .setTint(0xb7c5bf)
            .setDepth(ACTOR_DEPTH_BASE + Math.round(spawn.y)),
          nameLabel: this.add
            .text(
              spawn.x,
              spawn.y - SURVIVOR_NAME_OFFSET_Y,
              player.displayName,
              {
                color: "#d8e5cf",
                fontFamily: '"Courier New", monospace',
                fontSize: `${REMOTE_NAME_FONT_SIZE}px`,
                fontStyle: "bold",
                stroke: "#07100d",
                strokeThickness: 3,
                resolution: Math.min(window.devicePixelRatio || 1, 2),
              },
            )
            .setOrigin(0.5, 1)
            .setDepth(WORLD_OVERLAY_DEPTH + 20),
          idleLabel: this.add
            .text(spawn.x, spawn.y + 10, "Idle", {
              color: "#cfdbb2",
              backgroundColor: "#102019",
              fontFamily: '"Courier New", monospace',
              fontSize: "9px",
              fontStyle: "bold",
              padding: { left: 4, right: 4, top: 1, bottom: 1 },
              resolution: Math.min(window.devicePixelRatio || 1, 2),
            })
            .setOrigin(0.5, 0)
            .setDepth(WORLD_OVERLAY_DEPTH + 20)
            .setVisible(player.idle),
          combatMobSprite: null,
          combatMobAsset: null,
          combatMobName: null,
          combatCycleKey: null,
          combatEventType: null,
          combatEventKey: null,
          lastPresentedCombatEventKey: null,
          combatDeathPresentationUntil: 0,
          combatEventPresentationUntil: 0,
          lastCombatAnimationAt: 0,
          targetPoint: spawn,
          lastMovementDirection: initialDirection,
          visualState: player.idle ? "walking" : player.visualState,
          moving: player.idle ? false : player.moving,
          updatedAt: player.updatedAt,
          idle: player.idle,
          anchor,
        };
        this.remotePlayers.set(player.id, entity);
      }
      const anchor = this.getRemotePlayerSpawn(area, player);
      const sourceChanged = entity.idle !== player.idle;
      const anchorChanged = entity.anchor.x !== anchor.x || entity.anchor.y !== anchor.y;
      if (player.idle && (sourceChanged || anchorChanged)) {
        entity.idle = true;
        entity.anchor = anchor;
        entity.updatedAt = 0;
        entity.targetPoint = anchor;
        entity.lastMovementDirection = player.direction;
        entity.visualState = "walking";
        entity.moving = false;
        entity.combatMobName = null;
        entity.combatCycleKey = null;
        entity.combatEventType = null;
        entity.combatEventKey = null;
        entity.lastPresentedCombatEventKey = null;
        entity.combatDeathPresentationUntil = 0;
        entity.combatEventPresentationUntil = 0;
        this.rebaseRemotePlayerIfNeeded(entity, anchor, true);
      } else if (!player.idle && (sourceChanged || player.updatedAt >= entity.updatedAt)) {
        entity.idle = false;
        entity.anchor = anchor;
        entity.targetPoint = anchor;
        entity.lastMovementDirection = player.direction;
        entity.visualState = player.visualState;
        entity.moving = player.moving;
        const combatCycleChanged =
          entity.combatCycleKey !== (player.combatCycleKey ?? null);
        entity.combatMobName = player.combatMobName ?? null;
        entity.combatCycleKey = player.combatCycleKey ?? null;
        entity.combatEventType = player.combatEventType ?? null;
        entity.combatEventKey = player.combatEventKey ?? null;
        if (combatCycleChanged) entity.lastCombatAnimationAt = 0;
        entity.updatedAt = player.updatedAt;
        this.rebaseRemotePlayerIfNeeded(entity, anchor);
      }
      entity.nameLabel
        .setText(player.displayName)
        .setScale(this.getNameLabelScale(REMOTE_NAME_FONT_SIZE));
      entity.idleLabel.setVisible(entity.idle)
        .setScale(this.getNameLabelScale(9));
    }
  }

  private getRemotePlayerSpawn(
    area: HuntingWorldArea,
    player: HuntingVisualPlayer,
  ) {
    if (
      typeof player.worldX === "number" &&
      Number.isFinite(player.worldX) &&
      typeof player.worldY === "number" &&
      Number.isFinite(player.worldY)
    ) {
      const requestedPosition = {
        x: clampWorldCoordinate(player.worldX, area.width),
        y: clampWorldCoordinate(player.worldY, area.height),
      };
      if (isHuntingPointWalkable(area, requestedPosition)) {
        return requestedPosition;
      }
    }

    const fallback = getHuntingNavigationPoint(area, area.spawnNodeId);
    if (!fallback) throw new Error(`Spawn remoto ausente em ${area.id}.`);
    return fallback;
  }

  private walkRemotePlayers(delta: number) {
    for (const entity of this.remotePlayers.values()) {
      const isWalking = entity.idle ? false : this.walkRemotePlayer(entity, delta);
      this.syncRemotePlayerVisual(entity, isWalking, entity.visualState);
      this.syncRemoteCombatVisual(entity);
    }
  }

  private rebaseRemotePlayerIfNeeded(
    entity: RemotePlayerEntity,
    target: HuntingCoordinate,
    force = false,
  ) {
    const current = { x: entity.sprite.x, y: entity.sprite.y };
    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    if (!force && distance <= HUNTING_TILE_SIZE * 8 &&
      isHuntingSegmentWalkable(this.getArea(entity.areaId), current, target)) return;
    this.tweens.killTweensOf([entity.sprite, entity.shadow, entity.nameLabel, entity.idleLabel]);
    entity.sprite.setPosition(target.x, target.y).setAlpha(0);
    entity.shadow.setPosition(target.x, target.y + 2).setAlpha(0);
    entity.nameLabel.setPosition(target.x, target.y - SURVIVOR_NAME_OFFSET_Y).setAlpha(0);
    entity.idleLabel.setPosition(target.x, target.y + 10).setAlpha(0);
    const duration = this.state.prefersReducedMotion ? 0 : 180;
    this.tweens.add({ targets: entity.sprite, alpha: 0.84, duration });
    this.tweens.add({ targets: entity.shadow, alpha: 0.42, duration });
    this.tweens.add({ targets: entity.nameLabel, alpha: 1, duration });
    this.tweens.add({ targets: entity.idleLabel, alpha: 1, duration });
  }

  private walkRemotePlayer(entity: RemotePlayerEntity, delta: number) {
    const target = entity.targetPoint;
    const area = this.getArea(entity.areaId);
    const dx = target.x - entity.sprite.x;
    const dy = target.y - entity.sprite.y;
    const distance = Math.hypot(dx, dy);
    if (distance > HUNTING_TILE_SIZE * 8) return false;
    if (distance <= 0.5) return false;
    const catchUpSpeed = Math.max(160, Math.min(420, distance * 4.5));
    const travelDistance = Math.min(
      distance,
      (catchUpSpeed * Math.min(delta, 80)) / 1000,
    );
    const nextPosition = {
      x: entity.sprite.x + (dx / distance) * travelDistance,
      y: entity.sprite.y + (dy / distance) * travelDistance,
    };
    if (!isHuntingSegmentWalkable(area, entity.sprite, nextPosition)) {
      return false;
    }
    entity.sprite.setPosition(nextPosition.x, nextPosition.y);
    return entity.moving || distance > 1;
  }

  private syncRemotePlayerVisual(
    entity: RemotePlayerEntity,
    isWalking: boolean,
    visualPhase: HuntingVisualPresenceState,
  ) {
    const directionStart = { down: 0, left: 4, right: 8, up: 12 }[
      entity.lastMovementDirection
    ];
    if (
      visualPhase === "combat" &&
      entity.combatEventType === "MOB_HIT" &&
      entity.combatEventPresentationUntil > this.time.now &&
      !this.state.prefersReducedMotion
    ) {
      entity.sprite.play(
        this.survivorCombatAnimationKey(
          "hurt",
          entity.lastMovementDirection,
        ),
        true,
      );
    } else if (visualPhase === "combat" && !this.state.prefersReducedMotion) {
      entity.sprite.play(
        this.survivorCombatAnimationKey(
          "attack",
          entity.lastMovementDirection,
        ),
        true,
      );
    } else if (visualPhase === "combat") {
      entity.sprite
        .stop()
        .setTexture(SURVIVOR_ATTACK_TEXTURE)
        .setFrame(this.directionStart(entity.lastMovementDirection, 4) + 3);
    } else if (visualPhase === "investigating" && !this.state.prefersReducedMotion) {
      entity.sprite.play(
        this.investigateAnimationKey(entity.lastMovementDirection),
        true,
      );
    } else if (visualPhase === "investigating") {
      entity.sprite
        .stop()
        .setTexture(SURVIVOR_INVESTIGATE_TEXTURE)
        .setFrame(directionStart + 2);
    } else if (visualPhase === "alert") {
      entity.sprite
        .stop()
        .setTexture(SURVIVOR_INVESTIGATE_TEXTURE)
        .setFrame(directionStart + 3);
    } else if (isWalking && !this.state.prefersReducedMotion) {
      entity.sprite.play(
        this.animationKey(entity.lastMovementDirection),
        true,
      );
    } else {
      entity.sprite
        .stop()
        .setTexture(SURVIVOR_TEXTURE)
        .setFrame(directionStart);
    }
    const depth = ACTOR_DEPTH_BASE + Math.round(entity.sprite.y);
    entity.sprite.setDepth(depth);
    entity.shadow
      .setPosition(entity.sprite.x, entity.sprite.y + 2)
      .setDepth(depth - 2);
    entity.nameLabel.setPosition(
      entity.sprite.x,
      entity.sprite.y - SURVIVOR_NAME_OFFSET_Y,
    );
    entity.idleLabel.setPosition(entity.sprite.x, entity.sprite.y + 10);
  }

  private syncRemoteCombatVisual(entity: RemotePlayerEntity) {
    const now = this.time.now;
    if (
      entity.combatDeathPresentationUntil > now &&
      entity.combatMobSprite
    ) {
      return;
    }
    if (
      entity.combatDeathPresentationUntil > 0 &&
      entity.combatDeathPresentationUntil <= now
    ) {
      entity.combatDeathPresentationUntil = 0;
      entity.combatMobSprite?.destroy();
      entity.combatMobSprite = null;
      entity.combatMobAsset = null;
    }
    if (entity.visualState !== "combat" || !entity.combatMobName || entity.idle) {
      entity.combatMobSprite?.destroy();
      entity.combatMobSprite = null;
      entity.combatMobAsset = null;
      entity.lastCombatAnimationAt = 0;
      return;
    }

    const mobAsset = this.resolveMobSpriteAsset(entity.combatMobName);
    if (!mobAsset) return;
    const direction = this.oppositeDirection(entity.lastMovementDirection);
    const directionVector = {
      down: { x: 0, y: 42 },
      left: { x: -42, y: 0 },
      right: { x: 42, y: 0 },
      up: { x: 0, y: -42 },
    }[entity.lastMovementDirection];
    const requestedPoint = {
      x: entity.sprite.x + directionVector.x,
      y: entity.sprite.y + directionVector.y,
    };
    const area = this.getArea(entity.areaId);
    const mobPoint = isHuntingPointWalkable(area, requestedPoint)
      ? requestedPoint
      : { x: entity.sprite.x - directionVector.x, y: entity.sprite.y - directionVector.y };

    if (!entity.combatMobSprite || entity.combatMobAsset?.key !== mobAsset.key) {
      entity.combatMobSprite?.destroy();
      entity.combatMobSprite = this.add
        .sprite(
          mobPoint.x,
          mobPoint.y,
          this.mobTextureKey(mobAsset, "walk"),
          this.directionStart(direction, 4),
        )
        .setOrigin(0.5, 1)
        .setDisplaySize(SURVIVOR_DISPLAY_WIDTH, SURVIVOR_DISPLAY_HEIGHT)
        .setAlpha(0.82)
        .setTint(0xc3bbb2);
      entity.combatMobAsset = mobAsset;
      entity.lastCombatAnimationAt = 0;
    }

    const mobSprite = entity.combatMobSprite;
    mobSprite
      .setPosition(mobPoint.x, mobPoint.y)
      .setDepth(ACTOR_DEPTH_BASE + Math.round(mobPoint.y));
    const isFreshCombatEvent = Boolean(
      entity.combatEventKey &&
        entity.combatEventKey !== entity.lastPresentedCombatEventKey,
    );
    if (isFreshCombatEvent) {
      entity.lastPresentedCombatEventKey = entity.combatEventKey;
      if (entity.combatEventType === "MOB_DEFEATED") {
        entity.combatDeathPresentationUntil = now + 950;
        mobSprite.clearTint().setAlpha(0.82);
        mobSprite.play(this.mobAnimationKey(mobAsset, "death", direction), true);
        return;
      }
      if (entity.combatEventType === "PLAYER_HIT") {
        entity.combatEventPresentationUntil = now + 240;
        mobSprite.play(this.mobAnimationKey(mobAsset, "hurt", direction), true);
        this.tweens.add({
          targets: mobSprite,
          alpha: 0.45,
          yoyo: true,
          duration: 90,
        });
        return;
      }
      if (entity.combatEventType === "MOB_HIT") {
        entity.combatEventPresentationUntil = now + 280;
        mobSprite.play(this.mobAnimationKey(mobAsset, "attack", direction), true);
        this.tweens.add({
          targets: entity.sprite,
          alpha: 0.42,
          yoyo: true,
          duration: 90,
        });
        return;
      }
    }
    if (this.state.prefersReducedMotion) {
      mobSprite
        .stop()
        .setTexture(this.mobTextureKey(mobAsset, "walk"))
        .setFrame(this.directionStart(direction, 4));
      return;
    }
    if (now - entity.lastCombatAnimationAt >= 650) {
      entity.lastCombatAnimationAt = now;
      mobSprite.play(this.mobAnimationKey(mobAsset, "attack", direction), true);
    }
  }

  private getNameLabelScale(fontSize: number) {
    const zoom = Math.max(0.01, this.cameras.main.zoom);
    return Math.max(1, MIN_NAME_SCREEN_SIZE / (fontSize * zoom));
  }

  private updateCameraSmoothing(delta: number) {
    if (!this.isCameraFollowingActor) return;
    const normalizedFrames =
      Math.min(delta, CAMERA_MAX_DELTA_MS) / (1000 / 60);
    const lerp =
      1 - Math.pow(1 - CAMERA_FOLLOW_LERP_AT_60_FPS, normalizedFrames);
    this.cameras.main.setLerp(lerp, lerp);
  }

  private fitCameraToWorld() {
    const viewportWidth = Math.max(1, this.scale.gameSize.width);
    const viewportHeight = Math.max(1, this.scale.gameSize.height);
    const area = this.getArea();
    const widthZoom = viewportWidth / area.width;
    const heightZoom = viewportHeight / area.height;
    const coverZoom = Math.max(widthZoom, heightZoom);
    const zoom = this.state.isImmersive
      ? coverZoom
      : Math.max(CARD_MIN_ZOOM, coverZoom);
    this.cameras.main.setZoom(zoom);
    this.actorNameLabel?.setScale(
      this.getNameLabelScale(LOCAL_NAME_FONT_SIZE),
    );
    for (const entity of this.remotePlayers.values()) {
      entity.nameLabel.setScale(
        this.getNameLabelScale(REMOTE_NAME_FONT_SIZE),
      );
      entity.idleLabel.setScale(this.getNameLabelScale(9));
    }
    this.positionThreatPortraitBubble();
    if (this.actorBody) {
      this.cameras.main.setDeadzone();
      this.cameras.main.roundPixels =
        !this.state.isImmersive && !window.matchMedia("(pointer: coarse)").matches;
      if (!this.isCameraFollowingActor) {
        this.cameras.main.startFollow(
          this.actorBody,
          false,
          CAMERA_FOLLOW_LERP_AT_60_FPS,
          CAMERA_FOLLOW_LERP_AT_60_FPS,
        );
        this.isCameraFollowingActor = true;
      }
    } else {
      this.cameras.main.stopFollow().centerOn(area.width / 2, area.height / 2);
      this.isCameraFollowingActor = false;
    }
  }
}

export function createSuburbioHuntingGame(params: {
  parent: HTMLElement;
  assets: SuburbioHuntingAssets;
  initialState: SuburbioHuntingState;
  onReady: () => void;
  onAreaChange: (areaLabel: string) => void;
  onVisualPhaseChange: (phase: HuntingVisualPhase) => void;
  onPoseChange: (pose: LocalHuntingPose) => void;
  initialPose: Pick<LocalHuntingPose, "areaId" | "tileX" | "tileY" | "direction"> | null;
}): SuburbioHuntingController {
  const performanceExperiment = getPerformanceExperiment();
  let latestState = params.initialState;
  let viewportWidth = Math.max(1, params.parent.clientWidth);
  let viewportHeight = Math.max(1, params.parent.clientHeight);
  const getRenderScale = () => {
    if (
      !latestState.isImmersive ||
      viewportWidth < IMMERSIVE_SUPERSAMPLE_MIN_WIDTH
    ) {
      return 1;
    }
    return Math.max(
      1,
      Math.min(
        IMMERSIVE_RENDER_SCALE,
        IMMERSIVE_MAX_RENDER_WIDTH / viewportWidth,
        IMMERSIVE_MAX_RENDER_HEIGHT / viewportHeight,
      ),
    );
  };
  let renderScale = getRenderScale();
  let renderWidth = Math.round(viewportWidth * renderScale);
  let renderHeight = Math.round(viewportHeight * renderScale);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: params.parent,
    width: renderWidth,
    height: renderHeight,
    backgroundColor: "#101715",
    banner: false,
    pixelArt: false,
    audio: { noAudio: true },
    render: { antialias: true, smoothPixelArt: true, roundPixels: true },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new SuburbioHuntingPhaserScene(
      params.initialState,
      params.assets,
      params.onReady,
      params.onAreaChange,
      params.onVisualPhaseChange,
      params.onPoseChange,
      params.initialPose,
    ),
  });
  const freezeAfterFirstRender = () => game.loop.sleep();
  if (
    getPerformanceDiagnostics() &&
    performanceExperiment.mapMode !== 'live'
  ) {
    game.events.once(Phaser.Core.Events.POST_RENDER, freezeAfterFirstRender);
  }
  return {
    update: (state) => {
      latestState = state;
      game.events.emit(HUNTING_STATE_EVENT, state);
    },
    beginSnapshotSynchronization: () => {
      game.events.emit(HUNTING_SNAPSHOT_BEGIN_EVENT);
    },
    applySnapshot: (state) => {
      latestState = state;
      game.events.emit(HUNTING_SNAPSHOT_APPLY_EVENT, state);
    },
    showXpGain: (gain) => {
      game.events.emit(HUNTING_XP_GAIN_EVENT, gain);
    },
    resize: () => {
      const nextWidth = Math.max(1, params.parent.clientWidth);
      const nextHeight = Math.max(1, params.parent.clientHeight);
      viewportWidth = nextWidth;
      viewportHeight = nextHeight;
      renderScale = getRenderScale();
      const nextRenderWidth = Math.round(viewportWidth * renderScale);
      const nextRenderHeight = Math.round(viewportHeight * renderScale);
      if (
        nextRenderWidth === renderWidth &&
        nextRenderHeight === renderHeight
      ) {
        return;
      }
      renderWidth = nextRenderWidth;
      renderHeight = nextRenderHeight;
      game.scale.resize(renderWidth, renderHeight);
    },
    destroy: () => {
      game.events.off(Phaser.Core.Events.POST_RENDER, freezeAfterFirstRender);
      getPerformanceDiagnostics()?.setMapMetrics(null);
      game.destroy(true);
    },
  };
}

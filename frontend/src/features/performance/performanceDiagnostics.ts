export type MapPerformanceMetrics = {
  renderer: 'WebGL' | 'WebGL2' | 'Canvas';
  tweens: number;
  visibleObjects: number;
  preRenderedTileLayers: number;
  gpuTileLayers: number;
  cpuTileLayers: number;
};

export const VISUAL_STAGE_LABELS = [
  'Evento socket',
  'Status recebido',
  'Enfileirar aviso',
  'React pagina',
  'React cena',
  'React aviso',
  'Enviar a Phaser',
  'Aplicar cena Phaser',
  'Loop Phaser',
  'Render Phaser',
  'Imagem do mob',
  'Criar textura',
  'Audio XP',
] as const;

export type VisualStageName = typeof VISUAL_STAGE_LABELS[number];

export type VisualStageMetric = {
  name: VisualStageName;
  lastMs: number;
  worstMs: number;
  worstNearEventMs: number;
  samples: number;
};

export type VisualEventMetrics = {
  found: number;
  defeated: number;
  lastKind: 'rastreio' | 'abate' | null;
  lastEventAt: number;
  lastEventWorstFrameMs: number;
  worstEventFrameMs: number;
  eventFramesOver50: number;
  lastEventToToastMs: number;
  worstEventToToastMs: number;
  lastEventToReactCommitMs: number;
  worstEventToReactCommitMs: number;
  stages: VisualStageMetric[];
};

export type PerformanceSnapshot = {
  sampledAt: number;
  seconds: number;
  currentFps: number;
  averageFps: number;
  minimumFps: number;
  averageFrameMs: number;
  lastFrameMs: number;
  worstFrameMs: number;
  over16: number;
  over33: number;
  over50: number;
  over100: number;
  stalls: number;
  spikes: number;
  slowAnimations: number;
  activeToasts: number;
  queuedToasts: number;
  cssAnimations: number;
  lastToastEvent: string;
  worstToastDelayMs: number;
  lastSlowToastEvent: string;
  lastSpikeAt: number;
  map: MapPerformanceMetrics | null;
  visualEvents: VisualEventMetrics;
};

type TimedAnimation = { startedAt: number; expectedMs: number };

export type PerformanceExperiment = {
  noticeEffects: boolean;
  scanEffect: boolean;
  mapMode: 'live' | 'frozen' | 'hidden';
  silent: boolean;
};

export class PerformanceDiagnosticsSession {
  private readonly startedAt: number;
  private previousFrame: number | null = null;
  private recentFrames: number[] = [];
  private frameCount = 0;
  private totalFrameMs = 0;
  private lastFrameMs = 0;
  private worstFrameMs = 0;
  private minimumFps = Infinity;
  private over16 = 0;
  private over33 = 0;
  private over50 = 0;
  private over100 = 0;
  private activeToasts = 0;
  private queuedToasts = 0;
  private slowAnimations = 0;
  private lastToastEvent = 'Nenhum aviso';
  private worstToastDelayMs = 0;
  private lastSlowToastEvent = 'Nenhum atraso';
  private lastSpikeAt = -Infinity;
  private map: MapPerformanceMetrics | null = null;
  private toastStarts = new Map<string, number>();
  private animations = new Map<string, TimedAnimation>();
  private readonly visualStageMetrics = new Map<VisualStageName, VisualStageMetric>();
  private readonly visualEventStarts = new Map<string, number>();
  private foundEvents = 0;
  private defeatedEvents = 0;
  private lastEventKind: VisualEventMetrics['lastKind'] = null;
  private lastEventAt = -Infinity;
  private lastEventWorstFrameMs = 0;
  private worstEventFrameMs = 0;
  private eventFramesOver50 = 0;
  private lastEventToToastMs = 0;
  private worstEventToToastMs = 0;
  private lastEventToReactCommitMs = 0;
  private worstEventToReactCommitMs = 0;
  private visualEventSequence = 0;
  private readonly reactCommitSequences = new Map<VisualStageName, number>();

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  resetFrameClock() {
    this.previousFrame = null;
    this.recentFrames = [];
  }

  recordFrame(now: number) {
    if (this.previousFrame !== null) {
      const duration = now - this.previousFrame;
      if (duration > 0 && Number.isFinite(duration)) {
        this.frameCount += 1;
        this.totalFrameMs += duration;
        this.lastFrameMs = duration;
        this.worstFrameMs = Math.max(this.worstFrameMs, duration);
        if (duration > 16.7) this.over16 += 1;
        if (duration > 33.3) this.over33 += 1;
        if (duration > 50) {
          this.over50 += 1;
          this.lastSpikeAt = now;
        }
        if (duration > 100) this.over100 += 1;
        if (now - this.lastEventAt <= 1000) {
          this.lastEventWorstFrameMs = Math.max(this.lastEventWorstFrameMs, duration);
          this.worstEventFrameMs = Math.max(this.worstEventFrameMs, duration);
          if (duration > 50) this.eventFramesOver50 += 1;
        }
      }
    }
    this.previousFrame = now;
    this.recentFrames.push(now);
    while (this.recentFrames.length > 1 && now - this.recentFrames[0] > 1000) {
      this.recentFrames.shift();
    }
    const elapsed = now - this.recentFrames[0];
    if (elapsed >= 800 && this.recentFrames.length > 1) {
      this.minimumFps = Math.min(this.minimumFps, (this.recentFrames.length - 1) * 1000 / elapsed);
    }
  }

  setMapMetrics(metrics: MapPerformanceMetrics | null) {
    this.map = metrics;
  }

  setToastCounts(active: number, queued: number) {
    this.activeToasts = active;
    this.queuedToasts = queued;
  }

  beginVisualEvent(kind: 'rastreio' | 'abate', toastKey: string, now: number) {
    if (kind === 'rastreio') this.foundEvents += 1;
    else this.defeatedEvents += 1;
    this.lastEventKind = kind;
    this.lastEventAt = now;
    this.lastEventWorstFrameMs = 0;
    this.visualEventSequence += 1;
    this.visualEventStarts.set(toastKey, now);
    if (this.visualEventStarts.size > 30) {
      const oldest = this.visualEventStarts.keys().next().value;
      if (oldest) this.visualEventStarts.delete(oldest);
    }
  }

  recordVisualStage(name: VisualStageName, durationMs: number, now: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const metric = this.visualStageMetrics.get(name) ?? {
      name, lastMs: 0, worstMs: 0, worstNearEventMs: 0, samples: 0,
    };
    metric.lastMs = durationMs;
    metric.worstMs = Math.max(metric.worstMs, durationMs);
    if (now - this.lastEventAt <= 1000) {
      metric.worstNearEventMs = Math.max(metric.worstNearEventMs, durationMs);
    }
    metric.samples += 1;
    this.visualStageMetrics.set(name, metric);
  }

  recordReactCommit(scope: 'React pagina' | 'React cena' | 'React aviso', now: number) {
    if (now - this.lastEventAt < 0 || now - this.lastEventAt > 1000) return;
    if (this.reactCommitSequences.get(scope) === this.visualEventSequence) return;
    this.reactCommitSequences.set(scope, this.visualEventSequence);
    const durationMs = now - this.lastEventAt;
    this.recordVisualStage(scope, durationMs, now);
    if (scope === 'React pagina') {
      this.lastEventToReactCommitMs = durationMs;
      this.worstEventToReactCommitMs = Math.max(this.worstEventToReactCommitMs, durationMs);
    }
  }

  toastShown(id: string, now: number, sourceKey?: string) {
    this.toastStarts.set(id, now);
    this.lastToastEvent = `Aviso iniciou (${id.slice(0, 12)})`;
    const eventStartedAt = sourceKey ? this.visualEventStarts.get(sourceKey) : undefined;
    if (eventStartedAt !== undefined) {
      this.visualEventStarts.delete(sourceKey!);
      this.lastEventToToastMs = now - eventStartedAt;
      this.worstEventToToastMs = Math.max(this.worstEventToToastMs, this.lastEventToToastMs);
    }
  }

  toastHidden(id: string, expectedMs: number, now: number) {
    const startedAt = this.toastStarts.get(id);
    this.toastStarts.delete(id);
    for (const key of this.animations.keys()) {
      if (key.startsWith(`${id}|`)) this.animations.delete(key);
    }
    if (startedAt === undefined) return;
    const actualMs = now - startedAt;
    this.lastToastEvent = `Aviso ${Math.round(actualMs)} / ${expectedMs} ms`;
    if (actualMs > expectedMs + 150 && actualMs > expectedMs * 1.2) {
      this.slowAnimations += 1;
      this.lastSpikeAt = now;
      this.recordSlowToast(actualMs, expectedMs, 'aviso');
    }
  }

  animationStarted(id: string, name: string, expectedMs: number, now: number) {
    this.animations.set(`${id}|${name}`, { startedAt: now, expectedMs });
    this.lastToastEvent = `${name} iniciou (${Math.round(expectedMs)} ms previstos)`;
  }

  animationEnded(id: string, name: string, now: number) {
    const key = `${id}|${name}`;
    const animation = this.animations.get(key);
    this.animations.delete(key);
    if (!animation) return;
    const actualMs = now - animation.startedAt;
    this.lastToastEvent = `${name} ${Math.round(actualMs)} / ${Math.round(animation.expectedMs)} ms`;
    if (actualMs > animation.expectedMs + 100 && actualMs > animation.expectedMs * 1.5) {
      this.slowAnimations += 1;
      this.lastSpikeAt = now;
      this.recordSlowToast(actualMs, animation.expectedMs, name);
    }
  }

  private recordSlowToast(actualMs: number, expectedMs: number, name: string) {
    const delayMs = actualMs - expectedMs;
    if (delayMs > this.worstToastDelayMs) this.worstToastDelayMs = delayMs;
    this.lastSlowToastEvent = `${name}: ${Math.round(actualMs)} / ${Math.round(expectedMs)} ms`;
  }

  snapshot(now: number): PerformanceSnapshot {
    const recentElapsed = this.recentFrames.length > 1
      ? this.recentFrames.at(-1)! - this.recentFrames[0]
      : 0;
    return {
      sampledAt: now,
      seconds: Math.max(0, (now - this.startedAt) / 1000),
      currentFps: recentElapsed > 0 ? (this.recentFrames.length - 1) * 1000 / recentElapsed : 0,
      averageFps: this.totalFrameMs > 0 ? this.frameCount * 1000 / this.totalFrameMs : 0,
      minimumFps: Number.isFinite(this.minimumFps) ? this.minimumFps : 0,
      averageFrameMs: this.frameCount > 0 ? this.totalFrameMs / this.frameCount : 0,
      lastFrameMs: this.lastFrameMs,
      worstFrameMs: this.worstFrameMs,
      over16: this.over16,
      over33: this.over33,
      over50: this.over50,
      over100: this.over100,
      stalls: this.over100,
      spikes: this.over50,
      slowAnimations: this.slowAnimations,
      activeToasts: this.activeToasts,
      queuedToasts: this.queuedToasts,
      cssAnimations: this.animations.size,
      lastToastEvent: this.lastToastEvent,
      worstToastDelayMs: this.worstToastDelayMs,
      lastSlowToastEvent: this.lastSlowToastEvent,
      lastSpikeAt: this.lastSpikeAt,
      map: this.map,
      visualEvents: {
        found: this.foundEvents,
        defeated: this.defeatedEvents,
        lastKind: this.lastEventKind,
        lastEventAt: this.lastEventAt,
        lastEventWorstFrameMs: this.lastEventWorstFrameMs,
        worstEventFrameMs: this.worstEventFrameMs,
        eventFramesOver50: this.eventFramesOver50,
        lastEventToToastMs: this.lastEventToToastMs,
        worstEventToToastMs: this.worstEventToToastMs,
        lastEventToReactCommitMs: this.lastEventToReactCommitMs,
        worstEventToReactCommitMs: this.worstEventToReactCommitMs,
        stages: VISUAL_STAGE_LABELS.flatMap((name) => {
          const metric = this.visualStageMetrics.get(name);
          return metric ? [{ ...metric }] : [];
        }),
      },
    };
  }
}

let session: PerformanceDiagnosticsSession | null = null;

export function getPerformanceDiagnostics() {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('perf') !== '1') {
    return null;
  }
  session ??= new PerformanceDiagnosticsSession(performance.now());
  return session;
}

export function parsePerformanceExperiment(search: string): PerformanceExperiment {
  const params = new URLSearchParams(search);
  if (params.get('perf') !== '1') {
    return { noticeEffects: true, scanEffect: true, mapMode: 'live', silent: false };
  }
  const requestedMapMode = params.get('perfMap');
  return {
    noticeEffects: params.get('perfNoticeFx') !== '0',
    scanEffect: params.get('perfScanFx') !== '0',
    mapMode: requestedMapMode === 'frozen' || requestedMapMode === 'hidden'
      ? requestedMapMode
      : 'live',
    silent: params.get('perfSilent') === '1',
  };
}

export function getPerformanceExperiment(): PerformanceExperiment {
  if (typeof window === 'undefined') {
    return { noticeEffects: true, scanEffect: true, mapMode: 'live', silent: false };
  }
  return parsePerformanceExperiment(window.location.search);
}

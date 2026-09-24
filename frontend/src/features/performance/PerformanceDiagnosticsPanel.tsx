import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getPerformanceDiagnostics,
  getPerformanceExperiment,
} from './performanceDiagnostics';
import './performance-diagnostics.css';

const format = (value: number, digits = 0) => value.toFixed(digits);

function buildExperimentUrl(noticeEffects: boolean, scanEffect: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set('perf', '1');
  url.searchParams.delete('perfSilent');
  if (noticeEffects) url.searchParams.delete('perfNoticeFx');
  else url.searchParams.set('perfNoticeFx', '0');
  if (scanEffect) url.searchParams.delete('perfScanFx');
  else url.searchParams.set('perfScanFx', '0');
  return `${url.pathname}${url.search}`;
}

function buildMapExperimentUrl(mapMode: 'live' | 'frozen' | 'hidden') {
  const url = new URL(window.location.href);
  url.searchParams.set('perf', '1');
  url.searchParams.delete('perfSilent');
  if (mapMode === 'live') url.searchParams.delete('perfMap');
  else url.searchParams.set('perfMap', mapMode);
  return `${url.pathname}${url.search}`;
}

function buildSilentExperimentUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('perf', '1');
  url.searchParams.set('perfSilent', '1');
  url.searchParams.set('perfRun', String(Date.now()));
  url.searchParams.delete('perfNoticeFx');
  url.searchParams.delete('perfScanFx');
  url.searchParams.delete('perfMap');
  return `${url.pathname}${url.search}`;
}

export function PerformanceDiagnosticsPanel() {
  const session = getPerformanceDiagnostics();
  const experiment = getPerformanceExperiment();
  const [mapHost, setMapHost] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState(() => session?.snapshot(performance.now()));
  const [silentComplete, setSilentComplete] = useState(!experiment.silent);
  const silentStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;
    let animationFrame = 0;
    let lastPublish = 0;
    const tick = (now: number) => {
      if (!document.hidden) session.recordFrame(now);
      if (experiment.silent) {
        silentStartedAt.current ??= now;
        if (now - silentStartedAt.current >= 60_000) {
          setSnapshot(session.snapshot(now));
          setSilentComplete(true);
          return;
        }
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }
      if (now - lastPublish >= 500) {
        lastPublish = now;
        setSnapshot(session.snapshot(now));
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    const resetAfterVisibilityChange = () => session.resetFrameClock();
    document.addEventListener('visibilitychange', resetAfterVisibilityChange);
    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('visibilitychange', resetAfterVisibilityChange);
      session.resetFrameClock();
    };
  }, [experiment.silent, session]);

  useEffect(() => {
    if (!session || !silentComplete) return;
    const updateHost = () => {
      const next = document.querySelector<HTMLElement>('.auto-combat-hunting-scene');
      setMapHost((current) => current === next ? current : next);
    };
    updateHost();
    const observer = new MutationObserver(updateHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [session, silentComplete]);

  if (!session || !snapshot || !silentComplete) return null;

  const canvas = mapHost?.querySelector('canvas') ?? null;
  const bounds = canvas?.getBoundingClientRect();
  const scaleX = canvas && bounds?.width ? canvas.width / bounds.width : 0;
  const scaleY = canvas && bounds?.height ? canvas.height / bounds.height : 0;
  const alert = (snapshot.currentFps > 0 && snapshot.currentFps < 45) ||
    snapshot.sampledAt - snapshot.lastSpikeAt < 3000;
  const device = navigator.userAgent;
  const visualEvents = snapshot.visualEvents;
  const experiments = [
    { label: 'Completo', noticeEffects: true, scanEffect: true },
    { label: 'Sem avisos', noticeEffects: false, scanEffect: true },
    { label: 'Sem pulso', noticeEffects: true, scanEffect: false },
    { label: 'Sem ambos', noticeEffects: false, scanEffect: false },
  ];
  const mapExperiments = [
    { label: 'Mapa ativo', mapMode: 'live' as const },
    { label: 'Congelado', mapMode: 'frozen' as const },
    { label: 'Canvas oculto', mapMode: 'hidden' as const },
  ];

  const panel = (
    <aside className="performance-diagnostics" data-alert={alert} aria-label="Diagnóstico de performance">
      <header><strong>PERF · diagnóstico</strong><span>{format(snapshot.seconds)}s</span></header>
      <a className="performance-diagnostics__silent" href={buildSilentExperimentUrl()}>
        {experiment.silent ? 'Repetir coleta limpa de 60s' : 'Coleta limpa de 60s'}
      </a>
      <nav className="performance-diagnostics__modes" aria-label="Teste comparativo de efeitos">
        {experiments.map((item) => {
          const active = item.noticeEffects === experiment.noticeEffects && item.scanEffect === experiment.scanEffect;
          return (
            <a
              data-active={active}
              href={buildExperimentUrl(item.noticeEffects, item.scanEffect)}
              key={item.label}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <nav className="performance-diagnostics__map-modes" aria-label="Teste comparativo do mapa">
        {mapExperiments.map((item) => (
          <a
            data-active={item.mapMode === experiment.mapMode}
            href={buildMapExperimentUrl(item.mapMode)}
            key={item.mapMode}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="performance-diagnostics__grid">
        <span>FPS atual / média / mín.</span>
        <b>{format(snapshot.currentFps)} / {format(snapshot.averageFps)} / {format(snapshot.minimumFps)}</b>
        <span>Frame méd. / último / pior</span>
        <b>{format(snapshot.averageFrameMs, 1)} / {format(snapshot.lastFrameMs, 1)} / {format(snapshot.worstFrameMs, 1)} ms</b>
        <span>Frames &gt;16,7 / &gt;33,3 ms</span><b>{snapshot.over16} / {snapshot.over33}</b>
        <span>Frames &gt;50 / &gt;100 ms</span><b>{snapshot.over50} / {snapshot.over100}</b>
        <span>Picos / travamentos</span><b>{snapshot.spikes} / {snapshot.stalls}</b>
        <span>Toasts ativos / fila</span><b>{snapshot.activeToasts} / {snapshot.queuedToasts}</b>
        <span>Anim. CSS / lentas</span><b>{snapshot.cssAnimations} / {snapshot.slowAnimations}</b>
        <span>Pior atraso de aviso</span><b>{format(snapshot.worstToastDelayMs)} ms</b>
        <span>Tweens / objetos visíveis</span><b>{snapshot.map ? `${snapshot.map.tweens} / ${snapshot.map.visibleObjects}` : 'fora do mapa'}</b>
        <span>Pré-render. / GPU / CPU</span><b>{snapshot.map ? `${snapshot.map.preRenderedTileLayers} / ${snapshot.map.gpuTileLayers} / ${snapshot.map.cpuTileLayers}` : 'fora do mapa'}</b>
        <span>Renderizador</span><b>{snapshot.map?.renderer ?? 'sem cena'}</b>
        <span>Canvas interno</span><b>{canvas ? `${canvas.width} × ${canvas.height}` : '—'}</b>
        <span>Canvas CSS</span><b>{bounds ? `${format(bounds.width)} × ${format(bounds.height)}` : '—'}</b>
        <span>Interno / visual · DPR</span><b>{canvas ? `${format(scaleX, 2)}×${format(scaleY, 2)} · ${format(window.devicePixelRatio || 1, 2)}` : `— · ${format(window.devicePixelRatio || 1, 2)}`}</b>
        <span>Viewport</span><b>{window.innerWidth} × {window.innerHeight}</b>
      </div>
      <div className="performance-diagnostics__section">Evento visual</div>
      <div className="performance-diagnostics__grid">
        <span>Último / rastreios / abates</span>
        <b>{visualEvents.lastKind ?? '—'} / {visualEvents.found} / {visualEvents.defeated}</b>
        <span>Frame após evento últ. / pior</span>
        <b>{format(visualEvents.lastEventWorstFrameMs, 1)} / {format(visualEvents.worstEventFrameMs, 1)} ms</b>
        <span>Frames &gt;50 ms após evento</span><b>{visualEvents.eventFramesOver50}</b>
        <span>Evento → toast últ. / pior</span>
        <b>{format(visualEvents.lastEventToToastMs, 1)} / {format(visualEvents.worstEventToToastMs, 1)} ms</b>
        <span>Evento → commit React</span>
        <b>{format(visualEvents.lastEventToReactCommitMs, 1)} / {format(visualEvents.worstEventToReactCommitMs, 1)} ms</b>
      </div>
      {visualEvents.stages.length > 0 ? (
        <>
          <div className="performance-diagnostics__section">Etapa: última / pior / perto</div>
          <div className="performance-diagnostics__grid">
            {visualEvents.stages.map((stage) => (
              <div className="performance-diagnostics__stage" key={stage.name}>
                <span>{stage.name}</span>
                <b>{format(stage.lastMs, 1)} / {format(stage.worstMs, 1)} / {format(stage.worstNearEventMs, 1)} ms</b>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="performance-diagnostics__event" title={snapshot.lastToastEvent}>{snapshot.lastToastEvent}</div>
      <div className="performance-diagnostics__event" title={snapshot.lastSlowToastEvent}>{snapshot.lastSlowToastEvent}</div>
      <div className="performance-diagnostics__device" title={device}>{device}</div>
    </aside>
  );

  return createPortal(panel, mapHost ?? document.body);
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsePerformanceExperiment,
  PerformanceDiagnosticsSession,
} from './performanceDiagnostics';

test('isola efeitos e composicao do mapa somente no modo de diagnostico', () => {
  assert.deepEqual(parsePerformanceExperiment('?perf=1&perfMap=frozen'), {
    noticeEffects: true,
    scanEffect: true,
    mapMode: 'frozen',
    silent: false,
  });
  assert.deepEqual(
    parsePerformanceExperiment('?perf=1&perfNoticeFx=0&perfScanFx=0&perfMap=hidden'),
    { noticeEffects: false, scanEffect: false, mapMode: 'hidden', silent: false },
  );
  assert.deepEqual(parsePerformanceExperiment('?perfMap=hidden'), {
    noticeEffects: true,
    scanEffect: true,
    mapMode: 'live',
    silent: false,
  });
  assert.equal(parsePerformanceExperiment('?perf=1&perfSilent=1').silent, true);
});

test('mede intervalos reais e ignora pausa da aba ao retomar', () => {
  const diagnostics = new PerformanceDiagnosticsSession(0);
  diagnostics.recordFrame(0);
  diagnostics.recordFrame(16);
  diagnostics.recordFrame(32);
  diagnostics.recordFrame(152);
  diagnostics.recordFrame(210);
  diagnostics.resetFrameClock();
  diagnostics.recordFrame(50_000);
  diagnostics.recordFrame(50_016);

  const result = diagnostics.snapshot(50_016);
  assert.equal(result.over16, 2);
  assert.equal(result.over33, 2);
  assert.equal(result.over50, 2);
  assert.equal(result.over100, 1);
  assert.equal(result.stalls, 1);
  assert.equal(result.worstFrameMs, 120);
  assert.equal(result.lastFrameMs, 16);
  assert.equal(result.averageFrameMs, 45.2);
  assert.equal(result.seconds, 50.016);
});

test('separa toasts visiveis, fila e atraso real de animacao CSS', () => {
  const diagnostics = new PerformanceDiagnosticsSession(0);
  diagnostics.setToastCounts(1, 4);
  diagnostics.setMapMetrics({
    renderer: 'WebGL2',
    tweens: 3,
    visibleObjects: 17,
    preRenderedTileLayers: 2,
    gpuTileLayers: 4,
    cpuTileLayers: 2,
  });
  diagnostics.toastShown('mob-1', 100);
  diagnostics.animationStarted('mob-1', 'enter', 300, 105);
  diagnostics.animationEnded('mob-1', 'enter', 580);
  diagnostics.toastHidden('mob-1', 4200, 5400);

  const result = diagnostics.snapshot(5400);
  assert.equal(result.activeToasts, 1);
  assert.equal(result.queuedToasts, 4);
  assert.equal(result.cssAnimations, 0);
  assert.equal(result.slowAnimations, 2);
  assert.equal(result.worstToastDelayMs, 1100);
  assert.match(result.lastSlowToastEvent, /aviso: 5300 \/ 4200 ms/);
  assert.equal(result.map?.visibleObjects, 17);
  assert.match(result.lastToastEvent, /5300 \/ 4200 ms/);
});

test('correlaciona rastreio com frame longo, commit, toast e etapas visuais', () => {
  const diagnostics = new PerformanceDiagnosticsSession(0);
  diagnostics.recordFrame(90);
  diagnostics.beginVisualEvent('rastreio', 'hunt-event-1', 100);
  diagnostics.recordVisualStage('Evento socket', 8, 108);
  diagnostics.recordReactCommit('React pagina', 140);
  diagnostics.recordReactCommit('React cena', 145);
  diagnostics.recordReactCommit('React aviso', 150);
  diagnostics.toastShown('toast-1', 155, 'hunt-event-1');
  diagnostics.recordFrame(180);
  diagnostics.recordVisualStage('Aplicar cena Phaser', 12, 185);

  const result = diagnostics.snapshot(200);
  assert.equal(result.visualEvents.found, 1);
  assert.equal(result.visualEvents.defeated, 0);
  assert.equal(result.visualEvents.lastEventWorstFrameMs, 90);
  assert.equal(result.visualEvents.eventFramesOver50, 1);
  assert.equal(result.visualEvents.lastEventToToastMs, 55);
  assert.equal(result.visualEvents.lastEventToReactCommitMs, 40);
  assert.equal(
    result.visualEvents.stages.find((stage) => stage.name === 'React cena')?.lastMs,
    45,
  );
  assert.equal(
    result.visualEvents.stages.find((stage) => stage.name === 'React aviso')?.lastMs,
    50,
  );
  assert.equal(
    result.visualEvents.stages.find((stage) => stage.name === 'Aplicar cena Phaser')?.worstNearEventMs,
    12,
  );
});

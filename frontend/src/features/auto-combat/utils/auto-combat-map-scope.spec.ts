import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AutoCombatMapViewModel,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types';
import {
  resolveAutoCombatSelectedMapId,
  scopeInactiveAutoCombatSessionToMap,
  scopeInactiveAutoCombatStatusToMap,
} from './auto-combat-map-scope';

const maps = [
  {
    id: 'map-1',
    name: 'Mapa 1',
    tier: 1,
    minLevel: 1,
    maxLevel: 10,
    subMaps: [{ id: 'submap-1' }],
  },
  {
    id: 'map-2',
    name: 'Mapa 2',
    tier: 2,
    minLevel: 11,
    maxLevel: 20,
    subMaps: [{ id: 'submap-2' }],
  },
] as AutoCombatMapViewModel[];

function buildStatus(
  mapId: string,
  status: 'ACTIVE' | 'DEFEATED',
  phase: 'ENCOUNTER_READY' | 'COMBAT_ACTIVE' = 'ENCOUNTER_READY',
): AutoCombatStatusResponse {
  return {
    active: status === 'ACTIVE',
    hasActiveAutoCombat: status === 'ACTIVE',
    session: {
      id: `session-${mapId}`,
      mapId,
      status,
      startedAt: '2026-08-28T12:00:00.000Z',
      phase,
    },
  };
}

test('seleciona o mapa atual do personagem em vez do primeiro mapa da lista', () => {
  assert.equal(
    resolveAutoCombatSelectedMapId({
      maps,
      characterMapId: 'map-2',
    }),
    'map-2',
  );
});

test('mantem a selecao da sessao ativa como fonte autoritativa', () => {
  assert.equal(
    resolveAutoCombatSelectedMapId({
      maps,
      activeSessionMapId: 'map-1',
      characterMapId: 'map-2',
    }),
    'map-1',
  );
});

test('oculta lote inativo de outro mapa sem descartar sessao ativa', () => {
  const preservedMapOne = buildStatus('map-1', 'DEFEATED');
  const readyMapOne = buildStatus('map-1', 'ACTIVE');
  const activeMapOne = buildStatus('map-1', 'ACTIVE', 'COMBAT_ACTIVE');

  assert.equal(
    scopeInactiveAutoCombatStatusToMap(preservedMapOne, 'map-2'),
    null,
  );
  assert.equal(
    scopeInactiveAutoCombatStatusToMap(preservedMapOne, 'map-1'),
    preservedMapOne,
  );
  assert.equal(
    scopeInactiveAutoCombatStatusToMap(readyMapOne, 'map-2'),
    null,
  );
  assert.equal(
    scopeInactiveAutoCombatStatusToMap(activeMapOne, 'map-2'),
    activeMapOne,
  );
  assert.equal(
    scopeInactiveAutoCombatSessionToMap(
      preservedMapOne.session ?? null,
      'map-2',
    ),
    null,
  );
  assert.equal(
    scopeInactiveAutoCombatSessionToMap(readyMapOne.session ?? null, 'map-2'),
    null,
  );
  assert.equal(
    scopeInactiveAutoCombatSessionToMap(activeMapOne.session ?? null, 'map-2'),
    activeMapOne.session,
  );
});

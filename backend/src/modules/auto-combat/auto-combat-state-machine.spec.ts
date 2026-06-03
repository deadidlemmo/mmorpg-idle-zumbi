import { AutoCombatSessionPhase } from '@prisma/client';

import {
  assertAutoCombatPhaseTransition,
  buildHuntCycleKey,
  isAutoCombatPhaseTransitionAllowed,
} from './auto-combat-state-machine';

describe('auto-combat-state-machine', () => {
  it('permite somente transicoes validas do fluxo de caca e combate', () => {
    expect(
      isAutoCombatPhaseTransitionAllowed(
        AutoCombatSessionPhase.HUNTING,
        AutoCombatSessionPhase.ENCOUNTER_READY,
      ),
    ).toBe(true);
    expect(
      isAutoCombatPhaseTransitionAllowed(
        AutoCombatSessionPhase.ENCOUNTER_READY,
        AutoCombatSessionPhase.COMBAT_ACTIVE,
      ),
    ).toBe(true);
    expect(
      isAutoCombatPhaseTransitionAllowed(
        AutoCombatSessionPhase.HUNTING,
        AutoCombatSessionPhase.COMBAT_ACTIVE,
      ),
    ).toBe(false);
  });

  it('falha de forma explicita para transicao invalida', () => {
    expect(() =>
      assertAutoCombatPhaseTransition(
        AutoCombatSessionPhase.COMBAT_ACTIVE,
        AutoCombatSessionPhase.HUNTING,
      ),
    ).toThrow('Transicao invalida de AutoCombat');
  });

  it('gera chave estavel de idempotencia por ciclo de caca', () => {
    expect(buildHuntCycleKey('session-1', 12)).toBe('session-1:hunt:12');
    expect(buildHuntCycleKey('session-1', 0)).toBe('session-1:hunt:1');
  });
});

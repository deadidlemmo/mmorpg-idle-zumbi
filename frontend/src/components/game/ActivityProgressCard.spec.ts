import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldResetCycleProgress } from './activityProgressCard.utils.ts';

test('reinicia a barra ciclica sem animar para tras', () => {
  assert.equal(
    shouldResetCycleProgress({
      animation: 'cycle',
      current: 4,
      previous: 96,
    }),
    true,
  );
});

test('mantem a interpolacao ao avancar e nas barras de proficiencia', () => {
  assert.equal(
    shouldResetCycleProgress({
      animation: 'cycle',
      current: 52,
      previous: 48,
    }),
    false,
  );
  assert.equal(
    shouldResetCycleProgress({
      animation: 'value',
      current: 40,
      previous: 60,
    }),
    false,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLatestNotification } from './lootNotificationQueue';

test('selectLatestNotification mantém somente o aviso mais recente', () => {
  const latest = selectLatestNotification([
    { id: 'primeiro' },
    { id: 'segundo' },
    { id: 'ultimo' },
  ]);

  assert.deepEqual(latest, { id: 'ultimo' });
});

test('selectLatestNotification retorna null sem novos avisos', () => {
  assert.equal(selectLatestNotification([]), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enqueueNotifications,
  selectLatestNotification,
} from './lootNotificationQueue';

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

test('enqueueNotifications preserva o aviso ativo e o lote recebido', () => {
  const queue = enqueueNotifications(
    [{ id: 'abate' }],
    [{ id: 'drop-antigo' }, { id: 'drop-atual' }],
    5,
  );

  assert.deepEqual(queue, [
    { id: 'abate' },
    { id: 'drop-antigo' },
    { id: 'drop-atual' },
  ]);
});

test('enqueueNotifications limita pendencias sem substituir o aviso ativo', () => {
  const queue = enqueueNotifications(
    [{ id: 'ativo' }, { id: 'pendente-1' }, { id: 'pendente-2' }],
    [{ id: 'mais-recente' }],
    3,
  );

  assert.deepEqual(queue, [
    { id: 'ativo' },
    { id: 'pendente-2' },
    { id: 'mais-recente' },
  ]);
});

test('enqueueNotifications exibe o resultado do combate antes do loot confirmado', () => {
  const queue = enqueueNotifications(
    [
      { id: 'drop-1', kind: 'loot' },
      { id: 'drop-2', kind: 'loot' },
    ],
    [{ id: 'abate', kind: 'combat-result' }],
    5,
    (notification) => notification.kind === 'combat-result',
  );

  assert.deepEqual(queue, [
    { id: 'abate', kind: 'combat-result' },
    { id: 'drop-1', kind: 'loot' },
    { id: 'drop-2', kind: 'loot' },
  ]);
});

test('enqueueNotifications mantem o resultado ativo quando o loot chega depois', () => {
  const queue = enqueueNotifications(
    [{ id: 'abate', kind: 'combat-result' }],
    [{ id: 'drop', kind: 'loot' }],
    5,
    (notification) => notification.kind === 'combat-result',
  );

  assert.deepEqual(queue, [
    { id: 'abate', kind: 'combat-result' },
    { id: 'drop', kind: 'loot' },
  ]);
});

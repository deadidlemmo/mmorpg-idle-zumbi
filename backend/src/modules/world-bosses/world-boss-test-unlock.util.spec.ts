import { isWorldBossTestUnlockEnabled } from './world-boss-test-unlock.util';

describe('isWorldBossTestUnlockEnabled', () => {
  it.each([undefined, '', 'false', '1', 'yes', 'TRUEE'])(
    'mantem o desbloqueio de QA desativado para %p',
    (value) => {
      expect(isWorldBossTestUnlockEnabled(value)).toBe(false);
    },
  );

  it('ativa somente quando configurado explicitamente como true', () => {
    expect(isWorldBossTestUnlockEnabled(' true ', 'development')).toBe(true);
    expect(isWorldBossTestUnlockEnabled('TRUE', 'test')).toBe(true);
  });

  it('permanece desativado em producao mesmo com a flag ligada', () => {
    expect(isWorldBossTestUnlockEnabled('true', 'production')).toBe(false);
  });
});

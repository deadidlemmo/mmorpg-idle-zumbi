import { getAutoCombatHuntingSecondsPerEnemy } from './auto-combat-hunting.util';

describe('auto-combat hunting progression', () => {
  it('reduz o rastreio de 15 para 6 segundos entre os niveis 1 e 50', () => {
    expect(getAutoCombatHuntingSecondsPerEnemy(1)).toBe(15);
    expect(getAutoCombatHuntingSecondsPerEnemy(50)).toBe(6);
  });

  it('usa o nivel de caca apenas para reduzir o tempo de rastreio', () => {
    expect(getAutoCombatHuntingSecondsPerEnemy(10)).toBe(12);
    expect(getAutoCombatHuntingSecondsPerEnemy(20)).toBe(10);
    expect(getAutoCombatHuntingSecondsPerEnemy(30)).toBe(8);
    expect(getAutoCombatHuntingSecondsPerEnemy(40)).toBe(7);
  });
});

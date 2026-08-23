import {
  CRAFTING_DURATION_SECONDS_BY_TIER,
  getCraftingDurationSecondsForTier,
} from './crafting.config';

describe('crafting config', () => {
  it('keeps early crafting ceremonial while preserving tier escalation', () => {
    expect(CRAFTING_DURATION_SECONDS_BY_TIER).toMatchObject({
      1: 15,
      2: 30,
      3: 60,
      4: 120,
      5: 180,
    });
  });

  it('scales duration by batch quantity', () => {
    expect(getCraftingDurationSecondsForTier(1, 3)).toBe(45);
    expect(getCraftingDurationSecondsForTier(3, 2)).toBe(120);
  });
});

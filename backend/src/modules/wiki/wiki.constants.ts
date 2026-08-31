import {
  LAUNCH_LEVEL_CAP,
  LEVELS_PER_TIER,
} from '../../common/config/progression.config';

export const WIKI_LAUNCH_TIER_CAP = Math.ceil(
  LAUNCH_LEVEL_CAP / LEVELS_PER_TIER,
);

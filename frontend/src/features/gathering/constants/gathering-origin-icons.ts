import arsenalIcon from '../../../assets/images/gathering/skills/gathering-arsenal.webp';
import coletaIcon from '../../../assets/images/gathering/skills/gathering-coleta.webp';
import contencaoIcon from '../../../assets/images/gathering/skills/gathering-contencao.webp';
import desmancheIcon from '../../../assets/images/gathering/skills/gathering-desmanche.webp';
import patrulhaIcon from '../../../assets/images/gathering/skills/gathering-patrulha.webp';
import tecnovarreduraIcon from '../../../assets/images/gathering/skills/gathering-tecnovarredura.webp';
import {
  isGatheringAllowedOrigin,
  type GatheringAllowedOrigin,
} from '../types/gathering.types';

export const GATHERING_ORIGIN_ICON_BY_ORIGIN = {
  DESMANCHE: desmancheIcon,
  COLETA: coletaIcon,
  PATRULHA: patrulhaIcon,
  ARSENAL: arsenalIcon,
  TECNOVARREDURA: tecnovarreduraIcon,
  CONTENCAO: contencaoIcon,
} as const satisfies Record<GatheringAllowedOrigin, string>;

export const GATHERING_ORIGIN_ICON_BY_SKILL_KEY = {
  desmanche: desmancheIcon,
  coleta: coletaIcon,
  patrulha: patrulhaIcon,
  arsenal: arsenalIcon,
  tecnovarredura: tecnovarreduraIcon,
  contencao: contencaoIcon,
} as const;

function normalizeGatheringOriginForIcon(
  origin?: GatheringAllowedOrigin | string | null,
): GatheringAllowedOrigin | null {
  if (isGatheringAllowedOrigin(origin)) return origin;

  if (typeof origin !== 'string') return null;

  const normalizedOrigin = origin
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .toUpperCase();

  if (normalizedOrigin === 'TECNO-VARREDURA') return 'TECNOVARREDURA';
  if (normalizedOrigin === 'CONTENCAO') return 'CONTENCAO';

  return isGatheringAllowedOrigin(normalizedOrigin) ? normalizedOrigin : null;
}

export function getGatheringOriginIcon(
  origin?: GatheringAllowedOrigin | string | null,
): string | null {
  const normalizedOrigin = normalizeGatheringOriginForIcon(origin);

  if (!normalizedOrigin) return null;

  return GATHERING_ORIGIN_ICON_BY_ORIGIN[normalizedOrigin] ?? null;
}

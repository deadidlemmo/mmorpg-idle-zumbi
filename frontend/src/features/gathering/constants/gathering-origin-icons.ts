import arsenalIcon from '../../../assets/images/gathering/skills/gathering-arsenal.png';
import coletaIcon from '../../../assets/images/gathering/skills/gathering-coleta.png';
import contencaoIcon from '../../../assets/images/gathering/skills/gathering-contencao.png';
import desmancheIcon from '../../../assets/images/gathering/skills/gathering-desmanche.png';
import patrulhaIcon from '../../../assets/images/gathering/skills/gathering-patrulha.png';
import tecnovarreduraIcon from '../../../assets/images/gathering/skills/gathering-tecnovarredura.png';
import type { GatheringAllowedOrigin } from '../types/gathering.types';

const GATHERING_ORIGIN_ICON_BY_ORIGIN = {
  DESMANCHE: desmancheIcon,
  COLETA: coletaIcon,
  PATRULHA: patrulhaIcon,
  ARSENAL: arsenalIcon,
  TECNOVARREDURA: tecnovarreduraIcon,
  CONTENCAO: contencaoIcon,
} as const satisfies Record<GatheringAllowedOrigin, string>;

export function getGatheringOriginIcon(
  origin?: GatheringAllowedOrigin | null,
): string | null {
  if (!origin) return null;

  return GATHERING_ORIGIN_ICON_BY_ORIGIN[origin] ?? null;
}

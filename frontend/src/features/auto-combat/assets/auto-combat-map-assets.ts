import type { CSSProperties } from 'react';
import avenidaCaidosMapImage from '../../../assets/images/maps/avenida-dos-caidos.webp';
import complexoHelixMapImage from '../../../assets/images/maps/complexo-helix.webp';
import distritoFerrugemMapImage from '../../../assets/images/maps/distrito-da-ferrugem.webp';
import hospitalSantaRuinaMapImage from '../../../assets/images/maps/hospital-santa-ruina.webp';
import marcoZeroMapImage from '../../../assets/images/maps/marco-zero.webp';
import necropoleIndustrialMapImage from '../../../assets/images/maps/necropole-industrial.webp';
import refinariaPoCinzentoMapImage from '../../../assets/images/maps/refinaria-do-po-cinzento.webp';
import suburbioSilenciosoMapImage from '../../../assets/images/maps/suburbio-silencioso.webp';
import terminalEsquecidosMapImage from '../../../assets/images/maps/terminal-dos-esquecidos.webp';
import zonaQuarentena9MapImage from '../../../assets/images/maps/zona-de-quarentena-9.webp';

const MAP_IMAGE_BY_SLUG: Record<string, string> = {
  'suburbio-silencioso': suburbioSilenciosoMapImage,
  'distrito-da-ferrugem': distritoFerrugemMapImage,
  'hospital-santa-ruina': hospitalSantaRuinaMapImage,
  'terminal-dos-esquecidos': terminalEsquecidosMapImage,
  'zona-de-quarentena-9': zonaQuarentena9MapImage,
  'refinaria-do-po-cinzento': refinariaPoCinzentoMapImage,
  'avenida-dos-caidos': avenidaCaidosMapImage,
  'complexo-helix': complexoHelixMapImage,
  'necropole-industrial': necropoleIndustrialMapImage,
  'marco-zero': marcoZeroMapImage,
};

function normalizeMapImageKey(mapName?: string | null) {
  return String(mapName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getMapImageByName(mapName?: string | null) {
  const key = normalizeMapImageKey(mapName);

  if (!key) return null;

  return MAP_IMAGE_BY_SLUG[key] ?? null;
}

export function buildMapVisualStyle(mapImage?: string | null): CSSProperties | undefined {
  if (!mapImage) return undefined;

  return {
    backgroundImage: `linear-gradient(180deg, rgba(7, 12, 11, 0.08), rgba(7, 12, 11, 0.84)), radial-gradient(circle at 18% 12%, rgba(180, 214, 112, 0.12), transparent 12rem), url(${mapImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

import type { ConfigService } from '@nestjs/config';
import {
  STOREFRONT_PROVIDER_DEFINITIONS,
  type StorefrontProviderKey,
} from './storefront.config';

export type StorefrontProviderState = 'AVAILABLE' | 'UNAVAILABLE' | 'PLANNED';

function optionalValue(configService: ConfigService, key: string) {
  const value = configService.get<string>(key)?.trim();
  return value || null;
}

function enabledValue(configService: ConfigService, key: string) {
  return ['1', 'true', 'yes', 'on'].includes(
    optionalValue(configService, key)?.toLowerCase() ?? '',
  );
}

function validAbsoluteUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getStorefrontPublicUrls(configService: ConfigService) {
  return {
    frontendUrl: validAbsoluteUrl(optionalValue(configService, 'FRONTEND_URL')),
    apiUrl: validAbsoluteUrl(optionalValue(configService, 'PUBLIC_API_URL')),
  };
}

export function getStorefrontProviderState(
  configService: ConfigService,
  provider: StorefrontProviderKey,
): StorefrontProviderState {
  const urls = getStorefrontPublicUrls(configService);
  if (!urls.frontendUrl || !urls.apiUrl) return 'UNAVAILABLE';

  if (!isStorefrontProviderConfigured(configService, provider)) {
    return 'UNAVAILABLE';
  }

  if (provider === 'MERCADO_PAGO') {
    return enabledValue(configService, 'MERCADO_PAGO_CHECKOUT_ENABLED')
      ? 'AVAILABLE'
      : 'PLANNED';
  }

  return enabledValue(configService, 'STRIPE_CHECKOUT_ENABLED')
    ? 'AVAILABLE'
    : 'PLANNED';
}

export function isStorefrontProviderConfigured(
  configService: ConfigService,
  provider: StorefrontProviderKey,
) {
  return provider === 'MERCADO_PAGO'
    ? Boolean(
        optionalValue(configService, 'MERCADO_PAGO_ACCESS_TOKEN') &&
        optionalValue(configService, 'MERCADO_PAGO_WEBHOOK_SECRET'),
      )
    : Boolean(
        optionalValue(configService, 'STRIPE_SECRET_KEY') &&
        optionalValue(configService, 'STRIPE_WEBHOOK_SECRET'),
      );
}

export function getStorefrontProviders(configService: ConfigService) {
  return STOREFRONT_PROVIDER_DEFINITIONS.map((provider) => ({
    ...provider,
    state: getStorefrontProviderState(configService, provider.key),
  }));
}

export function requireStorefrontSecret(
  configService: ConfigService,
  key: string,
) {
  const value = optionalValue(configService, key);
  if (!value) throw new Error(`Configuração ausente: ${key}.`);
  return value;
}

export function selectMercadoPagoCheckoutUrl(params: {
  accessToken: string;
  initPoint?: string | null;
  sandboxInitPoint?: string | null;
}) {
  return params.accessToken.startsWith('TEST-')
    ? (params.sandboxInitPoint ?? null)
    : (params.initPoint ?? null);
}

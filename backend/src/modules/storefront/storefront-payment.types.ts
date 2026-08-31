import type {
  StorefrontOrder,
  StorefrontPaymentProvider,
  StorefrontPaymentStatus,
} from '@prisma/client';
import type { StorefrontOfferDefinition } from './storefront.config';

export interface StorefrontCheckoutContext {
  order: StorefrontOrder;
  offer: StorefrontOfferDefinition;
  payerEmail: string;
}

export interface StorefrontCreatedCheckout {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
  providerStatus: string;
  subscriptionId?: string | null;
  customerId?: string | null;
}

export interface StorefrontPaymentUpdate {
  provider: StorefrontPaymentProvider;
  orderId: string;
  providerPaymentId: string;
  providerEventId?: string | null;
  status: StorefrontPaymentStatus;
  providerStatus: string;
  amountCents: number;
  currency: string;
  paidAt?: Date | null;
  periodEndsAt?: Date | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MercadoPagoWebhookInput {
  body: unknown;
  dataId?: string | string[] | null;
  xRequestId?: string | string[] | null;
  xSignature?: string | string[] | null;
}

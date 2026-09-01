import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorefrontOrderStatus,
  StorefrontPaymentProvider,
  StorefrontPaymentStatus,
  StorefrontSubscriptionStatus,
} from '@prisma/client';
import MercadoPagoConfig, {
  Invoice,
  Payment,
  PreApproval,
  Preference,
  WebhookSignatureValidator,
} from 'mercadopago';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { StorefrontFulfillmentService } from './storefront-fulfillment.service';
import {
  getStorefrontProviderState,
  getStorefrontPublicUrls,
  isStorefrontProviderConfigured,
  requireStorefrontSecret,
  selectMercadoPagoCheckoutUrl,
} from './storefront-payment.config';
import type {
  MercadoPagoWebhookInput,
  StorefrontCheckoutContext,
  StorefrontCreatedCheckout,
} from './storefront-payment.types';

const CHECKOUT_EXPIRATION_MS = 31 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(
    typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripeObjectId(value: string | { id?: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function buildMembershipReturnUrl(params: {
  frontendUrl: string;
  characterId: string;
  orderId: string;
  state: 'success' | 'pending' | 'cancelled';
}) {
  const url = new URL(
    `/dashboard/${params.characterId}/membership`,
    params.frontendUrl,
  );
  url.searchParams.set('checkout', params.state);
  url.searchParams.set('orderId', params.orderId);
  return url.toString();
}

function mercadoPagoStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase() ?? 'unknown';
  if (normalized === 'approved') return StorefrontPaymentStatus.APPROVED;
  if (normalized === 'refunded') return StorefrontPaymentStatus.REFUNDED;
  if (normalized === 'charged_back') {
    return StorefrontPaymentStatus.CHARGEBACK_REVIEW;
  }
  if (['pending', 'in_process', 'authorized'].includes(normalized)) {
    return StorefrontPaymentStatus.PENDING;
  }
  return StorefrontPaymentStatus.FAILED;
}

function mercadoPagoSubscriptionStatus(status?: string | null) {
  switch (status?.trim().toLowerCase()) {
    case 'authorized':
      return StorefrontSubscriptionStatus.ACTIVE;
    case 'paused':
      return StorefrontSubscriptionStatus.PAUSED;
    case 'cancelled':
    case 'canceled':
      return StorefrontSubscriptionStatus.CANCELLED;
    default:
      return StorefrontSubscriptionStatus.PENDING;
  }
}

function stripeSubscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === 'active' || status === 'trialing') {
    return StorefrontSubscriptionStatus.ACTIVE;
  }
  if (status === 'paused') return StorefrontSubscriptionStatus.PAUSED;
  if (status === 'canceled' || status === 'incomplete_expired') {
    return StorefrontSubscriptionStatus.CANCELLED;
  }
  return StorefrontSubscriptionStatus.PAST_DUE;
}

function stripeSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const timestamps = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isFinite(value));
  return timestamps.length > 0 ? asDate(Math.max(...timestamps)) : null;
}

@Injectable()
export class StorefrontPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fulfillment: StorefrontFulfillmentService,
  ) {}

  async createCheckout(
    context: StorefrontCheckoutContext,
  ): Promise<StorefrontCreatedCheckout> {
    if (
      getStorefrontProviderState(this.configService, context.order.provider) !==
      'AVAILABLE'
    ) {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'Este meio de pagamento ainda não está configurado.',
        provider: context.order.provider,
      });
    }

    return context.order.provider === StorefrontPaymentProvider.STRIPE
      ? this.createStripeCheckout(context)
      : this.createMercadoPagoCheckout(context);
  }

  async handleStripeWebhook(rawBody: Buffer, signature?: string | null) {
    if (!isStorefrontProviderConfigured(this.configService, 'STRIPE')) {
      throw new ServiceUnavailableException(
        'Webhook Stripe ainda não está configurado.',
      );
    }
    if (!signature) throw new UnauthorizedException('Assinatura ausente.');

    const stripe = this.stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        requireStorefrontSecret(this.configService, 'STRIPE_WEBHOOK_SECRET'),
      );
    } catch {
      throw new UnauthorizedException('Assinatura Stripe inválida.');
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      return this.handleStripeCheckoutSession(event);
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (orderId) {
        await this.prisma.storefrontOrder.updateMany({
          where: { id: orderId, fulfilledAt: null },
          data: {
            status: StorefrontOrderStatus.EXPIRED,
            providerStatus: session.status ?? 'expired',
          },
        });
      }
      return { received: true, handled: Boolean(orderId) };
    }

    if (event.type === 'invoice.paid') {
      return this.handleStripeInvoice(event, StorefrontPaymentStatus.APPROVED);
    }

    if (event.type === 'invoice.payment_failed') {
      return this.handleStripeInvoice(event, StorefrontPaymentStatus.FAILED);
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object;
      const orderId =
        subscription.metadata.orderId ??
        (await this.fulfillment.findOrderIdBySubscription(
          StorefrontPaymentProvider.STRIPE,
          subscription.id,
        ));
      await this.fulfillment.updateSubscriptionStatus({
        provider: StorefrontPaymentProvider.STRIPE,
        providerSubscriptionId: subscription.id,
        orderId,
        providerCustomerId: stripeObjectId(subscription.customer),
        status: stripeSubscriptionStatus(subscription.status),
        currentPeriodEndsAt: stripeSubscriptionPeriodEnd(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });
      return { received: true, handled: true };
    }

    return { received: true, handled: false };
  }

  async handleMercadoPagoWebhook(input: MercadoPagoWebhookInput) {
    if (!isStorefrontProviderConfigured(this.configService, 'MERCADO_PAGO')) {
      throw new ServiceUnavailableException(
        'Webhook Mercado Pago ainda não está configurado.',
      );
    }

    const body = asRecord(input.body);
    const bodyData = asRecord(body?.data);
    const dataId =
      input.dataId ?? asString(bodyData?.id) ?? asString(body?.id) ?? null;

    try {
      WebhookSignatureValidator.validate({
        xSignature: input.xSignature,
        xRequestId: input.xRequestId,
        dataId,
        secret: requireStorefrontSecret(
          this.configService,
          'MERCADO_PAGO_WEBHOOK_SECRET',
        ),
        toleranceSeconds: 300,
      });
    } catch {
      throw new UnauthorizedException('Assinatura Mercado Pago inválida.');
    }

    const type = asString(body?.type) ?? asString(body?.topic);
    const resourceId = Array.isArray(dataId) ? dataId[0] : dataId;
    if (!type || !resourceId) {
      throw new BadRequestException('Notificação Mercado Pago incompleta.');
    }

    if (type === 'payment') {
      return this.handleMercadoPagoPayment(resourceId, body, input.xRequestId);
    }

    if (type === 'subscription_preapproval') {
      const preApproval = await new PreApproval(this.mercadoPagoClient()).get({
        id: resourceId,
      });
      const orderId = preApproval.external_reference;
      if (!preApproval.id || !orderId) {
        return { received: true, handled: false };
      }

      await this.fulfillment.updateSubscriptionStatus({
        provider: StorefrontPaymentProvider.MERCADO_PAGO,
        providerSubscriptionId: preApproval.id,
        orderId,
        status: mercadoPagoSubscriptionStatus(preApproval.status),
        currentPeriodEndsAt: asDate(preApproval.next_payment_date),
      });
      return { received: true, handled: true };
    }

    if (type === 'subscription_authorized_payment') {
      return this.handleMercadoPagoSubscriptionInvoice(
        resourceId,
        body,
        input.xRequestId,
      );
    }

    return { received: true, handled: false };
  }

  private async createStripeCheckout({
    order,
    offer,
    payerEmail,
  }: StorefrontCheckoutContext) {
    const urls = getStorefrontPublicUrls(this.configService);
    if (!urls.frontendUrl) throw new Error('FRONTEND_URL inválida.');

    const successUrl = buildMembershipReturnUrl({
      frontendUrl: urls.frontendUrl,
      characterId: order.characterId,
      orderId: order.id,
      state: 'success',
    });
    const cancelUrl = buildMembershipReturnUrl({
      frontendUrl: urls.frontendUrl,
      characterId: order.characterId,
      orderId: order.id,
      state: 'cancelled',
    });
    const expiresAt = new Date(Date.now() + CHECKOUT_EXPIRATION_MS);
    const metadata = {
      orderId: order.id,
      userId: order.userId,
      characterId: order.characterId,
      offerKey: order.offerKey,
      rewardQuantity: String(order.rewardQuantity),
    };
    const subscription = offer.kind === 'SUBSCRIPTION';

    const session = await this.stripeClient().checkout.sessions.create(
      {
        mode: subscription ? 'subscription' : 'payment',
        client_reference_id: order.id,
        customer_email: payerEmail,
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        metadata,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: order.amountCents,
              product_data: {
                name: offer.name,
                description: offer.description,
                metadata: { offerKey: order.offerKey },
              },
              ...(subscription
                ? { recurring: { interval: 'month' as const } }
                : {}),
            },
          },
        ],
        ...(subscription
          ? { subscription_data: { metadata } }
          : { payment_intent_data: { metadata } }),
      },
      { idempotencyKey: `storefront:${order.id}` },
    );

    if (!session.url) {
      throw new ServiceUnavailableException(
        'A Stripe não retornou a URL de checkout.',
      );
    }

    return {
      checkoutId: session.id,
      checkoutUrl: session.url,
      expiresAt,
      providerStatus: session.status ?? 'open',
    };
  }

  private async createMercadoPagoCheckout({
    order,
    offer,
    payerEmail,
  }: StorefrontCheckoutContext) {
    const urls = getStorefrontPublicUrls(this.configService);
    if (!urls.frontendUrl || !urls.apiUrl) {
      throw new Error('FRONTEND_URL ou PUBLIC_API_URL inválida.');
    }

    const successUrl = buildMembershipReturnUrl({
      frontendUrl: urls.frontendUrl,
      characterId: order.characterId,
      orderId: order.id,
      state: 'success',
    });
    const pendingUrl = buildMembershipReturnUrl({
      frontendUrl: urls.frontendUrl,
      characterId: order.characterId,
      orderId: order.id,
      state: 'pending',
    });
    const failureUrl = buildMembershipReturnUrl({
      frontendUrl: urls.frontendUrl,
      characterId: order.characterId,
      orderId: order.id,
      state: 'cancelled',
    });

    if (offer.kind === 'SUBSCRIPTION') {
      const preApproval = await new PreApproval(
        this.mercadoPagoClient(),
      ).create({
        body: {
          reason: offer.name,
          external_reference: order.id,
          payer_email: payerEmail,
          back_url: successUrl,
          status: 'pending',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: order.amountCents / 100,
            currency_id: 'BRL',
          },
        },
        requestOptions: { idempotencyKey: `storefront:${order.id}` },
      });

      if (!preApproval.id || !preApproval.init_point) {
        throw new ServiceUnavailableException(
          'O Mercado Pago não retornou o checkout da assinatura.',
        );
      }

      return {
        checkoutId: preApproval.id,
        checkoutUrl: preApproval.init_point,
        expiresAt: null,
        providerStatus: preApproval.status ?? 'pending',
        subscriptionId: preApproval.id,
      };
    }

    const expiresAt = new Date(Date.now() + CHECKOUT_EXPIRATION_MS);
    const preference = await new Preference(this.mercadoPagoClient()).create({
      body: {
        external_reference: order.id,
        notification_url: `${urls.apiUrl}/storefront/webhooks/mercado-pago`,
        auto_return: 'approved',
        back_urls: {
          success: successUrl,
          pending: pendingUrl,
          failure: failureUrl,
        },
        expires: true,
        date_of_expiration: expiresAt.toISOString(),
        payer: { email: payerEmail },
        metadata: {
          order_id: order.id,
          user_id: order.userId,
          character_id: order.characterId,
          offer_key: order.offerKey,
          reward_quantity: order.rewardQuantity,
        },
        items: [
          {
            id: order.offerKey,
            title: offer.name,
            description: offer.description,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: order.amountCents / 100,
            type: 'digital',
          },
        ],
      },
      requestOptions: { idempotencyKey: `storefront:${order.id}` },
    });

    const checkoutUrl = selectMercadoPagoCheckoutUrl({
      accessToken: requireStorefrontSecret(
        this.configService,
        'MERCADO_PAGO_ACCESS_TOKEN',
      ),
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });
    if (!preference.id || !checkoutUrl) {
      throw new ServiceUnavailableException(
        'O Mercado Pago não retornou a URL de checkout.',
      );
    }

    return {
      checkoutId: preference.id,
      checkoutUrl,
      expiresAt,
      providerStatus: 'open',
    };
  }

  private async handleStripeCheckoutSession(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) return { received: true, handled: false };

    const subscriptionId = stripeObjectId(session.subscription);
    const invoiceId = stripeObjectId(session.invoice);
    const paymentIntentId = stripeObjectId(session.payment_intent);
    let periodEndsAt: Date | null = null;

    if (subscriptionId) {
      const subscription =
        await this.stripeClient().subscriptions.retrieve(subscriptionId);
      periodEndsAt = stripeSubscriptionPeriodEnd(subscription);
    }

    const status =
      session.payment_status === 'paid'
        ? StorefrontPaymentStatus.APPROVED
        : StorefrontPaymentStatus.PENDING;

    await this.fulfillment.applyPaymentUpdate({
      provider: StorefrontPaymentProvider.STRIPE,
      orderId,
      providerPaymentId:
        (invoiceId ? `invoice:${invoiceId}` : null) ??
        paymentIntentId ??
        `checkout:${session.id}`,
      providerEventId: event.id,
      status,
      providerStatus: session.payment_status,
      amountCents: session.amount_total ?? 0,
      currency: session.currency?.toUpperCase() ?? 'BRL',
      paidAt: status === StorefrontPaymentStatus.APPROVED ? new Date() : null,
      periodEndsAt,
      subscriptionId,
      customerId: stripeObjectId(session.customer),
      metadata: { checkoutSessionId: session.id },
    });

    return { received: true, handled: true };
  }

  private async handleStripeInvoice(
    event: Stripe.Event,
    status: StorefrontPaymentStatus,
  ) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionDetails = invoice.parent?.subscription_details;
    const subscriptionId = stripeObjectId(subscriptionDetails?.subscription);
    const orderId =
      asString(subscriptionDetails?.metadata?.orderId) ??
      (subscriptionId
        ? await this.fulfillment.findOrderIdBySubscription(
            StorefrontPaymentProvider.STRIPE,
            subscriptionId,
          )
        : null);
    if (!orderId || !subscriptionId) {
      return { received: true, handled: false };
    }

    const periodEndTimestamp = Math.max(
      0,
      ...invoice.lines.data.map((line) => line.period.end),
    );

    await this.fulfillment.applyPaymentUpdate({
      provider: StorefrontPaymentProvider.STRIPE,
      orderId,
      providerPaymentId: `invoice:${invoice.id}`,
      providerEventId: event.id,
      status,
      providerStatus: invoice.status ?? event.type,
      amountCents:
        status === StorefrontPaymentStatus.APPROVED
          ? invoice.amount_paid
          : invoice.amount_due,
      currency: invoice.currency.toUpperCase(),
      paidAt: asDate(invoice.status_transitions.paid_at),
      periodEndsAt: asDate(periodEndTimestamp),
      subscriptionId,
      customerId: stripeObjectId(invoice.customer),
      metadata: { invoiceId: invoice.id },
    });

    if (status === StorefrontPaymentStatus.FAILED) {
      await this.fulfillment.updateSubscriptionStatus({
        provider: StorefrontPaymentProvider.STRIPE,
        providerSubscriptionId: subscriptionId,
        orderId,
        status: StorefrontSubscriptionStatus.PAST_DUE,
      });
    }

    return { received: true, handled: true };
  }

  private async handleMercadoPagoPayment(
    paymentId: string,
    body: Record<string, unknown> | null,
    requestId?: string | string[] | null,
  ) {
    const payment = await new Payment(this.mercadoPagoClient()).get({
      id: paymentId,
    });
    const orderId = payment.external_reference;
    if (!payment.id || !orderId) {
      return { received: true, handled: false };
    }

    const subscriptionId =
      payment.point_of_interaction?.transaction_data?.subscription_id;
    let periodEndsAt: Date | null = null;
    if (subscriptionId) {
      const subscription = await new PreApproval(this.mercadoPagoClient()).get({
        id: subscriptionId,
      });
      periodEndsAt = asDate(subscription.next_payment_date);
    }

    await this.fulfillment.applyPaymentUpdate({
      provider: StorefrontPaymentProvider.MERCADO_PAGO,
      orderId,
      providerPaymentId: String(payment.id),
      providerEventId:
        (Array.isArray(requestId) ? requestId[0] : requestId) ??
        asString(body?.id),
      status: mercadoPagoStatus(payment.status),
      providerStatus: payment.status ?? 'unknown',
      amountCents: Math.round((payment.transaction_amount ?? 0) * 100),
      currency: payment.currency_id?.toUpperCase() ?? 'BRL',
      paidAt: asDate(payment.date_approved),
      periodEndsAt,
      subscriptionId,
      metadata: {
        statusDetail: payment.status_detail ?? null,
      },
    });

    return { received: true, handled: true };
  }

  private async handleMercadoPagoSubscriptionInvoice(
    invoiceId: string,
    body: Record<string, unknown> | null,
    requestId?: string | string[] | null,
  ) {
    const invoice = await new Invoice(this.mercadoPagoClient()).get({
      id: invoiceId,
    });
    const orderId = invoice.external_reference;
    const subscriptionId = invoice.preapproval_id;
    if (!invoice.id || !orderId || !subscriptionId) {
      return { received: true, handled: false };
    }

    const subscription = await new PreApproval(this.mercadoPagoClient()).get({
      id: subscriptionId,
    });
    const paymentStatus = mercadoPagoStatus(invoice.payment?.status);

    await this.fulfillment.applyPaymentUpdate({
      provider: StorefrontPaymentProvider.MERCADO_PAGO,
      orderId,
      providerPaymentId: invoice.payment?.id
        ? String(invoice.payment.id)
        : `invoice:${invoice.id}`,
      providerEventId:
        (Array.isArray(requestId) ? requestId[0] : requestId) ??
        asString(body?.id),
      status: paymentStatus,
      providerStatus: invoice.payment?.status ?? invoice.status ?? 'unknown',
      amountCents: Math.round((invoice.transaction_amount ?? 0) * 100),
      currency: invoice.currency_id?.toUpperCase() ?? 'BRL',
      paidAt:
        paymentStatus === StorefrontPaymentStatus.APPROVED
          ? (asDate(invoice.last_modified) ?? new Date())
          : null,
      periodEndsAt: asDate(subscription.next_payment_date),
      subscriptionId,
      metadata: {
        invoiceId: invoice.id,
        statusDetail: invoice.payment?.status_detail ?? null,
      },
    });

    return { received: true, handled: true };
  }

  private stripeClient() {
    return new Stripe(
      requireStorefrontSecret(this.configService, 'STRIPE_SECRET_KEY'),
      {
        maxNetworkRetries: 2,
        timeout: 10_000,
      },
    );
  }

  private mercadoPagoClient() {
    return new MercadoPagoConfig({
      accessToken: requireStorefrontSecret(
        this.configService,
        'MERCADO_PAGO_ACCESS_TOKEN',
      ),
      options: {
        timeout: 10_000,
        maxRetries: 2,
        jitter: true,
      },
    });
  }
}

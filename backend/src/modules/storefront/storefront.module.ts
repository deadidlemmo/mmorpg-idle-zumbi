import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontFulfillmentService } from './storefront-fulfillment.service';
import { StorefrontPaymentsService } from './storefront-payments.service';
import { StorefrontService } from './storefront.service';
import { StorefrontWebhookController } from './storefront-webhook.controller';

@Module({
  controllers: [StorefrontController, StorefrontWebhookController],
  providers: [
    StorefrontService,
    StorefrontPaymentsService,
    StorefrontFulfillmentService,
  ],
})
export class StorefrontModule {}

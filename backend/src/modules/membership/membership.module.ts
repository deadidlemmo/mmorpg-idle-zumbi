import { Module } from '@nestjs/common';
import { PremiumEntitlementService } from './premium-entitlement.service';

@Module({
  providers: [PremiumEntitlementService],
  exports: [PremiumEntitlementService],
})
export class MembershipModule {}

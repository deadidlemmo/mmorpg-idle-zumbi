import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CosmeticsAdminController } from './cosmetics-admin.controller';
import { CosmeticsController } from './cosmetics.controller';
import { CosmeticsService } from './cosmetics.service';

@Module({
  imports: [AuthModule],
  controllers: [CosmeticsController, CosmeticsAdminController],
  providers: [CosmeticsService],
  exports: [CosmeticsService],
})
export class CosmeticsModule {}

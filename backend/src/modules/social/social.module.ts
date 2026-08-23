import { Module } from '@nestjs/common';
import { CosmeticsModule } from '../cosmetics/cosmetics.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [CosmeticsModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}

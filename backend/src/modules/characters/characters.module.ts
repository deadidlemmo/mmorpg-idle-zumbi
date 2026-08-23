import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CosmeticsModule } from '../cosmetics/cosmetics.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, CosmeticsModule],
  controllers: [CharactersController],
  providers: [CharactersService],
  exports: [CharactersService],
})
export class CharactersModule {}

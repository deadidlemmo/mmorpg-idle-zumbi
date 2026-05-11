import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConsumablesController } from './consumables.controller';
import { ConsumablesService } from './consumables.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConsumablesController],
  providers: [ConsumablesService],
})
export class ConsumablesModule {}
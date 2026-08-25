import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EquipmentController } from './equipment.controller';
import { EquipmentReinforcementService } from './equipment-reinforcement.service';
import { EquipmentService } from './equipment.service';

@Module({
  imports: [PrismaModule],
  controllers: [EquipmentController],
  providers: [EquipmentService, EquipmentReinforcementService],
  exports: [EquipmentService],
})
export class EquipmentModule {}

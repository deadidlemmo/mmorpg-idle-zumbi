import { Global, Module } from '@nestjs/common';
import { PetBonusesService } from './pet-bonuses.service';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

@Global()
@Module({
  controllers: [PetsController],
  providers: [PetsService, PetBonusesService],
  exports: [PetBonusesService],
})
export class PetsModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecoverDuplicateCocoonsDto } from './dto/recover-duplicate-cocoons.dto';
import { StartPetIncubationDto } from './dto/start-pet-incubation.dto';
import { PetsService } from './pets.service';

@Controller('pets')
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get('characters/:characterId')
  getState(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    return this.petsService.getState(request.user.id, characterId);
  }

  @Post('characters/:characterId/incubations')
  startIncubation(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Body() input: StartPetIncubationDto,
  ) {
    return this.petsService.startIncubation(
      request.user.id,
      characterId,
      input,
    );
  }

  @Post('characters/:characterId/incubations/:characterPetId/claim')
  claimIncubation(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Param('characterPetId') characterPetId: string,
  ) {
    return this.petsService.claimIncubation(
      request.user.id,
      characterId,
      characterPetId,
    );
  }

  @Post('characters/:characterId/collection/:characterPetId/equip')
  equipPet(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Param('characterPetId') characterPetId: string,
  ) {
    return this.petsService.equipPet(
      request.user.id,
      characterId,
      characterPetId,
    );
  }

  @Delete('characters/:characterId/equipment')
  unequipPet(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    return this.petsService.unequipPet(request.user.id, characterId);
  }

  @Post('characters/:characterId/collection/:characterPetId/sell')
  sellPet(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Param('characterPetId') characterPetId: string,
  ) {
    return this.petsService.sellPet(
      request.user.id,
      characterId,
      characterPetId,
    );
  }

  @Post('characters/:characterId/cocoons/duplicates/sell')
  sellDuplicateCocoons(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Body() input: RecoverDuplicateCocoonsDto,
  ) {
    return this.petsService.sellDuplicateCocoons(
      request.user.id,
      characterId,
      input,
    );
  }

  @Post('characters/:characterId/cocoons/duplicates/convert')
  convertDuplicateCocoons(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Body() input: RecoverDuplicateCocoonsDto,
  ) {
    return this.petsService.convertDuplicateCocoons(
      request.user.id,
      characterId,
      input,
    );
  }
}

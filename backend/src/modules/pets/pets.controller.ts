import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
}

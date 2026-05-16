import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCurrentMapDto } from './dto/update-current-map.dto';

@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Post()
  create(@Req() request: any, @Body() createCharacterDto: CreateCharacterDto) {
    return this.charactersService.create(request.user.id, createCharacterDto);
  }

  @Get('me')
  findMine(@Req() request: any) {
    return this.charactersService.findMine(request.user.id);
  }

  @Get(':id/status')
  getStatus(@Req() request: any, @Param('id') id: string) {
    return this.charactersService.getStatus(request.user.id, id);
  }

  @Get(':id/overview')
  getOverview(@Req() request: any, @Param('id') id: string) {
    return this.charactersService.getOverview(request.user.id, id);
  }

  @Patch(':id/current-map')
  updateCurrentMap(
    @Req() request: any,
    @Param('id') id: string,
    @Body() updateCurrentMapDto: UpdateCurrentMapDto,
  ) {
    return this.charactersService.updateCurrentMap(
      request.user.id,
      id,
      updateCurrentMapDto.mapId,
    );
  }

  @Get(':id')
  findOneMine(@Req() request: any, @Param('id') id: string) {
    return this.charactersService.findOneMine(request.user.id, id);
  }

  @Delete(':id')
  deleteMine(@Req() request: any, @Param('id') id: string) {
    return this.charactersService.deleteMine(request.user.id, id);
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
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
import { ClaimIncursionDto } from './dto/claim-incursion.dto';
import { StartIncursionDto } from './dto/start-incursion.dto';
import { IncursionsService } from './incursions.service';

@Controller('incursions')
@UseGuards(JwtAuthGuard)
export class IncursionsController {
  constructor(private readonly incursionsService: IncursionsService) {}

  @Get()
  listAll() {
    return this.incursionsService.listAll();
  }

  @Get(':characterId/available')
  listAvailable(
    @Req() request: any,
    @Param('characterId') characterId: string,
  ) {
    return this.incursionsService.listAvailable(request.user.id, characterId);
  }

  @Get(':characterId/status')
  getStatus(@Req() request: any, @Param('characterId') characterId: string) {
    return this.incursionsService.getStatus(request.user.id, characterId);
  }

  @Post('start')
  start(@Req() request: any, @Body() dto: StartIncursionDto) {
    return this.incursionsService.start(request.user.id, dto);
  }

  @Post('claim')
  claim(@Req() request: any, @Body() dto: ClaimIncursionDto) {
    return this.incursionsService.claim(request.user.id, dto);
  }

  @Post(':characterId/cancel')
  cancel(@Req() request: any, @Param('characterId') characterId: string) {
    return this.incursionsService.cancel(request.user.id, characterId);
  }
}

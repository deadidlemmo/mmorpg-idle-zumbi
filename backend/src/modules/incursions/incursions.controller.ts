/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
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
import { IncursionsGateway } from './incursions.gateway';
import { IncursionsService } from './incursions.service';

@Controller('incursions')
@UseGuards(JwtAuthGuard)
export class IncursionsController {
  constructor(
    private readonly incursionsService: IncursionsService,
    private readonly incursionsGateway: IncursionsGateway,
  ) {}

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
  async getStatus(
    @Req() request: any,
    @Param('characterId') characterId: string,
  ) {
    const status = await this.incursionsService.getStatus(
      request.user.id,
      characterId,
    );

    if (status.rewardedSession) {
      this.incursionsGateway.emitRewarded(characterId, status);
    } else {
      this.incursionsGateway.emitProgress(characterId, status);
    }

    return status;
  }

  @Post('start')
  async start(@Req() request: any, @Body() dto: StartIncursionDto) {
    const response = await this.incursionsService.start(request.user.id, dto);
    this.incursionsGateway.emitStarted(dto.characterId, {
      activeSession: response.session,
      session: response.session,
      message: response.message,
    });
    return response;
  }

  @Post('claim')
  async claim(@Req() request: any, @Body() dto: ClaimIncursionDto) {
    const response = await this.incursionsService.claim(request.user.id, dto);
    this.incursionsGateway.emitRewarded(dto.characterId, {
      activeSession: null,
      session: response.session,
      message: response.message,
      rewards: response.rewards,
      xpGained: response.xpGained,
      goldGained: response.goldGained,
    });
    return response;
  }

  @Post(':characterId/cancel')
  async cancel(@Req() request: any, @Param('characterId') characterId: string) {
    const response = await this.incursionsService.cancel(
      request.user.id,
      characterId,
    );
    this.incursionsGateway.emitCancelled(characterId, {
      activeSession: null,
      session: response.session,
      message: response.message,
    });
    return response;
  }
}

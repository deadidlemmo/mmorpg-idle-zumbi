/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { JoinWorldBossDto } from './dto/join-world-boss.dto';
import { LeaveWorldBossDto } from './dto/leave-world-boss.dto';
import { WorldBossesGateway } from './world-bosses.gateway';
import { WorldBossesService } from './world-bosses.service';

@Controller('world-bosses')
@UseGuards(JwtAuthGuard)
export class WorldBossesController {
  constructor(
    private readonly worldBossesService: WorldBossesService,
    private readonly worldBossesGateway: WorldBossesGateway,
  ) {}

  @Get(':characterId/active')
  async getActive(
    @Req() request: any,
    @Param('characterId') characterId: string,
  ) {
    const status = await this.worldBossesService.getActive(
      request.user.id,
      characterId,
    );
    if (status.event)
      this.worldBossesGateway.emitProgress(status.event.id, status);
    return status;
  }

  @Get(':characterId/status')
  async getStatus(
    @Req() request: any,
    @Param('characterId') characterId: string,
  ) {
    const status = await this.worldBossesService.getStatus(
      request.user.id,
      characterId,
    );
    if (status.event) {
      if (status.event.status === 'DEFEATED')
        this.worldBossesGateway.emitDefeated(status.event.id, status);
      else if (status.event.status === 'EXPIRED')
        this.worldBossesGateway.emitExpired(status.event.id, status);
      else this.worldBossesGateway.emitProgress(status.event.id, status);
      if (status.rewardsGranted?.length)
        this.worldBossesGateway.emitRewarded(status.event.id, status);
    }
    return status;
  }

  @Post('join')
  async join(@Req() request: any, @Body() dto: JoinWorldBossDto) {
    const status = await this.worldBossesService.join(request.user.id, dto);
    this.worldBossesGateway.emitJoined(dto.eventId, status);
    return status;
  }

  @Post('leave')
  async leave(@Req() request: any, @Body() dto: LeaveWorldBossDto) {
    const status = await this.worldBossesService.leave(request.user.id, dto);
    this.worldBossesGateway.emitProgress(dto.eventId, status);
    return status;
  }

  @Get(':eventId/ranking')
  getRanking(@Req() request: any, @Param('eventId') eventId: string) {
    return this.worldBossesService.getRanking(request.user.id, eventId);
  }
}

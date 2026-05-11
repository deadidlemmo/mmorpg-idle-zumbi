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
import { AutoCombatService } from './auto-combat.service';
import { PreviewAutoCombatDto } from './dto/preview-auto-combat.dto';
import { StartAutoCombatDto } from './dto/start-auto-combat.dto';

@Controller('auto-combat')
@UseGuards(JwtAuthGuard)
export class AutoCombatController {
  constructor(private readonly autoCombatService: AutoCombatService) {}

  @Post('start')
  start(@Req() request: any, @Body() startAutoCombatDto: StartAutoCombatDto) {
    return this.autoCombatService.start(request.user.id, startAutoCombatDto);
  }

  @Post('preview')
  preview(
    @Req() request: any,
    @Body() previewAutoCombatDto: PreviewAutoCombatDto,
  ) {
    return this.autoCombatService.preview(
      request.user.id,
      previewAutoCombatDto,
    );
  }

  @Get(':characterId/status')
  getStatus(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.getStatus(request.user.id, characterId);
  }

  @Get(':characterId/recent-events')
  getRecentEvents(
    @Req() request: any,
    @Param('characterId') characterId: string,
  ) {
    return this.autoCombatService.getRecentEvents(request.user.id, characterId);
  }

  @Post(':characterId/stop')
  stop(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.stop(request.user.id, characterId);
  }
}
import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InfirmaryService } from './infirmary.service';

@Controller('infirmary')
@UseGuards(JwtAuthGuard)
export class InfirmaryController {
  constructor(private readonly infirmaryService: InfirmaryService) {}

  @Get(':characterId/status')
  getStatus(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.getStatus(userId, characterId);
  }

  @Post(':characterId/heal')
  heal(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.heal(userId, characterId);
  }

  @Post(':characterId/start')
  startTreatment(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.startTreatment(userId, characterId);
  }

  @Post(':characterId/claim')
  claimTreatment(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.claimTreatment(userId, characterId);
  }

  @Post(':characterId/cancel')
  cancelTreatment(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.cancelTreatment(userId, characterId);
  }

  @Post(':characterId/instant')
  instantTreatment(@Req() req: any, @Param('characterId') characterId: string) {
    const userId = req.user.id ?? req.user.sub;

    return this.infirmaryService.instantTreatment(userId, characterId);
  }
}

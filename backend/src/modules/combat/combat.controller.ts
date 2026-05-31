import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CombatService } from './combat.service';
import { StartCombatDto } from './dto/start-combat.dto';

@Controller('combat')
@UseGuards(JwtAuthGuard)
export class CombatController {
  constructor(private readonly combatService: CombatService) {}

  @Post('start')
  start(@Req() request: any, @Body() startCombatDto: StartCombatDto) {
    return this.combatService.start(request.user.id, startCombatDto);
  }
}

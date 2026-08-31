import {
  Controller,
  Get,
  Header,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TopIdleService } from './top-idle.service';

type AuthenticatedRequest = {
  user?: { id?: string; userId?: string; sub?: string };
};

@Controller('topidle')
@UseGuards(JwtAuthGuard)
export class TopIdleController {
  constructor(private readonly topIdleService: TopIdleService) {}

  @Get('reward')
  @Header('Cache-Control', 'no-store')
  getRewardStatus(@Req() request: AuthenticatedRequest) {
    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }
    return this.topIdleService.getRewardStatus(userId);
  }
}

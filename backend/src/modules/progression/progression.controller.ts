import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateTutorialDto } from './dto/update-tutorial.dto';
import { ProgressionService } from './progression.service';

type AuthenticatedRequest = {
  user: { id: string };
};

@Controller('progression')
@UseGuards(JwtAuthGuard)
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  @Get(':characterId')
  getDashboard(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.progressionService.getDashboard(request.user.id, characterId);
  }

  @Get(':characterId/tutorial')
  getTutorial(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.progressionService.getTutorial(request.user.id, characterId);
  }

  @Patch(':characterId/tutorial')
  updateTutorial(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Body() dto: UpdateTutorialDto,
  ) {
    return this.progressionService.updateTutorial(
      request.user.id,
      characterId,
      dto,
    );
  }

  @Post(':characterId/missions/:missionId/claim')
  claimMission(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Param('missionId') missionId: string,
  ) {
    return this.progressionService.claimMission(
      request.user.id,
      characterId,
      missionId,
    );
  }

  @Post(':characterId/achievements/:achievementId/claim')
  claimAchievement(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Param('achievementId') achievementId: string,
  ) {
    return this.progressionService.claimAchievement(
      request.user.id,
      characterId,
      achievementId,
    );
  }
}

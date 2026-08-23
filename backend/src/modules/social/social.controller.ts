import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { SocialService } from './social.service';

type AuthenticatedRequest = {
  user: { id: string };
};

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('friends')
  list(@Req() request: AuthenticatedRequest) {
    return this.socialService.list(request.user.id);
  }

  @Get('characters/:characterId/profile')
  getCharacterProfile(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.socialService.getPublicCharacterProfile(
      request.user.id,
      characterId,
    );
  }

  @Post('friends/request')
  sendRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.socialService.sendRequest(request.user.id, dto.email);
  }

  @Post('friends/:id/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('id') friendshipId: string,
  ) {
    return this.socialService.accept(request.user.id, friendshipId);
  }

  @Delete('friends/:id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') friendshipId: string,
  ) {
    return this.socialService.remove(request.user.id, friendshipId);
  }
}

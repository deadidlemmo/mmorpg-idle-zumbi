import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchSocialCharactersDto } from './dto/search-social-characters.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { SocialRankingQueryDto } from './dto/social-ranking-query.dto';
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

  @Get('characters/search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  searchCharacters(
    @Req() request: AuthenticatedRequest,
    @Query() query: SearchSocialCharactersDto,
  ) {
    return this.socialService.searchCharacters(request.user.id, query.nickname);
  }

  @Get('rankings')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getRanking(@Query() query: SocialRankingQueryDto) {
    return this.socialService.getRanking(query.category, query.limit);
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sendRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.socialService.sendRequest(
      request.user.id,
      dto.targetCharacterId,
    );
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

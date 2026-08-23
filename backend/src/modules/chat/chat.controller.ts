import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';

type AuthenticatedRequest = {
  user: { id: string };
};

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('general/messages')
  listGeneralMessages(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    return this.chatService.listGeneralMessages(request.user.id, query);
  }
}

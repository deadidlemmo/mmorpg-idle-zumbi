import { IsString, IsUUID, Length } from 'class-validator';
import { CHAT_MESSAGE_MAX_LENGTH } from '../chat.constants';

export class SendChatMessageDto {
  @IsUUID()
  characterId!: string;

  @IsString()
  @Length(1, CHAT_MESSAGE_MAX_LENGTH)
  content!: string;
}

import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserSuspensionDto {
  @IsBoolean()
  suspended: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

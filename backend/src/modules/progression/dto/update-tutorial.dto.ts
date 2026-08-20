import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateTutorialDto {
  @IsInt()
  @Min(0)
  @Max(5)
  step: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsBoolean()
  dismissed?: boolean;
}

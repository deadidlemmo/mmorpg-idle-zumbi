import { IsUUID } from 'class-validator';

export class RevokeCosmeticEntitlementDto {
  @IsUUID()
  entitlementId!: string;
}

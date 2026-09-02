import { IsString, IsUUID, MaxLength } from 'class-validator';

export class PurchaseCosmeticVendorProductDto {
  @IsString()
  @MaxLength(80)
  productId: string;

  @IsUUID('4')
  requestId: string;
}

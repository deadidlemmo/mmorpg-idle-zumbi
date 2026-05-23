import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class VendorBuyDto {
  @IsUUID('4', {
    message: 'O itemId precisa ser um UUID valido.',
  })
  itemId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'A quantidade precisa ser um numero inteiro.',
  })
  @Min(1, {
    message: 'A quantidade precisa ser maior que zero.',
  })
  quantity?: number;
}

export class VendorSellDto {
  @IsUUID('4', {
    message: 'O inventoryItemId precisa ser um UUID valido.',
  })
  inventoryItemId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'A quantidade precisa ser um numero inteiro.',
  })
  @Min(1, {
    message: 'A quantidade precisa ser maior que zero.',
  })
  quantity?: number;
}

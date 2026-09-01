import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  CUSTOM_CASH_MAX_AMOUNT,
  CUSTOM_CASH_MIN_AMOUNT,
  STOREFRONT_OFFER_KEYS,
  STOREFRONT_PROVIDER_KEYS,
  type StorefrontOfferKey,
  type StorefrontProviderKey,
} from '../storefront.config';

export class CreateStorefrontCheckoutDto {
  @IsUUID('4')
  requestId!: string;

  @IsUUID('4')
  characterId!: string;

  @IsIn(STOREFRONT_OFFER_KEYS)
  offerKey!: StorefrontOfferKey;

  @IsIn(STOREFRONT_PROVIDER_KEYS)
  provider!: StorefrontProviderKey;

  @IsOptional()
  @IsInt()
  @Min(CUSTOM_CASH_MIN_AMOUNT)
  @Max(CUSTOM_CASH_MAX_AMOUNT)
  cashAmount?: number;
}

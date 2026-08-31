import { IsIn, IsUUID } from 'class-validator';
import {
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
}

import {
  COSMETIC_VENDOR_COSMETIC_KEYS,
  COSMETIC_VENDOR_PRODUCTS,
} from './cosmetic-vendor.config';

describe('COSMETIC_VENDOR_PRODUCTS', () => {
  it('mantém duas opções de Gold em cada categoria', () => {
    const categories = [
      'avatar',
      'frame',
      'card',
      'overview',
      'effect',
      'identity',
    ] as const;

    for (const category of categories) {
      expect(
        COSMETIC_VENDOR_PRODUCTS.filter(
          (product) => product.category === category,
        ),
      ).toHaveLength(2);
    }
  });

  it('não repete produtos ou cosméticos e exige preços válidos', () => {
    expect(
      new Set(COSMETIC_VENDOR_PRODUCTS.map((product) => product.id)).size,
    ).toBe(COSMETIC_VENDOR_PRODUCTS.length);
    expect(new Set(COSMETIC_VENDOR_COSMETIC_KEYS).size).toBe(
      COSMETIC_VENDOR_COSMETIC_KEYS.length,
    );
    expect(
      COSMETIC_VENDOR_PRODUCTS.every(
        (product) =>
          Number.isSafeInteger(product.goldPrice) && product.goldPrice > 0,
      ),
    ).toBe(true);
  });
});

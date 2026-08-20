// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: [
      'src/main.ts',
      'src/modules/auth/auth.controller.ts',
      'src/modules/auth/dto/login.dto.ts',
      'src/modules/auth/dto/register.dto.ts',
      'src/modules/auto-combat/auto-combat-hunting-processing.spec.ts',
      'src/modules/auto-combat/auto-combat.controller.ts',
      'src/modules/auto-combat/auto-combat.gateway.ts',
      'src/modules/auto-combat/auto-combat.service.ts',
      'src/modules/characters/characters.controller.ts',
      'src/modules/characters/characters.service.ts',
      'src/modules/characters/dto/create-character.dto.ts',
      'src/modules/combat/combat.controller.ts',
      'src/modules/combat/combat.service.ts',
      'src/modules/consumables/consumables.service.ts',
      'src/modules/gathering/gathering.service.ts',
      'src/modules/infirmary/infirmary.controller.ts',
      'src/modules/infirmary/infirmary.service.ts',
      'src/modules/world-bosses/world-bosses.controller.ts',
      'src/modules/world-bosses/world-bosses.gateway.ts',
      'src/modules/world-bosses/world-bosses.service.ts',
      'test/auto-combat-map-isolation.e2e-spec.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);

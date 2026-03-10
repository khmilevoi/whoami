import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginN from "eslint-plugin-n";
import tseslint from "typescript-eslint";

const tsFiles = ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"];
const sharedLanguageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
};

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "data/**/*.sqlite",
      "data/**/*.sqlite-shm",
      "data/**/*.sqlite-wal",
      "dist/**",
      "node_modules/**",
    ],
  },
  {
    files: tsFiles,
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      ...sharedLanguageOptions,
      globals: globals.node,
    },
    plugins: {
      n: eslintPluginN,
    },
    settings: {
      node: {
        tryExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "n/file-extension-in-import": ["error", "always"],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      ...sharedLanguageOptions,
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  eslintConfigPrettier,
);

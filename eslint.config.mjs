import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

const tsFiles = ["src/**/*.ts", "tests/**/*.ts"];
const sharedLanguageOptions = {
  ecmaVersion: 2022,
  sourceType: "commonjs",
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
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/adapters/http/server.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
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
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  eslintConfigPrettier,
);

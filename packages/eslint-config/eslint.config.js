import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// This package ships eslint configs consumed by every other workspace, so it
// deliberately does not reuse ./base.js on itself (no tsconfig project to
// type-check against) and instead uses the plain, non type-aware ruleset.
export default tseslint.config(
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
  prettierConfig,
);

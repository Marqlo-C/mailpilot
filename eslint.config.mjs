import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["extension/**/*.{ts,tsx}"],
    rules: {
      // Chrome Extension views run outside Next.js server rendering and cannot use next/image.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "extension/dist/**",
    "public/downloads/**",
    "coverage/**",
    ".dev-cache/**",
    ".npm-cache/**",
    ".vercel/**",
    ".gemini/**",
    "docs/**",
    "scratch/**",
    "Test HTML/**",
    "Test Outputs/**",
    "Delete/**",
    "scripts/archive/**",
    "scripts/temp-resume-llm-audit.ts",
    "lib/profile/__tests__/temp-resume-llm-audit.test.ts",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;

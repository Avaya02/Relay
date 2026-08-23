import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Next 16 locks a dev server per distDir rather than per port, so running
    // a second instance (to verify a change against a scratch server without
    // touching the one you're working in) needs its own build directory.
    // Without this, linting the repo reports thousands of problems in
    // generated output and buries the handful in your own code.
    ".next-*/**",
  ]),
]);

export default eslintConfig;

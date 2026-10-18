import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Plugins reach the studio only through the SDK (docs/PLUGINS.md → The rules), so a
// plugin keeps working when the studio's insides move. plugins/boundaries.test.ts
// checks the same rules plus relative imports that leave the plugin's folder.
const INTERNALS = {
  group: ["@/studio", "@/studio/*", "@/server", "@/server/*", "@/plugins", "@/plugins/*", "@/app", "@/app/*"],
  message:
    'Plugins import the studio through the SDK: "@/sdk" in browser code, "@/sdk/server" in server code. If the SDK is missing something you need, add it there (see docs/PLUGINS.md).',
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-plugin-react's automatic version detection crashes under ESLint 10.
  { settings: { react: { version: "19.2" } } },
  {
    files: ["plugins/*/**/*.{ts,tsx}"],
    ignores: ["plugins/*/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/sdk/server",
              message: 'Only server code (plugins/<id>/server/*) imports "@/sdk/server".',
            },
          ],
          patterns: [INTERNALS],
        },
      ],
    },
  },
  {
    files: ["plugins/*/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/sdk",
              message:
                'Server code imports "@/sdk/server" ("@/sdk" is the browser side and brings React with it).',
            },
          ],
          patterns: [INTERNALS],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

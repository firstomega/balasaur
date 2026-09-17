import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Platform-generated and rewritten wholesale on every regeneration, the
      // same reason routeTree.gen.ts ships its own eslint-disable. Linting them
      // means the next regeneration turns CI red on code nobody wrote and
      // nobody may edit: previewAuthStorage.ts says "do not edit it directly"
      // in its first line, so a fix applied here is reverted by the platform.
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Accessibility hints. Enabled at "warn" so they guide without blocking (the
      // build doesn't run lint anyway) while existing components catch up.
      ...Object.fromEntries(Object.keys(jsxA11y.configs.recommended.rules).map((r) => [r, "warn"])),
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);

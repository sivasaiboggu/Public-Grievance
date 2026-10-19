import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**", "docs/screenshots/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", { patterns: [
        { group: ["apps/web/**"], importNames: ["*"], message: "Mobile code must not import the web app." },
        { group: ["apps/mobile/**"], importNames: ["*"], message: "Web code must not import the mobile app." }
      ] }]
    }
  },
  {
    files: ["packages/core/**/*.{ts,tsx}", "packages/tokens/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: ["react-dom", "react-native", "expo-*", "next/*"] }] }
  }
);

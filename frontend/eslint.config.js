import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: { ecmaVersion: 2022, sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: true, document: true, console: true,
                 process: true, fetch: true, Blob: true, URL: true,
                 navigator: true, localStorage: true, sessionStorage: true,
                 setTimeout: true, clearTimeout: true, setInterval: true,
                 clearInterval: true, IntersectionObserver: true,
                 matchMedia: true } },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];

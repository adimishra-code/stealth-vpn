const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        process: true, __dirname: true, __filename: true,
        require: true, module: true, exports: true,
        Buffer: true, console: true, setTimeout: true,
        setInterval: true, clearInterval: true, clearTimeout: true,
        URL: true, URLSearchParams: true, fetch: true
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-process-exit": "warn"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { describe: true, it: true, expect: true,
                 beforeAll: true, afterAll: true, beforeEach: true,
                 afterEach: true, vi: true, jest: true }
    }
  }
];

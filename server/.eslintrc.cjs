/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // Enforce clean architecture dependency direction: adapter → usecase → domain
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          {
            target: "./src/domain",
            from: "./src/usecase",
            message: "domain must not depend on usecase",
          },
          {
            target: "./src/domain",
            from: "./src/adapter",
            message: "domain must not depend on adapter",
          },
          {
            target: "./src/usecase",
            from: "./src/adapter",
            message: "usecase must not depend on adapter",
          },
        ],
      },
    ],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  env: {
    node: true,
    es2022: true,
  },
};

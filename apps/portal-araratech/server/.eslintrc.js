module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  root: true,
  ignorePatterns: ["*.js"], // Ignore JavaScript files
  rules: {
    // Add specific rules or overrides here
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-namespace": "off",
    "no-control-regex": "off",
    "no-prototype-builtins": "off",
    "no-case-declarations": "off",
  },
};

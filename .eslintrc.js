module.exports = {
  root: true,
  extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    "@next/next/no-img-element": "off",
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "warn"
  }
};

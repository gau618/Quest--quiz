// .eslintrc.js
module.exports = {
  root: true,
  extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",     // Allow `any`
    "@typescript-eslint/no-unused-vars": "warn",     // Warn, don’t fail
    "@next/next/no-img-element": "off",              // Allow <img> tags
    "react-hooks/exhaustive-deps": "warn",           // Warn instead of error
    "prefer-const": "warn"                           // Optional: Warn unused lets
  }
};

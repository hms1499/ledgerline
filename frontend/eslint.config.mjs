// Flat config for ESLint. Next 16 removed `next lint`, so `eslint` runs
// against this file directly (see package.json "lint").
// next/core-web-vitals carries the react-hooks rules the code's disable
// comments already reference; next/typescript adds the type-aware checks.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// The React Compiler-era hooks rules (purity, set-state-in-effect,
// immutability) assume a screen can derive everything in render. This app
// deliberately assembles its screens from reads of the chain and of this
// browser's own stores, and lands the results in state from effects —
// guarded by per-read tags so a stale answer is never painted (Dashboard's
// "the tag checks" review). That is the pattern these rules push against, so
// they are off here; rules-of-hooks and exhaustive-deps, which do protect
// this code, stay on.
const compilerHooksOff = {
  "react-hooks/purity": "off",
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/immutability": "off",
};

// A destructured `_` or a rest-omitted key is a deliberate placeholder, not
// an unused binding: `const { awaitingReceipt: _, ...seen } = r` says "drop
// this field". Omitting `_` invites a rename churn that the placeholders
// exist to avoid.
const unusedVars = [
  "error",
  {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    destructuredArrayIgnorePattern: "^_",
    ignoreRestSiblings: true,
  },
];

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    rules: { ...compilerHooksOff },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-unused-vars": unusedVars },
  },
  {
    ignores: [".next/**", "next-env.d.ts", "node_modules/**"],
  },
];

export default eslintConfig;
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";

export default [
  {
    ignores: ["dist/", "node_modules/", "src-tauri/target/", "src-tauri/gen/", "coverage/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node 환경에서 실행되는 플레인 JS 도구/설정 파일
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "import-x": importX,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/shared",
              from: "./src/app",
              message: "shared 는 상위 layer 를 import 할 수 없다.",
            },
            {
              target: "./src/shared",
              from: "./src/pages",
              message: "shared 는 상위 layer 를 import 할 수 없다.",
            },
            {
              target: "./src/shared",
              from: "./src/widgets",
              message: "shared 는 상위 layer 를 import 할 수 없다.",
            },
            {
              target: "./src/shared",
              from: "./src/features",
              message: "shared 는 상위 layer 를 import 할 수 없다.",
            },
            {
              target: "./src/shared",
              from: "./src/entities",
              message: "shared 는 상위 layer 를 import 할 수 없다.",
            },
            {
              target: "./src/entities",
              from: "./src/app",
              message: "entities 는 shared 만 import 할 수 있다.",
            },
            {
              target: "./src/entities",
              from: "./src/features",
              message: "entities 는 shared 만 import 할 수 있다.",
            },
            {
              target: "./src/entities",
              from: "./src/widgets",
              message: "entities 는 shared 만 import 할 수 있다.",
            },
            {
              target: "./src/entities",
              from: "./src/pages",
              message: "entities 는 shared 만 import 할 수 있다.",
            },
            {
              target: "./src/features/*/!(index.ts)",
              from: "./src/features",
              message:
                "feature 간 cross-import 금지 — public API(index.ts)만 사용하거나 widgets/ 로 합성한다.",
            },
          ],
        },
      ],
    },
  },
];

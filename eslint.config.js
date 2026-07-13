import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import boundaries from "eslint-plugin-boundaries";

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
  // React Compiler / Rules of React 규칙 (eslint-plugin-react-hooks v6) — src 한정
  ...reactHooks.configs["recommended-latest"].map((c) => ({
    ...c,
    files: ["src/**/*.{ts,tsx}"],
  })),
  // FSD layer 경계 강제 (eslint-plugin-boundaries)
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      // boundaries 가 `@/*` alias·`.ts/.tsx` 를 실제 파일로 해석하려면 resolver 가 필요하다.
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
      "boundaries/include": ["src/**/*"],
      // 테스트는 경계 규칙 대상에서 제외한다.
      "boundaries/ignore": ["**/*.test.{ts,tsx}", "src/test/**/*"],
      // FSD 6 layer. slice 를 갖는 layer 는 폴더명을 slice 로 capture 한다.
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "pages", pattern: "src/pages/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared" },
      ],
    },
    rules: {
      // FSD 경계를 하나의 규칙으로 강제한다 (eslint-plugin-boundaries v7):
      //  · layer 의존 방향(strictly-below)
      //  · 같은 layer 의 다른 slice cross-import 금지 (같은 slice 만 deep 허용)
      //  · 하위 slice 는 public API(index.ts)로만 진입 — deep-import 금지 (shared/app 은 deep 허용)
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            // 같은 slice 내부(자기 자신)는 deep import 허용
            { from: { element: { type: "app" } }, allow: { to: { element: { type: "app" } } } },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "pages" } },
              allow: {
                to: {
                  element: {
                    type: "pages",
                    captured: { slice: "{{ from.element.captured.slice }}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "widgets" } },
              allow: {
                to: {
                  element: {
                    type: "widgets",
                    captured: { slice: "{{ from.element.captured.slice }}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "features" } },
              allow: {
                to: {
                  element: {
                    type: "features",
                    captured: { slice: "{{ from.element.captured.slice }}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "entities" } },
              allow: {
                to: {
                  element: {
                    type: "entities",
                    captured: { slice: "{{ from.element.captured.slice }}" },
                  },
                },
              },
            },
            // 하위 layer 는 public API(index)로만, shared 는 deep 허용
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    type: ["pages", "widgets", "features", "entities"],
                    fileInternalPath: "index.{ts,tsx}",
                  },
                },
              },
            },
            { from: { element: { type: "app" } }, allow: { to: { element: { type: "shared" } } } },
            {
              from: { element: { type: "pages" } },
              allow: {
                to: {
                  element: {
                    type: ["widgets", "features", "entities"],
                    fileInternalPath: "index.{ts,tsx}",
                  },
                },
              },
            },
            {
              from: { element: { type: "pages" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "widgets" } },
              allow: {
                to: {
                  element: {
                    type: ["features", "entities"],
                    fileInternalPath: "index.{ts,tsx}",
                  },
                },
              },
            },
            {
              from: { element: { type: "widgets" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "features" } },
              allow: {
                to: { element: { type: "entities", fileInternalPath: "index.{ts,tsx}" } },
              },
            },
            {
              from: { element: { type: "features" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "entities" } },
              allow: { to: { element: { type: "shared" } } },
            },
          ],
        },
      ],
    },
  },
];

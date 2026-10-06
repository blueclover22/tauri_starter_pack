import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import boundaries from "eslint-plugin-boundaries";

// FSD 경계 정책 (eslint-plugin-boundaries v7) — 운영 코드·테스트 공통.
//  · layer 의존 방향(strictly-below)
//  · 같은 layer 의 다른 slice cross-import 금지 (같은 slice 만 deep 허용, 예외로 entities 간은 index.ts 경유 허용)
//  · 하위 slice 는 public API(index.ts)로만 진입 — deep-import 금지 (shared/app 은 deep 허용)
//  · src/test(test-support) 는 shared·자기 자신만 import
const fsdPolicies = [
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
  // 같은 layer cross-slice 예외 — entities 간은 public API(index)로만 허용 (architecture §7.1)
  {
    from: { element: { type: "entities" } },
    allow: {
      to: { element: { type: "entities", fileInternalPath: "index.{ts,tsx}" } },
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
  {
    from: { element: { type: "test-support" } },
    allow: { to: { element: { type: ["test-support", "shared"] } } },
  },
];

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
  // React Compiler / Rules of React 규칙 (eslint-plugin-react-hooks v7 flat config) — src 한정
  {
    ...reactHooks.configs.flat["recommended-latest"],
    files: ["src/**/*.{ts,tsx}"],
  },
  // 문서 규칙의 기계 강제 — src 한정
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // 처리 안 된 Promise 금지 (type-aware)
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // localStorage / sessionStorage 직접 접근 금지 (coding-rules §3)
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "localStorage 직접 접근 금지 (docs/coding-rules.md)." },
        {
          name: "sessionStorage",
          message: "sessionStorage 직접 접근 금지 (docs/coding-rules.md).",
        },
      ],
      // IPC 는 공통 wrapper(@/shared/lib/tauri/invoke) 경유 (tauri-guide)
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/api/core",
              message: "invoke 는 @/shared/lib/tauri/invoke 의 invokeTauri 를 사용한다.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/lib/tauri/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "src/test/**/*"],
    rules: { "no-restricted-imports": "off" },
  },
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
      // FSD 6 layer + 테스트 지원(src/test). slice 를 갖는 layer 는 폴더명을 slice 로 capture 한다.
      // 테스트 파일(*.test.*)은 자신이 위치한 slice element 로 분류되어 운영 코드와 같은 정책을 받는다.
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "pages", pattern: "src/pages/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared" },
        { type: "test-support", pattern: "src/test" },
      ],
    },
    rules: {
      "boundaries/dependencies": ["error", { default: "disallow", policies: fsdPolicies }],
    },
  },
  // 테스트 파일만 src/test(mock·setup) import 허용 — 운영 코드는 금지
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [...fsdPolicies, { allow: { to: { element: { type: "test-support" } } } }],
        },
      ],
    },
  },
];

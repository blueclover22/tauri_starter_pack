import path from "node:path";

// `@` → src 런타임 alias 의 단일 소스. vite.config.ts / vitest.config.ts 가 공유한다.
// __dirname 기준이라 이 파일은 프로젝트 루트에 있어야 한다(하위로 옮기면 srcDir 가 어긋남).
const srcDir = path.resolve(__dirname, "./src");

export const alias = { "@": srcDir };

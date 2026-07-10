import path from "node:path";

// `@` → src 런타임 alias 의 단일 소스. vite.config.ts / vitest.config.ts 가 공유한다.
const srcDir = path.resolve(__dirname, "./src");

export const alias = { "@": srcDir };

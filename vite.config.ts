import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { alias } from "./vite.shared";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // React Compiler(자동 메모이제이션): plugin-react 6은 Babel-free(Oxc)라
  // 컴파일러 Babel 패스를 @rolldown/plugin-babel 로 react() "앞에" 둔다.
  plugins: [babel({ presets: [reactCompilerPreset()] }), react(), tailwindcss()],
  resolve: { alias },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});

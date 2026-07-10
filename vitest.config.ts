import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { alias } from "./vite.shared";

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

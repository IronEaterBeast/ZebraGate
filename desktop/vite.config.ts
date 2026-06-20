/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true
  },
  test: {
    // 测试前初始化 i18n，确保组件渲染走真实的中文文案（与运行时一致）。
    setupFiles: ["./src/test-setup.ts"]
  }
});

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // import-temp คือโค้ดอ้างอิงจากแอป Electron เดิม ไม่ใช่ส่วนหนึ่งของโปรเจกต์จริง (ดู tsconfig.json exclude)
    exclude: ["**/node_modules/**", "**/import-temp/**"],
  },
})

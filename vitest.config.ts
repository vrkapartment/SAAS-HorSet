import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // ให้เทสต์ import ด้วย path เดียวกับที่แอปใช้ ("@/features/...") ไม่ใช่ path แบบ relative
      // เพราะ path แบบ relative จะเน่าทันทีที่ย้ายไฟล์เทสต์ และอ่านแล้วไม่ตรงกับโค้ดจริง
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // import-temp คือโค้ดอ้างอิงจากแอป Electron เดิม ไม่ใช่ส่วนหนึ่งของโปรเจกต์จริง (ดู tsconfig.json exclude)
    exclude: ["**/node_modules/**", "**/import-temp/**"],
  },
})

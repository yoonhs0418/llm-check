import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  // 빌드 산출물만 실행 파일이 되므로 shebang은 소스가 아니라 번들에 붙인다.
  banner: { js: "#!/usr/bin/env node" },
});

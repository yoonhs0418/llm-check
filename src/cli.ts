import { parseArgs } from "node:util";

import { readPackageVersion } from "./commands/version.js";
import { renderHelp } from "./core/help.js";

/**
 * 버전의 단일 출처는 package.json이다.
 * src/cli.ts와 번들 결과 dist/cli.js가 모두 패키지 루트의 한 단계 아래에 있어,
 * 이 상대 경로는 소스 실행과 빌드 산출물 실행에서 똑같이 유효하다.
 */
const packageJsonUrl = new URL("../package.json", import.meta.url);

function fail(message: string): never {
  console.error(`llm-check: ${message}`);
  console.error("");
  console.error(renderHelp());
  process.exit(1);
}

function parseCliArgs(): { help: boolean; version: boolean } {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
      allowPositionals: false,
      strict: true,
    });
    return { help: values.help, version: values.version };
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : "인자를 해석할 수 없습니다.");
  }
}

const args = parseCliArgs();

if (args.version && !args.help) {
  console.log(await readPackageVersion(packageJsonUrl));
} else {
  // 인자가 없을 때도 도움말을 보여준다(아직 기본 동작이 없는 단계이므로).
  console.log(renderHelp());
}

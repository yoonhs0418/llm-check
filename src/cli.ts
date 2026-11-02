import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";

import { runValidate } from "./commands/validate.js";
import type { ValidateIo } from "./commands/validate.js";
import { readPackageVersion } from "./commands/version.js";
import { renderHelp } from "./core/help.js";

/**
 * 버전의 단일 출처는 package.json이다.
 * src/cli.ts와 번들 결과 dist/cli.js가 모두 패키지 루트의 한 단계 아래에 있어,
 * 이 상대 경로는 소스 실행과 빌드 산출물 실행에서 똑같이 유효하다.
 */
const packageJsonUrl = new URL("../package.json", import.meta.url);

/** 실제 파일 시스템·표준 입력에 연결한 io. 명령 로직(src/commands)은 이 인터페이스만 본다. */
const nodeIo: ValidateIo = {
  readFile: (path) => readFile(path, "utf8"),
  readStdin: () => text(process.stdin),
};

/** 전역 인자(--help / --version) 해석. 실패하면 오류 메시지 문자열을 돌려준다. */
function parseGlobalArgs(args: readonly string[]): { help: boolean; version: boolean } | string {
  try {
    const { values } = parseArgs({
      args: [...args],
      options: {
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
      allowPositionals: false,
      strict: true,
    });
    return { help: values.help, version: values.version };
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "인자를 해석할 수 없습니다.";
  }
}

const argv = process.argv.slice(2);

// process.exit()를 쓰지 않고 exitCode만 설정한다.
// 파이프로 출력할 때 exit()가 쓰기 중인 stdout을 잘라먹을 수 있다.
if (argv[0] === "validate") {
  const result = await runValidate(argv.slice(1), nodeIo);
  if (result.stdout !== "") {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== "") {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
} else {
  const parsed = parseGlobalArgs(argv);

  if (typeof parsed === "string") {
    process.stderr.write(`llm-check: ${parsed}\n\n${renderHelp()}\n`);
    process.exitCode = 2;
  } else if (parsed.version && !parsed.help) {
    process.stdout.write(`${await readPackageVersion(packageJsonUrl)}\n`);
  } else {
    // 인자가 없을 때도 도움말을 보여준다.
    process.stdout.write(`${renderHelp()}\n`);
  }
}

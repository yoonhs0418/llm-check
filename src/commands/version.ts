import { readFile } from "node:fs/promises";

import { parsePackageVersion } from "../core/version.js";

/**
 * package.json을 읽어 version을 돌려준다(파일 I/O 담당).
 *
 * 경로를 인자로 받는 이유: 호출자가 실행 위치에 맞는 경로를 계산하게 두면
 * 이 함수는 테스트에서 임의의 파일로도 검증할 수 있다.
 */
export async function readPackageVersion(packageJsonUrl: URL): Promise<string> {
  const raw = await readFile(packageJsonUrl, "utf8");
  return parsePackageVersion(raw);
}

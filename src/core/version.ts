/**
 * package.json 텍스트에서 version 문자열만 꺼내는 순수 함수.
 *
 * 파일 접근을 하지 않으므로 Node 환경과 무관하게 단독으로 테스트할 수 있다.
 * JSON.parse 결과는 unknown으로 받아 좁혀 쓴다(any를 쓰지 않기 위함).
 */
export function parsePackageVersion(json: string): string {
  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) {
    throw new Error("package.json에 version 필드가 없습니다.");
  }

  const { version } = parsed;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json의 version 필드가 문자열이 아닙니다.");
  }

  return version;
}

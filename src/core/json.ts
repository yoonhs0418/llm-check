/**
 * JSON 값을 다룰 때 반복되는 좁히기(narrowing)와 JSON Pointer 조립을 모아 둔 내부 헬퍼.
 *
 * 왜 직접 만드는가: `Array.isArray(value)`는 unknown을 `any[]`로 좁혀서 그 뒤 코드가 전부
 * any로 번진다. 타입 서술(type predicate)로 감싸 unknown 상태를 유지한다.
 */

/** JSON 객체(배열·null 제외). */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON 배열. 요소 타입은 unknown으로 유지한다. */
export function isJsonArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * JSON Pointer(RFC 6901)에 토큰 하나를 덧붙인다. 루트는 빈 문자열("")이다.
 *
 * 키에 '/'나 '~'가 들어 있으면 경로가 깨지므로 각각 '~1'과 '~0'으로 이스케이프한다.
 * ('~'를 먼저 바꿔야 한다. 순서를 바꾸면 '~1'이 다시 이스케이프되어 망가진다.)
 */
export function appendPointer(base: string, token: string | number): string {
  const escaped = typeof token === "number" ? String(token) : token.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${base}/${escaped}`;
}

/** 오류 메시지에 넣을 짧은 표현. 객체·배열은 내용을 늘어놓지 않는다. */
export function describeValue(value: unknown): string {
  if (isJsonArray(value)) {
    return "배열";
  }
  if (isJsonObject(value)) {
    return "객체";
  }
  if (value === undefined) {
    return "없음";
  }
  return JSON.stringify(value);
}

/**
 * LLM 응답 텍스트에서 첫 번째 JSON 블록을 꺼내는 순수 함수.
 *
 * 배경: "JSON만 달라"고 지시해도 모델은 코드펜스나 설명 문장을 섞어 반환한다.
 * 그래서 응답 전체를 JSON.parse하면 통째로 실패한다.
 *
 * 이 모듈은 파일·네트워크·프로세스에 접근하지 않는다(테스트에 입력 문자열만 필요하다).
 */

/** 추출 성공. end는 닫는 괄호 **다음** 인덱스이므로 text.slice(start, end)가 잘라낸 블록이다. */
export interface ExtractSuccess {
  readonly ok: true;
  readonly value: unknown;
  readonly start: number;
  readonly end: number;
  /** whole: 입력 전체가 JSON이었다 / scan: 괄호 짝을 찾아 잘라냈다 */
  readonly strategy: "whole" | "scan";
}

/**
 * 추출 실패.
 * - no-json: 여는 괄호가 아예 없다
 * - unbalanced: 여는 괄호는 있는데 짝이 맞지 않고 끝났다
 * - parse-error: 잘라내긴 했는데 JSON.parse가 실패했다
 *
 * start는 no-json일 때 의미가 없으므로 아예 키를 넣지 않는다(exactOptionalPropertyTypes).
 */
export interface ExtractFailure {
  readonly ok: false;
  readonly reason: "no-json" | "unbalanced" | "parse-error";
  readonly message: string;
  readonly start?: number;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

type ParseOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

function tryParse(raw: string): ParseOutcome {
  try {
    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : "JSON.parse가 실패했습니다." };
  }
}

/** 첫 번째 '{' 또는 '['의 위치. 없으면 -1. */
function findFirstOpener(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{" || char === "[") {
      return i;
    }
  }
  return -1;
}

/**
 * start의 여는 괄호와 짝이 맞는 닫는 괄호 다음 인덱스. 짝을 못 찾으면 -1.
 *
 * 정규식을 쓰지 않는 이유: 중첩 깊이와 "문자열 안의 괄호"를 정규식으로는 구분할 수 없다.
 * 대신 (a) 괄호 스택, (b) 문자열 내부 여부, (c) 백슬래시 이스케이프 세 가지 상태만 들고 한 번 훑는다.
 */
function findBlockEnd(text: string, start: number): number {
  const expectedClosers: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === undefined) {
      break;
    }

    if (inString) {
      if (escaped) {
        // \" 와 \ 처리: 이스케이프된 한 글자는 무조건 문자열의 내용이다.
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      expectedClosers.push("}");
      continue;
    }
    if (char === "[") {
      expectedClosers.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (expectedClosers.pop() !== char) {
        // '{ ]' 처럼 종류가 어긋난 경우도 짝이 맞지 않는 것으로 본다.
        return -1;
      }
      if (expectedClosers.length === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}

/**
 * text에서 JSON 값을 꺼낸다.
 *
 * 1) 입력 전체가 JSON이면 그대로 반환한다(strategy "whole").
 * 2) 아니면 첫 번째 여는 괄호부터 짝이 맞는 닫는 괄호까지를 잘라 파싱한다(strategy "scan").
 *
 * 블록은 **첫 번째 하나만** 찾고, 깨진 JSON을 고치려 하지 않는다.
 * 반환된 value는 unknown이다. 모양 검증은 호출자(또는 다음 단계의 검증기)가 한다.
 */
export function extractJson(text: string): ExtractResult {
  const whole = tryParse(text);
  if (whole.ok) {
    return { ok: true, value: whole.value, start: 0, end: text.length, strategy: "whole" };
  }

  const start = findFirstOpener(text);
  if (start === -1) {
    return { ok: false, reason: "no-json", message: "여는 괄호('{' 또는 '[')를 찾지 못했습니다." };
  }

  const end = findBlockEnd(text, start);
  if (end === -1) {
    return {
      ok: false,
      reason: "unbalanced",
      message: `${String(start)}번째 문자에서 시작한 괄호의 짝을 찾지 못했습니다.`,
      start,
    };
  }

  const block = tryParse(text.slice(start, end));
  if (!block.ok) {
    return {
      ok: false,
      reason: "parse-error",
      message: `JSON 블록을 잘라냈지만 파싱에 실패했습니다: ${block.message}`,
      start,
    };
  }

  return { ok: true, value: block.value, start, end, strategy: "scan" };
}

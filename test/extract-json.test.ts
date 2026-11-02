import { describe, expect, it } from "vitest";

import type { ExtractFailure, ExtractResult, ExtractSuccess } from "../src/core/extract-json.js";
import { extractJson } from "../src/core/extract-json.js";

/** 성공을 기대하는 자리에서 타입을 좁히기 위한 헬퍼(실패하면 테스트가 바로 깨진다). */
function expectSuccess(result: ExtractResult): ExtractSuccess {
  if (!result.ok) {
    throw new Error(`성공을 기대했지만 실패했습니다: ${result.reason} / ${result.message}`);
  }
  return result;
}

function expectFailure(result: ExtractResult): ExtractFailure {
  if (result.ok) {
    throw new Error("실패를 기대했지만 성공했습니다.");
  }
  return result;
}

describe("extractJson", () => {
  it("응답 전체가 JSON 객체면 strategy가 whole이고 원문 전체를 가리킨다", () => {
    const text = '{"score": 3, "ok": true}';

    const result = expectSuccess(extractJson(text));

    expect(result.strategy).toBe("whole");
    expect(result.value).toEqual({ score: 3, ok: true });
    expect(result.start).toBe(0);
    expect(result.end).toBe(text.length);
  });

  it("응답 전체가 JSON 배열이면 strategy가 whole이다", () => {
    const text = '[1, "둘", {"셋": 3}]';

    const result = expectSuccess(extractJson(text));

    expect(result.strategy).toBe("whole");
    expect(result.value).toEqual([1, "둘", { 셋: 3 }]);
    expect(result.end).toBe(text.length);
  });

  it("앞뒤에 설명 문장이 붙어 있으면 JSON 블록만 잘라내고 strategy가 scan이 된다", () => {
    const text = '다음은 결과입니다: {"score": 5} 이상입니다.';

    const result = expectSuccess(extractJson(text));

    expect(result.strategy).toBe("scan");
    expect(result.value).toEqual({ score: 5 });
    expect(text.slice(result.start, result.end)).toBe('{"score": 5}');
  });

  it("```json 코드펜스로 감싼 응답도 특별 처리 없이 그대로 꺼낸다", () => {
    const text = '좋아요!\n```json\n{"items": [1, 2]}\n```\n끝.';

    const result = expectSuccess(extractJson(text));

    expect(result.strategy).toBe("scan");
    expect(result.value).toEqual({ items: [1, 2] });
    expect(text.slice(result.start, result.end)).toBe('{"items": [1, 2]}');
  });

  it("문자열 값 안의 중괄호와 대괄호는 괄호 짝 계산에서 제외한다", () => {
    const text = '{"feedback": "괄호 {가 들어간} 문장과 [대괄호]도 있다", "score": 3}';

    const result = expectSuccess(extractJson(text));

    expect(result.value).toEqual({
      feedback: "괄호 {가 들어간} 문장과 [대괄호]도 있다",
      score: 3,
    });
  });

  it("문자열 안에 짝 없는 여는 괄호만 있어도 블록 끝을 올바르게 찾는다", () => {
    // 단순 카운팅이라면 이 '{' 때문에 깊이가 남아 unbalanced로 끝난다.
    const text = '설명: {"note": "여는 괄호 { 만 있는 문장"} 끝';

    const result = expectSuccess(extractJson(text));

    expect(result.value).toEqual({ note: "여는 괄호 { 만 있는 문장" });
    expect(text.slice(result.start, result.end)).toBe('{"note": "여는 괄호 { 만 있는 문장"}');
  });

  it("문자열 안의 이스케이프된 따옴표와 역슬래시를 문자열 종료로 착각하지 않는다", () => {
    // 픽스처를 손으로 escape하지 않고 JSON.stringify로 만든다(따옴표와 역슬래시가 실제로 이스케이프된 텍스트가 된다).
    const payload = {
      quote: '그는 "안녕"이라고 했다',
      path: "C:\\dev\\llm-check",
      trailing: "값이 역슬래시로 끝난다 \\",
    };
    const block = JSON.stringify(payload);
    const text = `응답입니다: ${block} 이상.`;

    const result = expectSuccess(extractJson(text));

    expect(result.value).toEqual(payload);
    expect(text.slice(result.start, result.end)).toBe(block);
  });

  it("중첩된 객체와 배열의 끝까지 올바르게 잘라낸다", () => {
    const text = '앞말 {"a": {"b": [1, {"c": [2, 3]}]}, "d": []} 뒷말';

    const result = expectSuccess(extractJson(text));

    expect(result.value).toEqual({ a: { b: [1, { c: [2, 3] }] }, d: [] });
    expect(text.slice(result.start, result.end)).toBe('{"a": {"b": [1, {"c": [2, 3]}]}, "d": []}');
  });

  it("JSON 블록이 두 개면 첫 번째 블록만 반환한다", () => {
    const text = '첫째 {"n": 1} 둘째 {"n": 2}';

    const result = expectSuccess(extractJson(text));

    expect(result.value).toEqual({ n: 1 });
    expect(text.slice(result.start, result.end)).toBe('{"n": 1}');
  });

  it("여는 괄호가 아예 없으면 no-json을 반환한다", () => {
    const result = expectFailure(extractJson("죄송하지만 JSON을 만들 수 없습니다."));

    expect(result.reason).toBe("no-json");
    // no-json에는 위치 정보가 없으므로 start 키 자체가 없다.
    expect(result.start).toBeUndefined();
    expect("start" in result).toBe(false);
  });

  it("괄호가 닫히지 않고 끝나면 unbalanced를 반환하고 시작 위치를 알려준다", () => {
    const text = '결과: {"score": 3, "items": [1, 2';

    const result = expectFailure(extractJson(text));

    expect(result.reason).toBe("unbalanced");
    expect(result.start).toBe(text.indexOf("{"));
  });

  it("괄호 짝은 맞지만 JSON 문법이 틀리면 parse-error를 반환한다", () => {
    const text = '결과: {"score": 3,}';

    const result = expectFailure(extractJson(text));

    expect(result.reason).toBe("parse-error");
    expect(result.start).toBe(text.indexOf("{"));
  });

  it("한글이 섞인 응답에서도 start/end가 원문 slice와 정확히 일치한다", () => {
    const block = '{"이름": "윤현석", "점수": 42}';
    const text = `안녕하세요. 결과는 다음과 같습니다:\n${block}\n확인 부탁드립니다.`;

    const result = expectSuccess(extractJson(text));

    expect(text.slice(result.start, result.end)).toBe(block);
    expect(result.value).toEqual({ 이름: "윤현석", 점수: 42 });
    expect(result.start).toBe(text.indexOf("{"));
    expect(result.end).toBe(text.indexOf("}") + 1);
  });
});

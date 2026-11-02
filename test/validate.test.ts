import { describe, expect, it } from "vitest";

import type { Schema } from "../src/core/schema.js";
import { parseSchema } from "../src/core/schema.js";
import type { ValidationError, ValidationResult } from "../src/core/validate.js";
import { validate } from "../src/core/validate.js";

function toSchema(input: unknown): Schema {
  const result = parseSchema(input);
  if (!result.ok) {
    throw new Error(`테스트 스키마가 잘못됐습니다: ${result.errors.map((e) => `${e.path} ${e.message}`).join(" / ")}`);
  }
  return result.schema;
}

function expectErrors(result: ValidationResult): readonly ValidationError[] {
  if (result.ok) {
    throw new Error("오류를 기대했지만 통과했습니다.");
  }
  return result.errors;
}

/** Job Crush의 분석 결과와 비슷한 모양: 점수 0~100 정수, 피드백 길이 상한, 키워드 배열 개수 상한. */
const analysisSchema = toSchema({
  type: "object",
  additionalProperties: false,
  required: ["score", "feedback", "keywords"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    feedback: { type: "string", maxLength: 200 },
    keywords: { type: "array", maxItems: 5, items: { type: "string", minLength: 1 } },
    level: { type: "string", enum: ["low", "mid", "high"] },
  },
});

const validAnalysis = {
  score: 82,
  feedback: "성과를 수치로 표현하면 더 설득력이 있습니다.",
  keywords: ["성장", "협업"],
  level: "mid",
};

describe("validate", () => {
  it("스키마를 만족하는 값은 통과한다", () => {
    expect(validate(validAnalysis, analysisSchema)).toEqual({ ok: true });
  });

  it("score가 132면 maximum 오류를 그 위치에 보고한다", () => {
    const errors = expectErrors(validate({ ...validAnalysis, score: 132 }, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/score");
    expect(errors[0]?.keyword).toBe("maximum");
    expect(errors[0]?.message).toContain("최대값 100");
  });

  it('score가 문자열 "80"이면 숫자로 바꿔주지 않고 type 오류를 낸다', () => {
    const errors = expectErrors(validate({ ...validAnalysis, score: "80" }, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/score");
    expect(errors[0]?.keyword).toBe("type");
    expect(errors[0]?.message).toContain("string");
  });

  it("integer 자리에 80.5가 오면 type 오류를 낸다", () => {
    const errors = expectErrors(validate({ ...validAnalysis, score: 80.5 }, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/score");
    expect(errors[0]?.keyword).toBe("type");
    expect(errors[0]?.message).toContain("정수");
  });

  it("필수 필드가 없으면 그 필드 경로에 required 오류를 낸다", () => {
    const withoutFeedback = {
      score: validAnalysis.score,
      keywords: validAnalysis.keywords,
      level: validAnalysis.level,
    };

    const errors = expectErrors(validate(withoutFeedback, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/feedback");
    expect(errors[0]?.keyword).toBe("required");
    expect(errors[0]?.message).toContain("feedback");
  });

  it("additionalProperties가 false인데 모르는 필드가 있으면 그 필드를 지적한다", () => {
    const errors = expectErrors(validate({ ...validAnalysis, debugInfo: "내부용" }, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/debugInfo");
    expect(errors[0]?.keyword).toBe("additionalProperties");
    expect(errors[0]?.message).toContain("debugInfo");
  });

  it("배열의 세 번째 요소만 틀리면 경로가 /keywords/2가 된다", () => {
    const errors = expectErrors(
      validate({ ...validAnalysis, keywords: ["성장", "협업", ""] }, analysisSchema),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/keywords/2");
    expect(errors[0]?.keyword).toBe("minLength");
  });

  it("배열 요소의 타입이 틀려도 경로로 어느 요소인지 알 수 있다", () => {
    const errors = expectErrors(
      validate({ ...validAnalysis, keywords: ["성장", 42] }, analysisSchema),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/keywords/1");
    expect(errors[0]?.keyword).toBe("type");
  });

  it("enum에 없는 값이면 enum 오류를 낸다", () => {
    const errors = expectErrors(validate({ ...validAnalysis, level: "최상" }, analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/level");
    expect(errors[0]?.keyword).toBe("enum");
  });

  it("오류가 여러 개면 첫 오류에서 멈추지 않고 모두 반환한다", () => {
    const errors = expectErrors(
      validate(
        {
          score: 132,
          feedback: "짧은 피드백",
          keywords: ["1", "2", "3", "4", "5", "6"],
          debugInfo: true,
        },
        analysisSchema,
      ),
    );

    expect(errors.map((error) => [error.path, error.keyword])).toEqual([
      ["/debugInfo", "additionalProperties"],
      ["/score", "maximum"],
      ["/keywords", "maxItems"],
    ]);
  });

  it("루트 값의 타입이 틀리면 경로가 빈 문자열이다", () => {
    const errors = expectErrors(validate([1, 2, 3], analysisSchema));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("");
    expect(errors[0]?.keyword).toBe("type");
    expect(errors[0]?.message).toContain("object");
  });

  it("필드 이름에 /가 들어 있으면 JSON Pointer 규칙대로 ~1로 이스케이프한다", () => {
    const schema = toSchema({ type: "object", properties: { "a/b": { type: "number" } } });

    const errors = expectErrors(validate({ "a/b": "숫자가 아님" }, schema));

    expect(errors[0]?.path).toBe("/a~1b");
  });
});

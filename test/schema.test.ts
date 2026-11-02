import { describe, expect, it } from "vitest";

import type { ParseSchemaResult, Schema, SchemaError } from "../src/core/schema.js";
import { parseSchema } from "../src/core/schema.js";

function expectSchema(result: ParseSchemaResult): Schema {
  if (!result.ok) {
    throw new Error(`정상 스키마를 기대했지만 거절됐습니다: ${result.errors.map((e) => e.path).join(", ")}`);
  }
  return result.schema;
}

function expectErrors(result: ParseSchemaResult): readonly SchemaError[] {
  if (result.ok) {
    throw new Error("거절을 기대했지만 통과했습니다.");
  }
  return result.errors;
}

function pathsOf(errors: readonly SchemaError[]): readonly string[] {
  return errors.map((error) => error.path);
}

describe("parseSchema", () => {
  it("지원하는 키워드만 쓴 스키마는 Schema로 변환된다", () => {
    const schema = expectSchema(
      parseSchema({
        type: "object",
        additionalProperties: false,
        required: ["score", "feedback"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          feedback: { type: "string", minLength: 1, maxLength: 200 },
          keywords: { type: "array", maxItems: 5, items: { type: "string" } },
          level: { type: "string", enum: ["low", "high"] },
        },
      }),
    );

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["score", "feedback"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.["score"]).toEqual({ type: "integer", minimum: 0, maximum: 100 });
    expect(schema.properties?.["keywords"]?.items).toEqual({ type: "string" });
    expect(schema.properties?.["level"]?.enum).toEqual(["low", "high"]);
  });

  it("$ref처럼 지원하지 않는 키워드가 있으면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "object", $ref: "#/definitions/analysis" }));

    expect(pathsOf(errors)).toEqual(["/$ref"]);
    expect(errors[0]?.message).toContain("지원하지 않는 키워드");
  });

  it("pattern·format·oneOf처럼 미지원 키워드가 여러 개면 전부 보고한다", () => {
    const errors = expectErrors(
      parseSchema({ type: "string", pattern: "^a", format: "email", oneOf: [{ type: "string" }] }),
    );

    expect(pathsOf(errors)).toEqual(["/pattern", "/format", "/oneOf"]);
  });

  it("type 값이 지원 목록에 없으면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "str" }));

    expect(pathsOf(errors)).toEqual(["/type"]);
    expect(errors[0]?.message).toContain("지원하지 않는 type");
  });

  it("type이 아예 없으면 거절한다", () => {
    const errors = expectErrors(parseSchema({ properties: { score: { type: "integer" } } }));

    expect(pathsOf(errors)).toEqual(["/type"]);
  });

  it("스키마가 객체가 아니면 거절한다", () => {
    const errors = expectErrors(parseSchema("문자열은 스키마가 아니다"));

    expect(pathsOf(errors)).toEqual([""]);
  });

  it("required가 배열이 아니면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "object", required: "score" }));

    expect(pathsOf(errors)).toEqual(["/required"]);
    expect(errors[0]?.message).toContain("문자열 배열");
  });

  it("required 요소가 문자열이 아니면 그 요소의 위치를 알려준다", () => {
    const errors = expectErrors(parseSchema({ type: "object", required: ["score", 1] }));

    expect(pathsOf(errors)).toEqual(["/required/1"]);
  });

  it("중첩된 properties 안의 잘못된 스키마도 경로와 함께 잡아낸다", () => {
    const errors = expectErrors(
      parseSchema({
        type: "object",
        properties: {
          detail: {
            type: "object",
            properties: {
              score: { type: "num" },
            },
          },
        },
      }),
    );

    expect(pathsOf(errors)).toEqual(["/properties/detail/properties/score/type"]);
  });

  it("additionalProperties는 false만 지원한다", () => {
    const errors = expectErrors(parseSchema({ type: "object", additionalProperties: true }));

    expect(pathsOf(errors)).toEqual(["/additionalProperties"]);
  });

  it("items에 배열(튜플 형태)을 주면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "array", items: [{ type: "string" }] }));

    expect(pathsOf(errors)).toEqual(["/items"]);
    expect(errors[0]?.message).toContain("하나만");
  });

  it("선언한 type에서 의미가 없는 키워드는 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "number", minLength: 3 }));

    expect(pathsOf(errors)).toEqual(["/minLength"]);
    expect(errors[0]?.message).toContain("number");
  });

  it("길이·개수 키워드에 음수나 소수를 주면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "string", maxLength: -1, minLength: 1.5 }));

    expect(pathsOf(errors)).toEqual(["/minLength", "/maxLength"]);
  });

  it("enum 요소에 객체가 있으면 거절한다", () => {
    const errors = expectErrors(parseSchema({ type: "object", enum: [{ a: 1 }] }));

    expect(pathsOf(errors)).toEqual(["/enum/0"]);
  });

  it("잘못된 곳이 여러 군데면 첫 오류에서 멈추지 않고 모두 반환한다", () => {
    const errors = expectErrors(
      parseSchema({ type: "object", $ref: "x", required: "nope", additionalProperties: true }),
    );

    expect(pathsOf(errors)).toEqual(["/$ref", "/required", "/additionalProperties"]);
  });
});

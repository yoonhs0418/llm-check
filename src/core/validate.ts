/**
 * parseSchema를 통과한 Schema로 값(unknown)을 검사하는 순수 함수.
 *
 * 규칙:
 * - 첫 오류에서 멈추지 않고 **전부** 모은다(한 번 돌려서 고칠 곳을 다 보는 게 목적이다).
 * - 타입을 강제 변환하지 않는다. "80"은 숫자가 아니라 문자열이다.
 * - 위치는 JSON Pointer(RFC 6901)로 알려준다. 루트는 빈 문자열("")이다.
 */

import { appendPointer, describeValue, isJsonArray, isJsonObject } from "./json.js";
import type { Schema, SchemaType } from "./schema.js";

export type ValidationKeyword =
  | "type"
  | "enum"
  | "required"
  | "additionalProperties"
  | "minimum"
  | "maximum"
  | "minLength"
  | "maxLength"
  | "minItems"
  | "maxItems";

export interface ValidationError {
  /** 원본 값 안의 위치(JSON Pointer). 예: "/scores/2", "/feedback", 루트는 "" */
  readonly path: string;
  readonly keyword: ValidationKeyword;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/** 실제 값의 JSON 타입 이름. 메시지에만 쓴다. */
function jsonTypeNameOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (isJsonArray(value)) {
    return "array";
  }
  if (isJsonObject(value)) {
    return "object";
  }
  return typeof value;
}

/** 타입이 맞으면 undefined, 틀리면 오류 메시지. */
function checkType(value: unknown, expected: SchemaType): string | undefined {
  if (expected === "integer") {
    if (typeof value !== "number") {
      return `타입이 ${jsonTypeNameOf(value)}입니다. integer여야 합니다 (값: ${describeValue(value)})`;
    }
    if (!Number.isInteger(value)) {
      return `정수가 아닙니다 (값: ${describeValue(value)})`;
    }
    return undefined;
  }

  const matches =
    expected === "object"
      ? isJsonObject(value)
      : expected === "array"
        ? isJsonArray(value)
        : expected === "null"
          ? value === null
          : typeof value === expected;

  return matches ? undefined : `타입이 ${jsonTypeNameOf(value)}입니다. ${expected}여야 합니다 (값: ${describeValue(value)})`;
}

function checkNumber(value: number, schema: Schema, path: string, errors: ValidationError[]): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({
      path,
      keyword: "minimum",
      message: `최소값 ${String(schema.minimum)}보다 작습니다 (값: ${String(value)})`,
    });
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({
      path,
      keyword: "maximum",
      message: `최대값 ${String(schema.maximum)}보다 큽니다 (값: ${String(value)})`,
    });
  }
}

function checkString(value: string, schema: Schema, path: string, errors: ValidationError[]): void {
  // JSON Schema의 길이는 코드 포인트 기준이다(UTF-16 코드 유닛인 value.length와 다르다).
  const length = Array.from(value).length;

  if (schema.minLength !== undefined && length < schema.minLength) {
    errors.push({
      path,
      keyword: "minLength",
      message: `최소 길이 ${String(schema.minLength)}보다 짧습니다 (길이: ${String(length)})`,
    });
  }
  if (schema.maxLength !== undefined && length > schema.maxLength) {
    errors.push({
      path,
      keyword: "maxLength",
      message: `최대 길이 ${String(schema.maxLength)}보다 깁니다 (길이: ${String(length)})`,
    });
  }
}

function checkArray(value: readonly unknown[], schema: Schema, path: string, errors: ValidationError[]): void {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({
      path,
      keyword: "minItems",
      message: `최소 개수 ${String(schema.minItems)}보다 적습니다 (개수: ${String(value.length)})`,
    });
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({
      path,
      keyword: "maxItems",
      message: `최대 개수 ${String(schema.maxItems)}보다 많습니다 (개수: ${String(value.length)})`,
    });
  }

  const { items } = schema;
  if (items !== undefined) {
    for (const [index, item] of value.entries()) {
      validateNode(item, items, appendPointer(path, index), errors);
    }
  }
}

function checkObject(
  value: Record<string, unknown>,
  schema: Schema,
  path: string,
  errors: ValidationError[],
): void {
  const { properties, required } = schema;

  if (required !== undefined) {
    for (const name of required) {
      if (!Object.hasOwn(value, name)) {
        // 경로는 "없는 그 필드"를 가리킨다. 사용자가 고쳐야 할 위치가 부모 객체가 아니라 그 필드이기 때문이다.
        errors.push({
          path: appendPointer(path, name),
          keyword: "required",
          message: `필수 필드가 없습니다: ${name}`,
        });
      }
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (properties === undefined || !Object.hasOwn(properties, key)) {
        errors.push({
          path: appendPointer(path, key),
          keyword: "additionalProperties",
          message: `스키마에 없는 필드입니다: ${key}`,
        });
      }
    }
  }

  if (properties !== undefined) {
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateNode(value[key], childSchema, appendPointer(path, key), errors);
      }
    }
  }
}

function validateNode(value: unknown, schema: Schema, path: string, errors: ValidationError[]): void {
  const typeError = checkType(value, schema.type);
  if (typeError !== undefined) {
    // 타입부터 틀리면 하위 규칙(범위·길이·properties)은 검사할 의미가 없다.
    errors.push({ path, keyword: "type", message: typeError });
    return;
  }

  const allowed = schema.enum;
  if (allowed !== undefined && !allowed.some((candidate) => candidate === value)) {
    errors.push({
      path,
      keyword: "enum",
      message: `허용된 값이 아닙니다 (허용: ${allowed.map((item) => describeValue(item)).join(", ")}, 값: ${describeValue(value)})`,
    });
  }

  // 타입은 위에서 이미 확인했지만, 여기서 다시 좁혀 각 검사 함수에 구체 타입으로 넘긴다.
  if (typeof value === "number") {
    checkNumber(value, schema, path, errors);
  } else if (typeof value === "string") {
    checkString(value, schema, path, errors);
  } else if (isJsonArray(value)) {
    checkArray(value, schema, path, errors);
  } else if (isJsonObject(value)) {
    checkObject(value, schema, path, errors);
  }
  // boolean과 null에는 추가 규칙이 없다.
}

/**
 * value가 schema를 만족하는지 검사한다.
 *
 * schema는 parseSchema를 통과한 Schema 타입만 받으므로, 검증되지 않은 스키마로는
 * 이 함수를 호출할 수 없다(스키마 오류와 값 오류가 섞이지 않는다).
 */
export function validate(value: unknown, schema: Schema): ValidationResult {
  const errors: ValidationError[] = [];
  validateNode(value, schema, "", errors);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * JSON Schema의 **작은 부분집합**을 내부 타입(Schema)으로 변환하는 순수 함수.
 *
 * 설계 원칙: 모르는 키워드는 조용히 무시하지 않고 거절한다.
 * 검사 도구가 모르는 규칙을 건너뛰고 "통과"를 돌려주면, 사용자는 검사되지 않은 것을
 * 검사된 것으로 착각한다. 그게 이 도구에서 가장 비싼 실패다.
 */

import { appendPointer, describeValue, isJsonArray, isJsonObject } from "./json.js";

export type SchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

/** enum에서 지원하는 값(JSON 원시값). 객체·배열 비교는 지원하지 않는다. */
export type JsonPrimitive = string | number | boolean | null;

/** parseSchema를 통과한 스키마. validate는 이 타입만 받는다. */
export interface Schema {
  readonly type: SchemaType;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
  readonly items?: Schema;
  readonly enum?: readonly JsonPrimitive[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
}

/** 스키마 자체가 잘못된 경우. path는 스키마 문서 안의 JSON Pointer다. */
export interface SchemaError {
  readonly path: string;
  readonly message: string;
}

export type ParseSchemaResult =
  | { readonly ok: true; readonly schema: Schema }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/** type에 상관없이 쓸 수 있는 키워드. */
const COMMON_KEYWORDS: readonly string[] = ["type", "enum"];

/** 선언한 type에서만 의미가 있는 키워드. */
const KEYWORDS_BY_TYPE: Readonly<Record<SchemaType, readonly string[]>> = {
  object: ["properties", "required", "additionalProperties"],
  array: ["items", "minItems", "maxItems"],
  string: ["minLength", "maxLength"],
  number: ["minimum", "maximum"],
  integer: ["minimum", "maximum"],
  boolean: [],
  null: [],
};

const SCHEMA_TYPES: ReadonlySet<string> = new Set<string>(Object.keys(KEYWORDS_BY_TYPE));

const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set<string>([
  ...COMMON_KEYWORDS,
  ...Object.values(KEYWORDS_BY_TYPE).flat(),
]);

const SUPPORTED_KEYWORD_LIST: string = [...SUPPORTED_KEYWORDS].join(", ");
const SCHEMA_TYPE_LIST: string = [...SCHEMA_TYPES].join(", ");

/** 내부 조립용(가변). 완성되면 Schema로 그대로 쓴다. */
interface SchemaDraft {
  type: SchemaType;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: JsonPrimitive[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

function isSchemaType(value: unknown): value is SchemaType {
  return typeof value === "string" && SCHEMA_TYPES.has(value);
}

function readNumber(raw: unknown, path: string, errors: SchemaError[]): number | undefined {
  if (typeof raw !== "number") {
    errors.push({ path, message: `숫자여야 합니다 (받은 값: ${describeValue(raw)})` });
    return undefined;
  }
  return raw;
}

/** 길이·개수 키워드는 0 이상의 정수만 허용한다. */
function readCount(raw: unknown, path: string, errors: SchemaError[]): number | undefined {
  const value = readNumber(raw, path, errors);
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    errors.push({ path, message: `0 이상의 정수여야 합니다 (받은 값: ${describeValue(raw)})` });
    return undefined;
  }
  return value;
}

function parseNode(input: unknown, path: string, errors: SchemaError[]): Schema | undefined {
  if (!isJsonObject(input)) {
    errors.push({ path, message: `스키마는 JSON 객체여야 합니다 (받은 값: ${describeValue(input)})` });
    return undefined;
  }

  const rawType = input["type"];
  const type = isSchemaType(rawType) ? rawType : undefined;
  if (rawType === undefined) {
    errors.push({ path: appendPointer(path, "type"), message: `type이 필요합니다 (지원: ${SCHEMA_TYPE_LIST})` });
  } else if (type === undefined) {
    errors.push({
      path: appendPointer(path, "type"),
      message: `지원하지 않는 type입니다: ${describeValue(rawType)} (지원: ${SCHEMA_TYPE_LIST})`,
    });
  }

  // 모르는 키워드와, 선언한 type에서 의미가 없는 키워드를 모두 거절한다.
  for (const key of Object.keys(input)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      errors.push({
        path: appendPointer(path, key),
        message: `지원하지 않는 키워드입니다 (지원: ${SUPPORTED_KEYWORD_LIST})`,
      });
      continue;
    }
    if (type !== undefined && !COMMON_KEYWORDS.includes(key) && !KEYWORDS_BY_TYPE[type].includes(key)) {
      errors.push({
        path: appendPointer(path, key),
        message: `type이 ${type}일 때는 쓸 수 없는 키워드입니다`,
      });
    }
  }

  if (type === undefined) {
    return undefined;
  }

  const draft: SchemaDraft = { type };
  const applicable = (key: string): boolean => KEYWORDS_BY_TYPE[type].includes(key);

  const rawEnum = input["enum"];
  if (rawEnum !== undefined) {
    const enumPath = appendPointer(path, "enum");
    if (!isJsonArray(rawEnum)) {
      errors.push({ path: enumPath, message: `enum은 배열이어야 합니다 (받은 값: ${describeValue(rawEnum)})` });
    } else if (rawEnum.length === 0) {
      errors.push({ path: enumPath, message: "enum은 비어 있을 수 없습니다" });
    } else {
      const values: JsonPrimitive[] = [];
      for (const [index, item] of rawEnum.entries()) {
        if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          values.push(item);
        } else {
          errors.push({
            path: appendPointer(enumPath, index),
            message: "enum 요소는 문자열·숫자·불린·null만 지원합니다",
          });
        }
      }
      draft.enum = values;
    }
  }

  const rawProperties = input["properties"];
  if (rawProperties !== undefined && applicable("properties")) {
    const propertiesPath = appendPointer(path, "properties");
    if (!isJsonObject(rawProperties)) {
      errors.push({
        path: propertiesPath,
        message: `properties는 객체여야 합니다 (받은 값: ${describeValue(rawProperties)})`,
      });
    } else {
      const parsed: Record<string, Schema> = {};
      for (const [key, child] of Object.entries(rawProperties)) {
        const childSchema = parseNode(child, appendPointer(propertiesPath, key), errors);
        if (childSchema !== undefined) {
          parsed[key] = childSchema;
        }
      }
      draft.properties = parsed;
    }
  }

  const rawRequired = input["required"];
  if (rawRequired !== undefined && applicable("required")) {
    const requiredPath = appendPointer(path, "required");
    if (!isJsonArray(rawRequired)) {
      errors.push({
        path: requiredPath,
        message: `required는 문자열 배열이어야 합니다 (받은 값: ${describeValue(rawRequired)})`,
      });
    } else {
      const names: string[] = [];
      for (const [index, item] of rawRequired.entries()) {
        if (typeof item === "string") {
          names.push(item);
        } else {
          errors.push({
            path: appendPointer(requiredPath, index),
            message: `required의 요소는 문자열이어야 합니다 (받은 값: ${describeValue(item)})`,
          });
        }
      }
      draft.required = names;
    }
  }

  const rawAdditional = input["additionalProperties"];
  if (rawAdditional !== undefined && applicable("additionalProperties")) {
    if (rawAdditional === false) {
      draft.additionalProperties = false;
    } else {
      errors.push({
        path: appendPointer(path, "additionalProperties"),
        message: `additionalProperties는 false만 지원합니다 (받은 값: ${describeValue(rawAdditional)})`,
      });
    }
  }

  const rawItems = input["items"];
  if (rawItems !== undefined && applicable("items")) {
    const itemsPath = appendPointer(path, "items");
    if (isJsonArray(rawItems)) {
      errors.push({ path: itemsPath, message: "items는 스키마 하나만 지원합니다 (배열 형태는 미지원)" });
    } else {
      const itemSchema = parseNode(rawItems, itemsPath, errors);
      if (itemSchema !== undefined) {
        draft.items = itemSchema;
      }
    }
  }

  for (const key of ["minimum", "maximum"] as const) {
    const raw = input[key];
    if (raw !== undefined && applicable(key)) {
      const value = readNumber(raw, appendPointer(path, key), errors);
      if (value !== undefined) {
        draft[key] = value;
      }
    }
  }

  for (const key of ["minLength", "maxLength", "minItems", "maxItems"] as const) {
    const raw = input[key];
    if (raw !== undefined && applicable(key)) {
      const value = readCount(raw, appendPointer(path, key), errors);
      if (value !== undefined) {
        draft[key] = value;
      }
    }
  }

  return draft;
}

/**
 * unknown으로 받은 스키마를 Schema로 변환한다.
 *
 * 잘못된 부분은 **모두** 모아 돌려준다(첫 오류에서 멈추지 않는다).
 * 스키마 파일을 고칠 때 한 번에 전부 보이는 편이 낫기 때문이다.
 */
export function parseSchema(input: unknown): ParseSchemaResult {
  const errors: SchemaError[] = [];
  const schema = parseNode(input, "", errors);

  if (schema === undefined) {
    if (errors.length === 0) {
      errors.push({ path: "", message: "스키마를 해석할 수 없습니다" });
    }
    return { ok: false, errors };
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, schema };
}

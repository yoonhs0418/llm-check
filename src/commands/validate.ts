/**
 * `llm-check validate <입력파일> --schema <스키마파일> [--json]` 명령의 본체.
 *
 * 파일·stdin 읽기는 io로 **주입**받고, 출력은 문자열로 **반환**한다.
 * 그래서 이 함수는 실제 파일이나 프로세스 없이 테스트할 수 있고,
 * process.exit / console / fs에 손대는 코드는 src/cli.ts 한 곳에만 남는다.
 */

import { parseArgs } from "node:util";

import { extractJson } from "../core/extract-json.js";
import type { ExtractFailure } from "../core/extract-json.js";
import { parseSchema } from "../core/schema.js";
import type { SchemaError } from "../core/schema.js";
import { validate } from "../core/validate.js";
import type { ValidationError } from "../core/validate.js";
import type { CommandIo, RunResult } from "./io.js";

interface JsonExtractOk {
  readonly ok: true;
  readonly strategy: "whole" | "scan";
  readonly start: number;
  readonly end: number;
}

interface JsonExtractFailure {
  readonly ok: false;
  readonly reason: "no-json" | "unbalanced" | "parse-error";
  readonly message: string;
  readonly start?: number;
}

/** --json으로 출력하는 결과 객체. 종료 코드 0과 1에서만 나온다. */
export interface JsonReport {
  readonly ok: boolean;
  readonly input: string;
  readonly schema: string;
  readonly extract: JsonExtractOk | JsonExtractFailure;
  readonly errors: readonly ValidationError[];
}

const STDIN_ARG = "-";

function usageError(message: string): RunResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: `llm-check validate: ${message}\n사용법: llm-check validate <입력파일> --schema <스키마파일> [--json]\n`,
  };
}

function toolError(message: string): RunResult {
  return { exitCode: 2, stdout: "", stderr: `llm-check validate: ${message}\n` };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

/** 루트는 JSON Pointer에서 빈 문자열이라 화면에서 보이지 않으므로 따로 표기한다. */
function displayPath(path: string): string {
  return path === "" ? "(루트)" : path;
}

/** start는 no-json일 때 없으므로, 키를 넣지 않는 쪽과 넣는 쪽을 나눈다(exactOptionalPropertyTypes). */
function toJsonExtractFailure(result: ExtractFailure): JsonExtractFailure {
  if (result.start === undefined) {
    return { ok: false, reason: result.reason, message: result.message };
  }
  return { ok: false, reason: result.reason, message: result.message, start: result.start };
}

function renderReport(report: JsonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function renderExtractFailure(inputLabel: string, extract: JsonExtractFailure): string {
  const position = extract.start === undefined ? "" : ` (위치 ${String(extract.start)})`;
  return [
    `실패: ${inputLabel}`,
    `JSON을 꺼내지 못했습니다: ${extract.reason}${position}`,
    `  ${extract.message}`,
    "",
  ].join("\n");
}

function renderValidationErrors(inputLabel: string, errors: readonly ValidationError[]): string {
  const pathWidth = Math.max(...errors.map((error) => displayPath(error.path).length));
  const keywordWidth = Math.max(...errors.map((error) => error.keyword.length));

  const lines = errors.map(
    (error) =>
      `${displayPath(error.path).padEnd(pathWidth)}  ${error.keyword.padEnd(keywordWidth)}  ${error.message}`,
  );

  return [`실패: ${inputLabel}`, ...lines, `오류 ${String(errors.length)}개`, ""].join("\n");
}

function renderSchemaErrors(schemaPath: string, errors: readonly SchemaError[]): string {
  const pathWidth = Math.max(...errors.map((error) => displayPath(error.path).length));
  const lines = errors.map((error) => `  ${displayPath(error.path).padEnd(pathWidth)}  ${error.message}`);

  return [
    `llm-check validate: 스키마가 잘못됐습니다: ${schemaPath}`,
    ...lines,
    `스키마 오류 ${String(errors.length)}개`,
    "",
  ].join("\n");
}

export async function runValidate(args: readonly string[], io: CommandIo): Promise<RunResult> {
  let inputPath: string;
  let schemaPath: string;
  let asJson: boolean;

  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
        schema: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });

    if (positionals.length === 0) {
      return usageError("입력 파일을 지정해야 합니다 (stdin은 - )");
    }
    if (positionals.length > 1) {
      return usageError(`입력 파일은 하나만 지정할 수 있습니다 (받은 개수: ${String(positionals.length)})`);
    }
    if (values.schema === undefined) {
      return usageError("--schema <스키마파일>이 필요합니다");
    }

    inputPath = positionals[0] ?? STDIN_ARG;
    schemaPath = values.schema;
    asJson = values.json;
  } catch (error: unknown) {
    return usageError(describeError(error));
  }

  const inputLabel = inputPath === STDIN_ARG ? "표준 입력" : inputPath;

  let inputText: string;
  try {
    inputText = inputPath === STDIN_ARG ? await io.readStdin() : await io.readFile(inputPath);
  } catch (error: unknown) {
    return toolError(`입력을 읽을 수 없습니다: ${inputLabel} (${describeError(error)})`);
  }

  // 추출보다 스키마를 먼저 확인한다: 스키마가 잘못됐다면 검사 결과(0/1)를 말할 자격이 없다.
  let schemaText: string;
  try {
    schemaText = await io.readFile(schemaPath);
  } catch (error: unknown) {
    return toolError(`스키마 파일을 읽을 수 없습니다: ${schemaPath} (${describeError(error)})`);
  }

  let schemaDocument: unknown;
  try {
    schemaDocument = JSON.parse(schemaText);
  } catch (error: unknown) {
    return toolError(`스키마 파일이 올바른 JSON이 아닙니다: ${schemaPath} (${describeError(error)})`);
  }

  const parsedSchema = parseSchema(schemaDocument);
  if (!parsedSchema.ok) {
    return { exitCode: 2, stdout: "", stderr: renderSchemaErrors(schemaPath, parsedSchema.errors) };
  }

  const extracted = extractJson(inputText);

  if (!extracted.ok) {
    const failure = toJsonExtractFailure(extracted);
    const report: JsonReport = {
      ok: false,
      input: inputPath,
      schema: schemaPath,
      extract: failure,
      errors: [],
    };
    return {
      exitCode: 1,
      stdout: asJson ? renderReport(report) : renderExtractFailure(inputLabel, failure),
      stderr: "",
    };
  }

  const extract: JsonExtractOk = {
    ok: true,
    strategy: extracted.strategy,
    start: extracted.start,
    end: extracted.end,
  };
  const result = validate(extracted.value, parsedSchema.schema);
  const errors = result.ok ? [] : result.errors;
  const report: JsonReport = { ok: result.ok, input: inputPath, schema: schemaPath, extract, errors };

  if (asJson) {
    return { exitCode: result.ok ? 0 : 1, stdout: renderReport(report), stderr: "" };
  }

  if (result.ok) {
    return { exitCode: 0, stdout: `통과: ${inputLabel} (스키마 ${schemaPath})\n`, stderr: "" };
  }
  return { exitCode: 1, stdout: renderValidationErrors(inputLabel, errors), stderr: "" };
}

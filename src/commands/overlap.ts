/**
 * `llm-check overlap <문항파일> [--threshold] [--blank] [--max-copied] [--json]` 명령의 본체.
 *
 * 문항 묶음을 받아 각 문항이 정의문을 그대로 되읽는지 재고(src/core/overlap.ts),
 * copied 개수가 허용치를 넘으면 종료 코드 1로 끝낸다.
 * 파일 읽기는 io로 주입받고 출력은 문자열로 반환한다(validate 명령과 같은 구조).
 */

import { parseArgs } from "node:util";

import { isJsonArray, isJsonObject } from "../core/json.js";
import { assessCopy, DEFAULT_BLANK, DEFAULT_THRESHOLD } from "../core/overlap.js";
import type { CopyStatus } from "../core/overlap.js";
import type { Schema } from "../core/schema.js";
import { validate } from "../core/validate.js";
import type { CommandIo, RunResult } from "./io.js";

/** 입력 파일의 모양. core의 validate로 검사해 오류 위치(JSON Pointer)를 그대로 보여준다. */
const QUESTIONS_SCHEMA: Schema = {
  type: "array",
  items: {
    type: "object",
    required: ["question", "definition"],
    properties: {
      id: { type: "string" },
      question: { type: "string" },
      definition: { type: "string" },
    },
  },
};

interface QuestionItem {
  readonly id?: string;
  readonly question: string;
  readonly definition: string;
}

interface AssessedRow {
  readonly index: number;
  readonly id?: string;
  readonly status: CopyStatus;
  readonly ratio?: number;
  readonly question: string;
}

interface JsonRow {
  readonly index: number;
  readonly id?: string;
  readonly status: CopyStatus;
  readonly ratio?: number;
}

/** --json으로 출력하는 결과 객체. 종료 코드 0과 1에서만 나온다. */
export interface OverlapReport {
  readonly ok: boolean;
  readonly input: string;
  readonly threshold: number;
  readonly maxCopied: number;
  readonly counts: {
    readonly total: number;
    readonly copied: number;
    readonly ok: number;
    readonly unmeasurable: number;
  };
  /** 잰 문항이 없으면 null. */
  readonly ratio: { readonly median: number | null; readonly max: number | null };
  readonly items: readonly JsonRow[];
}

const PREVIEW_LENGTH = 40;

function usageError(message: string): RunResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: `llm-check overlap: ${message}\n사용법: llm-check overlap <문항파일> [--threshold 0.6] [--blank ____] [--max-copied 0] [--json]\n`,
  };
}

function toolError(message: string): RunResult {
  return { exitCode: 2, stdout: "", stderr: `llm-check overlap: ${message}\n` };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

/**
 * validate가 모양을 이미 확인했지만, 타입을 any 없이 좁히려면 한 번 더 읽어야 한다.
 * 사용자에게 보여줄 오류는 validate가 내고, 이 함수는 타입 안전만 책임진다.
 */
function readItems(document: unknown): readonly QuestionItem[] | undefined {
  if (!isJsonArray(document)) {
    return undefined;
  }

  const items: QuestionItem[] = [];
  for (const entry of document) {
    if (!isJsonObject(entry)) {
      return undefined;
    }
    const { id, question, definition } = entry;
    if (typeof question !== "string" || typeof definition !== "string") {
      return undefined;
    }
    items.push(typeof id === "string" ? { id, question, definition } : { question, definition });
  }
  return items;
}

/** 비율은 소수점 넷째 자리까지만 남긴다(0.9696969696969697 같은 값을 그대로 내보내지 않는다). */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** 중앙값은 두 값의 평균이 될 수 있어 다시 반올림한다(0.51515 같은 자리수를 내보내지 않는다). */
function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (upper === undefined) {
    return null;
  }
  if (sorted.length % 2 === 1 || lower === undefined) {
    return upper;
  }
  return round((lower + upper) / 2);
}

function label(row: AssessedRow): string {
  return row.id ?? `#${String(row.index)}`;
}

function preview(question: string): string {
  const collapsed = question.replace(/\s+/gu, " ").trim();
  const characters = Array.from(collapsed);
  if (characters.length <= PREVIEW_LENGTH) {
    return collapsed;
  }
  return `${characters.slice(0, PREVIEW_LENGTH).join("")}…`;
}

function formatRatio(ratio: number): string {
  return ratio.toFixed(2);
}

function renderHuman(report: OverlapReport, rows: readonly AssessedRow[]): string {
  const { counts, ratio } = report;
  const measured = counts.copied + counts.ok;

  const lines: string[] = [
    `문항 ${String(counts.total)}개 — copied ${String(counts.copied)}, ok ${String(counts.ok)}, unmeasurable ${String(counts.unmeasurable)}`,
  ];

  if (ratio.median === null || ratio.max === null) {
    lines.push("겹침 비율 — 잰 문항이 없습니다");
  } else {
    lines.push(
      `겹침 비율 — 중앙값 ${formatRatio(ratio.median)}, 최댓값 ${formatRatio(ratio.max)} (잰 문항 ${String(measured)}개)`,
    );
  }

  const copiedRows = rows.filter((row) => row.status === "copied");
  if (copiedRows.length > 0) {
    lines.push(`copied 문항 ${String(copiedRows.length)}개 (threshold ${formatRatio(report.threshold)}):`);
    const labelWidth = Math.max(...copiedRows.map((row) => label(row).length));
    for (const row of copiedRows) {
      const shown = row.ratio === undefined ? "    " : formatRatio(row.ratio);
      lines.push(`  ${label(row).padEnd(labelWidth)}  ${shown}  ${preview(row.question)}`);
    }
  }

  lines.push(
    report.ok
      ? `통과: copied ${String(counts.copied)}개 (허용치 ${String(report.maxCopied)}개)`
      : `실패: copied ${String(counts.copied)}개가 허용치 ${String(report.maxCopied)}개를 넘었습니다`,
  );

  return `${lines.join("\n")}\n`;
}

function renderJson(report: OverlapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function runOverlap(args: readonly string[], io: CommandIo): Promise<RunResult> {
  let inputPath: string;
  let threshold = DEFAULT_THRESHOLD;
  let blank = DEFAULT_BLANK;
  let maxCopied = 0;
  let asJson: boolean;

  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
        threshold: { type: "string" },
        blank: { type: "string" },
        "max-copied": { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });

    if (positionals.length === 0) {
      return usageError("문항 파일을 지정해야 합니다");
    }
    if (positionals.length > 1) {
      return usageError(`문항 파일은 하나만 지정할 수 있습니다 (받은 개수: ${String(positionals.length)})`);
    }
    inputPath = positionals[0] ?? "";
    asJson = values.json;

    if (values.threshold !== undefined) {
      const parsed = Number(values.threshold);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return usageError(`--threshold는 0과 1 사이의 숫자여야 합니다 (받은 값: ${values.threshold})`);
      }
      threshold = parsed;
    }

    const rawMaxCopied = values["max-copied"];
    if (rawMaxCopied !== undefined) {
      const parsed = Number(rawMaxCopied);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return usageError(`--max-copied는 0 이상의 정수여야 합니다 (받은 값: ${rawMaxCopied})`);
      }
      maxCopied = parsed;
    }

    if (values.blank !== undefined) {
      if (values.blank === "") {
        return usageError("--blank는 빈 문자열일 수 없습니다");
      }
      blank = values.blank;
    }
  } catch (error: unknown) {
    return usageError(describeError(error));
  }

  let inputText: string;
  try {
    inputText = await io.readFile(inputPath);
  } catch (error: unknown) {
    return toolError(`문항 파일을 읽을 수 없습니다: ${inputPath} (${describeError(error)})`);
  }

  let document: unknown;
  try {
    document = JSON.parse(inputText);
  } catch (error: unknown) {
    return toolError(`문항 파일이 올바른 JSON이 아닙니다: ${inputPath} (${describeError(error)})`);
  }

  const shape = validate(document, QUESTIONS_SCHEMA);
  if (!shape.ok) {
    const lines = shape.errors.map(
      (error) => `  ${error.path === "" ? "(루트)" : error.path}  ${error.keyword}  ${error.message}`,
    );
    return {
      exitCode: 2,
      stdout: "",
      stderr: `llm-check overlap: 문항 파일의 모양이 올바르지 않습니다: ${inputPath}\n${lines.join("\n")}\n`,
    };
  }

  const items = readItems(document);
  if (items === undefined) {
    return toolError(`문항 파일을 읽을 수 없습니다: ${inputPath}`);
  }

  const rows: AssessedRow[] = items.map((item, index) => {
    const assessment = assessCopy(item.question, item.definition, { threshold, blank });
    if (assessment.status === "unmeasurable") {
      return item.id === undefined
        ? { index, status: assessment.status, question: item.question }
        : { index, id: item.id, status: assessment.status, question: item.question };
    }
    const ratio = round(assessment.ratio);
    return item.id === undefined
      ? { index, status: assessment.status, ratio, question: item.question }
      : { index, id: item.id, status: assessment.status, ratio, question: item.question };
  });

  const copiedCount = rows.filter((row) => row.status === "copied").length;
  const okCount = rows.filter((row) => row.status === "ok").length;
  const unmeasurableCount = rows.filter((row) => row.status === "unmeasurable").length;

  const ratios = rows.flatMap((row) => (row.ratio === undefined ? [] : [row.ratio]));
  const maxRatio = ratios.length === 0 ? null : Math.max(...ratios);

  const report: OverlapReport = {
    ok: copiedCount <= maxCopied,
    input: inputPath,
    threshold,
    maxCopied,
    counts: { total: rows.length, copied: copiedCount, ok: okCount, unmeasurable: unmeasurableCount },
    ratio: { median: median(ratios), max: maxRatio },
    items: rows.map((row) => {
      const { index, id, status, ratio } = row;
      const base = id === undefined ? { index, status } : { index, id, status };
      return ratio === undefined ? base : { ...base, ratio };
    }),
  };

  return {
    exitCode: report.ok ? 0 : 1,
    stdout: asJson ? renderJson(report) : renderHuman(report, rows),
    stderr: "",
  };
}

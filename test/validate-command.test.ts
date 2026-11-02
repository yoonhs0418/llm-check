import { describe, expect, it } from "vitest";

import type { CommandIo } from "../src/commands/io.js";
import type { JsonReport } from "../src/commands/validate.js";
import { runValidate } from "../src/commands/validate.js";

const schemaJson = JSON.stringify({
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

const okOutput = [
  "분석 결과입니다.",
  "```json",
  '{ "score": 82, "feedback": "좋습니다", "keywords": ["성장"], "level": "mid" }',
  "```",
].join("\n");

const badOutput = '결과: { "score": 132, "keywords": ["성장"] }';
const brokenOutput = '결과: { "score": 71, "keywords": ["성장",';

/** 파일 시스템과 표준 입력을 메모리로 대체한 io. 실제 파일 없이 명령을 돌린다. */
function makeIo(files: Readonly<Record<string, string>>, stdin = ""): CommandIo {
  return {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        return Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
      }
      return Promise.resolve(content);
    },
    readStdin: () => Promise.resolve(stdin),
  };
}

const defaultFiles = {
  "schema.json": schemaJson,
  "ok.txt": okOutput,
  "bad.txt": badOutput,
  "broken.txt": brokenOutput,
};

function parseReport(stdout: string): JsonReport {
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed !== "object" || parsed === null || !("ok" in parsed)) {
    throw new Error(`--json 출력이 기대한 모양이 아닙니다: ${stdout}`);
  }
  return parsed as JsonReport;
}

describe("runValidate", () => {
  it("스키마를 만족하면 종료 코드 0과 통과 메시지를 돌려준다", async () => {
    const result = await runValidate(["ok.txt", "--schema", "schema.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("통과");
    expect(result.stderr).toBe("");
  });

  it("스키마를 위반하면 종료 코드 1과 오류 목록을 stdout에 쓴다", async () => {
    const result = await runValidate(["bad.txt", "--schema", "schema.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("/score");
    expect(result.stdout).toContain("maximum");
    expect(result.stdout).toContain("/feedback");
    expect(result.stdout).toContain("오류 2개");
    expect(result.stderr).toBe("");
  });

  it("JSON을 꺼내지 못하면 종료 코드 1과 실패 이유를 보여준다", async () => {
    const result = await runValidate(["broken.txt", "--schema", "schema.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("unbalanced");
    expect(result.stdout).toContain("위치");
  });

  it("입력 파일이 없으면 종료 코드 2와 stderr 메시지를 돌려준다", async () => {
    const result = await runValidate(["없는파일.txt", "--schema", "schema.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("입력을 읽을 수 없습니다");
  });

  it("스키마 파일이 없으면 종료 코드 2를 돌려준다", async () => {
    const result = await runValidate(["ok.txt", "--schema", "없는스키마.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("스키마 파일을 읽을 수 없습니다");
  });

  it("스키마 파일이 깨진 JSON이면 종료 코드 2를 돌려준다", async () => {
    const io = makeIo({ ...defaultFiles, "schema.json": '{ "type": "object", }' });

    const result = await runValidate(["ok.txt", "--schema", "schema.json"], io);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("올바른 JSON이 아닙니다");
  });

  it("지원하지 않는 키워드가 든 스키마는 검사하지 않고 종료 코드 2를 돌려준다", async () => {
    const io = makeIo({
      ...defaultFiles,
      "schema.json": JSON.stringify({ type: "object", $ref: "#/definitions/analysis" }),
    });

    const result = await runValidate(["ok.txt", "--schema", "schema.json"], io);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("$ref");
  });

  it("--schema를 빼면 종료 코드 2와 사용법을 돌려준다", async () => {
    const result = await runValidate(["ok.txt"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--schema");
    expect(result.stderr).toContain("사용법");
  });

  it("입력 파일을 아예 주지 않으면 종료 코드 2를 돌려준다", async () => {
    const result = await runValidate(["--schema", "schema.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("입력 파일을 지정해야 합니다");
  });

  it("모르는 옵션을 주면 종료 코드 2를 돌려준다", async () => {
    const result = await runValidate(["ok.txt", "--schema", "schema.json", "--strict"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--strict");
  });

  it("입력 파일 자리에 -를 주면 표준 입력을 읽는다", async () => {
    const result = await runValidate(["-", "--schema", "schema.json"], makeIo(defaultFiles, okOutput));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("표준 입력");
  });

  it("--json 출력은 JSON.parse로 읽을 수 있고 오류 목록을 담는다", async () => {
    const result = await runValidate(["bad.txt", "--schema", "schema.json", "--json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(1);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.input).toBe("bad.txt");
    expect(report.extract.ok).toBe(true);
    expect(report.errors.map((error) => [error.path, error.keyword])).toEqual([
      ["/feedback", "required"],
      ["/score", "maximum"],
    ]);
  });

  it("--json은 통과했을 때도 같은 모양의 객체를 돌려준다", async () => {
    const result = await runValidate(["ok.txt", "--schema", "schema.json", "--json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(0);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.extract).toMatchObject({ ok: true, strategy: "scan" });
  });
});

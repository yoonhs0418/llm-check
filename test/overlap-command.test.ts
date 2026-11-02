import { describe, expect, it } from "vitest";

import type { CommandIo } from "../src/commands/io.js";
import type { OverlapReport } from "../src/commands/overlap.js";
import { runOverlap } from "../src/commands/overlap.js";

const DEF = "절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방법";

const questionsJson = JSON.stringify([
  {
    id: "q1",
    question:
      "어떤 팀이 절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방식으로 일한다면 ____ 다.",
    definition: DEF,
  },
  {
    id: "q2",
    question: "큰 그림을 먼저 잡고 아래로 내려가며 채우는 방식을 ____ 라 한다.",
    definition: DEF,
  },
]);

function makeIo(files: Readonly<Record<string, string>>): CommandIo {
  return {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        return Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
      }
      return Promise.resolve(content);
    },
    readStdin: () => Promise.resolve(""),
  };
}

const defaultFiles = { "questions.json": questionsJson };

function parseReport(stdout: string): OverlapReport {
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed !== "object" || parsed === null || !("counts" in parsed)) {
    throw new Error(`--json 출력이 기대한 모양이 아닙니다: ${stdout}`);
  }
  return parsed as OverlapReport;
}

describe("runOverlap", () => {
  it("기본값에서는 copied 문항이 있으면 종료 코드 1을 돌려준다", async () => {
    const result = await runOverlap(["questions.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("문항 2개");
    expect(result.stdout).toContain("copied 1");
    expect(result.stdout).toContain("q1");
    expect(result.stdout).toContain("허용치 0개를 넘었습니다");
    expect(result.stderr).toBe("");
  });

  it("--max-copied 1이면 같은 입력이 종료 코드 0이 된다", async () => {
    const result = await runOverlap(["questions.json", "--max-copied", "1"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("통과");
  });

  it("--threshold를 올리면 copied가 사라진다", async () => {
    const result = await runOverlap(["questions.json", "--threshold", "0.99"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("copied 0");
  });

  it("빈 배열이면 잴 문항이 없다고 알리고 종료 코드 0이다", async () => {
    const result = await runOverlap(["questions.json"], makeIo({ "questions.json": "[]" }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("문항 0개");
    expect(result.stdout).toContain("잰 문항이 없습니다");
  });

  it("정의문이 비어 있으면 unmeasurable로 세고 강등하지 않는다", async () => {
    const files = {
      "questions.json": JSON.stringify([{ id: "q1", question: "____ 이다.", definition: "" }]),
    };

    const result = await runOverlap(["questions.json"], makeIo(files));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("unmeasurable 1");
  });

  it("문항 파일이 없으면 종료 코드 2를 돌려준다", async () => {
    const result = await runOverlap(["없는파일.json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("문항 파일을 읽을 수 없습니다");
  });

  it("문항 파일이 깨진 JSON이면 종료 코드 2를 돌려준다", async () => {
    const result = await runOverlap(["questions.json"], makeIo({ "questions.json": "[{" }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("올바른 JSON이 아닙니다");
  });

  it("JSON 배열이 아니면 종료 코드 2를 돌려준다", async () => {
    const result = await runOverlap(["questions.json"], makeIo({ "questions.json": '{"id":"q1"}' }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("모양이 올바르지 않습니다");
  });

  it("question이 빠진 항목은 위치와 함께 종료 코드 2로 거절한다", async () => {
    const files = { "questions.json": JSON.stringify([{ id: "q1", definition: DEF }]) };

    const result = await runOverlap(["questions.json"], makeIo(files));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("/0/question");
    expect(result.stderr).toContain("required");
  });

  it("question이 문자열이 아니면 종료 코드 2로 거절한다", async () => {
    const files = { "questions.json": JSON.stringify([{ question: 42, definition: DEF }]) };

    const result = await runOverlap(["questions.json"], makeIo(files));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("/0/question");
    expect(result.stderr).toContain("type");
  });

  it("--threshold가 숫자가 아니거나 범위를 벗어나면 종료 코드 2를 돌려준다", async () => {
    const io = makeIo(defaultFiles);

    const notNumber = await runOverlap(["questions.json", "--threshold", "abc"], io);
    const tooBig = await runOverlap(["questions.json", "--threshold", "1.5"], io);

    expect(notNumber.exitCode).toBe(2);
    expect(notNumber.stderr).toContain("--threshold");
    expect(tooBig.exitCode).toBe(2);
  });

  it("--max-copied가 음수나 소수면 종료 코드 2를 돌려준다", async () => {
    const io = makeIo(defaultFiles);

    const negative = await runOverlap(["questions.json", "--max-copied", "-1"], io);
    const fractional = await runOverlap(["questions.json", "--max-copied", "0.5"], io);

    expect(negative.exitCode).toBe(2);
    expect(negative.stderr).toContain("--max-copied");
    expect(fractional.exitCode).toBe(2);
  });

  it("--blank가 빈 문자열이면 종료 코드 2를 돌려준다", async () => {
    const result = await runOverlap(["questions.json", "--blank", ""], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--blank");
  });

  it("문항 파일을 아예 주지 않으면 종료 코드 2를 돌려준다", async () => {
    const result = await runOverlap([], makeIo(defaultFiles));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("문항 파일을 지정해야 합니다");
  });

  it("--json 출력은 JSON.parse로 읽을 수 있고 개수·비율을 담는다", async () => {
    const result = await runOverlap(["questions.json", "--json"], makeIo(defaultFiles));

    expect(result.exitCode).toBe(1);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.input).toBe("questions.json");
    expect(report.threshold).toBe(0.6);
    expect(report.counts).toEqual({ total: 2, copied: 1, ok: 1, unmeasurable: 0 });
    expect(report.ratio.max).toBeGreaterThan(0.9);
    expect(report.items.map((item) => [item.id, item.status])).toEqual([
      ["q1", "copied"],
      ["q2", "ok"],
    ]);
  });

  it("id가 없는 항목은 #순번으로 표시한다", async () => {
    const files = {
      "questions.json": JSON.stringify([
        {
          question:
            "어떤 팀이 절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방식으로 일한다면 ____ 다.",
          definition: DEF,
        },
      ]),
    };

    const result = await runOverlap(["questions.json"], makeIo(files));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("#0");
  });
});

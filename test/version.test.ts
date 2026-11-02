import { describe, expect, it } from "vitest";

import { parsePackageVersion } from "../src/core/version.js";

describe("parsePackageVersion", () => {
  it("package.json 텍스트에서 version 문자열을 꺼낸다", () => {
    expect(parsePackageVersion('{"name": "llm-check", "version": "0.1.0"}')).toBe("0.1.0");
  });

  it("version 필드가 없으면 예외를 던진다", () => {
    expect(() => parsePackageVersion('{"name": "llm-check"}')).toThrow();
  });
});

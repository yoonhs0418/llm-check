import { describe, expect, it } from "vitest";

import { parsePackageVersion } from "../src/core/version.js";

// 기능 테스트가 아니라, TS + ESM + Vitest 배선이 실제로 동작하는지 확인하는 smoke test.
describe("smoke", () => {
  it("src의 ESM 모듈을 import해 실행할 수 있다", () => {
    expect(parsePackageVersion('{"version":"0.0.0"}')).toBe("0.0.0");
  });
});

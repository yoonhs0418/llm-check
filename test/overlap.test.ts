import { describe, expect, it } from "vitest";

import { assessCopy, bigramSet, normalize, overlap } from "../src/core/overlap.js";

// MetaLearn 원본 테스트에서 쓴 문장 그대로. 판정 방식을 옮겼으니 같은 입력에서 같은 판정이 나와야 한다.
const DEF = "절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방법";
const COPIED_QUESTION =
  "어떤 팀이 절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방식으로 일한다면 ____ 다.";
const PARAPHRASED_QUESTION = "큰 그림을 먼저 잡고 아래로 내려가며 채우는 방식을 ____ 라 한다.";

describe("normalize / bigramSet", () => {
  it("공백과 문장부호를 지우고 글자만 남긴다", () => {
    expect(normalize("최상위 컴포넌트를, 먼저!! 설계한다.")).toBe("최상위컴포넌트를먼저설계한다");
  });

  it("숫자와 영문도 글자로 남긴다", () => {
    expect(normalize("L3 단계 (2026)")).toBe("L3단계2026");
  });

  it("연속한 두 글자를 집합으로 모은다", () => {
    expect([...bigramSet("가나다")]).toEqual(["가나", "나다"]);
  });

  it("같은 2-gram이 반복되면 한 번만 센다", () => {
    expect(bigramSet("가가가").size).toBe(1);
  });

  it("글자가 한 개뿐이면 2-gram이 없다", () => {
    expect(bigramSet("가").size).toBe(0);
  });
});

describe("overlap", () => {
  it("겹침에는 방향이 있다: 짧은 쪽이 긴 쪽에 모두 담기면 1이다", () => {
    expect(overlap("최상위 컴포넌트", "최상위 컴포넌트를 먼저 설계한다")).toBe(1);
  });

  it("전혀 다른 말은 0.3 미만이다", () => {
    expect(overlap("전혀 다른 말", "최상위 컴포넌트를 먼저 설계한다")).toBeLessThan(0.3);
  });

  it("방향을 뒤집으면 값이 달라진다", () => {
    const forward = overlap("최상위 컴포넌트", "최상위 컴포넌트를 먼저 설계한다");
    const backward = overlap("최상위 컴포넌트를 먼저 설계한다", "최상위 컴포넌트");

    expect(forward).toBe(1);
    expect(backward).toBeLessThan(1);
  });

  it("문장부호와 공백만 다르면 같은 값이 나온다", () => {
    const spaced = overlap(DEF, "최상위 컴포넌트를, 먼저!! 설계한다.");
    const squeezed = overlap(DEF, "최상위컴포넌트를먼저설계한다");

    expect(spaced).toBe(squeezed);
  });

  it("a가 비어 있으면 0이다", () => {
    expect(overlap("", "최상위 컴포넌트")).toBe(0);
    expect(overlap("!!!", "최상위 컴포넌트")).toBe(0);
  });
});

describe("assessCopy", () => {
  it("정의문을 그대로 옮긴 문항은 copied로 판정한다", () => {
    const result = assessCopy(COPIED_QUESTION, DEF);

    expect(result.status).toBe("copied");
    if (result.status === "unmeasurable") {
      throw new Error("비율을 재지 못했습니다");
    }
    expect(result.ratio).toBeGreaterThanOrEqual(0.6);
  });

  it("다른 말로 바꾼 문항은 ok로 판정한다", () => {
    const result = assessCopy(PARAPHRASED_QUESTION, DEF);

    expect(result.status).toBe("ok");
    if (result.status === "unmeasurable") {
      throw new Error("비율을 재지 못했습니다");
    }
    expect(result.ratio).toBeLessThan(0.6);
  });

  it("정의문이 비어 있으면 unmeasurable이다(강등하지 않는다)", () => {
    expect(assessCopy(COPIED_QUESTION, "")).toEqual({ status: "unmeasurable" });
  });

  it("문항이 비어 있으면 unmeasurable이다", () => {
    expect(assessCopy("", DEF)).toEqual({ status: "unmeasurable" });
  });

  it("문항이 빈칸 표시뿐이면 unmeasurable이다", () => {
    expect(assessCopy("____", DEF)).toEqual({ status: "unmeasurable" });
  });

  it("빈칸 표시는 공백으로 바뀌어 비율에 끼지 않는다", () => {
    const withBlank = assessCopy(`${DEF} ____`, DEF);
    const withoutBlank = assessCopy(DEF, DEF);

    if (withBlank.status === "unmeasurable" || withoutBlank.status === "unmeasurable") {
      throw new Error("비율을 재지 못했습니다");
    }
    expect(withBlank.ratio).toBe(withoutBlank.ratio);
  });

  it("빈칸 표시는 옵션으로 바꿀 수 있다", () => {
    expect(assessCopy("<BLANK>", DEF, { blank: "<BLANK>" })).toEqual({ status: "unmeasurable" });
  });

  it("경계값: 비율이 정확히 threshold면 copied다", () => {
    // 정의문의 2-gram 5개(가나·나다·다라·라마·마바) 중 문항에 3개가 있어 3/5 = 0.6.
    const result = assessCopy("가나다라 ____", "가나다라마바");

    expect(result).toEqual({ status: "copied", ratio: 0.6 });
  });

  it("경계값: threshold를 조금만 올리면 같은 문항이 ok가 된다", () => {
    const result = assessCopy("가나다라 ____", "가나다라마바", { threshold: 0.61 });

    expect(result).toEqual({ status: "ok", ratio: 0.6 });
  });
});

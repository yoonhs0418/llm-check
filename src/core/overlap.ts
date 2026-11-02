/**
 * 문항이 정의문을 그대로 되읽는지 재는 판정기(순수 함수).
 *
 * 출처: MetaLearn의 `backend/app/features/curriculum/retrieval_level.py`.
 * LLM이 스스로 붙인 문항 유형 라벨이 13개 중 6개가 실제와 달랐기 때문에, 라벨을 믿지 않고
 * "정의문의 글자 2-gram이 문항에 얼마나 담겼는지"를 직접 재는 방식으로 바꿨다.
 * 판정 방식은 원본과 같게 유지한다(바꾸면 그때 쟀던 수치와 비교할 수 없다).
 */

/**
 * 글자와 숫자만 남긴다. 공백·문장부호·따옴표 차이로 비율이 흔들리지 않게 하는 것이 목적이다.
 *
 * Python 원본은 `re.sub(r"[^\w가-힣]", "", text)`였다. 파이썬 `\w`는 유니코드 기준이라
 * 한글도 이미 포함되고 `가-힣`는 사실상 중복이었다. JS에서는 같은 의도를
 * `\p{L}`(모든 문자) + `\p{N}`(모든 숫자) + `_`로 표현한다. 차이는 DECISIONS 14절에 적어 뒀다.
 */
export function normalize(text: string): string {
  return text.replace(/[^\p{L}\p{N}_]/gu, "");
}

/** 정규화한 문자열에서 연속한 두 글자를 모은 집합. 코드 포인트 단위로 센다(Python str 순회와 같다). */
export function bigramSet(text: string): ReadonlySet<string> {
  const characters = Array.from(normalize(text));
  const grams = new Set<string>();

  for (let i = 1; i < characters.length; i += 1) {
    const previous = characters[i - 1];
    const current = characters[i];
    if (previous !== undefined && current !== undefined) {
      grams.add(previous + current);
    }
  }

  return grams;
}

/**
 * a의 2-gram 중 몇 할이 b에도 있는지. a가 비어 있으면 0.
 *
 * **방향이 있다.** overlap(정의문, 문항)은 "정의문이 문항에 얼마나 담겼는지"이고,
 * 그 반대는 "문항이 정의문에 얼마나 담겼는지"로 의미가 다르다.
 */
export function overlap(a: string, b: string): number {
  const source = bigramSet(a);
  if (source.size === 0) {
    return 0;
  }

  const target = bigramSet(b);
  let shared = 0;
  for (const gram of source) {
    if (target.has(gram)) {
      shared += 1;
    }
  }

  return shared / source.size;
}

export type CopyStatus = "copied" | "ok" | "unmeasurable";

/**
 * 판정 결과.
 * - copied / ok: 비율을 쟀다
 * - unmeasurable: 잴 수 없었다(비율 키가 없다). 잴 수 없을 때는 강등하지 않는다.
 */
export type CopyAssessment =
  | { readonly status: "copied"; readonly ratio: number }
  | { readonly status: "ok"; readonly ratio: number }
  | { readonly status: "unmeasurable" };

export interface AssessCopyOptions {
  readonly threshold?: number;
  readonly blank?: string;
}

/** MetaLearn 실측 분포에서 고른 값. 데이터가 바뀌면 다시 정해야 한다(DECISIONS 14절). */
export const DEFAULT_THRESHOLD = 0.6;
export const DEFAULT_BLANK = "____";

/**
 * 문항이 정의문을 그대로 옮긴 것인지 판정한다.
 *
 * 빈칸 표시는 공백으로 바꿔 stem으로 삼는다(빈칸 자체는 글자가 아니므로 비율에 끼면 안 된다).
 */
export function assessCopy(
  question: string,
  definition: string,
  options: AssessCopyOptions = {},
): CopyAssessment {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const blank = options.blank ?? DEFAULT_BLANK;

  const stem = blank === "" ? question : question.replaceAll(blank, " ");

  // 잴 수 없으면 "copied"로 강등하지 않는다. 판정기가 확신할 수 없는 것을 단정하면 거짓 신고가 된다.
  if (normalize(stem) === "" || normalize(definition) === "") {
    return { status: "unmeasurable" };
  }

  const ratio = overlap(definition, stem);
  return ratio >= threshold ? { status: "copied", ratio } : { status: "ok", ratio };
}

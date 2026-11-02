# llm-check

LLM이 만들어 낸 출력 파일을 오프라인에서 검사하는 TypeScript CLI입니다.

검사하는 것은 두 가지입니다.

- **형식** — `validate`: 응답 텍스트에서 첫 JSON 블록을 꺼내 JSON Schema 부분집합으로 검사합니다.
- **내용** — `overlap`: 빈칸 문항이 정의문을 그대로 되읽는지 글자 2-gram 겹침으로 판정합니다.

LLM API를 호출하지 않으므로 네트워크나 API 키가 필요하지 않고, 런타임 의존성은 0개입니다.

## 왜 만들었나

**Job Crush** — Gemini에게 "JSON만 달라"고 지시해도 ` ```json ` 코드펜스나 "다음은 결과입니다" 같은 설명 문장을
섞어 반환해서 `JSON.parse`가 통째로 실패했습니다. 응답에서 첫 JSON 블록만 잘라내 다시 파싱하고, 점수 범위와
배열·문자열 길이를 확인하는 코드를 서비스 안에 넣어야 했습니다.

**MetaLearn** — 모델에게 빈칸 문항과 문항 유형 라벨을 함께 받았는데, 그 라벨을 직접 확인해 보니 13개 중 6개가
실제와 달랐습니다(정의문을 그대로 옮긴 문항을 "상황"이라고 신고). 라벨을 믿지 않고 정의문과 문항의 글자 겹침을
기계로 재 보니, 19개 중 12개가 정의문을 되읽는 문항이었습니다.

두 번 다 같은 종류의 검사를 서비스 코드 안에 다시 짰습니다. 그 검사를 서비스에서 떼어내 **파일만 보고 판정하는
CLI**로 옮긴 것이 이 저장소입니다. 모델을 호출하지 않으니 CI에서도 그대로 돌아갑니다.

## 빠른 시작

npm에 배포하지 않았으므로 git URL로 설치합니다. 설치할 때 npm이 `prepare`로 TypeScript를 빌드합니다.

```bash
npm install github:yoonhs0418/llm-check
npx llm-check --version
```

한 번만 써 볼 때는 설치 없이도 됩니다.

```bash
npx -y github:yoonhs0418/llm-check --help
```

커밋이나 태그를 붙여 버전을 고정할 수 있습니다(`github:yoonhs0418/llm-check#<커밋>`).
git URL 설치는 **설치 시점에 빌드가 돌기 때문에 Node 22.18 이상이 필요합니다**(아래 [개발 환경](#개발-환경) 참고).
빌드된 `dist/cli.js`를 실행하는 것 자체는 Node 20에서 됩니다.

저장소를 직접 받아서 쓰려면:

```bash
git clone https://github.com/yoonhs0418/llm-check.git
cd llm-check
npm install
```

`npm install`이 `prepare`로 `dist/cli.js`까지 만들기 때문에 따로 빌드하지 않아도 됩니다.
`examples/` 파일로 바로 돌려볼 수 있습니다.

```bash
node dist/cli.js validate examples/output-bad.txt --schema examples/analysis.schema.json
```

```
실패: examples/output-bad.txt
/feedback  required  필수 필드가 없습니다: feedback
/score     maximum   최대값 100보다 큽니다 (값: 132)
오류 2개
```

```bash
node dist/cli.js overlap examples/questions.json
```

```
문항 2개 — copied 1, ok 1, unmeasurable 0
겹침 비율 — 중앙값 0.52, 최댓값 0.97 (잰 문항 2개)
copied 문항 1개 (threshold 0.60):
  q1  0.97  어떤 팀이 절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기…
실패: copied 1개가 허용치 0개를 넘었습니다
```

둘 다 종료 코드 `1`로 끝납니다. 통과하는 입력(`examples/output-ok.txt`)은 `0`입니다.

```bash
node dist/cli.js validate examples/output-ok.txt --schema examples/analysis.schema.json
```

```
통과: examples/output-ok.txt (스키마 examples/analysis.schema.json)
```

## 명령

### validate — 형식 검사

```bash
llm-check validate <입력파일> --schema <스키마파일> [--json]
```

입력은 **아무 텍스트 파일**이면 됩니다. 설명 문장이나 코드펜스가 섞여 있어도 첫 JSON 블록을 찾아 꺼냅니다.
문자열 안의 괄호와 이스케이프를 추적하므로 `{"feedback": "괄호 {가 들어간} 문장"}` 같은 값도 끊기지 않습니다.

| 인자·옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `<입력파일>` | — | LLM 응답이 저장된 텍스트 파일. `-` 를 주면 표준 입력에서 읽습니다 |
| `--schema <경로>` | — | 검사에 쓸 JSON Schema 파일 (필수) |
| `--json` | — | 결과를 JSON 한 덩어리로 출력 |

JSON을 꺼내지 못하면 이유(`no-json` / `unbalanced` / `parse-error`)와 위치를 알려줍니다.

```bash
node dist/cli.js validate examples/output-broken.txt --schema examples/analysis.schema.json
```

```
실패: examples/output-broken.txt
JSON을 꺼내지 못했습니다: unbalanced (위치 23)
  23번째 문자에서 시작한 괄호의 짝을 찾지 못했습니다.
```

`--json` 출력:

```json
{
  "ok": false,
  "input": "examples/output-bad.txt",
  "schema": "examples/analysis.schema.json",
  "extract": { "ok": true, "strategy": "scan", "start": 31, "end": 95 },
  "errors": [
    { "path": "/feedback", "keyword": "required", "message": "필수 필드가 없습니다: feedback" },
    { "path": "/score", "keyword": "maximum", "message": "최대값 100보다 큽니다 (값: 132)" }
  ]
}
```

`path`는 JSON Pointer이고 루트는 빈 문자열입니다. `extract.strategy`는 입력 전체가 JSON이었으면 `whole`,
잘라냈으면 `scan`이며 `start`/`end`는 원문에서 잘라낸 구간입니다.

### overlap — 정의문 복사 판정

```bash
llm-check overlap <문항파일> [--threshold 0.6] [--blank ____] [--max-copied 0] [--json]
```

```
overlap(정의문, 문항) = |정의문의 2-gram ∩ 문항의 2-gram| / |정의문의 2-gram|
```

이 값이 `--threshold` 이상이면 `copied`입니다. 방향이 있습니다 — "정의문이 문항에 얼마나 담겼는지"를 재며,
그 반대가 아닙니다. 정의문이나 문항에 글자가 없어 잴 수 없으면 `unmeasurable`로 세고 `copied`로 강등하지 않습니다.

| 인자·옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `<문항파일>` | — | 문항 묶음 JSON 파일 (아래 형식) |
| `--threshold <비율>` | `0.6` | 겹침이 이 값 **이상**이면 copied |
| `--blank <문자열>` | `____` | 문항의 빈칸 표시. 공백으로 바꾼 뒤 잽니다 |
| `--max-copied <수>` | `0` | 허용할 copied 개수. 넘으면 종료 코드 1 |
| `--json` | — | 결과를 JSON 한 덩어리로 출력 |

입력은 `{ question, definition }` 객체의 JSON 배열입니다(`id`는 선택, 모양이 틀리면 종료 코드 2).

```json
[
  {
    "id": "q1",
    "question": "어떤 팀이 ... 설계 방식으로 일한다면 ____ 다.",
    "definition": "절차 지향 방식으로 최상위 컴포넌트를 먼저 설계한 뒤 하위 기능을 부여하는 설계 방법"
  }
]
```

`--json` 출력:

```json
{
  "ok": false,
  "input": "examples/questions.json",
  "threshold": 0.6,
  "maxCopied": 0,
  "counts": { "total": 2, "copied": 1, "ok": 1, "unmeasurable": 0 },
  "ratio": { "median": 0.5152, "max": 0.9697 },
  "items": [
    { "index": 0, "id": "q1", "status": "copied", "ratio": 0.9697 },
    { "index": 1, "id": "q2", "status": "ok", "ratio": 0.0606 }
  ]
}
```

문항 본문은 담지 않습니다(입력 파일에 이미 있습니다). 비율은 소수점 넷째 자리에서 반올림합니다.

### 그 외

```bash
llm-check --help
llm-check --version
```

## 종료 코드

| 코드 | 의미 | 예 |
| --- | --- | --- |
| `0` | 통과 | 스키마를 만족함 / copied 개수가 허용치 이내 |
| `1` | **검사 실패** — LLM 출력이 기준에 못 미침 | 스키마 위반, JSON을 꺼내지 못함, copied 초과 |
| `2` | **도구 오류** — 사용법·입출력·설정이 잘못됨 | 인자 누락, 파일 없음, 스키마 JSON 깨짐, 지원하지 않는 키워드 |

1과 2를 나눈 이유는 CI에서 "LLM 출력이 나쁘다"와 "설정이 잘못됐다"를 구분하기 위해서입니다.
검사 결과(0·1)는 **stdout**, 도구 오류(2)는 **stderr**로 나갑니다. 그래서 종료 코드가 0이나 1이면
`--json` 출력을 그대로 파이프로 받아 파싱할 수 있습니다.

GitHub Actions에서는 git URL로 설치해 쓰면 됩니다.

```yaml
      - uses: actions/setup-node@v4
        with:
          # git URL 설치는 llm-check를 빌드하므로 개발 조건(22.18+)이 필요합니다.
          node-version: "22"

      - run: npm install --no-save github:yoonhs0418/llm-check

      - name: LLM 출력 검사
        run: |
          npx llm-check validate artifacts/response.txt --schema schema/analysis.schema.json
          npx llm-check overlap artifacts/questions.json --max-copied 0
```

둘 중 하나라도 0이 아니면 스텝이 실패합니다. 실패 로그의 종료 코드로 원인을 구분하고,
결과를 모아 두려면 `--json` 출력을 파일로 저장해 아티팩트로 올리면 됩니다.

## 지원하는 스키마 키워드

| 키워드 | 지원 범위 |
| --- | --- |
| `type` | `object` · `array` · `string` · `number` · `integer` · `boolean` · `null` (**필수**) |
| `properties` | 중첩 가능 |
| `required` | 문자열 배열 |
| `additionalProperties` | `false`만 |
| `items` | 단일 스키마만 (튜플 형태 미지원) |
| `enum` | 문자열·숫자·불린·null (객체·배열 비교 미지원) |
| `minimum` / `maximum` | `number` · `integer`에서 |
| `minLength` / `maxLength` | `string`에서 (코드 포인트 기준) |
| `minItems` / `maxItems` | `array`에서 |

표준 JSON Schema보다 **엄격한 부분집합**입니다. 세 가지가 다릅니다.

1. `type`이 필수입니다. `type` 없는 스키마는 "아무것도 검사하지 않음"이라서 거절합니다.
2. 목록에 없는 키워드(`$ref`, `oneOf`, `pattern`, `format` 등)가 있으면 거절합니다.
3. 선언한 `type`에서 의미가 없는 키워드도 거절합니다(예: `type: "number"`에 `minLength`).

세 경우 모두 종료 코드 2로 끝나며, 검사를 수행하지 않습니다. 모르는 규칙을 건너뛰고 통과시키면
"검사했는데 통과"라는 거짓 결과가 되기 때문입니다. 출력은 어느 위치가 왜 거절됐는지 알려줍니다(일부).

```
  /$ref  지원하지 않는 키워드입니다 (지원: type, enum, properties, required, additionalProperties, items, minItems, maxItems, minLength, maxLength, minimum, maximum)
스키마 오류 1개
```

더 복잡한 스키마가 필요하면 ajv 같은 전체 구현을 쓰는 것이 맞습니다.

## 제한 사항

- **첫 번째 JSON 블록만** 꺼냅니다. 응답에 블록이 여러 개면 뒤쪽은 보지 않습니다.
- **깨진 JSON을 고치지 않습니다.** 후행 쉼표 제거나 따옴표 보정 같은 복구를 하면 모델이 의도한 값과 다른 값을
  조용히 만들어 낼 수 있어서, 대신 `parse-error`로 알리고 멈춥니다.
- 설명 문장에 `[`나 `{`가 **JSON보다 먼저** 나오면 그 괄호를 블록 시작으로 잡아 `parse-error`가 날 수 있습니다.

  ```bash
  printf '주의: 아래 결과[필수]를 확인하세요.\n{"score": 82, "feedback": "좋습니다", "keywords": ["성장"]}\n' \
    | node dist/cli.js validate - --schema examples/analysis.schema.json
  ```

  ```
  실패: 표준 입력
  JSON을 꺼내지 못했습니다: parse-error (위치 9)
    JSON 블록을 잘라냈지만 파싱에 실패했습니다: Unexpected token '필', "[필수]" is not valid JSON
  ```

- `overlap`의 기본 `threshold` **0.6은 MetaLearn 데이터에서 정한 값**입니다. 과목·문항 길이가 다른 데이터에서는
  분포를 보고 다시 정해야 합니다(`--threshold`로 바꿀 수 있습니다).
- `overlap`은 글자 2-gram 기반이라 **의미가 같은 다른 표현(패러프레이즈)은 잡지 못합니다.** 정의문을 통째로
  옮겨 적은 문항을 찾는 용도입니다.

## 개발 환경

Node 버전 요구 사항은 **사용(실행)** 과 **개발(기여)** 이 다릅니다.

| 용도 | 필요한 Node | 근거 |
| --- | --- | --- |
| 사용 (빌드된 CLI 실행) | **20 이상** | `package.json`의 `engines.node: ">=20"` |
| 개발 (빌드·린트·테스트) | **22.18 이상** (또는 24.11+) | 개발 도구 `tsup@9`, `vitest@5`가 요구하는 하한 |

빌드 산출물 `dist/cli.js`는 외부 의존성이 없고 Node 20 표준 API만 쓰므로 Node 20에서 실행됩니다.

| 명령 | 설명 |
| --- | --- |
| `npm run build` | tsup으로 `dist/cli.js` 빌드 (shebang 포함) |
| `npm run lint` | ESLint (typescript-eslint strictTypeChecked) |
| `npm run typecheck` | `tsc --noEmit` 타입 검사 |
| `npm run test` | Vitest 단발 실행 |
| `npm run check` | lint → typecheck → test 순서로 전부 실행 (CI와 동일) |

CI(GitHub Actions)는 job 세 개로 돌아갑니다.

- `check (Node 22)`, `check (Node 24)` — `npm ci` 후 `npm run check`
- `dist on Node 20 (engines floor)` — Node 22에서 빌드한 뒤 **실행만 Node 20으로 바꿔** `--version`이
  `package.json`과 일치하는지, `examples/` 파일로 종료 코드가 0/1/2 규약과 맞는지 확인

### 구조

```
src/
  cli.ts                 # 인자 파싱·실제 fs/process 연결 (Node 전용 진입점)
  commands/
    io.ts                # 명령이 보는 io 인터페이스와 결과 타입
    validate.ts          # validate 명령 본체 (io를 주입받아 결과 문자열을 반환)
    overlap.ts           # overlap 명령 본체
    version.ts           # package.json 읽기
  core/                  # 순수 로직 (Node API에 의존하지 않음)
    extract-json.ts      # 응답 텍스트에서 첫 JSON 블록 꺼내기
    schema.ts            # JSON Schema 부분집합 → Schema 타입
    validate.ts          # 값 검사 (오류를 모두 모아 반환)
    overlap.ts           # 정의문 복사 판정 (2-gram 겹침)
    help.ts, json.ts     # 도움말 텍스트, JSON 헬퍼
test/                    # Vitest 테스트
examples/                # 예시 스키마와 LLM 응답·문항 샘플
docs/
  DECISIONS.md           # 설계 결정 기록
```

`core`는 입력을 받아 결과를 돌려주는 순수 함수만 두고, 파일·표준 입력·종료 코드는 `commands`와 `cli.ts`가 담당합니다.
명령은 `run...(args, io)` 형태로 io를 주입받으므로 실제 파일 없이 테스트합니다.

## 만든 방식

Claude Code와 함께 단계별로 만들었습니다 — 프로젝트 뼈대 → JSON 추출 → 스키마 검증 → `validate` 명령 →
`overlap` 판정 → 문서 정리. 단계마다 범위와 제약을 먼저 정해 맡기고, 결과를 `npm run check`와 CI로 확인한 뒤
커밋했습니다. 각 단계에서 고른 방식과 거절한 대안은 [docs/DECISIONS.md](docs/DECISIONS.md)에 단계별로 남겼습니다.

## 설계 결정

도구와 설정을 그렇게 고른 이유는 [docs/DECISIONS.md](docs/DECISIONS.md)에 적어 뒀습니다 — ESM·tsup·`node:util`
`parseArgs`·Vitest를 고른 이유, strict 옵션 세 개를 켠 이유, JSON 추출에 정규식을 쓰지 않은 이유,
JSON Schema 부분집합을 직접 구현한 이유와 한계, 종료 코드를 0/1/2로 나눈 이유, `threshold` 0.6의 출처 등입니다.

## 라이선스

MIT — [LICENSE](LICENSE)

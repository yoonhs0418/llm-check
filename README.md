# llm-check

LLM이 만들어 낸 결과물(이미 저장된 출력 파일)을 검사하는 TypeScript CLI입니다.
LLM API를 호출하지 않는 **오프라인 도구**라서 실행에 네트워크나 API 키가 필요하지 않습니다.

LLM 응답에서 첫 JSON 블록을 꺼내고(설명 문장이나 ` ```json ` 코드펜스가 섞여 있어도),
JSON Schema의 작은 부분집합으로 그 값이 기대한 모양인지 검사합니다.

> 현재 제공하는 명령은 `validate` 하나입니다. 런타임 의존성은 0개입니다.

## 요구 사항

Node 버전 요구 사항은 **사용(실행)** 과 **개발(기여)** 이 다릅니다.

| 용도 | 필요한 Node | 근거 |
| --- | --- | --- |
| 사용 (빌드된 CLI 실행) | **20 이상** | `package.json`의 `engines.node: ">=20"` |
| 개발 (빌드·린트·테스트) | **22.18 이상** (또는 24.11+) | 개발 도구 `tsup@9`, `vitest@5`가 요구하는 하한 |

빌드 산출물 `dist/cli.js`는 외부 의존성이 없고 Node 20 표준 API만 쓰므로 Node 20에서 실행됩니다.
반면 `npm run check` / `npm run build`는 Node 22.18+ 가 필요합니다. 자세한 이유는
[docs/DECISIONS.md](docs/DECISIONS.md)의 "Node 버전" 절에 있습니다.

- npm (`package-lock.json` 사용)

## 설치

```bash
npm install
npm run build
```

전역 명령으로 써 보려면 저장소 루트에서:

```bash
npm link
```

## 사용법

```bash
llm-check validate <입력파일> --schema <스키마파일> [--json]
```

- `<입력파일>`: LLM 응답이 저장된 텍스트 파일. `-` 를 주면 표준 입력에서 읽습니다.
- `--schema`: 검사에 쓸 JSON Schema 파일 (필수)
- `--json`: 결과를 JSON 한 덩어리로 출력 (CI·스크립트용)

```bash
llm-check --help
```

```bash
llm-check --version
```

빌드 결과를 직접 실행해도 됩니다.

```bash
node dist/cli.js validate examples/output-ok.txt --schema examples/analysis.schema.json
```

### 예시 실행

`examples/` 폴더의 파일로 바로 돌려볼 수 있습니다. 아래는 실제 출력입니다.

**통과** — 설명 문장과 코드펜스에 섞인 정상 응답

```bash
node dist/cli.js validate examples/output-ok.txt --schema examples/analysis.schema.json
```

```
통과: examples/output-ok.txt (스키마 examples/analysis.schema.json)
```

**스키마 위반** — `score`가 132이고 `feedback`이 빠진 응답 (종료 코드 1)

```bash
node dist/cli.js validate examples/output-bad.txt --schema examples/analysis.schema.json
```

```
실패: examples/output-bad.txt
/feedback  required  필수 필드가 없습니다: feedback
/score     maximum   최대값 100보다 큽니다 (값: 132)
오류 2개
```

**JSON을 꺼내지 못함** — 괄호가 닫히지 않은 응답 (종료 코드 1)

```bash
node dist/cli.js validate examples/output-broken.txt --schema examples/analysis.schema.json
```

```
실패: examples/output-broken.txt
JSON을 꺼내지 못했습니다: unbalanced (위치 23)
  23번째 문자에서 시작한 괄호의 짝을 찾지 못했습니다.
```

**`--json`** — 기계가 읽는 형식 (종료 코드는 동일)

```bash
node dist/cli.js validate examples/output-bad.txt --schema examples/analysis.schema.json --json
```

```json
{
  "ok": false,
  "input": "examples/output-bad.txt",
  "schema": "examples/analysis.schema.json",
  "extract": {
    "ok": true,
    "strategy": "scan",
    "start": 31,
    "end": 95
  },
  "errors": [
    {
      "path": "/feedback",
      "keyword": "required",
      "message": "필수 필드가 없습니다: feedback"
    },
    {
      "path": "/score",
      "keyword": "maximum",
      "message": "최대값 100보다 큽니다 (값: 132)"
    }
  ]
}
```

표준 입력도 됩니다.

```bash
cat examples/output-ok.txt | node dist/cli.js validate - --schema examples/analysis.schema.json
```

### 종료 코드

| 코드 | 의미 | 예 |
| --- | --- | --- |
| `0` | 검사 통과 | 스키마를 만족함 |
| `1` | **검사 실패** — LLM 출력이 기준에 못 미침 | 스키마 위반, JSON을 꺼내지 못함 |
| `2` | **도구 오류** — 사용법·입출력·스키마가 잘못됨 | 인자 누락, 파일 없음, 스키마 JSON 깨짐, 지원하지 않는 키워드 |

1과 2를 나눈 이유는 CI에서 "LLM 출력이 나쁘다"와 "설정이 잘못됐다"를 구분하기 위해서입니다.
검사 결과(0·1)는 **stdout**, 도구 오류(2)는 **stderr**로 나갑니다. 그래서 종료 코드가 0이나 1이면
`--json` 출력을 그대로 파이프로 받아 파싱할 수 있습니다.

### 지원하는 스키마 키워드

JSON Schema 전체가 아니라 아래 부분집합만 지원하며, **모르는 키워드가 있으면 거절합니다**(종료 코드 2).
검사하지 않은 규칙을 통과시켜 "검사했는데 통과"라는 거짓 결과를 내지 않기 위해서입니다.

`type`(object·array·string·number·integer·boolean·null), `properties`, `required`,
`additionalProperties`(`false`만), `items`(단일 스키마), `enum`(원시값),
`minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`

## 개발 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run build` | tsup으로 `dist/cli.js` 빌드 (shebang 포함) |
| `npm run lint` | ESLint (typescript-eslint strictTypeChecked) |
| `npm run typecheck` | `tsc --noEmit` 타입 검사 |
| `npm run test` | Vitest 단발 실행 |
| `npm run check` | lint → typecheck → test 순서로 전부 실행 (CI와 동일) |

## 구조

```
src/
  cli.ts                 # 인자 파싱·실제 fs/process 연결 (Node 전용 진입점)
  commands/
    validate.ts          # validate 명령 본체 (io를 주입받아 결과 문자열을 반환)
    version.ts           # package.json 읽기
  core/                  # 순수 로직 (Node API에 의존하지 않음)
    extract-json.ts      # 응답 텍스트에서 첫 JSON 블록 꺼내기
    schema.ts            # JSON Schema 부분집합 → Schema 타입
    validate.ts          # 값 검사 (오류를 모두 모아 반환)
    help.ts, json.ts     # 도움말 텍스트, JSON 헬퍼
test/                    # Vitest 테스트
examples/                # 예시 스키마와 LLM 응답 샘플
docs/
  DECISIONS.md           # 도구·설정 선택 이유
```

`core`는 입력 문자열을 받아 결과를 돌려주는 순수 함수만 두고, 파일·표준 입력·종료 코드는 `commands`와 `cli.ts`가 담당합니다.
`runValidate(args, io)`가 io를 주입받기 때문에, 명령 전체를 실제 파일 없이 테스트할 수 있습니다.

## 설계 이유

설정과 도구 선택의 근거는 [docs/DECISIONS.md](docs/DECISIONS.md)에 정리해 두었습니다.

## 라이선스

MIT — [LICENSE](LICENSE)

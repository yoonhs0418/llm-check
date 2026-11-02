# 설계 결정 기록

이 문서는 llm-check에서 고른 도구와 설정이 **어떤 문제를 막기 위한 선택인지** 기록한다.
한 줄 요약: 이 도구는 LLM 출력 파일을 오프라인에서 검사하므로, 런타임 의존성을 0으로 두고
개발 단계의 안전망(타입·린트·테스트·CI)에 비용을 집중한다.

## 1. 왜 ESM인가

- Node 20 이상에서 ESM이 기본 모듈 형식이고, `node:util`의 `parseArgs`처럼 쓰려는 표준 API가 모두 ESM에서 바로 쓰인다.
- CJS/ESM을 섞으면 `__dirname` 유무, 조건부 export, `require` 불가 같은 문제를 계속 분기해야 한다.
  처음부터 ESM 하나로 고정해 그 분기를 없앴다.
- `import.meta.url`을 쓸 수 있어 "파일 기준 경로"를 번들 이후에도 안정적으로 계산할 수 있다(→ 7번).

## 2. 왜 tsup인가

- 필요한 건 "TS 한 덩어리를 실행 가능한 CLI 파일 하나로" 만드는 것뿐이다. tsup은 esbuild 래퍼라 설정 10줄로 그게 된다.
- CLI를 `tsc`로만 빌드하면 산출물이 파일 트리로 남아 `.js` 확장자·상대경로 문제를 신경 써야 하고, shebang을 붙일 방법이 없다.
  tsup은 번들 + shebang 주입을 한 번에 해 준다.
- rollup/webpack은 이 규모에서 설정 비용이 더 크고, 라이브러리 배포(d.ts, 다중 포맷)가 목표가 아니라 과하다.
- shebang은 소스가 아니라 `banner`로 번들에만 붙인다. 소스에 두면 번들러 설정에 따라 사라지거나 중복될 수 있고,
  실행 파일은 어차피 `dist/cli.js` 하나다.

## 3. 왜 `node:util`의 `parseArgs`인가

- `--help` / `--version` 두 개뿐인 CLI에 외부 파서를 넣으면, 의존성 트리와 공급망 위험이 기능 대비 과하다.
- `parseArgs`는 Node 18.3+ 표준이고 `strict: true`에서 모르는 옵션을 던져 주므로, 오타(`--versoin`)가 조용히 무시되지 않는다.
- 결과적으로 **런타임 의존성 0개**가 유지된다. 오프라인 검사 도구에서 이건 그 자체로 기능이다(설치가 가볍고 재현이 쉽다).
- 서브커맨드가 필요해지면 `allowPositionals`를 켜고 `src/commands` 아래로 분기하면 된다. 그 지점이 오면 다시 판단한다.

## 4. 왜 ESLint flat config + typescript-eslint strictTypeChecked인가

- flat config(`eslint.config.js`)는 ESLint 9+의 기본이고, `.eslintrc` 계열의 암묵적 상속·플러그인 해석 문제를 없앤다.
- 설정 파일을 `.ts`가 아니라 `.js`로 둔 이유: TS 설정 파일을 읽히려면 추가 로더 의존성이 필요하다. 그걸 피했다.
  대신 `eslint.config.js`는 타입 인식 규칙 대상(`**/*.ts`)에서 빠지므로 사실상 린트되지 않는다. 파일이 짧아 감수한다.
- `strictTypeChecked`를 고른 건 이 프로젝트가 **외부에서 온 신뢰할 수 없는 JSON**(LLM 출력)을 다루게 되기 때문이다.
  `no-unsafe-assignment`, `no-unsafe-member-access` 같은 타입 인식 규칙이 "파싱 결과를 검증 없이 쓰는" 코드를 컴파일 전에 잡아 준다.
- 타입 인식 규칙은 타입 정보가 필요하므로 `parserOptions.projectService: true`와 `tsconfigRootDir`가 필수다.
  `projectService`는 tsconfig를 IDE와 같은 방식으로 찾아 주므로, 파일 목록을 린트 설정에 중복 관리하지 않아도 된다.
- `any` 금지는 `strictTypeChecked`에 이미 포함되지만, 프로젝트 규칙이라 `no-explicit-any`를 명시해 의도를 드러냈다.

## 5. 왜 Vitest인가

- TS와 ESM을 추가 변환 설정 없이 그대로 실행한다. Jest는 ESM + TS 조합에서 transform/moduleNameMapper 설정이 늘어난다.
- `node --test`는 의존성이 0이지만 TS를 직접 실행할 수 없어 별도 로더가 필요하고, 이 프로젝트는 "순수 함수에 대한 입력/출력 단정"을
  많이 쓰게 될 예정이라 watch·필터링이 편한 쪽이 낫다.
- `vitest.config.ts`는 **만들지 않았다**. 기본 include 패턴이 `test/*.test.ts`를 이미 잡으므로 빈 설정 파일은 노이즈다.
  커버리지나 환경 설정이 필요해지는 시점에 추가한다.

## 6. 왜 strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes인가

- `strict`: null·undefined를 타입으로 다루지 않으면, 검사 도구에서 가장 흔한 버그인 "필드가 없는 입력"에서 바로 깨진다.
- `noUncheckedIndexedAccess`: 이 도구는 배열·레코드 인덱싱을 많이 하게 된다(`items[0]`, `record[key]`).
  이 옵션이 없으면 TS는 비어 있는 입력에도 값이 있다고 가정한다. 켜 두면 인덱싱 결과가 `T | undefined`가 되어
  "LLM이 빈 배열을 돌려준 경우"를 컴파일 시점에 처리하게 강제한다.
- `exactOptionalPropertyTypes`: `{ reason?: string }`에 `undefined`를 명시적으로 넣는 것과 키를 생략하는 것을 구분한다.
  검사 결과를 JSON으로 출력할 때 `"reason": undefined`가 섞이면 직렬화 결과가 달라지므로, 그 차이를 타입으로 묶어 둔다.

### 함께 켠 옵션 (덜 알려진 것들)

- `module`/`moduleResolution: NodeNext`: Node의 ESM 해석 규칙(확장자 필수, `exports` 필드)을 TS가 그대로 검사하게 한다.
  이걸 켜면 `import "./core/help.js"`처럼 **`.js` 확장자를 붙여야** 한다. 소스는 `.ts`인데 `.js`를 쓰는 게 어색해 보이지만,
  런타임이 보는 경로를 그대로 쓰는 것이 맞다(번들러 없이 실행해도 깨지지 않는다).
- `verbatimModuleSyntax`: `import type`을 자동으로 지우지 않고 작성한 그대로 내보낸다.
  타입만 쓰는 import가 런타임 import로 남아 부수효과를 일으키는 사고를 막는다.
- `isolatedModules`: 파일 하나만 보고 변환할 수 있는 코드만 허용한다. esbuild(tsup)가 파일 단위로 변환하므로,
  "tsc는 통과하는데 번들은 깨지는" 조합을 미리 차단한다.
- `types: ["node"]`: 설치된 모든 `@types`를 자동으로 끌어오지 않고 Node 타입만 명시한다. 전역 타입이 의도치 않게 섞이는 걸 막는다.
- `noEmit: true`: 빌드는 tsup이 하고 tsc는 검사 전용이라는 역할 분리를 설정에 박아 둔다. 그래서 `npm run typecheck`가 산출물을 만들지 않는다.
- `skipLibCheck: true`: 의존성의 `.d.ts`까지 검사하지 않는다. 우리 코드 문제만 보려는 것이고, 검사 시간도 짧아진다.

## 7. 왜 `core/`를 CLI와 분리했는가

- 검사 로직(`core`)은 "입력 문자열 → 판정 결과"인 순수 함수로 두면 테스트에 파일도 프로세스도 필요 없다.
  LLM 출력 검사기는 경계 조건이 많아서, 테스트 비용이 설계 품질을 그대로 결정한다.
- `process.exit`, `console`, `fs` 같은 Node 전용 코드가 로직에 섞이면 테스트가 프로세스 종료나 stdout 캡처에 묶인다.
  그래서 I/O는 `src/commands`, 출력·인자 해석은 `src/cli.ts`로 몰았다.
- 같은 로직을 나중에 CI 플러그인이나 다른 실행 형태에서 재사용할 길도 열어 둔다.
- 구체적인 예: `src/core/version.ts`는 package.json **텍스트**에서 version을 뽑는 순수 함수이고,
  파일을 읽는 쪽은 `src/commands/version.ts`다.

## 8. `--version`을 package.json에서 읽는 이유와 경로 규칙

- 버전 문자열을 코드에 상수로 두면 `package.json`과 어긋난다. 단일 출처를 유지하려고 실행 시점에 `package.json`을 읽는다.
- 경로는 `src/cli.ts`에서 `new URL("../package.json", import.meta.url)`로 계산한다.
  `src/cli.ts`와 번들 산출물 `dist/cli.js`가 **둘 다 패키지 루트의 한 단계 아래**라서 같은 상대 경로가 양쪽에서 유효하다.
  (경로 계산을 `src/commands/` 안에서 하면 번들 후 깊이가 달라져 깨진다. 그래서 진입점이 계산해 인자로 넘긴다.)
- 대안으로 빌드 시 버전을 문자열로 주입(`define`)할 수도 있지만, 그러면 빌드 없이 소스를 실행할 때 값이 비어 버린다.

## 9. 왜 GitHub Actions에서 `npm ci` + `npm run check`인가

- `npm ci`는 `package-lock.json`을 **그대로** 설치한다(없거나 어긋나면 실패). `npm install`은 lock을 갱신할 수 있어
  "CI에서만 다른 버전이 설치돼 통과/실패가 달라지는" 상황이 생긴다. 재현 가능한 환경이 목적이므로 `ci`를 쓴다.
- `npm run check` 하나만 돌리는 이유: 로컬에서 치는 명령과 CI가 치는 명령이 같아야 "내 PC에서는 됐는데" 상황이 줄어든다.
  검사 항목이 늘어나도 수정할 곳은 `package.json`의 `check` 한 곳이다.
- `push`와 `pull_request` 둘 다에서 돌린다: 브랜치 작업 중에도 깨짐을 바로 보고, PR에서는 머지 기준 상태로도 확인한다.
- `cache: npm` 사용 이유: `actions/setup-node`가 lock 파일 해시로 npm 캐시를 복원해 설치 시간을 줄인다.
  캐시 키가 `package-lock.json` 해시라서 의존성이 바뀌면 자동으로 무효화되므로, `npm ci`의 재현성을 깨지 않는다.
- CI가 어떤 Node에서 도는지는 10번 절에서 따로 정리했다(검사는 22/24 매트릭스, Node 20은 산출물 실행만 검증).

## 10. Node 버전: 사용 조건과 개발 조건을 분리한다

관찰한 사실(설치된 버전의 `engines.node`):

| 패키지 | 요구 Node |
| --- | --- |
| `tsup@9.0.0` | `^22.18.0 \|\| ^24.11.0 \|\| >=26.0.0` |
| `vitest@5.0.5` | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `eslint@10.14.0` | `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| 우리 패키지(`engines`) | `>=20` |

즉 **개발 도구의 하한은 Node 22.18**인데 CI는 Node 20에서 돌고 있었다. 지금 깨지지 않더라도
지원 밖 버전에서 검사를 돌린 셈이고, 도구가 새 문법·API를 쓰기 시작하면 CI에서만 터진다.

- **`engines.node: ">=20"`은 유지한다.** 이 필드는 **빌드 산출물의 실행 조건**이다.
  `dist/cli.js`는 런타임 의존성이 0개이고 `node:util`의 `parseArgs`, `node:fs/promises`, `import.meta.url`만 쓰므로
  Node 20에서 문제없이 돈다. 개발 도구 사정 때문에 사용자에게 Node 22를 요구하는 것은 근거가 없다.
- **검사는 Node 22/24 매트릭스에서 돌린다.** 22는 개발 도구의 하한(22.18+)이고, 24는 그다음 LTS다.
  한 버전만 돌리면 "로컬은 24, CI는 22"처럼 버전 차이에서만 나는 문제를 놓친다.
  `node-version: "22"`는 22.x 최신 패치를 받으므로 tsup의 `^22.18.0` 하한을 만족한다(그래서 `22.18`로 고정하지 않았다).
  매트릭스에 20을 넣지 않은 이유: `npm ci`는 경고만 내고 통과하지만, 그 위에서 돌린 tsup/vitest 결과는 지원 밖이라 신뢰할 수 없다.
- **`runtime-floor` job이 따로 필요한 이유**: 위 매트릭스는 `engines`의 하한을 전혀 검증하지 않는다.
  산출물이 Node 20에서 안 돌면 `engines: ">=20"`은 거짓 광고가 된다. 그래서 빌드는 Node 22에서 하고,
  같은 job에서 `setup-node`를 한 번 더 호출해 **실행만 Node 20으로 바꿔** `--help`와 `--version`을 실제로 돌린다.
  job을 두 개로 쪼개면 `dist/`를 artifact로 올렸다 내려야 해서 더 복잡해진다.
- `--version` 출력은 `package.json`의 값과 **문자열 비교**해서 다르면 job을 실패시킨다.
  이 한 줄로 번들의 shebang, ESM 실행, `../package.json` 상대 경로(8번 절)가 Node 20에서도 유효한지 함께 확인된다.
- `.npmrc`의 `engine-strict`는 켜지 않았다. 켜면 Node 20 환경에서 devDependencies 설치 자체가 막혀
  `runtime-floor` job과 "Node 20 사용자" 시나리오가 둘 다 깨진다. 대신 이 구분을 README 표와 CI job 구성으로 드러냈다.

## 11. 로컬 환경 주의: `NODE_ENV=production`

- 이 PC에는 `NODE_ENV=production`이 전역으로 설정돼 있어, 그대로 `npm install`하면 devDependencies가 설치되지 않는다
  (npm이 `omit=dev`로 동작). 빈 `node_modules`로 린트/테스트가 안 돌면 이걸 먼저 의심한다.
- 해결: `NODE_ENV=development npm install` 또는 `npm install --include=dev`.
- CI(GitHub Actions)에는 이 변수가 없으므로 영향이 없다.

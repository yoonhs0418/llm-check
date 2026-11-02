# llm-check

LLM이 만들어 낸 결과물(이미 저장된 출력 파일)을 검사하는 TypeScript CLI입니다.
LLM API를 호출하지 않는 **오프라인 도구**라서 실행에 네트워크나 API 키가 필요하지 않습니다.

> 현재는 **프로젝트 뼈대 단계**입니다. 빌드·린트·타입체크·테스트·CI 기반과 `--help` / `--version`만 동작하고,
> 실제 검사 기능은 아직 구현되어 있지 않습니다.

## 요구 사항

- Node.js 20 이상 (`package.json`의 `engines.node`로 명시)
- npm

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
llm-check --help
```

```bash
llm-check --version
```

빌드 결과를 직접 실행해도 됩니다.

```bash
node dist/cli.js --help
```

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
  cli.ts        # 인자 파싱과 출력 (Node 전용 진입점)
  commands/     # 입출력·파일 접근을 담당하는 계층
  core/         # 순수 로직 (Node API에 의존하지 않음)
test/           # Vitest 테스트
docs/
  DECISIONS.md  # 도구·설정 선택 이유
```

검사 로직은 앞으로 `src/core`에 순수 함수로 추가하고, 파일 읽기와 출력은 `src/commands`와 `src/cli.ts`에 둡니다.
그래서 기능이 늘어나도 이 README의 "사용법" 절만 확장하면 됩니다.

## 설계 이유

설정과 도구 선택의 근거는 [docs/DECISIONS.md](docs/DECISIONS.md)에 정리해 두었습니다.

## 라이선스

MIT — [LICENSE](LICENSE)

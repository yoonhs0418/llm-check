/**
 * --help 출력 텍스트를 만드는 순수 함수.
 *
 * 문자열만 돌려주고 출력은 호출자(src/cli.ts)가 담당하므로,
 * 나중에 도움말 내용을 테스트하거나 다른 곳에서 재사용하기 쉽다.
 */
export function renderHelp(): string {
  return [
    "llm-check — LLM이 만들어 낸 출력 파일을 오프라인에서 검사하는 CLI",
    "",
    "사용법:",
    "  llm-check validate <입력파일> --schema <스키마파일> [--json]",
    "  llm-check overlap <문항파일> [--threshold 0.6] [--blank ____] [--max-copied 0] [--json]",
    "  llm-check [--help | --version]",
    "",
    "명령:",
    "  validate            입력에서 첫 JSON 블록을 꺼내 JSON Schema로 검사합니다.",
    "                      <입력파일>에 - 를 주면 표준 입력에서 읽습니다.",
    "  overlap             문항이 정의문을 그대로 되읽는지 글자 2-gram 겹침으로 잽니다.",
    "                      <문항파일>은 { question, definition } 객체의 JSON 배열입니다.",
    "",
    "옵션:",
    "  --schema <경로>     검사에 쓸 JSON Schema 파일 (validate에 필수)",
    "  --threshold <비율>  겹침이 이 값 이상이면 copied로 봅니다 (기본 0.6)",
    "  --blank <문자열>    문항의 빈칸 표시 (기본 ____)",
    "  --max-copied <수>   허용할 copied 개수. 넘으면 종료 코드 1 (기본 0)",
    "  --json              결과를 JSON 한 덩어리로 출력합니다 (CI·스크립트용)",
    "  -h, --help          이 도움말을 출력합니다",
    "  -v, --version       버전을 출력합니다",
    "",
    "종료 코드:",
    "  0  통과",
    "  1  검사 실패 (JSON을 꺼내지 못했거나 스키마를 위반함)",
    "  2  사용법·입출력·스키마 오류",
  ].join("\n");
}

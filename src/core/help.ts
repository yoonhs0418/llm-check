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
    "  llm-check [options]",
    "",
    "옵션:",
    "  -h, --help     이 도움말을 출력합니다",
    "  -v, --version  버전을 출력합니다",
    "",
    "현재는 프로젝트 뼈대 단계이며, 검사 명령은 아직 제공하지 않습니다.",
  ].join("\n");
}

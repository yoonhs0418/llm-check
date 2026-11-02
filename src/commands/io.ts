/**
 * 명령(src/commands/*)이 바깥 세계와 닿는 지점의 공용 타입.
 *
 * 명령은 이 인터페이스만 보고, 실제 fs/process 연결은 src/cli.ts 한 곳에서 한다.
 * 그래서 명령 전체를 실제 파일 없이 테스트할 수 있다(DECISIONS 13절).
 */

export interface CommandIo {
  /** 읽지 못하면 reject한다(없는 파일, 권한 등). */
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
}

/**
 * 0: 통과 / 1: 검사 실패(LLM 출력이 기준 미달) / 2: 도구 사용·입출력·스키마 오류
 */
export type ExitCode = 0 | 1 | 2;

export interface RunResult {
  readonly exitCode: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

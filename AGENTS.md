# llm-check

LLM이 낸 결과물(이미 만들어진 출력 파일)을 검사하는 TypeScript CLI.
LLM API를 직접 호출하지 않는 오프라인 도구다.
아이디어 출처: Job Crush(Gemini 응답 JSON 복구·스키마 검증), MetaLearn(문항이 정의문을 그대로 옮겼는지 재는 판정기).
목적: 토스 Platform Engineer 인턴 지원용 공개 리포. 작고 정확하게 만든다.

## 작업 규칙
- 한 번에 한 단계만. 요청하지 않은 기능은 만들지 말 것
- 외부 의존성은 꼭 필요할 때만, 추가하면 이유를 docs/DECISIONS.md에 적을 것
- any 금지, strict TypeScript 유지
- 로직은 src/core에 순수 함수로, 입출력은 src/commands에
- 새 로직에는 테스트를 함께 작성하고 npm run check 통과 확인
- 내가 모를 만한 설정이나 패턴을 쓰면 짧게 설명할 것

# AGENTS.md

> 본 프로젝트의 작업 규칙 SSOT (Single Source of Truth) 는 **`.claude/CLAUDE.md`** 다.
> 이 문서는 외부 코딩 에이전트(Codex, Cursor, Aider 등) 를 위한 **얇은 진입점**이며, 자체 규칙을 정의하지 않는다.
> 본 문서와 `.claude/CLAUDE.md` 가 다르면 **언제나 `.claude/CLAUDE.md` 를 우선** 따른다.
>
> **강제 범위 주의**: `.claude/settings.json`(verify 명령 allow, SessionStart 훅 등) 과 전역 `~/.claude/settings.json`(비밀파일 read-deny) 은 **Claude Code 에서만** 작동한다. 외부 에이전트(Codex / Cursor / Aider 등) 는 그 강제를 받지 않으므로, 셸 정책·승인 게이트 등은 **본 문서와 `.claude/CLAUDE.md` 의 prose 가 SSOT** 다.

## 작업 시작 전 필독

다음 순서로 읽고 작업을 시작한다.

1. `.claude/CLAUDE.md` — 구동 순서, 코딩 원칙 요약, 참조 문서 인덱스, 검증 명령
2. `README.md` — 빌드·실행·환경 설정
3. `docs/architecture.md`, `docs/tauri-guide.md`, `docs/tauri-commands.md`, `docs/coding-rules.md` — 뼈대 기준
4. `docs/optional/*.md` — 기능 추가 시점에 해당 항목만

상세 코딩 원칙·검증 명령은 모두 `.claude/CLAUDE.md` 에 있으며 본 문서는 중복으로 옮겨 적지 않는다.

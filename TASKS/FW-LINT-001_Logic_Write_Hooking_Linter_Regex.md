# [Feature] FW-LINT-001: 정규식 기반 Hooking Linter 1차 — 제목·설명·도입부 자막 키워드 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-LINT-001: Hooking Linter 1차 — TS-STATIC-001 의 키워드 사전 활용 + 콘텐츠 (제목·설명·도입부 자막) 자동 검증 + CLI + CI 게이트"
labels: 'feature, lint, content, ci, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-LINT-001] CLI 스크립트 (`npm run lint:hooking`) — 콘텐츠 (Lesson 의 title·script·video 설명·도입부 30초 자막) 에서 후킹 키워드 자동 검출 + Pass/Fail 출력 + CI 통합 시 배포 차단
- **목적**: PRD 원칙 1 (이해 우선 — 후킹·자극 표현 금지) 의 자동화 검증. CON-05 (후킹 금지 정책) 의 데이터 레이어 강제. 단일 제작자(CON-08) 가 콘텐츠 편집 시 수동 검토 부담 제거. **TS-STATIC-001 (이미 발행) 의 키워드 사전을 본 Linter 가 활용**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-007 (Hooking Linter 2차 LLM)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
  - `/docs/SRS_V0_9.md#6.3` — CI 자동화
- 선행: TS-STATIC-001 (키워드 사전), CT-DB-003 (Lesson — title·script), CT-DB-007 (TeacherKit), IF-CI-001 (워크플로 베이스)
- 짝: FW-LINT-002 (LLM 2차), FW-LINT-003 (정의 검증), FW-LINT-004 (CC 라이선스)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lint-rules/hooking-keywords.json` 신규 — TS-STATIC-001 의 키워드 사전 통합 또는 별도 분리:
  ```json
  {
    "version": "1.0",
    "categories": {
      "exaggeration": ["1주일 마스터", "100% 보장", "절대 실패 안함", "월 천만원"],
      "fear_inducing": ["놓치면 후회", "지금 안하면 늦어", "마지막 기회"],
      "monetization_promise": ["부자 되는 법", "주식 비법", "빠른 부의 길"],
      "false_urgency": ["오늘만!", "지금 시작!", "바로 행동!"],
      "exclusivity_clickbait": ["아무도 모르는", "전문가만 아는", "비밀 공개"]
    },
    "patterns": [
      {"regex": "(\\d+)일\\s*만에", "reason": "시간 단축 약속 — 학습 깊이 위배"},
      {"regex": "월\\s*\\d+\\s*만원", "reason": "수익 약속"},
      {"regex": "수익률\\s*\\d+%", "reason": "수익률 보장"}
    ]
  }
  ```
- [ ] `scripts/lint-hooking.ts` CLI 스크립트:
  ```ts
  import { prisma } from '@/lib/db';
  import keywords from '../lint-rules/hooking-keywords.json';

  interface Violation {
    field: 'title' | 'script' | 'description' | 'subtitle';
    lessonId: string;
    word: string;
    category: string;
    excerpt: string;  // 위반 위치 ±50자
  }

  async function lintHooking(): Promise<{ pass: boolean; violations: Violation[] }> {
    const violations: Violation[] = [];

    // 1. Lesson 모든 데이터 조회
    const lessons = await prisma.lesson.findMany({
      select: { lessonId: true, title: true, script: true, /* description, subtitle 등 */ },
    });

    // 2. 카테고리별 키워드 검사
    for (const lesson of lessons) {
      const fields: Array<{ name: 'title' | 'script'; value: string }> = [
        { name: 'title', value: lesson.title },
        { name: 'script', value: lesson.script },
      ];

      for (const field of fields) {
        for (const [category, words] of Object.entries(keywords.categories)) {
          for (const word of words as string[]) {
            const idx = field.value.indexOf(word);
            if (idx !== -1) {
              violations.push({
                field: field.name,
                lessonId: lesson.lessonId,
                word,
                category,
                excerpt: field.value.substring(Math.max(0, idx - 50), Math.min(field.value.length, idx + word.length + 50)),
              });
            }
          }
        }

        // 3. 정규식 패턴 검사
        for (const pattern of keywords.patterns) {
          const regex = new RegExp(pattern.regex, 'g');
          let match;
          while ((match = regex.exec(field.value)) !== null) {
            violations.push({
              field: field.name,
              lessonId: lesson.lessonId,
              word: match[0],
              category: 'pattern',
              excerpt: field.value.substring(Math.max(0, match.index - 50), Math.min(field.value.length, match.index + match[0].length + 50)),
            });
          }
        }
      }
    }

    return { pass: violations.length === 0, violations };
  }

  // CLI 진입점
  lintHooking().then(({ pass, violations }) => {
    if (pass) {
      console.log('✓ Hooking Linter 1차 통과 (위반 0)');
      process.exit(0);
    } else {
      console.error(`❌ ${violations.length}건 위반 검출:`);
      violations.forEach(v => {
        console.error(`  [${v.category}] ${v.lessonId}.${v.field}: "${v.word}"`);
        console.error(`    ${v.excerpt}`);
      });
      process.exit(1);
    }
  });
  ```
- [ ] **package.json scripts**:
  ```json
  "lint:hooking": "tsx scripts/lint-hooking.ts",
  "lint:hooking:fix": "echo '수정은 콘텐츠 편집 SOP 따라 수동 진행'"
  ```
- [ ] **CI 통합 (IF-CI-001 의 quality.yml 에 추가 — 또는 IF-CI-003 통합)**:
  ```yaml
  hooking-lint:
    runs-on: ubuntu-latest
    needs: [setup]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run db:seed  # Lesson 시드 (CT-MOCK-001)
      - run: npm run lint:hooking
  ```
- [ ] **콘텐츠 외 영역 확장 (별도 후속)**:
  - 메일 템플릿 (`lib/email/templates/*.tsx`) — JSX 텍스트 추출 후 검증
  - PDF 템플릿 — 동적 생성 콘텐츠 미포함 (Lesson 데이터만 활용)
  - 정적 페이지 (랜딩·하단 배너 등) — Markdown 또는 JSX 추출
- [ ] **위반 검출 시 출력 형식**:
  - lesson_id + 필드명 + 키워드 + 카테고리 + 발견 위치 ±50자 excerpt
  - exit code 1 → CI Fail
- [ ] **카테고리별 정책 차등 (선택, 별도 후속)**:
  - exaggeration·monetization — 즉시 Fail
  - false_urgency·exclusivity — 경고 (선택적 차단)
  - 본 태스크는 **모두 Fail** (단순 정책)
- [ ] **Whitelist 관리 정책 (예외)**:
  - 콘텐츠상 필요한 표현이 false positive 검출 시 — `lint-rules/hooking-allowlist.json`
  - 단 allowlist 추가는 PR 리뷰 의무 + 정책 검토
- [ ] **EventLog 발행 (운영 환경 검증 시)**:
  - `content.lint_pass` (정상)
  - `content.lint_fail` (위반)
  - 운영자 알림 — 위반 시 Sentry 또는 Slack

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 콘텐츠 — Pass
- **Given**: Lesson 시드 (후킹 키워드 0건)
- **When**: `npm run lint:hooking`
- **Then**: exit code 0 + "통과" 출력

### Scenario 2: title 에 후킹 키워드 — Fail
- **Given**: Lesson title = "1주일 만에 마스터하는 경제"
- **When**: 실행
- **Then**: exit code 1 + "exaggeration" 카테고리 검출 + lesson_id·excerpt 출력

### Scenario 3: script 에 후킹 — Fail
- **Given**: script 에 "월 천만원 벌기" 포함
- **When**: 실행
- **Then**: monetization_promise 검출

### Scenario 4: 정규식 패턴 — Fail
- **Given**: script 에 "수익률 30%"
- **When**: 실행
- **Then**: pattern 카테고리 검출

### Scenario 5: 다중 위반 — 모두 출력
- **Given**: 3 lesson 에 5건 위반
- **When**: 실행
- **Then**: 5건 모두 출력 + exit code 1

### Scenario 6: CI 통합 — PR Fail
- **Given**: 위반 PR
- **When**: GitHub Actions 실행
- **Then**: hooking-lint Job Fail + main merge 차단

### Scenario 7: TS-STATIC-001 사전 정합
- **Given**: 동일 키워드 사전 활용
- **When**: TS-STATIC-001 + 본 Linter 동시 실행
- **Then**: 동일 위반 검출 (정합)

### Scenario 8: allowlist 활용
- **Given**: false positive 키워드 + allowlist 등록
- **When**: 실행
- **Then**: 해당 키워드 미검출. 다른 위반은 정상 검출

### Scenario 9: 위반 위치 excerpt 정확성
- **Given**: script 200자 + 100자 위치에 후킹 키워드
- **When**: 실행
- **Then**: excerpt 가 ±50자 범위 (50~150 자) 출력

### Scenario 10: 응답 시간
- **Given**: Lesson 125편 + 키워드 100개
- **When**: 실행
- **Then**: 실행 시간 ≤ 10초 (CI 부담 최소)

## :gear: Technical & Non-Functional Constraints
- **TS-STATIC-001 사전 활용**: 키워드 사전 단일 출처 (lint-rules/hooking-keywords.json). 두 검증기 동일 사전
- **CLI + CI 통합**: 로컬 + 자동화 양쪽 동작
- **카테고리 5종**: exaggeration·fear·monetization·false_urgency·exclusivity
- **정규식 패턴 추가**: 단순 키워드 외 패턴 검증 (수익률·기간 약속)
- **위반 발견 시 즉시 Fail (exit code 1)**: CI 차단 강제
- **excerpt ±50자**: 발견 위치 컨텍스트 제공 (수정 가이드)
- **allowlist 신중 활용**: false positive 만. PR 리뷰 의무
- **응답 시간 ≤ 10초**: 125 lesson + 100 키워드 = O(n×m) 단순 매칭
- **SQLite + PostgreSQL 호환**: 단순 SELECT 만, 양 환경 동작
- **운영 환경 EventLog (선택)**: 위반 발견 시 운영자 알림
- **금지**:
  - allowlist 무분별 추가 (정책 약화)
  - 카테고리별 차등 처리 임의 (모두 Fail 단일 정책)
  - exit code 0 출력 시 위반 잔존 (CI 우회)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lint-rules/hooking-keywords.json` 작성 (TS-STATIC-001 정합)
- [ ] `scripts/lint-hooking.ts` CLI 구현
- [ ] package.json `lint:hooking` 스크립트
- [ ] CI 통합 (IF-CI-001 또는 IF-CI-003 의 Job)
- [ ] 위반 출력 형식 (lesson_id + 카테고리 + excerpt)
- [ ] allowlist 정책 + 파일 생성
- [ ] 응답 시간 ≤ 10초 측정
- [ ] PR 본문에 "PRD 원칙 1 자동화 검증. CON-05 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - TS-STATIC-001 (키워드 사전 — 이미 발행)
  - CT-DB-003 (Lesson 모델)
  - CT-MOCK-001 (Lesson 시드)
  - IF-CI-001 (워크플로 베이스)
- **Blocks**:
  - FW-LINT-002 (LLM 2차 — 본 Linter 통과 후 실행)
  - FW-LINT-003 (정의 검증)
  - IF-CI-003 (CI 후킹 린터 통합 — 본 스크립트 호출)
  - TS-UT-011 (Hooking Linter 단위 테스트)
- **Related**:
  - REQ-FUNC-007 (Hooking Linter 정책)
  - CON-05 (후킹 금지)

# [Test] TS-STATIC-001: 후킹 키워드 정적 분석 (CI grep) — PRD 원칙 1 영구 회귀 방지

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-STATIC-001: 후킹 키워드 정적 분석 — 50+ 한국어 후킹 키워드 grep + CI 빌드 차단"
labels: 'test, static, ci, hooking, story-2, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-STATIC-001] 코드·콘텐츠 전반에 후킹 키워드 50+ 종 (부자, 초보 탈출, 자동 수익, 1주일 마스터, 대박, 한방, 보장 등) 의 정적 분석 검출 + CI 빌드 차단
- **목적**: PRD 원칙 1 (이해 우선) · CON-05 (후킹 금지) 의 코드·콘텐츠 레이어 영구 회귀 방지. 단일 제작자가 매 PR 마다 수동 검토 없이 후킹 톤 회귀를 즉시 차단할 수 있는 자동화 안전망. REQ-NF-013 (후킹 톤 검출 자동화) 의 1차 게이트이며, TS-E2E-009 (시각 회귀) 와 함께 후킹 부재의 이중 방어선.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-013 (후킹 톤 검출 자동화)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-007 (랜딩 톤 차분)
  - `/docs/SRS_V0_9.md#5.1` — TC-007 (후킹 키워드 검출)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-CI (단일 quality.yml — 본 검사 통합)
- PRD 원칙 1 (이해 우선) — 단기 흥미·자극 영구 배제
- 페르소나: SH-03 이수민 (Q3-A · 30대 직장인 · 미디어 노출 피로)
- 선행: IF-CI-001 (quality.yml), IF-CI-003 (정적 분석 Job 인프라)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **후킹 키워드 사전 작성** — `lint-rules/hooking-keywords.json`:
  ```json
  {
    "categories": {
      "wealth_promise": ["부자", "부자 되기", "부자 되는", "부의 비밀", "재테크 비법", "월 1억", "월 천만", "수익률 보장", "원금 보장"],
      "shortcut": ["1주일 마스터", "한 달 만에", "단기간", "초보 탈출", "쉽게", "간단히", "한방에", "한 번에"],
      "automation": ["자동 수익", "자동 매매", "패시브 인컴", "잠자는 동안", "가만히 앉아"],
      "fomo": ["지금 시작", "마지막 기회", "한정", "조기 마감", "오늘만", "긴급", "서두르세요"],
      "exaggeration": ["대박", "초대박", "혁명", "획기적", "필수", "반드시", "100% 보장", "비법", "비밀 공개"],
      "guarantee": ["수익 보장", "성공 보장", "확실한", "손해 X"],
      "celebrity_authority": ["전문가만 아는", "고수의", "재벌의", "워렌 버핏도"]
    },
    "exemption_paths": [
      "tests/fixtures/anti-patterns/",
      "docs/PRD/",
      "lint-rules/hooking-keywords.json"
    ],
    "version": "1.0",
    "last_updated": "2026-04-25"
  }
  ```
- [ ] 검사 대상 디렉토리 — `app/`, `components/`, `lib/`, `prisma/seed/` (콘텐츠 시드 포함)
- [ ] **검사 도구 선택** — Node.js 스크립트 + `globby` + 정규식 매칭. 또는 ESLint custom rule 작성 (장기적 권장)
- [ ] **본 태스크는 Node.js 스크립트 채택** (단순성 + CI 통합 용이):
  ```ts
  // scripts/check-hooking-keywords.ts
  import { globby } from 'globby';
  import fs from 'fs';
  import keywords from '../lint-rules/hooking-keywords.json';

  async function check() {
    const files = await globby(['app/**/*.{ts,tsx}', 'lib/**/*.ts', 'prisma/seed/**/*.ts'], {
      ignore: keywords.exemption_paths
    });
    const violations: Array<{file, line, keyword, category}> = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n');
      for (const [cat, words] of Object.entries(keywords.categories)) {
        for (const word of words as string[]) {
          lines.forEach((line, i) => {
            if (line.includes(word) && !line.match(/^\s*\/\//)) {
              violations.push({ file: f, line: i + 1, keyword: word, category: cat });
            }
          });
        }
      }
    }
    if (violations.length > 0) {
      console.error('후킹 키워드 검출:', JSON.stringify(violations, null, 2));
      process.exit(1);
    }
    console.log('후킹 키워드 0건. 통과.');
  }
  check();
  ```
- [ ] **콘텐츠 시드 검사 포함** — `prisma/seed/lessons.ts` 의 `script`, OX `questionText` 필드도 검사 대상
- [ ] **DB 콘텐츠 검사 (선택)** — Lesson.script, OxQuestion.questionText 의 DB 값도 검사:
  - 별도 스크립트 `scripts/check-db-hooking.ts` 작성
  - Vercel Cron 또는 수동 실행 (CI 부하 우려)
  - 본 태스크는 코드·시드 검사만 필수, DB 검사는 별도 후속 (Public Pilot 단계)
- [ ] **CI 통합 — `.github/workflows/quality.yml`** 의 `static-analysis` Job:
  ```yaml
  - name: Check hooking keywords
    run: npx tsx scripts/check-hooking-keywords.ts
  ```
- [ ] **PR 코멘트 자동화** — violations.json 을 GitHub Action 의 `peter-evans/create-or-update-comment` 로 PR 에 표시 (파일·라인·키워드·카테고리 명시)
- [ ] **예외 메커니즘** — 의도적 사용 (예: 후킹 키워드를 "사용 금지" 로 설명하는 문서) 의 경우:
  - `// HOOKING_KEYWORD_OK: 사유` 주석으로 라인 단위 예외
  - 또는 `lint-rules/hooking-keywords.json` 의 `exemption_paths` 에 디렉토리 추가
- [ ] **버저닝** — 키워드 사전 변경 시 PR 리뷰 의무. 주기적 (분기별) 사전 갱신 — 새 후킹 트렌드 반영
- [ ] **로컬 재현** — `package.json` 에 `"test:hooking": "tsx scripts/check-hooking-keywords.ts"` 스크립트
- [ ] **branch protection rule** — main 에 본 Job 을 required check 등록

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 후킹 키워드 0건
- **Given**: 차분한 톤의 새 컴포넌트 추가 PR
- **When**: PR 생성 + CI 실행
- **Then**: `static-analysis` Job Pass. PR Checks 녹색. main merge 가능

### Scenario 2: "부자 되기" 키워드 추가 — Fail
- **Given**: 새 랜딩 페이지 텍스트에 "부자 되기" 포함
- **When**: PR 생성
- **Then**: Job Fail. PR 코멘트에 violation 목록 (파일·라인·키워드·카테고리). main merge 차단

### Scenario 3: 콘텐츠 시드 검사 — Lesson.script 의 후킹 표현
- **Given**: `prisma/seed/lessons.ts` 의 script 에 "1주일 마스터" 추가
- **When**: PR 생성
- **Then**: 검출 + Fail. 콘텐츠 편집자도 본 검사 우회 불가

### Scenario 4: 의도적 사용 — `HOOKING_KEYWORD_OK` 주석
- **Given**: 문서나 안티패턴 예시 컴포넌트에서 "1주일 마스터" 사용 + 같은 라인에 `// HOOKING_KEYWORD_OK: 안티패턴 예시` 주석
- **When**: PR 생성
- **Then**: 해당 라인은 검사 skip. Pass

### Scenario 5: 부분 매칭 vs 완전 매칭
- **Given**: 본문에 "부자유스러운 환경" (부자 ≠ 부자) 포함
- **When**: 검사
- **Then**: 단순 substring 매칭으로 검출됨 → false positive. **본 태스크 정책: 단어 경계 무시한 substring 매칭** (보수적). false positive 는 `HOOKING_KEYWORD_OK` 주석으로 처리

### Scenario 6: 카테고리별 리포팅
- **Given**: 다양한 카테고리의 키워드가 검출됨
- **When**: PR 코멘트 검사
- **Then**: 카테고리별 그룹화된 리포트 — `wealth_promise: 2건, fomo: 1건` 같은 형태

### Scenario 7: 실행 시간
- **Given**: 전체 코드베이스 (약 500개 파일)
- **When**: 본 스크립트 실행
- **Then**: ≤ 10초 (CI 비용 영향 최소)

### Scenario 8: 키워드 사전 변경 PR
- **Given**: `lint-rules/hooking-keywords.json` 만 수정한 PR
- **When**: PR 생성
- **Then**: 추가된 키워드가 기존 코드에 검출되는지 자동 확인. 검출 시 Fail (사전 추가 vs 코드 정정 동시 PR 권장)

### Scenario 9: 영문 후킹 키워드 (보조)
- **Given**: 영문 사용자 인터페이스 부분에 "Get Rich" 키워드 추가
- **When**: 검사
- **Then**: 본 태스크는 한국어 우선. 영문은 후속 작업 (별도 카테고리 추가 가능). 현재는 미검출 → Pass (의도)

### Scenario 10: 로컬 재현
- **Given**: 개발자 로컬 환경
- **When**: `npm run test:hooking` 실행
- **Then**: CI 와 동일한 결과 출력. PR 전 사전 검증 가능

## :gear: Technical & Non-Functional Constraints
- **단어 경계 정책**: substring 매칭 채택 (보수적). `부자` 가 `부자유` 안에서도 검출. false positive 는 예외 메커니즘으로 처리
- **카테고리 7종 (PRD 원칙 정합)**:
  - `wealth_promise` (부자·재테크 비법)
  - `shortcut` (단기간 마스터)
  - `automation` (자동 수익)
  - `fomo` (지금·한정·서두르세요)
  - `exaggeration` (대박·혁명·100%)
  - `guarantee` (보장)
  - `celebrity_authority` (전문가만 아는)
- **검사 대상**: TS/TSX 코드 + 시드 파일 + (선택) DB Lesson.script
- **검사 제외**: 본 키워드 사전 자체, 안티패턴 docs, 테스트 fixtures
- **실행 시간**: ≤ 10초 (전체 코드베이스). PR 피드백 루프 효율
- **branch protection**: required check. 우회 금지
- **로컬 재현**: npm script 제공. 개발자 사전 검증 가능
- **PR 코멘트 update vs new**: 동일 PR 재push 시 update (스팸 방지)
- **금지**:
  - violation 무시하고 수동 merge (branch protection 강제)
  - 키워드 사전 임의 삭제 (PR 리뷰 의무)
  - 한국어 외 다른 언어 후킹 검사를 무계획으로 추가 (별도 PR)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lint-rules/hooking-keywords.json` 50+ 키워드 7개 카테고리
- [ ] `scripts/check-hooking-keywords.ts` 구현
- [ ] `.github/workflows/quality.yml` 의 `static-analysis` Job 통합
- [ ] PR 코멘트 자동화 동작 (peter-evans Action)
- [ ] `HOOKING_KEYWORD_OK` 예외 메커니즘 동작
- [ ] branch protection rule required check 등록
- [ ] 의도적 violation PR 1건으로 차단 검증
- [ ] 로컬 `npm run test:hooking` 동작
- [ ] 실행 시간 ≤ 10초 측정
- [ ] CONTRIBUTING.md 에 후킹 정책 + 본 검사 가이드 추가
- [ ] PR 본문에 "본 게이트 통과는 PRD 원칙 1 (이해 우선) 영구 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CI-001 (quality.yml 단일 파일)
  - IF-CI-003 (정적 분석 Job 인프라)
- **Blocks**:
  - TS-E2E-009 (이수민 시각 회귀 — 본 정적 검사가 1차, E2E 가 2차 게이트)
  - **Story 2 폐쇄** — 후킹 부재의 이중 방어선 1차 항목
  - REQ-NF-013 (후킹 톤 검출 자동화) 검증
- **Related**:
  - PRD 원칙 1 영구 회귀 방지 안전망
  - 분기별 키워드 사전 갱신 (운영 SOP)

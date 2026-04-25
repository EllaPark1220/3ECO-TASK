# [Feature] FW-LINT-003: Hooking Linter 정의 검증 — 30초 개념 정의 + 한국 맥락 예시 자막 키워드 매칭

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-LINT-003: 30초 정의 + 한국 맥락 예시 자동 검증 — 자막 키워드 매칭 + Lesson 별 검증 + CI 통합"
labels: 'feature, lint, content, ci, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-LINT-003] CLI 스크립트 — Lesson 의 script (자막) 에서 (1) 30초 내 개념 정의 1회 + (2) 한국 맥락 예시 1개 이상이 포함되었는지 검증 → 둘 중 하나라도 누락 시 Fail
- **목적**: REQ-FUNC-008 (한국 맥락 예시 1개 이상) + 콘텐츠 품질 정책 자동화. 단순 후킹 부재만으로는 학습 가치 부족 — **정의 명확성 + 한국 맥락 적용** 두 축 자동 검증. CON-05 (후킹 금지) 와 사촌 정책 — 후킹 안하는 것 외에도 학습 가치 충족 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-008 (한국 맥락 예시 1개 이상)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-014 (3매체 정합성)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (콘텐츠 품질)
- 선행: CT-DB-003 (Lesson — script), FW-LINT-001 (CLI 패턴), CT-MOCK-001 (Lesson 시드)
- 짝: FW-LINT-001 (1차), FW-LINT-002 (LLM)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lint-rules/korean-context-keywords.json` — 한국 맥락 인지용 키워드 사전:
  ```json
  {
    "version": "1.0",
    "categories": {
      "currency": ["원화", "원/달러", "환율", "한국은행", "기준금리"],
      "institutions": ["한국은행", "금융위", "정부", "국세청", "예금보험공사"],
      "markets": ["코스피", "코스닥", "한국 주식", "삼성전자", "네이버"],
      "policy": ["부동산 정책", "최저임금", "예산", "추경", "재정 정책"],
      "geography": ["서울", "수도권", "지방", "광역시", "한국"],
      "examples": ["한국의 사례", "국내 사례", "최근 뉴스", "2020년대", "코로나"]
    }
  }
  ```
- [ ] `scripts/lint-content-quality.ts` 신규 — 정의 + 한국 맥락 검증
- [ ] **(1) 30초 정의 검증 — 첫 ~150자 (대략 30초 분량) 내 개념 정의**:
  ```ts
  function checkDefinition(script: string, lessonTitle: string): { ok: boolean; reason?: string } {
    // 첫 150자 추출 (한국어 평균 분당 300자 → 30초 = 150자)
    const opening = script.substring(0, 150);

    // 정의 패턴 — "X 는/이란 ... 이다", "X 를 의미한다", "X 는 ... 한 것"
    // 또는 lessonTitle 의 핵심 단어가 첫 150자 내 언급
    const titleKeywords = lessonTitle.split(/\s+/).filter(w => w.length >= 2);
    const titleMentioned = titleKeywords.some(kw => opening.includes(kw));

    // 정의 시그널 단어 — "는", "이란", "을 말한다", "라고 한다"
    const definitionPatterns = [/.+는\s+.+이다/, /.+이란\s+.+/, /.+를?\s+(의미|뜻)하다/];
    const hasDefinition = definitionPatterns.some(p => p.test(opening));

    if (!titleMentioned) {
      return { ok: false, reason: `첫 150자 내 제목 키워드(${titleKeywords.join(', ')}) 미언급` };
    }
    if (!hasDefinition) {
      return { ok: false, reason: `첫 150자 내 명확한 개념 정의 패턴 부재` };
    }
    return { ok: true };
  }
  ```
- [ ] **(2) 한국 맥락 예시 검증 — 사전 키워드 1개 이상 매칭**:
  ```ts
  function checkKoreanContext(script: string): { ok: boolean; matched?: string[]; reason?: string } {
    const matched: string[] = [];
    for (const [category, keywords] of Object.entries(koreanContextKeywords.categories)) {
      for (const word of keywords as string[]) {
        if (script.includes(word)) {
          matched.push(`${category}:${word}`);
        }
      }
    }

    if (matched.length === 0) {
      return {
        ok: false,
        reason: '한국 맥락 키워드 0건 (currency·institutions·markets·policy·geography·examples 중 최소 1개 필요)',
      };
    }
    return { ok: true, matched };
  }
  ```
- [ ] **CLI 통합**:
  ```ts
  async function lintContentQuality() {
    const lessons = await prisma.lesson.findMany({
      select: { lessonId: true, title: true, script: true },
    });

    let failCount = 0;
    for (const lesson of lessons) {
      const defResult = checkDefinition(lesson.script, lesson.title);
      const koreanResult = checkKoreanContext(lesson.script);

      if (!defResult.ok || !koreanResult.ok) {
        failCount++;
        console.error(`❌ ${lesson.lessonId}:`);
        if (!defResult.ok) console.error(`  [definition] ${defResult.reason}`);
        if (!koreanResult.ok) console.error(`  [korean_context] ${koreanResult.reason}`);
      } else {
        console.log(`✓ ${lesson.lessonId}: 정의 OK + 한국 맥락 ${koreanResult.matched!.length}건`);
      }
    }
    process.exit(failCount > 0 ? 1 : 0);
  }
  ```
- [ ] **package.json scripts**:
  ```json
  "lint:content": "tsx scripts/lint-content-quality.ts"
  ```
- [ ] **CI 통합** — IF-CI-001 의 quality.yml 또는 IF-CI-003 (별도 후킹 린터 Job) 에 통합:
  ```yaml
  content-quality-lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run db:seed
      - run: npm run lint:content
  ```
- [ ] **30초 분량 산정 정책**:
  - 한국어 평균 발화 속도 — 분당 300자 (자연스러운 강의)
  - 30초 → 약 150자
  - 영상의 자막 (FW-LINT-001 의 자막 영역) 과 본문 script 의 첫 부분이 일치한다는 가정 (REQ-FUNC-014 정합성)
  - 본 검증은 script 의 첫 150자만 검사
- [ ] **한국 맥락 부재 case 처리**:
  - 일부 lesson 은 글로벌 개념만 다룰 수 있음 (예: "수요와 공급의 기본 원리")
  - 정책: **모든 lesson 에 한국 맥락 1건 이상** (REQ-FUNC-008 강제)
  - 글로벌 개념 다루더라도 한국 시장·정책 비교 1건 이상 의무
- [ ] **allowlist 미적용 정책**:
  - 본 검증은 false positive 최소 (단순 키워드 매칭)
  - allowlist 없음 — 위반 발견 시 콘텐츠 수정 강제
- [ ] **응답 시간**: lesson 125편 검증 ≤ 5초 (단순 문자열 매칭)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 lesson — Pass
- **Given**: title "GDP 의 의미" + script 첫 150자에 "GDP" 언급 + "이다" 정의 + 본문에 "한국은행" 언급
- **When**: `npm run lint:content`
- **Then**: ✓ 통과

### Scenario 2: 첫 150자 내 제목 키워드 미언급 — Fail
- **Given**: title "GDP 의 의미" + script 첫 150자가 "경제는 복잡합니다..." 로 시작 (GDP 미언급)
- **When**: 실행
- **Then**: ❌ definition Fail

### Scenario 3: 정의 패턴 부재 — Fail
- **Given**: 첫 150자에 제목 언급은 있지만 정의 패턴 ("는/이란/의미") 부재
- **When**: 실행
- **Then**: ❌ definition Fail

### Scenario 4: 한국 맥락 0건 — Fail
- **Given**: script 가 글로벌 개념만 (한국 키워드 0건)
- **When**: 실행
- **Then**: ❌ korean_context Fail

### Scenario 5: 한국 맥락 다중 매칭
- **Given**: script 에 "한국은행", "원화", "코스피" 모두 언급
- **When**: 실행
- **Then**: ✓ matched 3건 (institutions·currency·markets)

### Scenario 6: 둘 다 위반 — 모두 출력
- **Given**: 정의 Fail + 한국 맥락 Fail
- **When**: 실행
- **Then**: 두 가지 reason 모두 출력 + exit code 1

### Scenario 7: 다중 lesson 검증
- **Given**: 10편 lesson 중 3편 위반
- **When**: 실행
- **Then**: 3건 위반 출력 + exit code 1

### Scenario 8: 응답 시간 — 125편 ≤ 5초
- **Given**: 125편 lesson + 사전 키워드 30개
- **When**: 실행
- **Then**: ≤ 5초

### Scenario 9: CI 통합 — PR Fail
- **Given**: 위반 PR
- **When**: GitHub Actions
- **Then**: content-quality-lint Job Fail

### Scenario 10: CT-MOCK-001 시드 정합성
- **Given**: CT-MOCK-001 의 Lesson 10편 시드 (한국 맥락 의무)
- **When**: 본 검증 실행
- **Then**: 10편 모두 통과 (시드가 정책 정합)

## :gear: Technical & Non-Functional Constraints
- **30초 = 150자 정책**: 한국어 평균 발화 속도 기반. 영상 자막 vs script 첫 부분 정합성 (REQ-FUNC-014) 가정
- **한국 맥락 1건 이상 강제 (REQ-FUNC-008)**: 모든 lesson 의무
- **6 카테고리**: currency·institutions·markets·policy·geography·examples
- **allowlist 미적용**: false positive 최소. 위반 발견 시 콘텐츠 수정 강제
- **정의 패턴 — 단순 정규식**: "는/이란/의미" 시그널 단어. LLM 활용 (FW-LINT-002) 보다 단순
- **응답 시간 ≤ 5초**: 단순 문자열 매칭
- **CI 통합**: 매 PR 자동 검증
- **콘텐츠 편집 SOP 정합**: 위반 발견 시 수정 가이드 (별도 SOP)
- **금지**:
  - 한국 맥락 0건 lesson 통과 (REQ-FUNC-008 위반)
  - allowlist 추가 (정책 약화)
  - 제목 키워드 미언급 lesson 통과 (학습자 이해 어려움)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lint-rules/korean-context-keywords.json` 작성 (6 카테고리)
- [ ] `scripts/lint-content-quality.ts` 구현
- [ ] 정의 검증 + 한국 맥락 검증 분리
- [ ] CI 통합 (IF-CI-001 또는 IF-CI-003)
- [ ] CT-MOCK-001 시드 정합 검증 (10편 통과)
- [ ] 응답 시간 ≤ 5초 측정
- [ ] PR 본문에 "REQ-FUNC-008 자동 검증 + 30초 정의 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson)
  - CT-MOCK-001 (시드 — 본 검증의 기준 데이터)
  - FW-LINT-001 (CLI 패턴)
  - IF-CI-001 (워크플로 베이스)
- **Blocks**:
  - IF-CI-003 (CI 후킹 린터 Job — 본 스크립트 통합)
  - 콘텐츠 편집 SOP — 위반 시 수정 가이드
- **Related**:
  - REQ-FUNC-008 (한국 맥락 예시)
  - REQ-FUNC-014 (3매체 정합성)

# [Feature] CT-MOCK-001: Lesson 10편 시드 + Module 5종 + OxQuestion 50건 + 콘텐츠 무결성 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-MOCK-001: Lesson 10편 (L001~L010) + Module M1~M5 + OxQuestion 50건 (10×5) 시드 + 무결성 검증 스크립트"
labels: 'feature, backend, content, mock, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-MOCK-001] Alpha 단계 운영을 위한 Lesson 10편 + Module 5종 + OxQuestion 50건 시드 스크립트 + 콘텐츠 무결성 자동 검증
- **목적**: 모든 E2E 테스트 (TS-E2E-001·002·003·004·007·009·010) + Alpha 실 운영의 데이터 기반. 단순 dummy 가 아닌 **REQ-FUNC-008 (한국 맥락 예시 1개 이상) + REQ-FUNC-014 (3매체 정합성) + REQ-FUNC-015 (개정 이력 자동 삽입) + REQ-FUNC-037 (CC BY-NC-SA 4.0 라이선스) 모두 충족하는 실제 운영 가능 콘텐츠**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-008, 009 (콘텐츠 편집 SOP)
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-014, 015 (3매체 정합성·개정 이력)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스 3곳)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-08, 09 (3매체 동시 발행·OX 5문항)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-005 (유튜브 단독)
- 페르소나·Pain — 박지훈 P1 (체계감) · 장은혜 P14 (학생 자기학습 경로)
- 라이선스: CC BY-NC-SA 4.0 (REF-15)
- 선행: CT-DB-001~006 (스키마)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `prisma/seed/index.ts` 메인 시드 스크립트 + 분리:
  - `prisma/seed/modules.ts` — M1~M5
  - `prisma/seed/lessons.ts` — L001~L010
  - `prisma/seed/ox-questions.ts` — 50건
- [ ] **Module 5종 시드 (M1~M5)**:
  ```ts
  const modules = [
    { moduleId: 'M1', name: '화폐와 가치 기초', orderIndex: 1, description: '돈의 기능과 가치 측정의 기본 개념' },
    { moduleId: 'M2', name: '시장과 가격', orderIndex: 2, description: '수요·공급·가격 결정 메커니즘' },
    { moduleId: 'M3', name: '거시 경제 지표', orderIndex: 3, description: 'GDP·물가·실업률 등 주요 지표' },
    { moduleId: 'M4', name: '금융과 위험', orderIndex: 4, description: '저축·투자·신용·리스크 관리' },
    { moduleId: 'M5', name: '경제 정책 판단', orderIndex: 5, description: '재정·통화 정책의 영향 분석' },
  ];
  ```
- [ ] **Lesson 10편 분배**:
  - M1: L001 (화폐의 정의), L002 (가치 측정)
  - M2: L003 (수요와 공급), L004 (가격의 신호)
  - M3: L005 (GDP 의 의미), L006 (인플레이션)
  - M4: L007 (신용과 위험), L008 (분산투자 원리)
  - M5: L009 (재정 정책 사례), L010 (한국 통화 정책)
- [ ] **각 Lesson 의 3매체 콘텐츠**:
  - **youtubeVideoId**: 실제 게시된 유튜브 영상 ID (별도 영상 제작 필요 — 본 시드는 ID 만 매핑. 실제 영상은 콘텐츠 제작 SOP 별도 트랙)
  - **script**: 본문 약 800~1500자. **한국 맥락 예시 1개 이상** (REQ-FUNC-008). `<section id="anchor-1">` ~ `<section id="anchor-5">` 자동 wrap (FR-LES-005 의 마크업)
  - **pdfKitUrl**: `/teacher-kit/{lessonId}.pdf` (FR-PDF-001 가 동적 생성)
- [ ] **revisionLastUpdated 정책**: 시드 시점은 `2026-04-25` 고정 (재현 가능)
- [ ] **revisionNotes 정책**: 첫 시드는 `"v1.0: 최초 발행"` 동일
- [ ] **OxQuestion 50건 (10편 × 5문항)**:
  - 각 lesson 의 questionOrder 1~5
  - questionText: 본문 핵심 개념 검증 (한국 맥락 우선)
  - correctAnswer: O 또는 X
  - explanation: 정답 이유 + 본문 §N 참조
  - scrollAnchor: `anchor-N` (questionOrder 와 매핑)
- [ ] **무결성 검증 스크립트 — `prisma/seed/verify.ts`**:
  ```ts
  async function verify() {
    const lessons = await prisma.lesson.findMany({ include: { oxQuestions: true } });

    // 1. Lesson 10편
    if (lessons.length !== 10) throw new Error(`Lesson 카운트 ${lessons.length} (기대 10)`);

    // 2. lessonId 포맷
    for (const l of lessons) {
      if (!/^L\d{3}$/.test(l.lessonId)) throw new Error(`Invalid lessonId: ${l.lessonId}`);
    }

    // 3. 3매체 NOT NULL + 빈 문자열 거부
    for (const l of lessons) {
      if (!l.youtubeVideoId || !l.script || !l.pdfKitUrl) {
        throw new Error(`3매체 누락: ${l.lessonId}`);
      }
    }

    // 4. Lesson 당 OX 5문항
    for (const l of lessons) {
      if (l.oxQuestions.length !== 5) throw new Error(`OX 카운트 ${l.oxQuestions.length} (기대 5): ${l.lessonId}`);
    }

    // 5. questionOrder 1~5 정합
    for (const l of lessons) {
      const orders = l.oxQuestions.map(q => q.questionOrder).sort();
      if (JSON.stringify(orders) !== JSON.stringify([1,2,3,4,5])) {
        throw new Error(`questionOrder 정합 위반: ${l.lessonId}`);
      }
    }

    // 6. scrollAnchor 포맷
    for (const l of lessons) {
      for (const q of l.oxQuestions) {
        if (!/^anchor-\d+$/.test(q.scrollAnchor)) {
          throw new Error(`scrollAnchor 포맷 위반: ${l.lessonId}/${q.questionOrder}`);
        }
      }
    }

    // 7. 후킹 키워드 부재 (TS-STATIC-001 의 사전 활용)
    const keywords = require('../../lint-rules/hooking-keywords.json');
    for (const l of lessons) {
      for (const cat of Object.values(keywords.categories)) {
        for (const word of cat as string[]) {
          if (l.script.includes(word)) {
            throw new Error(`후킹 키워드 검출: ${l.lessonId} / ${word}`);
          }
        }
      }
    }

    console.log('시드 무결성 검증 통과 ✓');
  }
  ```
- [ ] `package.json` script:
  ```json
  "db:seed": "tsx prisma/seed/index.ts",
  "db:seed:verify": "tsx prisma/seed/verify.ts"
  ```
- [ ] **CI 통합** — `.github/workflows/quality.yml` 에 시드 검증 Job 추가 (별도 Postgres 인스턴스에 시드 후 verify 실행)
- [ ] **시드 idempotency** — `upsert` 사용으로 재실행 시 안전
- [ ] **테스트 격리 정책** — E2E 테스트는 본 시드를 기반으로 하되, 사용자별 진도·스탬프는 spec 별 격리

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 시드 정상 실행
- **Given**: 클린 DB (마이그레이션만 적용)
- **When**: `npm run db:seed`
- **Then**: Module 5건 + Lesson 10건 + OxQuestion 50건 INSERT. 에러 0건

### Scenario 2: 무결성 검증 통과
- **Given**: 시드 완료
- **When**: `npm run db:seed:verify`
- **Then**: 7개 검증 항목 모두 통과. console.log 출력

### Scenario 3: 재시드 idempotency
- **Given**: 1차 시드 완료 후
- **When**: 동일 시드 재실행
- **Then**: 에러 0건. upsert 로 동일 결과 (UPDATE 시 변경 0)

### Scenario 4: 의도적 후킹 키워드 추가 시 검증 실패
- **Given**: lessons.ts 의 script 에 "1주일 마스터" 추가
- **When**: verify 실행
- **Then**: 에러 throw — "후킹 키워드 검출". CI 차단

### Scenario 5: 3매체 누락 시도 시 검증 실패
- **Given**: 어느 lesson 의 script: '' (빈 문자열) 변경
- **When**: verify 실행
- **Then**: 에러 throw — "3매체 누락"

### Scenario 6: OX 문항 4건만 시드 시 검증 실패
- **Given**: L003 의 OX 문항을 4건만 시드
- **When**: verify 실행
- **Then**: 에러 throw — "OX 카운트 4 (기대 5)"

### Scenario 7: questionOrder 중복 시 검증 실패
- **Given**: L001 의 OX 가 (1, 1, 2, 3, 4) — order=1 중복
- **When**: 시드 실행
- **Then**: P2002 발생 (UNIQUE 제약 위반)

### Scenario 8: 한국 맥락 예시 검증
- **Given**: 모든 lesson 의 script
- **When**: 콘텐츠 리뷰
- **Then**: 각 script 에 한국 사례 1개 이상 (예: 한국은행, 원화, 한국 시장 등) 포함. 별도 정규식 검증 가능

### Scenario 9: revisionLastUpdated 고정값
- **Given**: 시드 후
- **When**: 재시드
- **Then**: revisionLastUpdated 가 `2026-04-25` 고정 (테스트 재현성)

### Scenario 10: SQLite + PostgreSQL 호환
- **Given**: 동일 시드 스크립트
- **When**: 양 환경 실행
- **Then**: 양 환경 동일 결과. 무결성 검증 통과

## :gear: Technical & Non-Functional Constraints
- **콘텐츠 품질 기준 (REQ-FUNC-008·014)**:
  - script 800~1500자 (본문 분량 표준)
  - 한국 맥락 예시 1개 이상 (한국은행·원화·한국 시장·정부 정책 등)
  - 후킹 키워드 0건 (TS-STATIC-001 사전 활용)
- **3매체 동시 발행 (INV-08)**: youtubeVideoId·script·pdfKitUrl 모두 시드 시점 일치. 분리 발행 금지
- **OX 5문항 (INV-09)**: Lesson 당 정확히 5문항. 시드 검증으로 강제
- **idempotency**: upsert 사용. 재실행 안전
- **재현성**: revisionLastUpdated 고정 (`2026-04-25`). 테스트 재현 가능
- **CI 통합**: 매 PR 마다 시드 + verify 자동 실행 (별도 Postgres 인스턴스)
- **유튜브 영상 매핑 정책**: 본 시드의 youtubeVideoId 는 placeholder. 실제 영상 제작은 별도 트랙 (콘텐츠 제작 SOP). Alpha 시점에 placeholder ID 가 실제 영상으로 교체
- **CC 라이선스 명시**: 모든 lesson 의 revisionNotes 또는 별도 컬럼에 CC BY-NC-SA 4.0 표기 (FW-PDF-002 의 PDF 푸터에서 활용)
- **콘텐츠 검토 의무**: 시드 PR 은 콘텐츠 리뷰 필수. 단일 제작자라도 자체 검토 체크리스트 활용
- **금지**:
  - 후킹 키워드 포함 (TS-STATIC-001 와 정합)
  - 결제·PII 키워드 (REQ-NF-014·015)
  - 한국 맥락 예시 누락
  - 외부 출처 명시 없는 인용 (REF-NF-026 표절 방지)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Module 5종 + Lesson 10편 + OxQuestion 50건 시드 완료
- [ ] verify.ts 의 7개 검증 항목 통과
- [ ] 모든 Lesson 에 한국 맥락 예시 1개 이상
- [ ] 후킹 키워드 0건 (TS-STATIC-001 사전 검사 통과)
- [ ] CI 통합 — PR 마다 시드 + verify 자동 실행
- [ ] idempotency 검증 (재실행 안전)
- [ ] SQLite + PostgreSQL 양 환경 동작
- [ ] 콘텐츠 리뷰 체크리스트 작성
- [ ] PR 본문에 "Alpha 운영 + 모든 E2E 의 콘텐츠 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma)
  - CT-DB-002 (User — 기본 admin 사용자 시드 위함)
  - CT-DB-003 (Lesson + Module)
  - CT-DB-006 (OxQuestion)
  - TS-STATIC-001 (후킹 키워드 사전 — verify.ts 가 활용)
- **Blocks**:
  - 모든 E2E 테스트 (TS-E2E-001·002·003·004·007·009·010)
  - Alpha 실 운영 (Lesson 콘텐츠 진입로)
  - FR-LES-001~003 (레슨 조회·시청)
  - FW-OX-001 (OX 채점 — OxQuestion 시드 의존)
  - FR-STAMP-002 (스탬프 맵 — Lesson 10편 표시)
- **Related**:
  - 콘텐츠 제작 SOP (별도 트랙)
  - 유튜브 영상 제작 일정

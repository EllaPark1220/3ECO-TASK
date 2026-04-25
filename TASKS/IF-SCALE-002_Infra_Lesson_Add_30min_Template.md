# [Infra] IF-SCALE-002: 신규 레슨 1편 추가 30분 내 완료 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-SCALE-002: 신규 레슨 1편 추가 작업시간 ≤30분 검증 — 콘텐츠 템플릿 + 자동 삽입 + CC 라이선스 검증"
labels: 'infra, scalability, content, template, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-SCALE-002] 신규 레슨 1편 추가 작업시간 ≤ 30분 검증 — 콘텐츠 템플릿 + CLI 자동 삽입 + CC 라이선스 + 3매체 무결성 자동 검증
- **목적**: REQ-NF-051 (신규 레슨 1편 추가 30분 이내) 을 정량적으로 검증한다. 단일 제작자(CON-08) 가 반복적으로 콘텐츠를 추가할 때의 운영 부담을 최소화하기 위해, 표준 템플릿 + CLI 자동화 스크립트 + 무결성 검증을 일체화한다. 30분에는 콘텐츠 작성(유튜브 ID·스크립트·OX 문항 입력) 시간이 포함되지만, 영상 촬영·편집 시간은 제외.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-051 (신규 레슨 1편 추가 30분 이내)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON·OX_QUESTION 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-01 (lessonId UNIQUE), INV-02 (3매체 NOT NULL), INV-08 (3매체 동시 발행)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스 3곳 명시)
- 선행: FW-LINT-004 (CC 라이선스 자동 검증)
- 짝: IF-SCALE-001 (125편 확장 검증 — 확장된 환경에서 1편 추가 측정)

## :white_check_mark: Task Breakdown (실행 계획)

### 콘텐츠 템플릿 정의
- [ ] `templates/lesson-template.json` — 표준 레슨 입력 템플릿:
  ```json
  {
    "lessonId": "L___",
    "moduleId": "M_",
    "title": "",
    "youtubeVideoId": "",
    "script": "",
    "revisionLastUpdated": "YYYY-MM-DD",
    "revisionNotes": "v1.0: 최초 발행",
    "oxQuestions": [
      { "questionOrder": 1, "questionText": "", "correctAnswer": "O|X", "explanation": "", "scrollAnchor": "anchor-1" },
      { "questionOrder": 2, "questionText": "", "correctAnswer": "O|X", "explanation": "", "scrollAnchor": "anchor-2" },
      { "questionOrder": 3, "questionText": "", "correctAnswer": "O|X", "explanation": "", "scrollAnchor": "anchor-3" },
      { "questionOrder": 4, "questionText": "", "correctAnswer": "O|X", "explanation": "", "scrollAnchor": "anchor-4" },
      { "questionOrder": 5, "questionText": "", "correctAnswer": "O|X", "explanation": "", "scrollAnchor": "anchor-5" }
    ]
  }
  ```
- [ ] `templates/lesson-template.md` — 마크다운 가이드 (제작자 참조용):
  - lessonId 부여 규칙 (순차 `L{NNN}`)
  - script 작성 규칙 (800~1500자, 한국 맥락 예시 1개+, 후킹 금지)
  - OX 문항 작성 규칙 (정답 균형, scrollAnchor 매핑)

### CLI 자동 삽입 스크립트
- [ ] `scripts/add-lesson.ts` — 인터랙티브 CLI 또는 JSON 파일 기반 삽입:
  ```ts
  #!/usr/bin/env tsx
  import { z } from 'zod';
  import { prisma } from '../lib/prisma';

  const LessonInput = z.object({
    lessonId: z.string().regex(/^L\d{3}$/),
    moduleId: z.string().regex(/^M\d$/),
    title: z.string().min(2).max(100),
    youtubeVideoId: z.string().min(5),
    script: z.string().min(800).max(5000),
    revisionLastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revisionNotes: z.string().min(1),
    oxQuestions: z.array(z.object({
      questionOrder: z.number().int().min(1).max(5),
      questionText: z.string().min(5),
      correctAnswer: z.enum(['O', 'X']),
      explanation: z.string().min(10),
      scrollAnchor: z.string().regex(/^anchor-\d+$/),
    })).length(5),
  });

  async function addLesson(inputPath: string) {
    const startTime = Date.now();

    // 1. JSON 파일 읽기 + 검증
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const input = LessonInput.parse(raw);

    // 2. 중복 체크
    const existing = await prisma.lesson.findUnique({ where: { lessonId: input.lessonId } });
    if (existing) throw new Error(`lessonId ${input.lessonId} 이미 존재`);

    // 3. 후킹 키워드 검증 (FW-LINT-004 활용)
    await validateNoHookingKeywords(input.script, input.title);

    // 4. CC 라이선스 체크 (FW-LINT-004)
    // revisionNotes 또는 metadata 에 CC BY-NC-SA 4.0 명시 검증

    // 5. DB INSERT (트랜잭션)
    await prisma.$transaction(async (tx) => {
      await tx.lesson.create({ data: { ...input, oxQuestions: undefined } });
      await tx.oxQuestion.createMany({ data: input.oxQuestions.map(q => ({ ...q, lessonId: input.lessonId })) });
    });

    // 6. 무결성 검증
    const verify = await prisma.lesson.findUnique({
      where: { lessonId: input.lessonId },
      include: { oxQuestions: true },
    });
    assert(verify!.oxQuestions.length === 5);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ ${input.lessonId} 추가 완료 (DB 작업 ${elapsed}초)`);
  }
  ```
- [ ] **`package.json` 스크립트**:
  ```json
  "lesson:add": "tsx scripts/add-lesson.ts",
  "lesson:add:verify": "tsx scripts/verify-lesson.ts"
  ```

### 작업 시간 측정
- [ ] **측정 프로토콜** — `docs/sop/lesson-add-timing.md`:
  1. 템플릿 JSON 복사 → 30초
  2. lessonId + moduleId + title 입력 → 1분
  3. youtubeVideoId 확인·입력 → 1분
  4. script 작성 (800~1500자) → 15분
  5. OX 5문항 작성 → 8분
  6. `npm run lesson:add content/L0XX.json` → 30초
  7. 검증 확인 → 30초
  8. **총 예상: ~26분 (≤ 30분)**
- [ ] **3회 반복 측정** — L126, L127, L128 각각 추가하며 시간 기록
- [ ] **측정 결과 문서화** — 평균, 최대, 최소 시간 기록

### 후속 자동화 (선택)
- [ ] **인터랙티브 CLI 모드** (선택) — 프롬프트 기반 입력:
  ```bash
  npm run lesson:add:interactive
  # → "lessonId?" → "L126"
  # → "moduleId?" → "M1"
  # → "title?" → ...
  ```
- [ ] **PDF 캐시 사전 생성** (선택) — `lesson:add` 후 자동으로 `GET /api/teacher/kit/L126` 호출하여 PDF 사전 캐시

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 템플릿 기반 1편 추가 — 30분 이내
- **Given**: 표준 템플릿 JSON + 콘텐츠 준비
- **When**: `npm run lesson:add content/L126.json` 실행
- **Then**: L126 + OX 5문항 DB INSERT 완료. 총 작업 시간 ≤ 30분 (콘텐츠 작성 포함)

### Scenario 2: Zod 검증 — 잘못된 입력 차단
- **Given**: lessonId 포맷 오류 (`L12` — 3자리 미달)
- **When**: `lesson:add` 실행
- **Then**: Zod parse 실패. DB INSERT 0건. 에러 메시지로 수정 안내

### Scenario 3: 중복 lessonId 차단
- **Given**: L001 이미 존재
- **When**: lessonId `L001` 으로 추가 시도
- **Then**: "lessonId L001 이미 존재" 에러. DB 변경 0건

### Scenario 4: 후킹 키워드 검증 — 위반 시 차단
- **Given**: script 에 "1주일 마스터" 포함
- **When**: `lesson:add` 실행
- **Then**: "후킹 키워드 검출" 에러. DB INSERT 0건

### Scenario 5: OX 5문항 미달 — 차단
- **Given**: oxQuestions 가 4건
- **When**: `lesson:add` 실행
- **Then**: Zod parse 실패 (array length 5 불일치). 에러

### Scenario 6: 트랜잭션 원자성 — OX INSERT 실패 시 Lesson 롤백
- **Given**: Lesson INSERT 성공 후 OX INSERT 에서 에러 발생
- **When**: 트랜잭션 실행
- **Then**: Lesson 도 롤백. DB 에 불완전 데이터 0건

### Scenario 7: 코드 변경 0건
- **Given**: L126 추가 후
- **When**: `git diff -- ':!content/' ':!scripts/'`
- **Then**: 스키마·API·UI 코드 변경 0줄

### Scenario 8: 추가 후 API 정상 동작
- **Given**: L126 추가 완료
- **When**: `GET /api/lesson/L126`
- **Then**: 200 응답 + 정상 7필드 반환

### Scenario 9: 3회 반복 측정 — 평균 ≤ 30분
- **Given**: L126, L127, L128 순차 추가
- **When**: 각 작업 시간 기록
- **Then**: 평균 ≤ 30분. 최대 ≤ 35분

### Scenario 10: SOP 문서 완성
- **Given**: 측정 완료 후
- **When**: `docs/sop/lesson-add-timing.md` 작성
- **Then**: 단계별 시간, 평균·최대·최소 기록. 개선 포인트 식별

## :gear: Technical & Non-Functional Constraints
- **작업 시간 정의 (REQ-NF-051)**: "영상 촬영·편집 시간 제외. DB 삽입 + 콘텐츠 작성(script·OX) + 검증까지"
- **콘텐츠 품질 기준**: IF-SCALE-001 의 placeholder 가 아닌 실제 수준. script 800~1500자 + 한국 맥락 예시 1개+
- **자동화 범위**: CLI 스크립트가 Zod 검증 + 후킹 린터 + DB INSERT + 무결성 검증을 일괄 수행
- **트랜잭션 보장**: Lesson + OX 5문항 은 단일 `$transaction` 으로 원자성 보장
- **SOP 문서화**: 반복 작업이므로 SOP 문서로 표준화. 향후 외주 편집자 (NF-RISK-001) 도 동일 절차 수행 가능
- **금지**:
  - 30분 초과 작업을 정당화 (개선 필요 — 템플릿·CLI 최적화)
  - DB 직접 SQL INSERT (CLI 스크립트 우회)
  - 무결성 검증 생략 (3매체 + OX 5문항 필수)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `templates/lesson-template.json` + `.md` 작성
- [ ] `scripts/add-lesson.ts` CLI 스크립트 구현
- [ ] Zod 검증 + 후킹 린터 + 트랜잭션 INSERT 통합
- [ ] 3회 반복 측정 — 평균 ≤ 30분 증빙
- [ ] `docs/sop/lesson-add-timing.md` SOP 문서 작성
- [ ] 코드 변경 0건 검증 (시드·스크립트 파일 외)
- [ ] PR 본문에 "REQ-NF-051 정량 검증. 평균 N분 달성" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-LINT-004 (CC 라이선스 자동 검증 — CLI 스크립트 내 호출)
  - IF-SCALE-001 (125편 환경 — 확장된 상태에서 추가 테스트)
  - CT-DB-003 (Lesson 모델)
  - CT-DB-006 (OxQuestion 모델)
  - CT-DB-010 (마이그레이션 안정화)
- **Blocks**:
  - 없음 (운영 SOP 태스크 — downstream 기능 의존 없음)
- **Related**:
  - REQ-NF-051 (신규 레슨 1편 추가 30분)
  - NF-RISK-001 (단일 제작자 페이스 — 콘텐츠 추가 속도 관리)
  - CON-08 (단일 제작자 부담 고려)

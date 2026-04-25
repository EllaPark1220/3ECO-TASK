# [Feature] FW-OX-001: submitOx() Server Action 본체 — 정답 판정 + 트랜잭션 INSERT

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-OX-001: submitOx() Server Action 본체 — 정답 판정 + LessonProgress UPDATE + Stamp INSERT"
labels: 'feature, backend, ox, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-OX-001] OX 제출 정답 판정 + `LessonProgress` UPDATE (`oxCompleted=true`) + `Stamp` INSERT 비즈니스 로직 본체
- **목적**: Story 1 (박지훈) 의 핵심 학습 루프 (시청 → 이해 확인 → 스탬프) 의 채점 단계. UC-02 (OX 체크 제출) 의 비즈니스 로직 본체이며, REQ-FUNC-002 (이벤트 누락 <0.5%) 와 REQ-FUNC-006 (중복 채점 방지) 을 충족한다. **본 태스크는 정상 경로 INSERT 만 다루며**, 멱등 변환 (P2002 catch) 은 별도 FW-OX-002 (Issue #3) 에서 처리한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001, 002, 006
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-036 (앵커 스크롤)
  - `/docs/SRS_V0_9.md#3.4.1` — OX 제출 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#3.5.2` — UC-02
  - `/docs/SRS_V0_9.md#6.1` — `submitOx()` 엔드포인트 정의
  - `/docs/SRS_V0_9.md#6.2.3` — INV-03, INV-04 (stamp 발급 전제 조건)
- 선행 계약: CT-API-004 (DTO) · CT-DB-005 (Stamp 제약) · CT-DB-006 (OxQuestion)
- 후속: FW-OX-002 (P2002 변환) · FW-OX-003 (이벤트 발행)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lessons/[id]/actions.ts` 또는 `lib/services/ox.ts` 에 `submitOx()` Server Action 정의
- [ ] 첫 줄에 `requireUser()` 가드 호출 (FR-AUTH-002 의존)
- [ ] Zod 스키마 (`OxSubmitRequestSchema`) 로 입력 검증
- [ ] **트랜잭션 시작** — `prisma.$transaction()` 으로 다음 작업 원자성 보장:
  1. `OxQuestion` 전체 SELECT (where lessonId)
  2. 답안 정답 비교 — 모든 question_order 의 `correctAnswer === answer` 검증
  3. 오답 1개 이상 시 — `passed=false`, `scroll_to_section` = 첫 오답의 `scrollAnchor` 반환. UPDATE 없음
  4. 전 정답 시 — `LessonProgress` UPSERT (`oxCompleted=true, stampEarned=true, updatedAt=now()`)
  5. `Stamp` INSERT (`userId, lessonId, earnedAt`)
- [ ] 트랜잭션 외부에서 응답 구성 — `{ passed, stamp_earned, scroll_to_section? }`
- [ ] 에러 핸들링은 **본 태스크에서 try/catch 의 try 블록만 작성**. catch 블록은 FW-OX-002 가 P2002 처리 추가
- [ ] OxQuestion 미존재 또는 lesson 미존재 → 404 (`LESSON_NOT_FOUND`)
- [ ] answers 배열 길이가 OxQuestion 개수와 불일치 → 400 (`INVALID_ANSWER_COUNT`)
- [ ] LessonProgress 가 없는 경우 (사용자가 시청 안하고 직접 OX 시도) → 정책 결정 필요 — 본 태스크는 **시청 여부 무관 채점 허용** 으로 결정. UPSERT 가 자동 생성
- [ ] EventLog 발행은 FW-OX-003 으로 분리 (본 태스크에서 호출만)
- [ ] **시간성 검증 sanity check** — `OxQuestion.questionOrder` 순서대로 답안 정렬 확인

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전 정답 — 스탬프 정상 발급
- **Given**: User(`u1`) + Lesson(`L001`) (OxQuestion 5개 존재) + 시청 완료 상태
- **When**: `submitOx({ lesson_id: 'L001', answers: [전부 정답] })` 호출
- **Then**: 응답 `{ passed: true, stamp_earned: true }`. DB — LessonProgress.oxCompleted=true, Stamp 1건 INSERT (`u1, L001`)

### Scenario 2: 1개 오답 — 앵커 반환
- **Given**: 동일 셋업
- **When**: 3번째 문항 오답으로 `submitOx()` 호출
- **Then**: 응답 `{ passed: false, stamp_earned: false, scroll_to_section: '#anchor-3' }`. DB UPDATE 발생 안함. Stamp INSERT 발생 안함

### Scenario 3: 다중 오답 — 첫 오답 앵커
- **Given**: 동일 셋업
- **When**: 2번·4번 오답으로 호출
- **Then**: 응답의 `scroll_to_section` = 2번 문항의 scrollAnchor (첫 오답 우선)

### Scenario 4: answers 배열 길이 불일치 — 400
- **Given**: OxQuestion 5개 존재
- **When**: answers 3개만 전송
- **Then**: 400 + `INVALID_ANSWER_COUNT`. 트랜잭션 진입 안함

### Scenario 5: 미인증 — 401
- **Given**: 세션 없음
- **When**: `submitOx()` 호출
- **Then**: `requireUser()` 가드가 throw. 401 응답

### Scenario 6: 존재하지 않는 lesson_id — 404
- **Given**: `L999` 가 없음
- **When**: `submitOx({ lesson_id: 'L999', ... })` 호출
- **Then**: 404 + `LESSON_NOT_FOUND`

### Scenario 7: 트랜잭션 원자성 — Stamp INSERT 실패 시 LessonProgress UPDATE 도 롤백
- **Given**: Stamp INSERT 가 (가상의) DB 에러로 실패한다고 가정
- **When**: `submitOx()` 호출
- **Then**: LessonProgress 의 `oxCompleted` 도 변경되지 않음 (트랜잭션 롤백). 응답은 5xx 에러

### Scenario 8: 시청 미완료 상태에서도 OX 채점 가능
- **Given**: LessonProgress 가 없는 사용자 (시청 0초)
- **When**: 전 정답으로 `submitOx()` 호출
- **Then**: LessonProgress UPSERT 로 자동 생성 (`lastPositionSec=0, oxCompleted=true, stampEarned=true`). Stamp INSERT 정상

### Scenario 9: 응답 시간 목표
- **Given**: 부하 100명 동시 OX 제출
- **When**: k6 부하 테스트
- **Then**: p95 응답 시간 ≤ 500ms (REQ-NF-003 — 스탬프 렌더링 경로 일부)

## :gear: Technical & Non-Functional Constraints
- **트랜잭션 필수**: LessonProgress UPDATE + Stamp INSERT 는 단일 트랜잭션 — `prisma.$transaction()` 사용. 부분 성공 금지
- **정답 비교 시간 일정성**: 정답 비교는 boolean 단순 비교라 timing attack 무관. 하지만 답안 길이 변경에 따른 응답 시간 차이는 무시 가능
- **OxQuestion 캐싱**: 동일 lesson 의 OxQuestion 은 1분 RSC 캐시 적용 가능 (questions 는 거의 불변)
- **에러 분리**:
  - 검증 에러 (400) — Zod parse 실패, answers 길이 불일치
  - 인증 에러 (401) — 세션 없음
  - 권한 에러 (403) — 본 태스크는 LEARNER·TEACHER·ADMIN 모두 OX 가능 (정책 채택)
  - 데이터 에러 (404) — Lesson 또는 OxQuestion 미존재
  - 충돌 에러 (P2002 → 200) — FW-OX-002 가 처리 (본 태스크 범위 밖)
  - 서버 에러 (500) — 트랜잭션 실패
- **이벤트 발행 분리**: 본 태스크는 INSERT 만 수행. EventLog 의 `ox.submitted`·`stamp.earned`·`lesson.completed` 발행은 FW-OX-003 가 트랜잭션 직후 호출
- **응답 시간 (REQ-NF-003)**: p95 ≤ 500ms. 트랜잭션 내부 쿼리 3개 (SELECT + UPDATE + INSERT) 합산 < 200ms 목표
- **RSC revalidate**: 응답 후 `/lessons` 와 `/stamp-map` 경로의 캐시 무효화 (`revalidatePath`)
- **금지**:
  - OxQuestion 의 `correctAnswer` 를 응답에 포함시키는 행위 (정답 노출 방지)
  - Stamp INSERT 를 트랜잭션 외부에서 시도

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] Prisma `$transaction()` 으로 LessonProgress UPDATE + Stamp INSERT 원자성 보장
- [ ] 정답 판정 로직이 OxQuestion 순서 기반으로 정확히 작동
- [ ] 첫 오답의 scrollAnchor 반환 검증
- [ ] 응답 페이로드에 `correctAnswer` 노출 0건 (보안 검토)
- [ ] `requireUser()` 가드 첫 줄 호출 검증
- [ ] TS-UT-004 (오답 시 scroll_to_section 반환), TS-UT-005 의 일부 통과
- [ ] PR 본문에 "본 태스크는 정상 경로만. 멱등 변환은 FW-OX-002" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-004 (submitOx DTO 계약)
  - CT-DB-004 (LessonProgress 모델)
  - CT-DB-005 (Stamp 모델 + UNIQUE 제약)
  - CT-DB-006 (OxQuestion 모델)
  - FR-AUTH-002 (RBAC 가드)
  - FW-AUTH-001 (Supabase Auth)
- **Blocks**:
  - FW-OX-002 (P2002 catch — 본 태스크의 try 블록을 확장)
  - FW-OX-003 (EventLog 발행 — 본 태스크 직후 호출)
  - FW-OX-004 (스탬프 10자리 트리거)
  - FR-OX-001 (OX UI — 본 액션의 클라이언트)
  - FR-LES-005 (오답 앵커 스크롤 — scroll_to_section 활용)
  - TS-IT-001 (Story 1 통합 테스트)
  - TS-E2E-001 (박지훈 E2E — OX 통과 단계)
- **Related**:
  - INV-04 (stampEarned 는 oxCompleted 전제) — 본 로직이 강제

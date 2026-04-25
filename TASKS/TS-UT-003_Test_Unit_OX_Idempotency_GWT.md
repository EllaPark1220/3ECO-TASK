# [Test] TS-UT-003: OX 멱등 GWT 단위 테스트 — P2002 catch → 200 변환 검증 (TC-006)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-UT-003: OX 멱등 GWT 단위 테스트 — P2002 catch → 200 변환 검증 (TC-006)"
labels: 'test, unit, idempotency, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-003] FW-OX-002 의 P2002 → 200 변환 로직에 대한 단위 테스트 (Vitest 기반)
- **목적**: AC = Test Code 원칙에 따라, SRS REQ-FUNC-006 의 AC ("동일 OX 제출의 중복 채점·중복 스탬프 발급 0건") 를 자동화된 피드백 루프로 변환한다. 본 테스트는 §1.5.1.1 Option B 의 영구 멱등 보장이 코드 수준에서 깨지지 않음을 영구히 보증하는 회귀 방지(regression prevention) 안전망이다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — TC-006 정의
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-006 AC
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B 의 6개 시나리오 (FW-OX-002 GWT 와 정합)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-03, INV-05
- 테스트 도구: Vitest + Prisma Mock + MSW (선택)
- 선행 구현: FW-OX-002 (테스트 대상)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/unit/ox-submit-idempotency.test.ts` 신규 파일 생성
- [ ] Vitest 설정에 Prisma Mock 또는 테스트용 SQLite (in-memory) 통합
- [ ] 테스트 픽스처 셋업 — User(`u1`, `u2`) + Lesson(`L001`, `L002`) + OxQuestion(5개) 시드
- [ ] Scenario 1~6 별 `it()` 블록 작성 (FW-OX-002 의 GWT 와 1:1 매핑)
- [ ] 각 시나리오마다 Given (DB 상태 셋업) → When (submitOx 호출) → Then (응답 + DB 상태 + 이벤트 검증) 3단계 명확히 분리
- [ ] **핵심 어서션**: `expect(stampCount).toBe(1)` (멱등 후에도 카운트 1 유지)
- [ ] 응답 페이로드 동등성 검증 — 첫 응답과 재제출 응답이 deep-equal
- [ ] EventLog 검증 — `stamp.earned` 1건 + `ox.duplicate_idempotent` 1건 (재제출 시)
- [ ] 동시성 시나리오 — `Promise.all([submitOx(), submitOx(), submitOx()])` 동시 호출 시 stamp 카운트 1 유지
- [ ] beforeEach/afterEach 로 DB 상태 초기화
- [ ] CI 통합 — IF-CI-001 의 quality.yml 에서 자동 실행
- [ ] 커버리지 리포트 — FW-OX-002 의 catch 블록 100% 라인 커버리지

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 제출 시 정상 INSERT 검증
- **Given**: User(`u1`) + Lesson(`L001`) 픽스처. Stamp 0건 상태
- **When**: `submitOx({ lesson_id: 'L001', answers: [...전부 정답] })` 호출
- **Then**:
  ```ts
  expect(response).toEqual({ passed: true, stamp_earned: true })
  expect(await prisma.stamp.count({ where: { userId: 'u1' } })).toBe(1)
  expect(eventLogCount('stamp.earned')).toBe(1)
  ```

### Scenario 2: 동일 입력 재제출 시 멱등 변환 (TC-006 핵심)
- **Given**: Scenario 1 직후 상태 (Stamp 1건 존재)
- **When**: 동일한 입력으로 `submitOx()` 재호출
- **Then**:
  ```ts
  expect(response2).toEqual(response1) // deep-equal
  expect(await prisma.stamp.count({ where: { userId: 'u1' } })).toBe(1) // 여전히 1건
  expect(eventLogCount('stamp.earned')).toBe(1) // 추가 발행 없음
  expect(eventLogCount('ox.duplicate_idempotent')).toBe(1)
  ```

### Scenario 3: 답안 변경 재제출도 멱등
- **Given**: Scenario 1 직후 상태
- **When**: 일부 오답으로 변경하여 `submitOx()` 호출
- **Then**: 응답은 첫 응답과 동일 (`{ passed: true, stamp_earned: true }`). Stamp 카운트 1 유지

### Scenario 4: 다른 사용자 — 정상 INSERT
- **Given**: Scenario 1 직후 상태 (u1 의 Stamp 1건)
- **When**: User(`u2`) 가 동일 lesson 으로 `submitOx()` 호출
- **Then**: 새 Stamp INSERT 성공. 전체 Stamp 카운트 2

### Scenario 5: P2002 외 에러는 재throw 검증 (가드 회귀 방지)
- **Given**: Prisma Mock 으로 P1001 (DB 연결 실패) 강제 발생
- **When**: `submitOx()` 호출
- **Then**: 함수가 throw 함. catch 되지 않음
  ```ts
  await expect(submitOx(...)).rejects.toThrow(/P1001/)
  ```

### Scenario 6: 동시 100 요청 — 단일 Stamp 보장 (동시성 회귀)
- **Given**: User(`u1`) + Lesson(`L001`)
- **When**: `Promise.all([submitOx(), submitOx(), ..., submitOx()])` 100회 동시 호출
- **Then**:
  ```ts
  const responses = await Promise.all([...])
  expect(responses.every(r => r.passed === true)).toBe(true)
  expect(await prisma.stamp.count()).toBe(1) // 100 호출에도 단일 Stamp
  ```

## :gear: Technical & Non-Functional Constraints
- **테스트 프레임워크**: Vitest (Next.js 권장)
- **격리**: 각 테스트는 beforeEach 에서 DB truncate 후 픽스처 재시드. 테스트 간 상태 누수 0
- **속도**: 본 파일 전체 실행 ≤ 5초 (단위 테스트 표준)
- **DB**: 테스트는 in-memory SQLite 사용 권장. Supabase 실제 인스턴스 호출 금지
- **Mock 정책**: Prisma Client 자체는 실제 사용. 외부 의존(Resend, Gemini, YouTube) 만 mock
- **커버리지**: FW-OX-002 의 catch 블록은 line + branch 커버리지 100% 달성
- **회귀 방지**: 본 테스트가 깨지면 PR 자동 reject. main 브랜치 머지 차단

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 시나리오 모두 `pass`
- [ ] 동시성 시나리오 (Scenario 6) 가 실제 동시 호출로 검증됨 (sequential await 가 아님)
- [ ] FW-OX-002 의 catch 블록 라인·브랜치 커버리지 100%
- [ ] 테스트 파일 실행 시간 ≤ 5초
- [ ] CI (IF-CI-001) 에서 자동 실행되고, 실패 시 빌드 차단
- [ ] PR 본문에 "본 테스트는 §1.5.1.1 Option B 영구 멱등 회귀 방지의 핵심" 명시
- [ ] Vitest watch 모드에서 단독 실행 가능 (`vitest run tests/unit/ox-submit-idempotency.test.ts`)
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-002 (테스트 대상 — 본체 구현 완료 필요)
  - CT-DB-005 (Stamp UNIQUE 제약)
  - CT-DB-002, CT-DB-003, CT-DB-006 (User · Lesson · OxQuestion 시드 위해)
  - CT-MOCK-001, CT-MOCK-002 (픽스처 데이터)
- **Blocks**:
  - TS-IT-010 (통합 테스트 — 본 단위 테스트가 먼저 통과해야 의미 있음)
  - IF-CI-001 (CI 파이프라인 통합 — 본 테스트가 게이트 항목)
  - Alpha Exit (§6.7 Appendix E — REQ-FUNC-006 항목)

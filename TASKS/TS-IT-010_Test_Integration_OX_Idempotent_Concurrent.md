# [Test] TS-IT-010: OX 멱등 통합 테스트 — 동시 100 req → 단일 stamp 보장

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-IT-010: 동시 100 req 동일 입력 → 단일 Stamp INSERT 검증 (Vitest + Prisma 실 DB + k6)"
labels: 'test, integration, idempotency, concurrency, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-010] OX 제출 Server Action 의 동시 100 req 동시 호출 통합 테스트 — Stamp UNIQUE 제약 + P2002 catch 변환의 동시성 안전 검증
- **목적**: TS-UT-003 (단위 테스트) 의 동시성 시나리오 (Scenario 6) 를 **실제 DB 환경 + 실제 네트워크 부하** 조건에서 재검증. SRS §1.5.1.1 Option B 의 영구 멱등 보장이 race condition · DB 격리 수준 · 네트워크 지터 환경에서도 깨지지 않음을 보증. REQ-FUNC-006 (멱등) + REQ-NF-008 (오류율 ≤0.5%) 동시 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B 결정 본문 (특히 동시성·이전 트리거)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-006 AC
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-008 (핵심 오류율 ≤0.5%)
  - `/docs/SRS_V0_9.md#5.1` — TC-006 (멱등 테스트 — 본 태스크가 통합 게이트)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-03 (조합당 stamp 1건), INV-05 (영구 멱등)
- 선행: TS-UT-003 (단위 테스트), FW-OX-001, FW-OX-002, CT-DB-005

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/integration/ox-submit-concurrent.test.ts` 신규 파일 (Vitest)
- [ ] **테스트 환경**:
  - 실제 PostgreSQL 인스턴스 활용 (Supabase 의 dev 프로젝트 또는 로컬 docker)
  - SQLite 단위 테스트 환경과 분리 — 동시성 검증은 PostgreSQL 의 격리 수준 확인 필수
  - `.env.test` 의 DATABASE_URL 활용
- [ ] **beforeAll** — User(`u1`) + Lesson(`L001`) + OxQuestion 5개 시드
- [ ] **beforeEach** — Stamp + LessonProgress truncate (각 시나리오 격리)
- [ ] **시나리오 1 — Promise.all 동시 100 req**:
  ```ts
  it('동시 100 req → 단일 Stamp', async () => {
    const requests = Array.from({ length: 100 }, () =>
      submitOx({ lesson_id: 'L001', answers: [...전부 정답] })
    );
    const responses = await Promise.all(requests);
    
    expect(responses.every(r => r.passed === true)).toBe(true);
    expect(responses.every(r => r.stamp_earned === true)).toBe(true);
    
    const stampCount = await prisma.stamp.count({ where: { userId: 'u1' } });
    expect(stampCount).toBe(1); // 100 호출에도 1건만
    
    const eventLog = await getEventLog();
    const stampEarnedCount = eventLog.filter(e => e.event === 'stamp.earned').length;
    expect(stampEarnedCount).toBe(1); // 정상 INSERT 1건
    
    const duplicateCount = eventLog.filter(e => e.event === 'ox.duplicate_idempotent').length;
    expect(duplicateCount).toBe(99); // 나머지 99건은 멱등 변환
  });
  ```
- [ ] **시나리오 2 — k6 부하 테스트로 실제 HTTP 레벨 검증**:
  - `tests/load/ox-concurrent.k6.js` 신규
  - 100 VU (Virtual Users) 동시 시작 — 1초 내 100 req
  - 응답 시간 분포 (p50, p95, p99) 측정
  - 에러율 측정 (5xx 또는 변환 실패)
  - 실행: `k6 run tests/load/ox-concurrent.k6.js`
- [ ] **시나리오 3 — DB 격리 수준 검증**:
  - PostgreSQL 의 기본 격리 수준 (`READ COMMITTED`) 에서 UNIQUE 제약이 정상 작동
  - `SHOW transaction_isolation;` 출력 확인
  - Serializable 격리 수준 미사용 검증 (성능 영향)
- [ ] **시나리오 4 — 다른 사용자 동시 호출 비충돌**:
  - User u1 와 u2 가 동일 lesson 으로 동시 100 req 씩 (총 200 req)
  - 결과: u1·u2 각자 1건씩 stamp (총 2건). 충돌 0
- [ ] **시나리오 5 — 응답 시간 분포**:
  - 정상 INSERT 경로 vs 멱등 변환 경로 응답 시간 비교
  - **catch 경로의 응답 시간 ≤ 정상 경로의 1.2배** (FW-OX-002 의 제약과 정합)
- [ ] **시나리오 6 — Sentry 메트릭 카운터 검증**:
  - `ox.duplicate_idempotent` 카운터가 정확히 99 증가 검증
  - 본 메트릭은 §1.5.1.1 Option A 이전 트리거 #1 (월간 UNIQUE 충돌율 > 0.5%) 의 측정 기반
- [ ] **CI 통합**:
  - Vitest 시나리오 — IF-CI-001 의 unit/integration test Job 에서 실행
  - k6 시나리오 — IF-CI-005 (k6 부하 Job) 별도. Closed Beta 단계에서 실행 (Alpha 는 단위 테스트만)
- [ ] **Cleanup** — afterAll 에서 픽스처 + EventLog 삭제

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 동시 100 req → 단일 Stamp (Promise.all)
- **Given**: User(`u1`) + Lesson(`L001`) + Stamp 0건
- **When**: `Promise.all([submitOx() × 100])` 실행
- **Then**:
  - 100 응답 모두 `{ passed: true, stamp_earned: true }`
  - DB Stamp 카운트 = 1
  - EventLog `stamp.earned` 1건 + `ox.duplicate_idempotent` 99건

### Scenario 2: k6 부하 테스트 — 실제 HTTP 동시성
- **Given**: 배포된 Vercel Preview URL
- **When**: 100 VU 동시 시작
- **Then**: 5xx 응답 0건. 모든 응답 200 + 동일 페이로드. p95 ≤ 700ms

### Scenario 3: 다른 사용자 비충돌
- **Given**: User u1, u2 가 동일 lesson 으로 각 100 req 씩 동시 호출
- **When**: Promise.all 200 req
- **Then**: u1·u2 각 1건씩 stamp 발급 (총 2건). 충돌 0

### Scenario 4: catch 경로 응답 시간
- **Given**: 첫 INSERT 성공 후 99개 P2002 catch
- **When**: 평균 응답 시간 측정
- **Then**: catch 경로 평균 ≤ 정상 INSERT 평균 × 1.2

### Scenario 5: Sentry 메트릭 정확성
- **Given**: Scenario 1 실행 후
- **When**: Sentry 또는 Vercel Logs 조회
- **Then**: `ox.duplicate_idempotent` 카운터 99 증가. Option A 이전 트리거 측정 기반 정상

### Scenario 6: P2002 외 에러 비변환 (회귀 방지)
- **Given**: DB 연결이 일시적으로 끊어진 상태에서 50 req 동시 호출
- **When**: 호출
- **Then**: P1001 (Connection error) 가 catch 되지 않고 5xx 응답. 일부 req 만 영향 (서버 복구 후 정상화). **P1001 → 200 변환 0건** (FW-OX-002 의 변환 범위 엄격성 검증)

### Scenario 7: 격리 수준 확인
- **Given**: PostgreSQL 인스턴스
- **When**: 트랜잭션 격리 수준 조회
- **Then**: `READ COMMITTED` (기본). UNIQUE 제약이 격리 수준 무관하게 작동

### Scenario 8: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: Vitest 부분 단독 실행
- **Then**: 30초 이내 (실 DB I/O 포함)

### Scenario 9: 시나리오 격리
- **Given**: 본 spec 종료
- **When**: 다른 통합 테스트 실행
- **Then**: 본 테스트 픽스처 잔여 0

### Scenario 10: 응답 페이로드 동등성 (deep-equal)
- **Given**: 100 응답 수집
- **When**: 첫 응답과 나머지 99 응답 비교
- **Then**: 모두 deep-equal 일치 (`{ passed: true, stamp_earned: true }` 동일 구조)

## :gear: Technical & Non-Functional Constraints
- **DB 환경 — 실 PostgreSQL 강제**: 단위 테스트의 SQLite 와 분리. PostgreSQL 의 격리 수준·UNIQUE 제약 동작이 실제 환경과 동일해야 함
- **격리 수준**: PostgreSQL 기본 `READ COMMITTED`. Serializable 미사용
- **k6 부하 시나리오**:
  - 100 VU `setup` 단계에서 동시 시작 (`--vus=100 --duration=10s`)
  - 응답 시간 임계치: p95 < 700ms
  - 에러율 임계치: < 0.5% (REQ-NF-008)
- **CI 부하 비용**:
  - Vitest 통합 테스트 — 매 PR 실행 (저비용)
  - k6 부하 테스트 — Closed Beta 진입 시점 + 주 1회 정기 실행 (비용 관리)
- **flaky 방지**: 동시 호출 후 DB 상태 검증은 약간의 시간 (≤500ms) 대기 — race condition 으로 인한 false negative 방지
- **`Promise.all` vs `Promise.allSettled`**: 일부 req 가 의도적으로 throw 되는 시나리오에서는 `Promise.allSettled` 사용 (Scenario 6 P1001)
- **Sentry 메트릭 측정**: 본 환경에서는 mock 또는 실제 Sentry sandbox 활용. 실 운영 데이터 오염 방지
- **클린업 보장**: afterAll 에서 truncate. Vitest 의 `--no-isolate` 옵션 사용 시 더 신중한 clean up 필요
- **금지**:
  - 단위 테스트 환경 (SQLite) 으로 동시성 검증 (격리 수준 다름)
  - 임의 sleep 대신 condition-based wait 활용
  - 실 운영 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/integration/ox-submit-concurrent.test.ts` 구현 (Vitest + 실 PostgreSQL)
- [ ] `tests/load/ox-concurrent.k6.js` 구현 (k6 부하)
- [ ] DB Stamp 카운트 = 1, EventLog 분리 (1건 + 99건) 검증
- [ ] catch 경로 응답 시간 정상 경로의 1.2배 이내
- [ ] Sentry 메트릭 카운터 정확성
- [ ] P1001 같은 다른 에러는 변환되지 않음 (FW-OX-002 회귀 방지)
- [ ] CI Vitest Job 통합 (매 PR 실행)
- [ ] CI k6 Job 통합 (Closed Beta 진입 시점)
- [ ] flaky 검증 — 10회 연속 통과
- [ ] PR 본문에 "§1.5.1.1 Option B 의 동시성 안전 통합 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점 본체)
  - FW-OX-002 (P2002 catch 변환)
  - CT-DB-005 (Stamp UNIQUE 제약)
  - TS-UT-003 (단위 테스트 — 본 통합 테스트의 사전 게이트)
  - IF-CI-005 (k6 부하 Job 인프라 — Closed Beta 단계)
  - IF-SUP-001 (Supabase dev 프로젝트 — 실 PostgreSQL)
- **Blocks**:
  - REQ-FUNC-006 (멱등) 영구 회귀 방지
  - REQ-NF-008 (오류율 ≤0.5%) 검증
  - **Public Pilot 진입 준비** — 부하 안정성 검증
  - §1.5.1.1 Option A 이전 트리거 모니터링 (메트릭 기반)
- **Related**:
  - SRS §1.5.1.1 Option B 의 동시성 보장 검증

# [Feature] FW-OX-002: Prisma P2002 catch → 200 동일 페이로드 변환 (영구 멱등 핵심 로직)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-OX-002: Prisma P2002 catch → 200 동일 페이로드 변환 (영구 멱등 핵심 로직)"
labels: 'feature, backend, idempotency, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-OX-002] OX 제출 시 발생하는 Prisma `P2002` UNIQUE 충돌 에러를 catch 하여 **동일한 200 응답 페이로드로 변환** 하는 비즈니스 로직 구현
- **목적**: SRS §1.5.1.1 Option B 의 본질적 구현. 본 로직은 단순한 에러 핸들링이 아니라 **본 프로젝트의 멱등성 보장 메커니즘 그 자체**다. UNIQUE 제약이 트리거한 P2002 를 200 응답으로 변환함으로써, 클라이언트는 첫 제출과 재제출을 구분할 수 없는 영구 멱등(permanent idempotency) 을 달성한다. INV-05 충족의 핵심.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — **Option B 결정 본문 전체** (구현 규약 1~4·수용 리스크·이전 트리거)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-006 AC
  - `/docs/SRS_V0_9.md#6.2.3` — INV-05 (영구 멱등) · `OxSubmission.handleUniqueConflict as200Response`
  - `/docs/SRS_V0_9.md#3.6.2` — Component 책임 매트릭스 Progress Service
  - `/docs/SRS_V0_9.md#5.1` — TC-006 (Stamp UNIQUE 충돌 → 200 변환 검증)
  - `/docs/SRS_V0_9.md#6.1` — `submitOx()` 비고 ("이미 처리됨" 케이스 명시)
- Prisma 공식 문서: `https://www.prisma.io/docs/reference/api-reference/error-reference#p2002` (참고용)
- 선행 계약: CT-API-004 의 Scenario 3 (멱등 응답 DTO 계약)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lessons/[id]/actions.ts` 또는 `lib/services/ox.ts` 에 `submitOx()` Server Action 의 try/catch 블록 작성
- [ ] FW-OX-001 의 Stamp INSERT 시도 결과를 try 블록 내부에 배치
- [ ] catch 블록에서 `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'` 검증
- [ ] P2002 + target 이 `Stamp_userId_lessonId_key` (또는 동등한 키) 인 경우에만 변환 진입 (다른 P2002 는 재throw)
- [ ] **read-only short-circuit**: P2002 catch 후, `LessonProgress` 에서 `ox_completed=true, stamp_earned=true` 상태를 SELECT 만 수행
- [ ] 동일 페이로드 구성 — `{ passed: true, stamp_earned: true }` (scroll_to_section 은 undefined)
- [ ] EventLog 에 `ox.duplicate_idempotent` 이벤트 기록 (FW-OX-003 와 별도 — Option A 이전 트리거 모니터링용)
- [ ] HTTP 200 응답 (CT-API-004 OxSubmitResponse 와 정합)
- [ ] 정합성 검증: P2002 외 모든 에러는 그대로 throw (5xx 처리 위임)
- [ ] 모니터링 메트릭 export — UNIQUE 충돌 발생 횟수 카운터 (Sentry 또는 Vercel Logs · §1.5.1.1 Option A 이전 트리거 측정용)
- [ ] 단위 테스트 작성 (TS-UT-003 와 정합)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 제출 — INSERT 성공 (정상 경로)
- **Given**: User(`u1`) 가 Lesson(`L001`) 의 OX 를 처음 통과
- **When**: `submitOx({ lesson_id: 'L001', answers: [...전부 정답] })` 호출
- **Then**: Stamp INSERT 성공, 응답은 `{ passed: true, stamp_earned: true }`. EventLog 에 `stamp.earned` 1건 기록

### Scenario 2: 두 번째 제출 — P2002 catch + 200 변환 (Option B 핵심)
- **Given**: User(`u1`) 의 Lesson(`L001`) Stamp 가 이미 존재 (Scenario 1 직후)
- **When**: 동일한 `submitOx({ lesson_id: 'L001', answers: [...전부 정답] })` 재호출
- **Then**: P2002 가 발생하지만 catch 되어, 응답은 **Scenario 1 과 동일한 페이로드** `{ passed: true, stamp_earned: true }` (HTTP 200). EventLog 에는 `stamp.earned` 가 추가되지 **않고**, 대신 `ox.duplicate_idempotent` 1건이 기록됨. **DB 의 Stamp 카운트는 1건 그대로**

### Scenario 3: 답안 일부 변경 후 재제출
- **Given**: User(`u1`) 의 Lesson(`L001`) Stamp 가 이미 존재
- **When**: 일부 답을 바꾸어 `submitOx({ lesson_id: 'L001', answers: [...일부 오답] })` 재호출
- **Then**: P2002 발생 (Stamp INSERT 시도가 충돌). catch 되어 200 변환. 첫 정답의 stamp 가 유지된다 (수용 리스크 — §1.5.1.1 표 4행)

### Scenario 4: 다른 사용자의 동일 lesson — 충돌 없음
- **Given**: User(`u1`) 의 Lesson(`L001`) Stamp 가 이미 존재
- **When**: User(`u2`) 가 `submitOx({ lesson_id: 'L001', answers: [...전부 정답] })` 호출
- **Then**: P2002 발생하지 않음. 새 Stamp(`u2`, `L001`) INSERT 성공. 응답 `{ passed: true, stamp_earned: true }`

### Scenario 5: P2002 가 아닌 다른 에러는 재throw
- **Given**: DB 연결이 끊어진 상태
- **When**: `submitOx()` 호출
- **Then**: P1001 (Database connection error) 또는 다른 에러가 catch 되지 않고 그대로 throw 되어 5xx 응답이 반환된다 (P2002 외에는 변환 금지)

### Scenario 6: 모니터링 메트릭 카운트
- **Given**: 1분 내 동일 사용자가 5회 동일 OX 재제출
- **When**: Vercel Logs 또는 Sentry 메트릭을 조회
- **Then**: `ox.duplicate_idempotent` 카운터가 4 (= 5 - 1) 증가. 본 메트릭은 §1.5.1.1 Option A 이전 트리거 #1 (월간 UNIQUE 충돌율 > 0.5%) 측정의 기반

## :gear: Technical & Non-Functional Constraints
- **에러 변환 범위 엄격화**: P2002 만 변환. P2003(외래키)·P1001(연결)·P2025(레코드 없음) 등 다른 에러는 그대로 throw
- **target 검증**: Prisma 의 `error.meta?.target` 이 Stamp UNIQUE 인덱스인지 확인 (`['userId', 'lessonId']` 또는 인덱스명). 다른 UNIQUE 충돌(예: User.email)이 잘못 변환되지 않도록 가드
- **read-only short-circuit**: §1.5.1.1 구현 규약 3 — 멱등 응답 시 DB 재쓰기 금지. SELECT 로 기존 상태만 확인
- **성능**: catch 경로의 응답 시간 ≤ 정상 INSERT 경로의 1.2배 (DB 조회 1회 추가만 허용)
- **이벤트 분리**: 정상 INSERT 시 발행되는 `stamp.earned` 와 멱등 변환 시 발행되는 `ox.duplicate_idempotent` 는 별개 이벤트. 후자는 KPI 집계에서 제외
- **수용 리스크 명시**:
  - OX 문항 개정 시 과거 제출 재처리 불가 (수동 감사 절차로 위임 — 별도 운영 플레이북 작성 필요)
  - 답안 일부 변경 재제출도 멱등 처리 (정책적 의도 동작)
- **보안**: 멱등 응답 페이로드에 다른 사용자의 Stamp 정보가 절대 노출되지 않도록 user_id 필터 강제

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 전부 통과 (TS-UT-003 와 정합)
- [ ] P2002 catch 로직이 `submitOx()` 함수 내부에 격리되어 있고, 다른 에러는 변환되지 않음
- [ ] EventLog 의 `stamp.earned` 와 `ox.duplicate_idempotent` 이벤트가 분리 기록됨
- [ ] §1.5.1.1 Option A 이전 트리거 4종에 대한 모니터링 메트릭이 노출됨 (UNIQUE 충돌율, p95 지연, 중복 사용자 리포트, 개정 후 감사 이벤트)
- [ ] 단위 테스트 (TS-UT-003) 통과
- [ ] 통합 테스트 (TS-IT-010) 통과 — 동시 100 req 동일 입력 → 단일 stamp
- [ ] PR 본문에 "본 로직이 §1.5.1.1 Option B 의 영구 멱등 보장 핵심임" 명시
- [ ] 코드 리뷰에서 다른 에러까지 잘못 catch 하지 않는지 점검
- [ ] Linter / SonarQube 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-005 (Stamp UNIQUE 제약 — P2002 가 발생하려면 본 제약이 활성화 상태여야 함)
  - CT-API-004 (멱등 응답 DTO 계약)
  - FW-OX-001 (OX 채점 Server Action 본체 — 본 태스크는 FW-OX-001 의 catch 블록을 구현)
- **Blocks**:
  - FW-OX-003 (이벤트 발행 — `ox.duplicate_idempotent` 이벤트 정의)
  - FR-OX-001 (OX UI — 멱등 응답 처리)
  - TS-UT-003 (단위 테스트)
  - TS-IT-010 (통합 테스트 — 동시 100 req)
  - NF-OBS-001 (Sentry — 멱등 변환 메트릭 시각화)
- **Related**:
  - SRS §1.5.1.1 Option A 이전 트리거 모니터링 (4종 측정 지표 노출)

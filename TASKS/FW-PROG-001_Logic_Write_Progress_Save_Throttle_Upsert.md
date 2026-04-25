# [Feature] FW-PROG-001: saveProgress() Server Action — 10초 간격 병합 + UPSERT

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PROG-001: saveProgress() Server Action — 10초 간격 병합 + LessonProgress UPSERT"
labels: 'feature, backend, progress, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PROG-001] `saveProgress()` Server Action — 비디오 재생 위치를 10초 간격으로 `LessonProgress.lastPositionSec` 에 UPSERT
- **목적**: Story 4 (오세은) 의 핵심 — 재개 위치 저장으로 단편 세션 학습자(<8분) 의 완주율을 보장. UC-01 (레슨 시청) + UC-04 (재개 위치 복원) 의 데이터 진입점이며, REQ-FUNC-020 (10초 간격 저장) · REQ-NF-006 (저장 주기 ≤10s) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020, 021, 024, 025
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (저장 주기 ≤10s)
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01, UC-04
  - `/docs/SRS_V0_9.md#6.1` — `saveProgress()` 엔드포인트
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블
  - `/docs/SRS_V0_9.md#6.3.4` — 다기기 LWW 시퀀스
- 선행 계약: CT-API-003 (DTO) · CT-DB-004 (LessonProgress)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/services/progress.ts` 에 `saveProgress()` Server Action 구현
- [ ] 첫 줄에 `requireUser()` 가드 호출
- [ ] Zod 스키마로 입력 검증 — `{ lesson_id: string (regex L\d{3}), position_sec: int >= 0 }`
- [ ] **서버 측 throttle 정책**: 동일 (user_id, lesson_id) 의 직전 저장으로부터 10초 미만 경과 시 **silently merge** (기존 레코드의 lastPositionSec 만 갱신, updatedAt 갱신 없음). 클라이언트는 항상 200 응답 받음
- [ ] Prisma UPSERT — `prisma.lessonProgress.upsert({ where: { userId_lessonId: {...} }, create: {...}, update: { lastPositionSec, updatedAt: now() } })`
- [ ] **시간성 정확성**: position_sec 가 비정상적으로 큰 값 (예: 1시간 = 3600초 초과) 인 경우 검증 — Lesson 의 영상 길이 메타가 없으므로 일단 허용하되, 비정상 패턴 감지를 위한 EventLog 기록
- [ ] LessonProgress 가 없는 경우 자동 생성 (UPSERT — `oxCompleted=false, stampEarned=false, lastPositionSec=position_sec`)
- [ ] 다기기 LWW 단순 처리 — 본 태스크는 단순 UPSERT 로 last-write-wins 자동 충족 (REQ-FUNC-024 의 알림 배너 부분은 FW-PROG-004 가 별도 처리)
- [ ] 응답 — `{ ok: true }`. 가벼운 응답으로 클라이언트 부담 최소화
- [ ] EventLog 발행 — `progress.saved` (10초마다 1건) — 단 폭증 방지를 위해 1분에 1건으로 sample 가능 (정책 결정)
- [ ] 인증 실패 시에도 클라이언트의 IndexedDB 큐가 작동하도록 401 응답 명확화

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 저장
- **Given**: User(`u1`) + Lesson(`L001`) + LessonProgress 없음
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 30 })` 호출
- **Then**: LessonProgress 자동 생성 (lastPositionSec=30, oxCompleted=false). 응답 `{ ok: true }`. p95 ≤ 200ms

### Scenario 2: 기존 LessonProgress 갱신
- **Given**: LessonProgress 존재 (lastPositionSec=30)
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 60 })` 호출
- **Then**: lastPositionSec=60 으로 UPDATE. updatedAt 갱신

### Scenario 3: 10초 미만 간격 — silently merge
- **Given**: 직전 저장이 5초 전 (lastPositionSec=30)
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 35 })` 호출
- **Then**: lastPositionSec=35 갱신되지만, **`updatedAt` 은 갱신되지 않음** (DB 부하 경감). 응답은 정상 200

### Scenario 4: 잘못된 lesson_id 포맷 — 400
- **Given**: `lesson_id: 'INVALID'`
- **When**: 호출
- **Then**: Zod parse 실패. 400 + `INVALID_LESSON_ID`

### Scenario 5: 음수 position_sec — 400
- **Given**: `position_sec: -10`
- **When**: 호출
- **Then**: 400 + `INVALID_POSITION`

### Scenario 6: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401. 클라이언트는 IndexedDB 에 큐잉 (FW-PROG-003 가 처리)

### Scenario 7: 다기기 동시 호출 — LWW
- **Given**: Device A 가 position_sec=120 저장 직후
- **When**: Device B 가 position_sec=200 저장
- **Then**: 최종 lastPositionSec=200 (최후 값 우선). updatedAt 은 B 의 시각

### Scenario 8: OX 통과 후 저장 시도 (멱등 영역)
- **Given**: LessonProgress.oxCompleted=true 상태 (이미 학습 완료)
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 100 })` 호출
- **Then**: lastPositionSec 만 갱신. oxCompleted, stampEarned 은 변경 안함

### Scenario 9: 비정상 큰 position_sec — 허용 + 로깅
- **Given**: `position_sec: 99999` (영상 길이를 훨씬 초과)
- **When**: 호출
- **Then**: 응답은 200 (저장은 정상). 단 EventLog 에 `progress.anomaly` 기록 (운영 모니터링용)

### Scenario 10: 응답 시간 목표
- **Given**: 부하 100명 동시 호출
- **When**: k6 부하 테스트
- **Then**: p95 응답 시간 ≤ 200ms (가벼운 UPSERT)

## :gear: Technical & Non-Functional Constraints
- **UPSERT 단일 쿼리**: Prisma `upsert()` 로 단일 SQL 라운드트립. SELECT 후 UPDATE/INSERT 분리 금지
- **`@@unique([userId, lessonId])` 제약 활용**: LessonProgress 의 복합 UNIQUE 가 자연 멱등 키 역할
- **silently merge 정책**: 10초 미만 간격은 updatedAt 갱신 안함. DB write 부하 경감 + 다기기 LWW 의 timestamp 정밀도 유지
- **시간 정확성**: 서버 시각 (DB `now()`) 기준. 클라이언트 시각 사용 금지
- **응답 가벼움**: `{ ok: true }` 만 반환. 클라이언트가 lastPositionSec 을 다시 받을 필요 없음 (자체 보유)
- **인증 정책**: 미인증 시 401 명확. 클라이언트는 401 을 IndexedDB 큐잉 트리거로 사용
- **이벤트 발행 빈도**: `progress.saved` 가 사용자당 분당 6건 발생 가능. EventLog 폭증 위험 → 1분 1건으로 sample 정책 채택 권장
- **금지**:
  - 클라이언트가 보낸 timestamp 사용 (서버 시각만)
  - oxCompleted, stampEarned 필드를 본 액션에서 변경 (FW-OX-001 의 책임 영역)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Prisma `upsert()` 단일 쿼리 사용 검증
- [ ] silently merge 정책 동작 확인 (직전 5초 후 호출 시 updatedAt 미갱신)
- [ ] 다기기 LWW 동작 검증 (TS-UT-006 일부)
- [ ] EventLog `progress.saved` sample 정책 적용
- [ ] TS-UT-005 (10초 간격 병합) 통과
- [ ] TS-LOAD-004 (저장 주기 ≤ 10s) 통과
- [ ] PR 본문에 "본 태스크는 단순 UPSERT 만. IndexedDB 큐잉은 FW-PROG-003" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-003 (saveProgress DTO)
  - CT-DB-004 (LessonProgress 모델)
  - FR-AUTH-002 (RBAC 가드)
  - FW-AUTH-003 (세션 발급 — 인증 의존)
- **Blocks**:
  - FW-PROG-002 (클라이언트 10초 위치 송신 훅 — 본 액션의 호출자)
  - FW-PROG-003 (오프라인 큐 — 본 액션 401 시 폴백)
  - FW-PROG-004 (다기기 LWW + 알림 배너)
  - FR-PROG-001 (재개 위치 조회 — 본 액션이 저장한 데이터 사용)
  - FW-OX-001 (OX 채점 — LessonProgress 상태 의존, 단 분리)
  - TS-IT-001 (Story 1 통합)
  - TS-E2E-002 (오세은 E2E)

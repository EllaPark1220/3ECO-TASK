# [Feature] FR-STAMP-001: GET /api/stamp/map — 사용자별 모든 lesson 스탬프 + 모듈 그룹화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-STAMP-001: 스탬프 맵 조회 Route Handler — 모듈별 그룹화 + 사용자별 stamp 매핑 + 1분 캐시"
labels: 'feature, backend, stamp-map, query, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-STAMP-001] `GET /api/stamp/map` Route Handler — 현재 사용자의 모든 lesson 별 스탬프 획득 여부를 모듈 그룹화하여 반환
- **목적**: FR-STAMP-002 (시각화 컴포넌트) 의 데이터 공급원. UC-03 (스탬프 맵 조회) 의 Read 진입점이며, REQ-FUNC-001 (스탬프 시각 반영) + REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms) 의 백엔드 측 충족. 모듈별 그룹화로 클라이언트 렌더링 단순화.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001, 003 (스탬프 시각·완주율 표시)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-03
  - `/docs/SRS_V0_9.md#6.1` — `/api/stamp/map` 엔드포인트
  - `/docs/SRS_V0_9.md#6.2.2` — STAMP, LESSON, MODULE 테이블
- 선행: FR-AUTH-001 (세션 조회), CT-DB-005 (Stamp), CT-DB-003 (Lesson + Module)
- 짝: FR-STAMP-002 (시각화 — 본 API 호출자)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/stamp/map/route.ts` Route Handler 생성
- [ ] **인증 필수** — `requireUser()` 가드 (본인 데이터만)
- [ ] **응답 DTO 정의 — `lib/contracts/stamp.ts`**:
  ```ts
  export interface StampMapResponse {
    user_id: string;
    total_lessons: number;
    earned_count: number;
    modules: Array<{
      module_id: string;
      name: string;
      order_index: number;
      lessons: Array<{
        lesson_id: string;
        title: string;
        earned: boolean;
        earned_at: string | null;  // ISO datetime
      }>;
    }>;
  }
  ```
- [ ] **쿼리 전략 — 단일 SQL JOIN**:
  ```ts
  const data = await prisma.module.findMany({
    orderBy: { orderIndex: 'asc' },
    include: {
      lessons: {
        select: { lessonId: true, title: true },
        orderBy: { lessonId: 'asc' },
      },
    },
  });

  const stamps = await prisma.stamp.findMany({
    where: { userId: user.id },
    select: { lessonId: true, earnedAt: true },
  });

  // 메모리 매핑
  const stampMap = new Map(stamps.map(s => [s.lessonId, s.earnedAt]));
  ```
- [ ] **응답 조립**:
  ```ts
  const response: StampMapResponse = {
    user_id: user.id,
    total_lessons: 0, // computed
    earned_count: stamps.length,
    modules: data.map(m => ({
      module_id: m.moduleId,
      name: m.name,
      order_index: m.orderIndex,
      lessons: m.lessons.map(l => ({
        lesson_id: l.lessonId,
        title: l.title,
        earned: stampMap.has(l.lessonId),
        earned_at: stampMap.get(l.lessonId)?.toISOString() ?? null,
      })),
    })),
  };
  response.total_lessons = response.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  ```
- [ ] **응답 헤더**:
  - `Content-Type: application/json`
  - `Cache-Control: private, max-age=60`  // 사용자별 사적 캐시 (Edge 캐시 미사용 — 사용자 특정 데이터)
  - `X-Request-Id`
- [ ] **Edge 캐시 vs Private 캐시 정책**:
  - 본 응답은 사용자별 다름 → Edge Cache 사용 금지 (`s-maxage` 미사용)
  - 클라이언트 (브라우저) 의 사적 캐시 1분 — `private, max-age=60`
  - 사용자가 다른 탭에서 OX 통과 후 본 페이지로 돌아올 때 SWR `mutate` 활용 (FR-STAMP-002)
- [ ] **OX 통과 직후 즉시 반영 정책 (REQ-NF-003)**:
  - 클라이언트가 `submitOx()` 응답 직후 본 API 의 SWR mutate 트리거
  - 최대 1초 내 새 데이터 fetch + 렌더 (p95 ≤ 500ms 목표)
- [ ] **응답 시간 목표**:
  - p95 ≤ 200ms (Module + Lesson 10편 + Stamp N건)
  - 인덱스 활용 — Stamp 의 `(userId, lessonId)` 복합 UNIQUE
- [ ] **N+1 쿼리 회피**:
  - Module + Lesson 은 단일 쿼리 (Prisma include)
  - Stamp 는 별도 쿼리 1회
  - 총 2회 SQL — N+1 부재 검증
- [ ] **빈 데이터 처리**:
  - 신규 사용자 (Stamp 0건) — modules 모두 반환 + 모든 lesson `earned: false`
  - Lesson 시드 미완료 (Module 만 있음) — 빈 lessons 배열
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 신규 사용자 — Stamp 0건
- **Given**: User(`u1`) 의 Stamp 0건 + Lesson 10편 시드
- **When**: `GET /api/stamp/map`
- **Then**: 200 + `{ total_lessons: 10, earned_count: 0, modules: [...5개], lessons[].earned: false }`

### Scenario 2: 일부 스탬프 보유
- **Given**: User(`u1`) 의 Stamp (L001, L003) 2건
- **When**: 호출
- **Then**: `earned_count: 2`. modules[0].lessons[0].earned=true, [0].earned_at='...'. 나머지 8 lesson earned=false

### Scenario 3: 모듈 순서 정합 (orderIndex)
- **Given**: 모듈 5개
- **When**: 응답
- **Then**: modules 배열이 orderIndex 1~5 순서. M1→M2→M3→M4→M5

### Scenario 4: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 5: N+1 쿼리 부재
- **Given**: 호출
- **When**: Prisma 쿼리 카운트 측정 (Vercel Logs)
- **Then**: SQL 쿼리 정확히 2회 (Module+Lesson include 1회 + Stamp 1회). N+1 0

### Scenario 6: 응답 시간
- **Given**: Lesson 10편 + Stamp 5건
- **When**: 부하 100명 동시 호출
- **Then**: p95 ≤ 200ms

### Scenario 7: Cache 정책 — 1분 사적 캐시
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=60`. Edge 캐시 사용 안함

### Scenario 8: OX 통과 후 즉시 반영 (REQ-NF-003)
- **Given**: 클라이언트가 OX 통과 후 SWR `mutate('/api/stamp/map')` 호출
- **When**: 새 데이터 fetch
- **Then**: 새 stamp 가 응답에 포함. 클라이언트 렌더까지 p95 ≤ 500ms

### Scenario 9: 다른 사용자 데이터 접근 차단
- **Given**: User(`u1`) 가 로그인
- **When**: 클라이언트가 user_id='u2' 위조 시도
- **Then**: 본 API 는 user_id 입력을 받지 않음 — 항상 세션의 user.id 사용. u2 데이터 노출 0

### Scenario 10: Lesson 미시드 시 — 빈 lessons 배열
- **Given**: Module 만 시드 + Lesson 0건
- **When**: 호출
- **Then**: 200 + `total_lessons: 0, earned_count: 0, modules: [...5개, 모두 lessons:[]]`

## :gear: Technical & Non-Functional Constraints
- **Route Handler 선택**: 캐시 헤더 + 클라이언트 fetch 진입점 → Server Action 이 아닌 Route Handler
- **Cache 정책 — Private 강제**: 사용자별 데이터라 `s-maxage` 사용 금지. `private, max-age=60` 만
- **N+1 회피**: Prisma include 활용 + Stamp 별도 1회. 총 2회 SQL
- **응답 시간 (REQ-NF-003 영향)**: p95 ≤ 200ms (백엔드). 클라이언트 렌더 합산 p95 ≤ 500ms
- **세션 우선 (IDOR 방지)**: user_id 는 세션에서 추출. 클라이언트 입력 무시
- **인덱스 활용**:
  - Stamp 의 `userId` 인덱스 (조회 핫스팟)
  - Module 의 `orderIndex` (정렬)
- **응답 페이로드 컬럼 화이트리스트**: 필요 필드만 SELECT. PII 누출 방지 (`User.email` 등 미포함)
- **OX 통과 후 즉시 반영**: SWR mutate + Sentry custom metric 으로 측정 (REQ-NF-003)
- **응답 페이로드 크기**: Lesson 10편 기준 ~ 5KB. gzip 후 < 2KB. 부하 영향 미미
- **금지**:
  - Edge Cache 활용 (사용자별 데이터)
  - user_id 를 클라이언트 입력으로 받기 (IDOR)
  - 다른 사용자의 stamp 노출 (보안 핵심)
  - N+1 쿼리 (성능)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/api/stamp/map/route.ts` 구현
- [ ] 응답 DTO `StampMapResponse` 정의
- [ ] N+1 쿼리 부재 (Prisma 쿼리 2회) 검증
- [ ] Cache-Control private 헤더 검증
- [ ] 응답 시간 p95 ≤ 200ms 측정
- [ ] OX 통과 후 SWR mutate → 500ms 내 반영 (FR-STAMP-002 와 통합)
- [ ] IDOR 방어 검증 (세션 우선)
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "FR-STAMP-002 의 데이터 공급원. REQ-NF-003 백엔드 충족" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답 포맷)
  - CT-DB-002 (User)
  - CT-DB-003 (Lesson + Module)
  - CT-DB-005 (Stamp)
  - FR-AUTH-001 (getCurrentUser)
  - FR-AUTH-002 (RBAC 가드 — requireUser)
  - CT-MOCK-001 (Lesson 시드)
- **Blocks**:
  - FR-STAMP-002 (스탬프 맵 시각화 — 본 API 의 클라이언트)
  - FW-STAMP-001 (스탬프 맵 공유 — 본 데이터 공유)
  - FR-KPI-002 (완주율 KPI — 본 데이터 집계 활용)
  - TS-E2E-001 (박지훈 E2E — 스탬프 맵 반영 검증)
- **Related**:
  - REQ-NF-003 의 백엔드 측 충족

# [Feature] FR-LES-002: GET /api/lessons — 레슨 목록 조회 + 모듈 그룹화 + 진도 매핑

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LES-002: 레슨 목록 조회 Route Handler — 모듈별 그룹화 + 사용자별 진도(stamp/lastPosition) 매핑 + 60초 사적 캐시"
labels: 'feature, backend, lessons, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LES-002] `GET /api/lessons` Route Handler — 모든 Lesson 의 메타 (제목·모듈·revision) + 현재 사용자의 진도 정보 (stampEarned·lastPositionSec) 통합 응답 + 모듈 그룹화
- **목적**: 박지훈 (Story 1) 의 체계감 시각화 보조 + Story 4 (오세은) 의 단편 세션 학습자가 다음 레슨을 선택할 때 진도 미반영 인지 부담 제거. FR-STAMP-001 과 다른 점은 본 API 는 **레슨 진입로** (제목·메타 포함), FR-STAMP-001 은 **시각화 데이터** (스탬프 위치만).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-024 (다기기 진도)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-04 (레슨 목록)
  - `/docs/SRS_V0_9.md#6.1` — `/api/lessons` 엔드포인트
- 선행: FR-AUTH-001, CT-DB-002, CT-DB-003, CT-DB-004

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/lessons/route.ts` Route Handler
- [ ] **인증 정책** — 로그인·익명 모두 허용:
  - 로그인 — 진도 정보 포함
  - 익명 — 진도 정보 부재 (모든 lesson 의 stampEarned=false, lastPositionSec=null)
- [ ] **응답 DTO**:
  ```ts
  export interface LessonListResponse {
    modules: Array<{
      module_id: string;
      name: string;
      order_index: number;
      lessons: Array<{
        lesson_id: string;
        title: string;
        revision_last_updated: string;
        stamp_earned: boolean;
        last_position_sec: number | null;
      }>;
    }>;
    total_lessons: number;
    earned_count: number;
  }
  ```
- [ ] **쿼리 전략**:
  ```ts
  const data = await prisma.module.findMany({
    orderBy: { orderIndex: 'asc' },
    include: {
      lessons: {
        select: {
          lessonId: true,
          title: true,
          revisionLastUpdated: true,
        },
        orderBy: { lessonId: 'asc' },
      },
    },
  });

  const user = await getCurrentUser();
  const progressMap = new Map<string, { stampEarned: boolean; lastPositionSec: number }>();
  if (user) {
    const progress = await prisma.lessonProgress.findMany({
      where: { userId: user.id },
      select: { lessonId: true, stampEarned: true, lastPositionSec: true },
    });
    progress.forEach(p => progressMap.set(p.lessonId, { stampEarned: p.stampEarned, lastPositionSec: p.lastPositionSec }));
  }
  ```
- [ ] **응답 조립** — Module + Lesson + Progress 매핑:
  ```ts
  const modules = data.map(m => ({
    module_id: m.moduleId,
    name: m.name,
    order_index: m.orderIndex,
    lessons: m.lessons.map(l => {
      const p = progressMap.get(l.lessonId);
      return {
        lesson_id: l.lessonId,
        title: l.title,
        revision_last_updated: l.revisionLastUpdated.toISOString(),
        stamp_earned: p?.stampEarned ?? false,
        last_position_sec: p?.lastPositionSec ?? null,
      };
    }),
  }));
  ```
- [ ] **Cache 정책**:
  - 익명 — `public, s-maxage=60` (Edge cache 1분)
  - 로그인 — `private, max-age=60` (사용자별 다른 데이터)
- [ ] **응답 시간 목표**: p95 ≤ 200ms (Module + Lesson 10편 + Progress N건)
- [ ] **N+1 회피**: Module include lessons 1회 + Progress 1회 = 총 2회 SQL
- [ ] **OpenAPI 명세 업데이트**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로그인 사용자 — 진도 포함
- **Given**: User(`u1`) + Lesson 10편 + LessonProgress (L001 stamp_earned=true, L003 last_position_sec=120)
- **When**: `GET /api/lessons`
- **Then**: 200 + 5 modules × 10 lessons. L001 stamp_earned=true, L003 last_position_sec=120, 나머지 default

### Scenario 2: 익명 사용자 — 진도 부재
- **Given**: 세션 없음
- **When**: `GET /api/lessons`
- **Then**: 200 + 모든 lesson stamp_earned=false, last_position_sec=null. 익명 사용자에게도 콘텐츠 메타 노출

### Scenario 3: 모듈 순서 정합
- **Given**: 응답
- **When**: modules 배열
- **Then**: order_index 1~5 순서

### Scenario 4: lessonId 정렬
- **Given**: 각 module 의 lessons
- **When**: 정렬 검증
- **Then**: lesson_id ascending (L001, L002, ...)

### Scenario 5: total_lessons + earned_count
- **Given**: User 가 stamp 3건 보유
- **When**: 응답
- **Then**: total_lessons=10, earned_count=3

### Scenario 6: N+1 부재
- **Given**: 호출
- **When**: Prisma 쿼리 카운트
- **Then**: 정확히 2회 (Module include + Progress)

### Scenario 7: 익명 — Edge cache 활용
- **Given**: 익명 호출
- **When**: 헤더
- **Then**: `Cache-Control: public, s-maxage=60`. Edge cache 적용

### Scenario 8: 로그인 — 사적 캐시
- **Given**: 로그인 호출
- **When**: 헤더
- **Then**: `Cache-Control: private, max-age=60`

### Scenario 9: 응답 시간
- **Given**: 부하 100명
- **When**: 호출
- **Then**: p95 ≤ 200ms

### Scenario 10: 다른 사용자 진도 노출 차단
- **Given**: User(`u1`) 호출
- **When**: 응답
- **Then**: u1 의 progress 만. u2 진도 노출 0

## :gear: Technical & Non-Functional Constraints
- **이중 캐시 정책**: 익명 (Edge) vs 로그인 (Private). 사용자별 데이터 격리
- **N+1 회피**: 2회 SQL. 로그인 사용자만 추가 1회
- **세션 우선 (IDOR)**: user_id 입력 미허용
- **응답 시간**: p95 ≤ 200ms
- **금지**:
  - 다른 사용자 progress 노출
  - N+1 쿼리
  - user_id 클라이언트 입력

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] 응답 DTO 정의
- [ ] N+1 부재 검증 (2회 SQL)
- [ ] Cache 정책 — 익명/로그인 분리
- [ ] 응답 시간 p95 ≤ 200ms
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "Story 1·4 의 레슨 진입로 + 진도 매핑" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User)
  - CT-DB-003 (Lesson + Module)
  - CT-DB-004 (LessonProgress)
  - CT-API-001 (응답 포맷)
  - FR-AUTH-001 (getCurrentUser)
- **Blocks**:
  - 사용자가 lesson 진입 시 첫 조회
  - FR-STAMP-002 (스탬프 맵 시각화 — 별도 데이터 보완)
  - FR-KPI-002 (완주율 KPI — 본 데이터 활용)
- **Related**:
  - REQ-FUNC-024 (다기기 진도)

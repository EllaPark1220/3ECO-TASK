# [Feature] FW-EXP-001: 페르소나 매칭 태그 + A/B 격리 미들웨어 — 이수민 후킹 변형 차단 + 결정적 분배

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-EXP-001: A/B 실험 격리 미들웨어 — 페르소나 태그 + 결정적 user 분배 + 이수민 세그먼트 보호 + Cookie 활용"
labels: 'feature, backend, experiment, middleware, priority:critical, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-EXP-001] A/B 실험 (EXP-1~4) 의 사용자 분배 + 격리 미들웨어 — 페르소나 태그 (이수민 등 보호 세그먼트) + 결정적 분배 (user.id 해싱) + Cookie persistence + EventLog 발행. 이수민 (SH-02) 같은 학습 회피 페르소나는 후킹 변형 (EXP-2 의 후킹 도입부) 에 노출 0 강제
- **목적**: 4개 실험 (EXP-1 스탬프맵·EXP-2 후킹 도입부·EXP-3 단편 세션·EXP-4 글로 읽기) 의 데이터 신뢰성 확보. PRD 원칙 1 (이해 우선) 충돌 방지 — 후킹 거부 페르소나에 후킹 변형 노출은 본 사이트 정신 위반. **결정적 분배** (동일 사용자 일관 그룹 유지) 로 사용자 경험 분열 방지.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.8` — REQ-FUNC-040~043 (4개 EXP)
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-029 (실험 신뢰성)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 (SH-02 이수민 — 학습 회피)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`exp.assigned`)
- 외부: `https://nextjs.org/docs/app/building-your-application/routing/middleware`
- 선행: CT-DB-002 (User), CT-DB-009 (EventLog), FR-AUTH-001 (세션)
- 짝: FR-EXP-001~004 (실험 분석)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/experiments/` 신규 모듈 — 실험 정의 + 분배 로직
- [ ] **실험 정의 — `lib/experiments/registry.ts`**:
  ```ts
  export type ExperimentId = 'EXP-1' | 'EXP-2' | 'EXP-3' | 'EXP-4';
  export type Variant = 'control' | 'treatment';

  export interface ExperimentConfig {
    id: ExperimentId;
    name: string;
    enabledFromStage: 'closed-beta' | 'public-pilot';
    minSampleSize: number;       // n ≥ 100~500
    excludePersonaTags: string[]; // 보호 세그먼트
    distribution: 0.5;            // 50:50
  }

  export const EXPERIMENTS: Record<ExperimentId, ExperimentConfig> = {
    'EXP-1': { id: 'EXP-1', name: '스탬프맵 노출 vs 숨김', enabledFromStage: 'closed-beta', minSampleSize: 500, excludePersonaTags: [], distribution: 0.5 },
    'EXP-2': { id: 'EXP-2', name: '후킹 없는 도입부 vs 짧은 후킹', enabledFromStage: 'closed-beta', minSampleSize: 200, excludePersonaTags: ['hooking-averse'], distribution: 0.5 },  // 이수민 보호
    'EXP-3': { id: 'EXP-3', name: '단편 세션 vs 전체 lesson', enabledFromStage: 'closed-beta', minSampleSize: 200, excludePersonaTags: [], distribution: 0.5 },
    'EXP-4': { id: 'EXP-4', name: '글로 읽기 노출 vs 영상 우선', enabledFromStage: 'closed-beta', minSampleSize: 100, excludePersonaTags: ['video-only'], distribution: 0.5 },
  };
  ```
- [ ] **페르소나 태그 정의 — User 모델 확장**:
  ```prisma
  model User {
    // ... 기존
    personaTags  String[]  @default([])  // ['hooking-averse', 'video-only', 'accessibility-priority']
  }
  ```
  - 본 태스크 PR 에 마이그레이션 통합
  - 태그 부여 — User 자가 진단 (간이 설문) 또는 운영자 수동 (별도 후속)
  - **본 태스크는 schema + 격리 로직만**. 태그 부여 UI 는 별도 후속
- [ ] **결정적 분배 함수 — `lib/experiments/assign.ts`**:
  ```ts
  import crypto from 'node:crypto';

  /**
   * 결정적 분배 — 동일 (userId, expId) 항상 동일 variant
   * 해싱 활용으로 균등 분포 보장
   */
  export function assignVariant(userId: string, expId: ExperimentId): Variant {
    const hash = crypto.createHash('sha256').update(`${userId}:${expId}`).digest('hex');
    const intHash = parseInt(hash.substring(0, 8), 16);
    return (intHash % 100) < (EXPERIMENTS[expId].distribution * 100) ? 'control' : 'treatment';
  }

  /**
   * 페르소나 보호 — 제외 세그먼트는 항상 control
   */
  export function getVariantForUser(
    user: { id: string; personaTags: string[] },
    expId: ExperimentId,
  ): Variant {
    const config = EXPERIMENTS[expId];
    const isExcluded = user.personaTags.some(tag => config.excludePersonaTags.includes(tag));
    if (isExcluded) return 'control';  // 보호 세그먼트는 자극적 변형 미노출

    return assignVariant(user.id, expId);
  }
  ```
- [ ] **익명 사용자 처리** — Cookie 기반 결정적 분배:
  ```ts
  /**
   * 익명 사용자 — Cookie 의 anon_id 활용 (없으면 발급)
   */
  export function getVariantForAnonymous(anonId: string, expId: ExperimentId): Variant {
    const config = EXPERIMENTS[expId];
    // 익명은 페르소나 태그 부재 → 보호 적용 불가
    return assignVariant(anonId, expId);
  }
  ```
- [ ] **Next.js Middleware — `middleware.ts`**:
  ```ts
  import { NextResponse, type NextRequest } from 'next/server';

  export async function middleware(req: NextRequest) {
    // 익명 사용자 — anon_id Cookie 발급
    const anonId = req.cookies.get('anon_id')?.value;
    const response = NextResponse.next();

    if (!anonId) {
      const newAnonId = crypto.randomUUID();
      response.cookies.set('anon_id', newAnonId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,  // 1년
      });
    }
    return response;
  }

  export const config = { matcher: ['/((?!api|_next|favicon).*)'] };
  ```
- [ ] **EventLog 발행 — `exp.assigned`**:
  ```ts
  // RSC 또는 Server Action 진입 시
  export async function ensureExperimentAssignment(userId: string, expId: ExperimentId) {
    // 이미 발행된 적 있는지 (멱등)
    const existing = await prisma.eventLog.findFirst({
      where: {
        userId,
        event: 'exp.assigned',
        payload: { path: ['exp_id'], equals: expId },
      },
    });
    if (existing) return existing.payload.variant;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, personaTags: true } });
    if (!user) return 'control';

    const variant = getVariantForUser(user, expId);

    await prisma.eventLog.create({
      data: {
        userId,
        event: 'exp.assigned',
        payload: { exp_id: expId, variant, persona_tags: user.personaTags },
      },
    });

    return variant;
  }
  ```
- [ ] **이수민 보호 — `excludePersonaTags: ['hooking-averse']` 검증**:
  - 운영자가 이수민 페르소나를 인지한 사용자에게 'hooking-averse' 태그 부여 (별도 admin 페이지)
  - 본 사용자는 EXP-2 (후킹 도입부) 에서 항상 control (후킹 없는 변형)
  - 본 정책은 PRD 원칙 1 (이해 우선) + CON-05 (후킹 금지 정신) 정합
- [ ] **결정적 분배 검증 — 동일 userId 반복**:
  - 동일 (userId, expId) 항상 동일 variant
  - 사용자가 다른 기기·세션에서 봐도 분열 0
  - 익명 사용자도 anon_id Cookie 보존되면 동일
- [ ] **A/B 격리 정책 — variant 별 코드 분기**:
  ```tsx
  // 사용처 예시 (Lesson 시청 페이지)
  export default async function LessonPage({ params }) {
    const user = await getCurrentUser();
    const variant = user
      ? await ensureExperimentAssignment(user.id, 'EXP-2')
      : await ensureExperimentAssignmentAnon(getAnonId(), 'EXP-2');

    return (
      <main>
        {variant === 'treatment' ? <ShortHookingIntro /> : <PlainIntro />}
        {/* ... */}
      </main>
    );
  }
  ```
- [ ] **OpenAPI 명세 갱신** — `exp.assigned` 이벤트 catalog 추가
- [ ] **응답 시간 목표**: middleware ≤ 5ms (Cookie 만 처리), assignment ≤ 50ms (EventLog)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 결정적 분배 — 동일 user 반복
- **Given**: userId 'u1' + expId 'EXP-1'
- **When**: assignVariant 100회 호출
- **Then**: 모두 동일 variant (control 또는 treatment)

### Scenario 2: 균등 분포 — 1000명 ~ 50:50
- **Given**: 1000개 가상 userId
- **When**: 각각 EXP-1 분배
- **Then**: control / treatment ~= 50:50 (오차 ±5%)

### Scenario 3: 이수민 보호 — hooking-averse 태그
- **Given**: User { personaTags: ['hooking-averse'] }
- **When**: getVariantForUser(user, 'EXP-2')
- **Then**: 항상 'control' (후킹 없는 변형)

### Scenario 4: video-only 보호 — EXP-4
- **Given**: User { personaTags: ['video-only'] }
- **When**: getVariantForUser(user, 'EXP-4')
- **Then**: 항상 'control' (영상 우선 변형)

### Scenario 5: 멱등 — exp.assigned 재발행 0
- **Given**: 이미 발행된 사용자
- **When**: ensureExperimentAssignment 재호출
- **Then**: EventLog 추가 INSERT 0. 기존 variant 반환

### Scenario 6: 익명 사용자 — anon_id Cookie
- **Given**: 첫 방문 (Cookie 없음)
- **When**: middleware 통과
- **Then**: Set-Cookie: anon_id=<uuid> + httpOnly + secure + sameSite=Lax

### Scenario 7: 익명 동일 anon_id — 동일 variant
- **Given**: anon_id='abc' + expId 'EXP-1'
- **When**: 100회 호출
- **Then**: 모두 동일 variant

### Scenario 8: 페르소나 태그 부재 — 정상 분배
- **Given**: User { personaTags: [] }
- **When**: getVariantForUser(user, 'EXP-2')
- **Then**: 결정적 분배 (control 또는 treatment)

### Scenario 9: 응답 시간 — middleware ≤ 5ms
- **Given**: middleware 진입
- **When**: Cookie 발급 + 통과
- **Then**: ≤ 5ms

### Scenario 10: EventLog payload 정합
- **Given**: 분배 후
- **When**: EventLog 조회
- **Then**: payload 에 exp_id, variant, persona_tags 모두 포함

## :gear: Technical & Non-Functional Constraints
- **결정적 분배 (SHA-256 해싱)**: 동일 (userId, expId) 항상 동일 variant
- **익명 사용자 — anon_id Cookie 1년**: 결정적 분배 + Cross-device 부재 (수용 가능)
- **페르소나 보호 — control 강제**: 보호 세그먼트는 자극 변형 노출 0
- **이수민 보호 — `hooking-averse`**: PRD 원칙 1 정합 (CON-05 정신)
- **EventLog 멱등**: `exp.assigned` 1회 발행. 재호출은 기존 variant 반환
- **middleware 응답 시간 ≤ 5ms**: Edge runtime + 단순 Cookie
- **assignment 응답 시간 ≤ 50ms**: EventLog INSERT 포함
- **Cookie 정책**: httpOnly + secure + sameSite=Lax + maxAge 1년
- **PostgreSQL 활용**: User.personaTags = String[]
- **태그 부여 별도 후속**: 본 태스크는 schema + 격리 로직만
- **금지**:
  - 비결정적 분배 (Math.random) → variant 분열
  - 페르소나 보호 무시 (PRD 원칙 위반)
  - middleware 에 DB 접근 (응답 시간 영향)
  - exp.assigned 다중 발행 (KPI 왜곡)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/experiments/registry.ts` + `assign.ts` 구현
- [ ] User.personaTags 마이그레이션
- [ ] Next.js middleware (anon_id Cookie)
- [ ] ensureExperimentAssignment() Server-side 함수
- [ ] 이수민 보호 (hooking-averse) 검증
- [ ] video-only 보호 (EXP-4) 검증
- [ ] 멱등 EventLog
- [ ] 결정적 분배 + 균등 분포 검증
- [ ] 응답 시간 측정
- [ ] PR 본문에 "이수민 보호 + 결정적 분배 + 4개 EXP 격리" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User — personaTags 추가)
  - CT-DB-009 (EventLog)
  - FR-AUTH-001 (getCurrentUser)
- **Blocks**:
  - FR-EXP-001~004 (실험 분석 — 본 분배의 데이터 활용)
  - 페르소나 태그 부여 admin 페이지 (별도 후속)
  - EXP-1·2·3·4 의 실제 변형 코드
- **Related**:
  - CON-05 (후킹 금지 정신)
  - 페르소나 SH-02 이수민

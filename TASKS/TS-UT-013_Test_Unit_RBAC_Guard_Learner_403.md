# [Test] TS-UT-013: RBAC 가드 단위 테스트 — LEARNER의 TeacherFeedback 생성 403 차단

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-UT-013: RBAC 가드 GWT 단위 테스트 — learner→TeacherFeedback 403, teacher→StampMap 허용, admin→전체 허용, 미인증 401"
labels: 'test, unit, auth, rbac, security, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-013] RBAC 가드 (`requireUser`, `requireRole`, `requireRoleAny`, `requireSelfOrAdmin`) 의 GWT 단위 테스트
- **목적**: FR-AUTH-002 (RBAC 가드 미들웨어) 의 Acceptance Criteria 를 자동화 테스트로 변환하여, REQ-NF-021 (RBAC 3역할) · INV-07 (LEARNER 의 TeacherFeedback·TeacherKitDownload 생성 금지) 가 코드 레이어에서 영구 강제됨을 회귀 검증한다. LEARNER → TEACHER 전용 리소스 접근 시 403 을 확인하는 것이 핵심 시나리오.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC 3역할)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (역할 격리 — LEARNER 의 Teacher 리소스 접근 차단)
  - `/docs/SRS_V0_9.md#5.1` — TC 관련 (권한 검증)
- 테스트 대상: FR-AUTH-002 (`lib/auth/guards.ts` — 4개 가드 함수)
- 테스트 프레임워크: Vitest (또는 Jest)
- 선행: FR-AUTH-002 (RBAC 가드 구현 — 테스트 대상)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `__tests__/unit/auth/rbac.test.ts` 테스트 파일 생성
- [ ] **테스트 환경 설정**:
  - `getCurrentUser()` mock — 역할별 사용자 객체 반환
  - Prisma User 테이블 mock (role 필드)
  - EventLog mock (access_denied 기록 검증)
- [ ] **10개 GWT 시나리오 구현**:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { requireUser, requireRole, requireRoleAny, requireSelfOrAdmin } from '@/lib/auth/guards';

  // Mock 사용자 객체
  const learner = { id: 'u1', role: 'LEARNER', email: 'learner@example.com' };
  const teacher = { id: 'u2', role: 'TEACHER', email: 'teacher@example.com' };
  const admin = { id: 'u3', role: 'ADMIN', email: 'admin@example.com' };

  describe('RBAC Guards', () => {

    describe('requireUser()', () => {
      // Scenario 1: 인증 사용자 통과
      it('Given LEARNER 세션, When requireUser 호출, Then 사용자 객체 반환', async () => {
        mockSession(learner);
        const user = await requireUser();
        expect(user.id).toBe('u1');
        expect(user.role).toBe('LEARNER');
      });

      // Scenario 2: 미인증 → 401
      it('Given 세션 없음, When requireUser 호출, Then AuthError UNAUTHORIZED 발생', async () => {
        mockSession(null);
        await expect(requireUser()).rejects.toThrow('UNAUTHORIZED');
      });
    });

    describe('requireRole()', () => {
      // Scenario 3: ★ 핵심 — LEARNER 가 TeacherFeedback 생성 → 403
      it('Given LEARNER, When requireRole("TEACHER") 호출, Then AuthError FORBIDDEN', async () => {
        mockSession(learner);
        await expect(requireRole('TEACHER')).rejects.toThrow('FORBIDDEN');
      });

      // Scenario 4: TEACHER 가 TEACHER 전용 리소스 → 통과
      it('Given TEACHER, When requireRole("TEACHER") 호출, Then 사용자 객체 반환', async () => {
        mockSession(teacher);
        const user = await requireRole('TEACHER');
        expect(user.role).toBe('TEACHER');
      });

      // Scenario 5: LEARNER 가 ADMIN 전용 라우트 → 403
      it('Given LEARNER, When requireRole("ADMIN") 호출, Then FORBIDDEN', async () => {
        mockSession(learner);
        await expect(requireRole('ADMIN')).rejects.toThrow('FORBIDDEN');
      });

      // Scenario 6: TEACHER 가 ADMIN 전용 → 403
      it('Given TEACHER, When requireRole("ADMIN") 호출, Then FORBIDDEN', async () => {
        mockSession(teacher);
        await expect(requireRole('ADMIN')).rejects.toThrow('FORBIDDEN');
      });

      // Scenario 7: ADMIN 은 모든 역할 통과
      it('Given ADMIN, When requireRole("ADMIN") 호출, Then 통과', async () => {
        mockSession(admin);
        const user = await requireRole('ADMIN');
        expect(user.role).toBe('ADMIN');
      });
    });

    describe('requireRoleAny()', () => {
      // Scenario 8: TEACHER 또는 ADMIN — TEACHER 통과
      it('Given TEACHER, When requireRoleAny(["TEACHER","ADMIN"]) 호출, Then 통과', async () => {
        mockSession(teacher);
        const user = await requireRoleAny(['TEACHER', 'ADMIN']);
        expect(user.role).toBe('TEACHER');
      });

      // Scenario 9: LEARNER — TEACHER|ADMIN 전용 → 403
      it('Given LEARNER, When requireRoleAny(["TEACHER","ADMIN"]) 호출, Then FORBIDDEN', async () => {
        mockSession(learner);
        await expect(requireRoleAny(['TEACHER', 'ADMIN'])).rejects.toThrow('FORBIDDEN');
      });
    });

    describe('requireSelfOrAdmin()', () => {
      // Scenario 10: 본인 데이터 접근 — 통과
      it('Given LEARNER u1, When requireSelfOrAdmin("u1") 호출, Then 통과', async () => {
        mockSession(learner);
        const user = await requireSelfOrAdmin('u1');
        expect(user.id).toBe('u1');
      });

      // Scenario 11: 타인 데이터 접근 — 403
      it('Given LEARNER u1, When requireSelfOrAdmin("u2") 호출, Then FORBIDDEN', async () => {
        mockSession(learner);
        await expect(requireSelfOrAdmin('u2')).rejects.toThrow('FORBIDDEN');
      });

      // Scenario 12: ADMIN 은 타인 데이터 접근 가능
      it('Given ADMIN u3, When requireSelfOrAdmin("u1") 호출, Then 통과', async () => {
        mockSession(admin);
        const user = await requireSelfOrAdmin('u1');
        expect(user.role).toBe('ADMIN');
      });
    });

    describe('EventLog 기록', () => {
      // Scenario 13: 권한 거부 시 EventLog 기록
      it('Given LEARNER → TEACHER 가드 실패, When EventLog 확인, Then auth.access_denied 1건', async () => {
        mockSession(learner);
        try { await requireRole('TEACHER'); } catch {}
        const logs = await getEventLogs('auth.access_denied');
        expect(logs.length).toBeGreaterThanOrEqual(1);
        expect(logs[0].payload.requiredRole).toBe('TEACHER');
        expect(logs[0].payload.actualRole).toBe('LEARNER');
      });
    });
  });
  ```

- [ ] **submitTeacherFeedback 통합 검증** (선택 — 실제 Server Action 호출):
  ```ts
  describe('submitTeacherFeedback() RBAC', () => {
    it('Given LEARNER, When submitTeacherFeedback 호출, Then 403', async () => {
      mockSession(learner);
      const result = await submitTeacherFeedback({
        lesson_id: 'L001', will_reuse: true, used_in_class: false, comment: 'test'
      });
      expect(result.error_code).toBe('FORBIDDEN');
    });
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 인증 사용자 — requireUser 통과
- **Given**: LEARNER 세션
- **When**: `requireUser()` 호출
- **Then**: 사용자 객체 반환. 에러 없음

### Scenario 2: 미인증 — 401 UNAUTHORIZED
- **Given**: 세션 없음
- **When**: `requireUser()` 호출
- **Then**: `AuthError('UNAUTHORIZED')` throw

### Scenario 3: ★ LEARNER → TeacherFeedback — 403 FORBIDDEN (INV-07 핵심)
- **Given**: LEARNER 역할
- **When**: `requireRole('TEACHER')` 호출 (submitTeacherFeedback 의 가드)
- **Then**: `AuthError('FORBIDDEN')` throw. DB INSERT 0건

### Scenario 4: TEACHER → TEACHER 리소스 — 통과
- **Given**: TEACHER 역할
- **When**: `requireRole('TEACHER')` 호출
- **Then**: 사용자 객체 반환

### Scenario 5: LEARNER → ADMIN 전용 — 403
- **Given**: LEARNER 역할
- **When**: `requireRole('ADMIN')` 호출
- **Then**: 403

### Scenario 6: TEACHER → ADMIN 전용 — 403
- **Given**: TEACHER 역할
- **When**: `requireRole('ADMIN')` 호출
- **Then**: 403

### Scenario 7: ADMIN — 전체 통과
- **Given**: ADMIN 역할
- **When**: `requireRole('ADMIN')` 호출
- **Then**: 통과

### Scenario 8: requireRoleAny — TEACHER|ADMIN 중 TEACHER 통과
- **Given**: TEACHER 역할
- **When**: `requireRoleAny(['TEACHER', 'ADMIN'])` 호출
- **Then**: 통과

### Scenario 9: requireSelfOrAdmin — 본인 통과, 타인 403
- **Given**: LEARNER `u1`
- **When**: `requireSelfOrAdmin('u1')` → 통과, `requireSelfOrAdmin('u2')` → 403

### Scenario 10: 권한 거부 시 EventLog 기록
- **Given**: LEARNER → TEACHER 가드 실패
- **When**: EventLog 확인
- **Then**: `auth.access_denied` 이벤트 1건 (requiredRole, actualRole 포함)

## :gear: Technical & Non-Functional Constraints
- **테스트 프레임워크**: Vitest (Next.js App Router 호환)
- **세션 mock 전략**:
  - `getCurrentUser()` 함수를 `vi.mock()` 으로 stub
  - 각 테스트에서 `mockSession(learner | teacher | admin | null)` 호출
  - 실제 Supabase Auth 호출 없음 (순수 단위 테스트)
- **가드 함수 인터페이스**:
  - `requireUser()` → `User` | throw `AuthError('UNAUTHORIZED')`
  - `requireRole(role)` → `User` | throw `AuthError('FORBIDDEN')`
  - `requireRoleAny(roles)` → `User` | throw `AuthError('FORBIDDEN')`
  - `requireSelfOrAdmin(targetUserId)` → `User` | throw `AuthError('FORBIDDEN')`
- **AuthError 클래스**:
  ```ts
  class AuthError extends Error {
    constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN', public requiredRole?: string) {
      super(code);
    }
  }
  ```
- **실행 시간 목표**: 13개 시나리오 전체 ≤ 5초 (DB 미사용 — 순수 로직 테스트)
- **금지**:
  - 실제 DB 조회 (mock 전용)
  - 테스트 간 세션 상태 공유
  - `ADMIN` 역할에 대한 예외 없는 통과 (ADMIN 도 명시적 `requireRole('ADMIN')` 검증)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개+ GWT 시나리오 테스트 코드 구현 + 전부 통과
- [ ] `__tests__/unit/auth/rbac.test.ts` 파일 생성
- [ ] 4개 가드 함수 (requireUser, requireRole, requireRoleAny, requireSelfOrAdmin) 모두 테스트
- [ ] ★ LEARNER → TeacherFeedback 403 핵심 시나리오 통과 (INV-07)
- [ ] EventLog `auth.access_denied` 기록 검증
- [ ] CI 에서 자동 실행 확인
- [ ] 테스트 실행 시간 ≤ 5초
- [ ] PR 본문에 "FR-AUTH-002 의 AC → 자동화. INV-07 LEARNER→TEACHER 격리 영구 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-AUTH-002 (RBAC 가드 구현 — 테스트 대상)
  - FW-AUTH-003 (세션 발급 — 가드가 세션 활용)
  - CT-DB-002 (User 모델 — Role enum)
  - IF-CI-001 (CI 파이프라인)
- **Blocks**:
  - 없음 (테스트 태스크)
- **Related**:
  - REQ-NF-021 (RBAC 3역할)
  - INV-07 (역할 격리)
  - FW-TF-001 (Teacher Feedback — RBAC 가드 소비자)
  - CT-DB-011 (Supabase RLS — 본 테스트와 짝 — 데이터 레이어 방어선)

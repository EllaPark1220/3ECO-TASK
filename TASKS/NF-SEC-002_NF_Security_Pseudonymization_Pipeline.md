# [NF] NF-SEC-002: 가명처리 파이프라인 구축 (user_id → pseudo_id)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-SEC-002: 보안 인프라 — 분석 데이터용 user_id → pseudo_id 가명처리 파이프라인 (HMAC-SHA256)"
labels: 'nf, security, privacy, pseudonymization, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-002] 분석용 데이터 가명처리(Pseudonymization) 파이프라인 구축
- **목적**: REQ-NF-016 (가명처리) 충족. Vercel Analytics, 자체 구축 KPI 대시보드(FR-KPI-*), 또는 실험 데이터(EXP-1~4) 추출 시, 사용자의 식별자인 `user_id`나 `email` 등 PII를 평문으로 노출하지 않고 일관성 있는 `pseudo_id`로 해싱하여 개인정보 유출 리스크를 원천 차단.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-016 (PII 가명처리 정책)
- 관련: FR-KPI-* (모든 통계 쿼리에서 사용됨), EXP-* (실험 군 배정 시 사용)
- 선행: CT-DB-002 (User 스키마)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **환경변수 세팅 (`PSEUDONYMIZATION_SECRET`)**:
  - `crypto` 모듈 해싱에 사용할 비밀키(Pepper)를 `.env` 및 Vercel Dashboard에 주입.
  - 주기적 교체를 위해 `PSEUDONYMIZATION_SECRET_V1` 형태로 버저닝 운영 검토.
- [ ] **가명처리 유틸리티 모듈 구현 (`lib/security/pseudonymize.ts`)**:
  - Node.js 내장 `crypto`의 `createHmac('sha256')`를 이용하여 단방향 해싱.
  - 성능을 위해 `hex` 형태로 반환 후, 데이터베이스 저장 시 용량 절감을 위해 16자리 또는 32자리로 잘라내어 반환(Collision 확률 고려).
  ```ts
  import { createHmac } from 'crypto';

  export function generatePseudoId(userId: string): string {
    if (!userId) return 'anonymous';
    const secret = process.env.PSEUDONYMIZATION_SECRET;
    if (!secret) throw new Error('PSEUDONYMIZATION_SECRET is missing');

    return createHmac('sha256', secret)
      .update(userId)
      .digest('hex')
      .substring(0, 32); // 32자리 hex (충돌 위험 방지)
  }
  ```
- [ ] **배치/쿼리 레벨에서의 래핑 처리**:
  - `LessonProgress`나 `EventLog`에서 대규모 데이터를 뽑아낼 때, Prisma의 쿼리 결과 배열을 순회하며 `userId` 필드를 `pseudoId` 필드로 맵핑하고, 원본 `userId`는 객체에서 `delete` 하는 Mapper 함수 구현.
  ```ts
  export function mapToPseudonymousData<T extends { userId?: string | null }>(
    rows: T[]
  ): Omit<T, 'userId'> & { pseudoId: string }[] {
    return rows.map(row => {
      const { userId, ...rest } = row;
      return {
        ...rest,
        pseudoId: userId ? generatePseudoId(userId) : 'anonymous'
      };
    });
  }
  ```
- [ ] **Analytics 및 로깅 인프라와의 연동 방안 점검**:
  - Sentry나 Vercel Analytics에 사용자를 식별시켜야 할 경우(오류 추적용), 원본 이메일이나 ID 대신 이 `generatePseudoId` 결과만 전송하도록 전역 셋업 점검.
- [ ] **성능 테스트 보장 (Performance Profiling)**:
  - 10,000건의 row를 가명처리할 때 Vercel Edge/Node 환경에서 소요되는 시간이 50ms를 초과하지 않는지 Jest 단위 테스트 레벨에서 성능 측정.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 동일 식별자 일관성 보장
- **Given**: 동일한 `userId` 문자열 "user_12345"
- **When**: `generatePseudoId()` 함수를 두 번 호출
- **Then**: 반환된 `pseudo_id` 값이 완전히 동일해야 함 (통계 집계 정합성 보장)

### Scenario 2: 다른 식별자 분리 보장
- **Given**: 서로 다른 `userId` "user_A", "user_B"
- **When**: 각각 `generatePseudoId()` 함수 호출
- **Then**: 반환된 `pseudo_id` 값이 서로 다름 (충돌 방지)

### Scenario 3: Secret 환경변수 누락 시 에러 페일세이프
- **Given**: `.env`에 `PSEUDONYMIZATION_SECRET`이 설정되지 않은 상태
- **When**: 가명처리 헬퍼 함수 호출
- **Then**: 예외(Error)를 발생시켜 시스템이 중단되어야 함 (보안키 없이 처리되는 것 방지)

### Scenario 4: 단방향 암호화 역산 불가
- **Given**: 해싱된 32자리 `pseudo_id`
- **When**: 애플리케이션 외부의 디코딩 도구로 해석 시도
- **Then**: Secret 키가 없으므로 원래의 `userId`를 알아낼 수 없음

### Scenario 5: Anonymous 유저 처리
- **Given**: 비로그인 사용자의 `userId` (null 또는 빈 문자열)
- **When**: `generatePseudoId()` 함수 호출
- **Then**: 에러를 발생시키지 않고 고정 문자열 `'anonymous'` 반환

### Scenario 6: 대규모 데이터 매퍼 검증
- **Given**: DB에서 조회된 100건의 `EventLog` 객체 배열 (각각 `userId` 포함)
- **When**: `mapToPseudonymousData()` 매퍼 실행
- **Then**: 반환된 배열의 객체들은 `userId` 필드가 삭제되고, `pseudoId` 필드가 생성되어 있음

### Scenario 7: 해시 충돌 가능성 점검 (길이 확인)
- **Given**: 생성된 `pseudoId`
- **When**: 길이 검증
- **Then**: 정확히 32자리 문자열을 반환하여, 사용자 수 10만 명 기준 충돌 확률을 0으로 수렴시킴

### Scenario 8: 외부 Analytics 전송 차단
- **Given**: Sentry의 `setUser` 함수 호출 시나리오
- **When**: `userId` 원문을 전송하려고 시도
- **Then**: 코드 리뷰 및 linter 단에서 이를 차단하고 `pseudoId` 사용을 강제하는 룰 검증

### Scenario 9: 성능 (Latency) 허용치 검증
- **Given**: 10,000건의 더미 사용자 배열
- **When**: 전체 배열에 대해 가명처리 매퍼 실행
- **Then**: 처리 소요 시간이 50ms 미만 (성능 병목이 아님을 증명)

### Scenario 10: Secret 롤링(교체) 후의 행동 정의
- **Given**: Vercel 대시보드에서 `PSEUDONYMIZATION_SECRET` 값이 변경됨
- **When**: 동일한 `userId`로 다시 해싱
- **Then**: 이전과 다른 완전히 새로운 `pseudo_id`가 발급되며, 과거 통계 데이터와 분리됨을 확인 (문서화 됨)

## :gear: Technical & Non-Functional Constraints
- **Performance**: Edge Functions에서도 가볍게 동작하도록 내장 `crypto` 사용 (Bcrypt 같은 무거운 해시 금지). HMAC-SHA256이 이상적임.
- **Privacy Design**: DB에는 가명처리된 값을 영구 저장하지 않음. 통계 추출 시점에 "On-the-fly"로 변환하여 파일이나 API로 반환하는 방식을 고수함. DB에 저장 시 나중에 Secret 교체 시 마이그레이션 부담이 큼.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 기반 Jest 단위 테스트 작성 및 통과
- [ ] `pseudonymize.ts` 헬퍼 및 매퍼 함수 작성 완료
- [ ] Sentry / Analytics 설정 파일 내 PII 필터링 적용 확인
- [ ] `.env.example`에 `PSEUDONYMIZATION_SECRET` 안내 추가
- [ ] PR 본문에 "REQ-NF-016 가명처리 파이프라인" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-DB-002 (사용자 모델)
- **Blocks**: FR-KPI-001 ~ 012 (KPI 데이터 집계 로직의 프로덕션 진입을 블락)

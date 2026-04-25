# [Feature] FW-OX-004: 스탬프 10개 도달 트리거 — Resend 체감 변화 설문 메일 자동 발송 (1회 멱등)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-OX-004: stamp_count = 10 도달 시 Resend 메일 발송 — REQ-FUNC-003 트리거 + 1회 멱등 + EventLog 기반 누적 카운트"
labels: 'feature, backend, ox, stamp, survey, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-OX-004] 사용자가 10번째 stamp 를 획득하는 순간 (FW-OX-001 의 Stamp INSERT 직후) Resend 로 체감 변화 설문 메일 자동 발송 + 1회 멱등 (재발송 방지) + EventLog 기록
- **목적**: REQ-FUNC-003 (스탬프 10자리 트리거 → 체감 변화 설문) 구현. PRD 의 "꾸준히 학습한 사용자에게 학습 효용 자기보고 유도" — 단순 다운로드 카운트가 아닌 **체감 변화** 측정 위한 진입점. CT-API-008 (submitSurvey DTO) + IF-RES-001 (Resend) 연결. **MVP-IN** — Public Pilot 진입 시점 활성, 실 운영 데이터 수집.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003 (체감 변화 설문 트리거)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-043 ("덜 두렵다" ≥60%)
  - `/docs/SRS_V0_9.md#6.2.2` — STAMP + EVENT_LOG 테이블
  - `/docs/SRS_V0_9.md#3.4.1` — OX → 스탬프 시퀀스
- 페르소나: SH-01 박지훈 (10자리 도달 시나리오)
- 선행: FW-OX-001 (OX 채점 + Stamp INSERT), FW-OX-003 (EventLog 발행), IF-RES-001 (Resend), CT-API-008 (Survey DTO)
- 짝: TS-IT-003 (10자리 → 설문 메일 통합 테스트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/services/stamp-trigger.ts` 신규 파일 — 10자리 트리거 함수
- [ ] **트리거 호출 시점** — FW-OX-001 의 Stamp INSERT 직후:
  ```ts
  // FW-OX-001 의 트랜잭션 + EventLog 발행 후
  await emitEvent({ userId, event: 'stamp.earned', payload: { lesson_id } });
  await checkStampMilestone(userId);  // ← 본 태스크의 트리거
  ```
- [ ] **체크 + 발송 함수**:
  ```ts
  import { prisma } from '@/lib/db';
  import { resend } from '@/lib/email/client';
  import { render } from '@react-email/render';
  import { StampMilestoneSurveyEmail } from '@/lib/email/templates/stampMilestoneSurvey';

  export async function checkStampMilestone(userId: string): Promise<void> {
    try {
      // 1. 현재 stamp_count 조회
      const stampCount = await prisma.stamp.count({ where: { userId } });

      // 2. 10자리 도달 검증
      if (stampCount !== 10) return;  // 정확히 10개일 때만 트리거 (11, 12 무시)

      // 3. 멱등 검증 — 이미 발송했는지 EventLog 확인
      const alreadySent = await prisma.eventLog.findFirst({
        where: {
          userId,
          event: 'survey.milestone_email_sent',
        },
      });
      if (alreadySent) return;  // 이미 발송함 → skip

      // 4. 사용자 이메일 조회
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, nickname: true },
      });
      if (!user) return;  // 안전 — 사용자 없음

      // 5. 익명 토큰 발급 (Survey 응답 시 활용)
      const anonymousToken = crypto.randomUUID();

      // 6. 설문 URL 구성 (CT-API-008 의 익명 모드)
      const surveyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/survey?token=${anonymousToken}`;

      // 7. Resend 메일 발송 (silent fail)
      const html = await render(StampMilestoneSurveyEmail({
        nickname: user.nickname,
        surveyUrl,
      }));
      await resend.emails.send({
        from: 'no-reply@economic-judgment.app',
        to: user.email,
        subject: '경제 판단력 교과서 — 학습 체감 변화 설문',
        html,
      });

      // 8. EventLog 발행 — 멱등 키
      await prisma.eventLog.create({
        data: {
          userId,
          event: 'survey.milestone_email_sent',
          payload: { stamp_count: stampCount, anonymous_token: anonymousToken },
        },
      });
    } catch (error) {
      // silent fail — 메인 OX 채점 흐름 영향 0
      console.error('checkStampMilestone failed:', error);
      // Sentry.captureException(error);
    }
  }
  ```
- [ ] **메일 템플릿 — `lib/email/templates/stampMilestoneSurvey.tsx`**:
  ```tsx
  import { Html, Body, Heading, Text, Button, Section, Hr } from '@react-email/components';

  export function StampMilestoneSurveyEmail({ nickname, surveyUrl }: Props) {
    return (
      <Html>
        <Body>
          <Heading>{nickname}님, 10편 완주 축하드립니다.</Heading>
          <Text>
            경제 판단력 교과서를 꾸준히 학습해 주셔서 감사합니다.
            지금까지의 학습이 일상의 경제 판단에 어떤 변화를 가져왔는지 잠깐 되돌아보는 시간을
            가져주시면 감사하겠습니다.
          </Text>
          <Text>
            5분 내 응답 가능하며, 익명으로 처리됩니다.
          </Text>
          <Section>
            <Button href={surveyUrl}>설문 시작</Button>
          </Section>
          <Hr />
          <Text style={{ fontSize: '12px', color: '#888' }}>
            본 메일은 학습 진척도에 따라 1회 발송됩니다.
            발송을 원하지 않으시면 무시하시면 됩니다.
          </Text>
        </Body>
      </Html>
    );
  }
  ```
- [ ] **CON-05 (후킹 금지) 정합 — 메일 본문**:
  - "축하드립니다" — 1회 (사실 인지 표현, 자극 표현 부재)
  - "잠깐 되돌아보는 시간" — 차분한 톤
  - "5분 내 응답" — 부담 최소화
  - 후킹 키워드 (TS-STATIC-001 사전) 부재 검증
- [ ] **익명 토큰 정책**:
  - UUID v4 생성
  - URL query parameter 로 전달
  - CT-API-008 (Survey) 의 anonymous_token 으로 활용
  - **만료 정책 30일** (Survey 분기 한도 + 여유)
  - 토큰 자체에는 user_id 직접 저장 0 — Survey 응답 시 user_id NULL (익명성 보장)
- [ ] **silent fail 정책**:
  - 메일 발송 실패가 OX 채점 본 흐름 영향 0
  - 실패 시 Sentry 알림 + EventLog 미발행 → 다음 stamp 도달 시 재시도 (정확히 10개일 때만이라 불가능 — 별도 재발송 SOP 필요)
- [ ] **재발송 SOP (별도 후속)**:
  - 운영자가 수동으로 재발송 트리거 가능 (admin Server Action)
  - 본 태스크는 자동 1회만
- [ ] **EventLog 발행 (catalog 추가)**:
  - `survey.milestone_email_sent` (정상 발송)
  - `survey.milestone_email_failed` (Sentry 알림 호환)
- [ ] **응답 시간 영향**:
  - 본 함수가 FW-OX-001 의 트랜잭션 외부에서 호출되어야 함
  - OX 응답 시간 영향 0 (비동기 fire-and-forget 또는 트랜잭션 분리)
- [ ] **카운트 정책 — 정확히 10개일 때만**:
  - 11, 12 stamp 도달 시 발송 0 (이미 멱등 검증 통과)
  - 10 미만 → return early (정상 case)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 10번째 stamp 도달 → 발송
- **Given**: 사용자 A 의 stamp 9개 + 10번째 OX 통과
- **When**: FW-OX-001 의 트랜잭션 직후 checkStampMilestone(A) 호출
- **Then**: Resend 메일 1통 발송. EventLog `survey.milestone_email_sent` 1건 INSERT

### Scenario 2: 11번째 stamp — 발송 0
- **Given**: 사용자 A 가 11번째 stamp 획득
- **When**: 호출
- **Then**: 메일 미발송. stamp_count !== 10 으로 return

### Scenario 3: 멱등 — 재호출 시 미발송
- **Given**: 이미 메일 발송 완료 (EventLog 존재) + 가상의 시나리오 (DB 조작으로 stamp_count=10 재현)
- **When**: 재호출
- **Then**: 멱등 검증으로 skip. 메일 0통 추가 발송

### Scenario 4: 사용자 미존재 — silent
- **Given**: 잘못된 user_id
- **When**: 호출
- **Then**: 에러 throw 0 (silent fail). 메인 흐름 영향 0

### Scenario 5: Resend 발송 실패 — silent + Sentry
- **Given**: Resend 5xx
- **When**: 호출
- **Then**: console.error + Sentry 알림. EventLog 미발행 (다음 시도 위함). OX 채점 본 흐름 영향 0

### Scenario 6: 메일 본문 — CON-05 정합
- **Given**: 발송된 메일
- **When**: 본문 검사
- **Then**: 후킹 키워드 0건. "축하" 1회 (사실 인지). 차분한 톤

### Scenario 7: 익명 토큰 — Survey 활용
- **Given**: 메일의 surveyUrl
- **When**: 사용자가 클릭하여 Survey 제출
- **Then**: CT-API-008 의 익명 모드 활성. user_id NULL 저장

### Scenario 8: EventLog payload
- **Given**: 발송 후
- **When**: EventLog 조회
- **Then**: `payload.stamp_count: 10` + `payload.anonymous_token` 포함

### Scenario 9: OX 응답 시간 영향 0
- **Given**: FW-OX-001 의 본 함수 호출
- **When**: 응답 시간 측정
- **Then**: 본 함수의 시간이 OX 응답 시간에 미포함 (fire-and-forget 패턴)

### Scenario 10: 카운트 정확성 — 정확히 10
- **Given**: stamp_count: 9 + INSERT 직후 10
- **When**: 호출
- **Then**: stamp_count === 10 일 때만 발송. 9·11 발송 0

## :gear: Technical & Non-Functional Constraints
- **트리거 시점 — Stamp INSERT 직후**: FW-OX-001 의 트랜잭션 외부에서 호출 (응답 시간 영향 0)
- **fire-and-forget 패턴**: `await` 미사용 또는 별도 비동기 처리. OX 응답 영향 0
- **멱등 강제 — EventLog 기반**: `survey.milestone_email_sent` 조회로 1회만 발송
- **카운트 정확성 — 정확히 10**: 11, 12 도달 시 발송 0 (멱등 검증 통과)
- **silent fail 정책**: 메일 발송 실패가 OX 본 흐름 영향 0. Sentry 알림 + 운영자 인지
- **익명 토큰 정책**: UUID v4 + 30일 만료 + Survey 의 anonymous_token 활용
- **CON-05 (후킹 금지) 정합**: 메일 본문 — 차분한 톤, 자극 표현 부재
- **CT-API-008 (Survey) 통합**: anonymous_token 으로 익명 응답 유도
- **재발송 SOP 별도**: 본 태스크는 자동 1회만. 수동 재발송은 admin Server Action (별도 후속)
- **Resend Free 한도**: 100/일, 3000/월. 10자리 도달 사용자 ~ 월 1000명 (Stage 1 목표) — 한도 충분
- **응답 시간 영향 0**: 트랜잭션 분리 + 비동기
- **금지**:
  - 메일 발송이 OX 응답 시간 영향
  - 카운트 11+ 발송 (멱등 위반)
  - 동기 await 으로 본 함수 호출 (응답 지연)
  - PII 를 EventLog payload 에 저장 (이메일은 User 테이블에서 조회)
  - 후킹 표현 메일 본문

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/services/stamp-trigger.ts` 의 checkStampMilestone() 구현
- [ ] FW-OX-001 의 호출 통합 (트랜잭션 외부)
- [ ] StampMilestoneSurveyEmail 템플릿 작성
- [ ] 멱등 정책 — EventLog 기반
- [ ] silent fail + Sentry 알림
- [ ] 익명 토큰 (UUID v4 + 30일 만료) 발급
- [ ] CT-API-008 의 anonymous_token 활용
- [ ] CON-05 후킹 부재 검증 (TS-STATIC-001 사전 활용)
- [ ] OX 응답 시간 영향 0 측정
- [ ] PR 본문에 "REQ-FUNC-003 트리거. 멱등 + silent fail + 익명 Survey 진입" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점 + Stamp INSERT)
  - FW-OX-003 (EventLog 발행 패턴)
  - IF-RES-001 (Resend SDK)
  - CT-API-008 (Survey Contract — anonymous_token 활용)
  - CT-DB-002 (User — email 조회)
  - CT-DB-005 (Stamp 모델 — count 쿼리)
  - CT-DB-009 (EventLog 모델)
- **Blocks**:
  - REQ-FUNC-003 (체감 변화 설문 트리거) 구현
  - REQ-NF-043 ("덜 두렵다" ≥60%) 측정의 데이터 진입
  - TS-IT-003 (10자리 → 설문 메일 통합 테스트)
  - 재발송 SOP (별도 후속)
- **Related**:
  - 페르소나 SH-01 박지훈 (10자리 도달 시나리오)
  - CT-MOCK-003 (10자리 시드 — 통합 테스트 픽스처)

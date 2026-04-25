# [Infra] IF-RES-001: Resend Free 셋업 — 가입 확인 메일 + Teacher will_reuse 알림

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-RES-001: Resend Free API + 발송 템플릿 (가입 확인·will_reuse=true 운영자 알림) + DKIM·SPF 설정"
labels: 'infra, resend, email, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-RES-001] Resend Free 계정 + API 키 + 도메인 검증 (DKIM·SPF) + Next.js 통합 + 한국어 발송 템플릿 2종 (가입 확인·will_reuse=true 운영자 알림)
- **목적**: FW-AUTH-002 (가입 확인 메일) + FW-TF-001 (will_reuse=true 운영자 알림) 의 메일 발송 인프라. Supabase Auth 가 자체 메일도 발송 가능하지만, **한국어 템플릿 + 발송 도메인 일치 + 운영자 알림 통합 위해 Resend 단일 채택**. Free 한도 (월 3,000건 + 일 100건) 내 운영. CON-09 (월 10만원 한도) 정합.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.1` — External Systems (Resend)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-024 (외부 도구 비용 0원 출발)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Free 한도)
- 외부 문서:
  - `https://resend.com/docs`
  - `https://resend.com/docs/dashboard/domains/introduction`
- 선행: IF-VC-001 (Vercel — 환경변수 등록 대상)
- 사용처: FW-AUTH-002 (가입 확인 메일 — Supabase Auth 가 트리거하지만 발송 도메인은 Resend 활용 가능), FW-TF-001 (will_reuse 알림)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Resend 계정 생성** — 개인 GitHub 또는 이메일 가입
- [ ] **API 키 발급** — Resend Dashboard 의 API Keys 메뉴
- [ ] **도메인 추가** (도메인 보유 시):
  - `mail.economy-textbook.kr` 또는 별도 서브도메인
  - DKIM·SPF·DMARC TXT 레코드 등록 (DNS provider 에서)
  - 검증 대기 (보통 < 1시간)
- [ ] **도메인 미보유 시 대응**:
  - Resend 의 기본 도메인 (`onboarding@resend.dev`) 활용 가능 — Alpha 단계 임시
  - 단 발신자 신뢰도·스팸 회피 위해 Closed Beta 이전에는 자체 도메인 필수
- [ ] **`npm install resend` 설치**
- [ ] **`lib/email/client.ts` 생성**:
  ```ts
  import { Resend } from 'resend';
  export const resend = new Resend(process.env.RESEND_API_KEY!);
  ```
- [ ] **메일 템플릿 — `lib/email/templates.ts`**:
  ```ts
  // 1. 가입 확인 메일 (Supabase Auth 가 자체 발송 — 본 템플릿은 Resend 직접 발송 시 옵션)
  export function signupConfirmTemplate(params: { confirmUrl: string; nickname: string }) {
    return {
      subject: '[경제 판단력 교과서] 이메일 인증을 완료해주세요',
      html: `
        <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px;">
          <h2>안녕하세요, ${params.nickname}님</h2>
          <p>경제 판단력 교과서에 가입해주셔서 감사합니다.</p>
          <p>아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>
          <a href="${params.confirmUrl}" style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">이메일 인증하기</a>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">본 메일은 발신 전용입니다.</p>
        </div>
      `,
    };
  }

  // 2. will_reuse=true 운영자 알림
  export function teacherFeedbackAdminAlertTemplate(params: { teacherNickname: string; lessonId: string; willReuse: boolean; usedInClass: boolean; comment?: string }) {
    return {
      subject: `[교사 피드백] ${params.teacherNickname} 님이 ${params.lessonId} 재사용 의사를 밝혔습니다`,
      html: `
        <div style="font-family: 'Noto Sans KR', sans-serif;">
          <h3>교사 피드백 알림</h3>
          <ul>
            <li>교사: ${params.teacherNickname}</li>
            <li>레슨: ${params.lessonId}</li>
            <li>재사용 의사: ${params.willReuse ? '예' : '아니오'}</li>
            <li>수업 활용: ${params.usedInClass ? '예' : '아니오'}</li>
            ${params.comment ? `<li>의견: ${params.comment.slice(0, 200)}${params.comment.length > 200 ? '...' : ''}</li>` : ''}
          </ul>
          <p>관리자 대시보드에서 상세 확인하세요.</p>
        </div>
      `,
    };
  }
  ```
- [ ] **발송 함수 — `lib/email/send.ts`**:
  ```ts
  export async function sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    try {
      const result = await resend.emails.send({
        from: params.from ?? 'noreply@mail.economy-textbook.kr',
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { success: true, id: result.data?.id };
    } catch (error) {
      console.error('Email send failed:', error);
      // Sentry 알림
      // 메일 발송 실패가 메인 비즈니스 로직 영향 0 (silent fail)
      return { success: false, error: String(error) };
    }
  }
  ```
- [ ] **Supabase Auth 와의 분담 정책**:
  - **Supabase Auth 가 자체 발송**: 가입 확인·비밀번호 재설정·매직 링크 (Supabase 의 SMTP 또는 Custom SMTP 옵션 — Closed Beta 단계에서 Resend 로 통합 가능)
  - **Resend 직접 발송**: 운영자 알림 (will_reuse=true 등) — 본 태스크의 핵심 사용처
- [ ] **Custom SMTP (선택 — Closed Beta 이후)**:
  - Supabase Auth Settings 의 "Enable Custom SMTP" → Resend SMTP 정보 입력
  - 모든 인증 메일이 자체 도메인으로 발송 (신뢰도·일관성)
- [ ] **Vercel 환경변수 등록**:
  - `RESEND_API_KEY=...` (Production / Preview / Development 모두)
  - `ADMIN_EMAIL=...` (운영자 알림 수신 주소)
- [ ] **Free 한도 모니터링**:
  - 월 3,000건 + 일 100건
  - 가입 확인 — 사용자 1000명/월 = 1000건 (한도 33%)
  - will_reuse 알림 — 교사 피드백 빈도에 따라 (월 100건 이내 예상)
  - 합산 1,100건/월 (한도 37%) — Alpha·Private Beta 충분
- [ ] **Resend Dashboard 의 Logs 활용** — 발송 성공·실패·바운스 모니터링
- [ ] **단위 테스트** — Resend SDK mock 또는 Resend Sandbox API 활용
- [ ] **TS-IT-016 (선택)** — 메일 발송 통합 테스트 (실제 발송 vs mock 정책 결정)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 도메인 검증 완료
- **Given**: DNS 레코드 (DKIM·SPF·DMARC) 등록
- **When**: Resend Dashboard 확인
- **Then**: 도메인 상태 "Verified". 발송 가능

### Scenario 2: 가입 확인 메일 발송 (Custom SMTP 활성 시)
- **Given**: 사용자 가입
- **When**: Supabase Auth 가 확인 메일 발송
- **Then**: Resend SMTP 통해 발송. 사용자 inbox 도착 (한국어 본문)

### Scenario 3: will_reuse=true 운영자 알림
- **Given**: TEACHER 가 `submitTeacherFeedback({ will_reuse: true })` 호출
- **When**: FW-TF-001 의 후속 호출
- **Then**: `sendEmail` 호출. ADMIN_EMAIL 에 알림 도착

### Scenario 4: 발송 실패 — silent fail
- **Given**: Resend API 일시 장애
- **When**: sendEmail 호출
- **Then**: console.error + Sentry 알림. 호출자 (FW-TF-001) 는 정상 응답. 사용자 영향 0

### Scenario 5: API 키 누락 시 빌드 차단
- **Given**: RESEND_API_KEY 누락
- **When**: 빌드
- **Then**: lib/env.ts 의 zod 검증 실패. 빌드 중단

### Scenario 6: 한국어 본문 정상
- **Given**: 발송된 메일
- **When**: 사용자 수신
- **Then**: 제목·본문 모두 한국어. 인코딩 깨짐 0

### Scenario 7: Free 한도 모니터링
- **Given**: 1주일 운영
- **When**: Resend Dashboard 확인
- **Then**: 발송 카운트 추적. 일 한도 (100건) 의 80% 미만

### Scenario 8: 바운스 처리
- **Given**: 잘못된 이메일 주소로 발송 시도
- **When**: Resend 가 bounce 처리
- **Then**: Dashboard 의 Logs 에 bounce 기록. Sentry 알림 (선택)

### Scenario 9: 발신자 도메인 일치
- **Given**: from `noreply@mail.economy-textbook.kr`
- **When**: 메일 헤더 검사
- **Then**: From 헤더 + DKIM·SPF·DMARC 모두 PASS. 스팸 필터 통과율 높음

### Scenario 10: 단위 테스트 mock
- **Given**: 테스트 환경
- **When**: sendEmail 호출
- **Then**: Resend SDK mock 활용. 실제 발송 0. 호출 횟수·인수 검증 가능

## :gear: Technical & Non-Functional Constraints
- **Resend Free 한도**: 월 3,000건 + 일 100건. 초과 시 Pro 전환 (월 $20 — CON-09 한도 내)
- **도메인 검증**: DKIM·SPF·DMARC 모두 PASS. 스팸 분류 회피
- **Custom SMTP 정책 (Supabase Auth 통합)**:
  - Alpha — Supabase 기본 SMTP (Resend 분리 발송)
  - Closed Beta — Custom SMTP (Resend) 로 통합. 모든 메일 자체 도메인
- **silent fail 정책**: 메일 발송 실패가 메인 비즈니스 로직 영향 0. 단 Sentry 알림 필수
- **발신자 정책**:
  - `noreply@mail.economy-textbook.kr` — 사용자 발송
  - `admin@mail.economy-textbook.kr` — 운영자 알림
- **PII 보호**: 메일 본문에 PII 최소 — comment 200자 truncate, 다른 사용자 정보 미포함
- **테스트 환경**: Resend Sandbox 또는 SDK mock. 실제 메일 발송 0
- **모니터링**:
  - Resend Dashboard Logs 주 1회 확인
  - bounce·complaint 비율 < 0.5%
- **Pro 전환 트리거**: 월 2,500건 도달 (Free 한도의 83%)
- **금지**:
  - PII 자동 추출 후 메일 본문 포함
  - 발신 도메인 일치 없이 발송 (스팸 분류 위험)
  - 평문 비밀번호 메일 발송
  - 마케팅 메일 발송 (PRD 원칙 1·2 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Resend 계정 + API 키 발급
- [ ] 도메인 검증 (또는 Alpha 임시 onboarding@resend.dev)
- [ ] 메일 템플릿 2종 정의 (한국어)
- [ ] `lib/email/send.ts` + `lib/email/templates.ts` + `lib/email/client.ts` 분리
- [ ] silent fail 정책 + Sentry 알림 통합
- [ ] Vercel 환경변수 등록 (3환경)
- [ ] Free 한도 모니터링 셋업
- [ ] 단위 테스트 mock 동작
- [ ] FW-TF-001 통합 — will_reuse=true 알림 발송
- [ ] PR 본문에 "FW-AUTH-002 + FW-TF-001 의 메일 발송 인프라" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel 환경변수)
  - 도메인 보유 (선택 — Alpha 는 임시 가능)
- **Blocks**:
  - FW-AUTH-002 (가입 확인 — Custom SMTP 활성 시)
  - FW-TF-001 (will_reuse 운영자 알림)
  - FW-AUTH-004 (가입 확인 메일 — Supabase Auth 와 분담)
- **Related**:
  - REQ-NF-024 (외부 도구 비용 0원 출발)
  - D-TIER (Pro 전환 트리거)

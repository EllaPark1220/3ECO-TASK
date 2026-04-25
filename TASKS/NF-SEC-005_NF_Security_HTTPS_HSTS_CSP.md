# [Feature] NF-SEC-005: HTTPS + HSTS + CSP + 보안 헤더 — Vercel 자동 + Next.js Middleware

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-SEC-005: HTTPS + HSTS + CSP + 보안 헤더 (X-Frame-Options 등) — Vercel 자동 HTTPS + Next.js Middleware 헤더 + Mozilla Observatory ≥A"
labels: 'nf, security, https, csp, headers, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-005] HTTP 보안 헤더 통합 — (1) HTTPS 강제 (Vercel 자동) + (2) HSTS (Strict-Transport-Security) + (3) CSP (Content-Security-Policy) + (4) X-Frame-Options + (5) X-Content-Type-Options + (6) Referrer-Policy + (7) Permissions-Policy. Mozilla Observatory 점수 ≥ A 강제.
- **목적**: REQ-NF-016 (HTTPS·CSP) 충족 + OWASP Top 10 의 Security Misconfiguration 대응. 외부 보안 audit 시 즉시 통과 가능한 baseline. 단일 제작자(CON-08) 가 매 요청 헤더 수동 검증할 수 없음 — Middleware 일괄 적용.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-016 (HTTPS·CSP)
- 외부:
  - https://observatory.mozilla.org/
  - https://content-security-policy.com/
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
- 선행: IF-VC-001 (Vercel — HTTPS 자동), FW-EXP-001 (Middleware 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Vercel 자동 HTTPS 검증**:
  - Vercel Production + Preview 모두 HTTPS 자동 (Let's Encrypt)
  - HTTP 접속 → 자동 301 → HTTPS
  - 본 정책 — 검증만 (별도 설정 0)
- [ ] **Next.js Middleware 또는 next.config.ts 의 headers — 보안 헤더 일괄 적용**:
  ```ts
  // next.config.ts
  const securityHeaders = [
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',  // 2년
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',  // iframe 차단 (clickjacking)
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',  // 불필요 권한 차단
    },
    {
      key: 'Content-Security-Policy',
      value: getCSPDirective(),
    },
  ];

  module.exports = {
    async headers() {
      return [{ source: '/:path*', headers: securityHeaders }];
    },
  };
  ```
- [ ] **CSP (Content-Security-Policy) 정책 — 가장 엄격하면서 동작**:
  ```ts
  function getCSPDirective(): string {
    const directives = {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",  // Next.js 의 inline script (제거 시도 별도 후속)
        'https://va.vercel-scripts.com',  // Vercel Analytics
      ],
      'style-src': ["'self'", "'unsafe-inline'"],  // Tailwind inline
      'img-src': [
        "'self'",
        'data:',  // base64 (Next/Image)
        'https://*.supabase.co',  // Supabase Storage
        'https://i.ytimg.com',  // YouTube 썸네일
        'blob:',
      ],
      'font-src': [
        "'self'",
        'https://fonts.gstatic.com',  // 나눔 폰트 (만약 외부 호스팅 시)
        'data:',
      ],
      'connect-src': [
        "'self'",
        'https://*.supabase.co',  // Supabase API
        'wss://*.supabase.co',  // Supabase Realtime
        'https://generativelanguage.googleapis.com',  // Gemini (Server-side)
        'https://api.resend.com',  // Resend (Server-side)
      ],
      'frame-src': [
        "'self'",
        'https://www.youtube.com',  // YouTube embed
        'https://www.youtube-nocookie.com',
      ],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],  // X-Frame-Options DENY 와 정합
    };
    return Object.entries(directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
  }
  ```
- [ ] **HSTS preload 등록 (선택, Stage 1 후반)**:
  - `https://hstspreload.org/` 에 도메인 등록
  - max-age 2년 + includeSubDomains + preload 모두 충족 시 등록 가능
  - 등록 후 — 브라우저가 첫 방문부터 HTTPS 강제 (HTTP 요청 0)
  - 본 등록은 도메인 안정성 확보 후 (Stage 1 후반 또는 Stage 2)
- [ ] **CSP report-uri (선택, 운영 모니터링)**:
  - CSP 위반 시 본 사이트의 `/api/csp-report` 로 자동 보고
  - 의외 차단 발견 시 정책 조정
  - 본 cron 또는 EventLog 통합
  ```ts
  // CSP 의 추가 directive
  'report-uri': ['/api/csp-report'],
  ```
- [ ] **Mozilla Observatory 자동 점수 검증 — CI 또는 수동**:
  - https://observatory.mozilla.org/analyze/<도메인>
  - 점수 ≥ A 강제 (정책 준수 시 자동)
  - CI 통합은 별도 후속 (수동 분기 검증)
- [ ] **Cookie Secure + SameSite (NF-SEC-001 정합)**:
  - 본 태스크와 정합 — Cookie 헤더 정책
- [ ] **외부 도메인 화이트리스트 정합**:
  - CSP 의 connect-src·img-src 등은 본 사이트 의존 도메인만
  - 신규 외부 SaaS 도입 시 CSP 갱신 의무 (운영자 SOP)
- [ ] **테스트 — 의도적 위반**:
  ```ts
  it('인라인 외부 script — CSP 차단', () => {
    // 외부 스크립트 로드 시도 (https://evil.com/x.js)
    // 브라우저 콘솔에 CSP violation 출력 + 차단
  });

  it('iframe 임베드 — X-Frame-Options 차단', () => {
    // 외부 사이트의 본 사이트 iframe 임베드
    // X-Frame-Options DENY 로 차단
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: HTTPS 자동 강제
- **Given**: HTTP 접속
- **When**: GET /
- **Then**: 301 → HTTPS

### Scenario 2: HSTS 헤더
- **Given**: HTTPS 응답
- **When**: 헤더 검사
- **Then**: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

### Scenario 3: X-Frame-Options DENY
- **Given**: 응답
- **When**: 검사
- **Then**: X-Frame-Options: DENY

### Scenario 4: CSP 정책 적용
- **Given**: 응답
- **When**: 검사
- **Then**: Content-Security-Policy 헤더 + 정책 catalog

### Scenario 5: 외부 script 차단
- **Given**: https://evil.com/x.js 로드 시도
- **When**: 브라우저 실행
- **Then**: CSP violation + 차단

### Scenario 6: iframe 임베드 차단
- **Given**: 외부 사이트가 본 사이트 iframe 임베드
- **When**: 시도
- **Then**: X-Frame-Options DENY 로 차단

### Scenario 7: YouTube embed 정상
- **Given**: 본 사이트의 lesson 페이지
- **When**: YouTube embed
- **Then**: frame-src 화이트리스트 → 정상

### Scenario 8: Supabase API 정상
- **Given**: 클라이언트의 Supabase 호출
- **When**: connect-src 검증
- **Then**: 정상 (화이트리스트)

### Scenario 9: 불필요 권한 차단 (camera 등)
- **Given**: 사용자 사이트
- **When**: navigator.mediaDevices.getUserMedia
- **Then**: Permissions-Policy 로 차단

### Scenario 10: Mozilla Observatory ≥ A
- **Given**: production URL
- **When**: Observatory 분석
- **Then**: ≥ A 점수

## :gear: Technical & Non-Functional Constraints
- **HTTPS 자동 (Vercel)**: 별도 설정 0
- **HSTS max-age 2년 + preload**: 강력 정책
- **CSP — 가장 엄격하면서 동작**: 외부 도메인 명시 화이트리스트
- **X-Frame-Options DENY + frame-ancestors none**: clickjacking 차단
- **불필요 권한 (camera·mic·geo) 차단**
- **CSP report-uri (선택, 운영 모니터링)**
- **Mozilla Observatory ≥ A 강제**: 외부 audit 즉시 통과
- **외부 도메인 화이트리스트 — 신규 SaaS 도입 시 SOP**
- **금지**:
  - `'unsafe-eval'` 활용 (XSS 위험)
  - `*` 와일드카드 (모든 도메인 허용)
  - X-Frame-Options 누락 (clickjacking)
  - HSTS preload 등록 후 max-age 단축 (브라우저 캐시 영구)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] next.config.ts 의 headers
- [ ] CSP 정책 catalog
- [ ] HSTS + X-Frame-Options + 기타 헤더
- [ ] Mozilla Observatory 검증 (≥ A)
- [ ] 운영자 SOP — 신규 SaaS 도입 시 CSP 갱신
- [ ] CSP report-uri (선택, EventLog 통합)
- [ ] HSTS preload 등록 (Stage 1 후반)
- [ ] PR 본문에 "REQ-NF-016 + OWASP Misconfiguration + Mozilla A" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel HTTPS)
  - FW-EXP-001 (Middleware 패턴 — 정합)
- **Blocks**:
  - REQ-NF-016 충족
  - OWASP Misconfiguration mitigation
- **Related**:
  - NF-SEC-001 (Cookie Secure + SameSite)
  - NF-SEC-002 (RLS)
  - NF-SEC-004 (Input Validation)

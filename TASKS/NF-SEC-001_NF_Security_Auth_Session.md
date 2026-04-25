# [NF] NF-SEC-001: TLS 1.2+ 강제 및 HSTS 활성화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-SEC-001: 보안 인프라 — TLS 1.2+ 강제 및 HSTS 활성화 (Vercel 자동 + 헤더 검증)"
labels: 'nf, security, https, hsts, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-001] TLS 1.2+ 강제 및 HSTS 활성화
- **목적**: REQ-NF-018 (전송 구간 보안) 충족. 사용자 데이터 보호를 위해 모든 통신 구간을 암호화하고, Vercel의 기본 기능을 활용하여 TLS 1.2+ 및 HSTS(HTTP Strict Transport Security)를 적용. 중간자 공격(MitM)과 다운그레이드 공격을 원천 차단.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-018 (TLS 1.2+ 강제)
- OWASP Top 10: Cryptographic Failures 대응
- 선행: IF-VC-001 (Vercel 환경 구축)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Vercel TLS 정책 통합 및 점검**:
  - Vercel 프로덕션 배포 시 Let's Encrypt를 통한 인증서 자동 발급 보장.
  - Vercel Dashboard -> Domains 설정에서 TLS 1.2 미만 프로토콜 접속이 차단되는지 확인(최신 Vercel Edge 네트워크는 기본적으로 1.2+ 강제).
- [ ] **HTTP → HTTPS 자동 리디렉션 강제화**:
  - 사용자가 `http://`로 접근 시 `308 Permanent Redirect`로 `https://`로 강제 리디렉션되도록 Vercel 기본 동작 검증.
- [ ] **HSTS 보안 헤더 추가 (`next.config.ts`)**:
  - 브라우저 수준에서 HTTPS 접속을 강제하기 위해 `Strict-Transport-Security` 헤더를 전역 라우트에 주입.
  - 서브도메인 보호(`includeSubDomains`) 및 브라우저 프리로드 리스트 등재 준비(`preload`) 포함.
  ```ts
  // next.config.ts
  const securityHeaders = [
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload', // 2년 강제
    }
  ];

  module.exports = {
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: securityHeaders,
        },
      ];
    },
  };
  ```
- [ ] **로컬 개발 환경 무시 예외 처리**:
  - `NODE_ENV === 'development'` 일 때는 HSTS 헤더가 `localhost`에 적용되어 로컬 개발을 방해하지 않도록 조건부 적용(Next.js headers는 주로 프로덕션 빌드에 적용됨).
- [ ] **CI 통합 검증 스크립트 작성 (`scripts/verify-tls.sh`)**:
  - cURL을 이용해 HTTP 응답의 헤더를 파싱하여 HSTS가 정상적으로 들어오는지 자동 검사.
  ```bash
  #!/bin/bash
  URL="https://your-production-url.com"
  HEADER=$(curl -s -D- $URL | grep -i "Strict-Transport-Security")
  if [[ -z "$HEADER" ]]; then
    echo "❌ HSTS 헤더 누락"
    exit 1
  fi
  echo "✅ HSTS 헤더 정상: $HEADER"
  ```
- [ ] **HSTS Preload 리스트 등록 (운영 SOP)**:
  - Alpha 단계 배포 후 안정성이 확인되면, `hstspreload.org`에 도메인을 정식 등록하는 절차를 문서화 (`docs/ops/hsts-preload-sop.md`).

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: HTTP 접근 시 308 HTTPS 리디렉션
- **Given**: 배포된 프로덕션 도메인
- **When**: 클라이언트가 `http://` 로 요청
- **Then**: HTTP 308 상태 코드가 반환되고 `https://` Location으로 리디렉션 됨

### Scenario 2: HSTS 헤더 포함 여부 검증
- **Given**: 배포된 프로덕션 도메인
- **When**: `https://` 로 리소스 요청
- **Then**: 응답 헤더에 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` 가 정확히 포함됨

### Scenario 3: HSTS max-age 조건
- **Given**: HSTS 응답 헤더
- **When**: 파싱하여 `max-age` 값을 추출
- **Then**: `max-age`가 최소 1년 (31536000) 이상 설정되어 있음 (현재 2년 설정)

### Scenario 4: 서브도메인 보호 적용
- **Given**: HSTS 응답 헤더
- **When**: 디렉티브 확인
- **Then**: `includeSubDomains` 속성이 포함되어 있음

### Scenario 5: TLS 1.0, 1.1 차단 확인
- **Given**: 외부 점검 도구 (예: SSL Labs, TestSSL)
- **When**: 프로덕션 도메인을 스캔
- **Then**: TLS 1.0, TLS 1.1 연결이 거부되고, TLS 1.2 및 TLS 1.3만 허용됨

### Scenario 6: CI 파이프라인에서 헤더 검증
- **Given**: CI/CD 파이프라인 구동 (`IF-CI-001`)
- **When**: 배포 후 연막 테스트(Smoke Test) 실행 단계 도달
- **Then**: `verify-tls.sh` 스크립트가 실행되어 HSTS 헤더 존재를 확인하고 Pass 처리함

### Scenario 7: 로컬 환경 예외 처리
- **Given**: 로컬 개발 서버 (`http://localhost:3000`) 구동
- **When**: 메인 페이지 요청
- **Then**: 로컬에서는 HSTS 헤더가 전달되지 않아 HTTP 개발에 차질이 없어야 함

### Scenario 8: HSTS Preload SOP 작성
- **Given**: 레포지토리 문서 폴더
- **When**: `docs/ops/hsts-preload-sop.md` 확인
- **Then**: 도메인 소유자 인증, 제출 절차, 롤백 시나리오가 문서에 기록되어 있음

### Scenario 9: 혼합 콘텐츠(Mixed Content) 차단
- **Given**: 프로덕션 사이트
- **When**: 이미지 등 일부 정적 리소스를 `http://` 로드 시도
- **Then**: 브라우저 보안 정책에 의해 혼합 콘텐츠가 자동으로 차단됨 (Console 에러 발생)

### Scenario 10: Vercel Preview 환경 검증
- **Given**: Vercel PR Preview URL
- **When**: 페이지 요청
- **Then**: 프리뷰 환경에서도 동일한 HSTS 보안 헤더가 삽입되어야 함

## :gear: Technical & Non-Functional Constraints
- **Vercel 인프라 한계**: Vercel은 자체 로드밸런서에서 TLS 핸드셰이크를 처리하므로, 코드 상에서 TLS 버전을 직접 제어하는 것이 불가능함. Vercel의 글로벌 기본 정책(1.2+)에 온전히 의존함.
- **캐시 이슈**: HSTS `max-age`가 길기 때문에, 도메인 내에서 단 하나의 서브도메인이라도 HTTP를 띄울 일이 향후 2년간 절대 없어야 함.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과
- [ ] `next.config.ts` 에 HSTS 헤더 반영 완료
- [ ] `scripts/verify-tls.sh` 생성 및 CI/CD 연동
- [ ] SSL Labs 스캔 결과 A등급 이상 스크린샷 PR 첨부
- [ ] HSTS Preload 절차 문서화
- [ ] PR 본문에 "REQ-NF-018 HSTS 강제" 라벨 부착

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-001 (Vercel 기본 인프라)
- **Blocks**: 스테이징(Stage 0) 안정성 검증 통과

# [NF] NF-SEC-003: 외부 폰트 및 스크립트 최소화 자동 감사

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-SEC-003: 보안 인프라 — Google Fonts 외 외부 CDN / 서드파티 스크립트 0건 자동 검증 (정적 분석)"
labels: 'nf, security, script, static-analysis, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-003] 외부 리소스 최소화 정적 분석기
- **목적**: REQ-NF-020 (외부 리소스 통제) 충족. 무분별한 서드파티 스크립트, CDN 삽입을 통제하여 Supply Chain Attack 리스크를 방지하고, 렌더링 블로킹 및 LCP 저하를 차단. CI 파이프라인에서 코드를 스캔하여 승인되지 않은 도메인이 포함된 태그가 발견될 경우 빌드를 Fail 시킴.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-020 (외부 폰트/스크립트 통제)
- 선행: IF-FONT-001 (Google Fonts 세팅 - `next/font/google` 사용)
- 관련: IF-CI-001 (GitHub Actions CI)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **분석 대상 및 화이트리스트 도메인 정의**:
  - 검사 대상: `src/`, `app/`, `components/` 폴더 내 `.tsx`, `.jsx`, `.html` 파일.
  - 화이트리스트 목록 (예시):
    - `https://va.vercel-scripts.com` (Vercel Analytics)
    - `https://www.youtube.com/iframe_api` (YouTube Player API)
    - (Google Fonts는 `next/font/google`로 번들링하므로 `<link href="...fonts.googleapis.com">` 태그 자체를 허용하지 않음)
- [ ] **Node.js 기반 정적 검증 스크립트 작성 (`scripts/check-external-scripts.ts`)**:
  - `glob`로 파일을 순회하며, 정규표현식으로 `<script src="http` 및 `<link href="http` 패턴을 캡처.
  - 추출된 URL 호스트네임이 화이트리스트 배열에 없으면 배열에 위반 내역 추가.
  ```ts
  import fs from 'fs';
  import { globSync } from 'glob';

  const WHITELIST = [
    'va.vercel-scripts.com',
    'www.youtube.com',
  ];

  const files = globSync('app/**/*.{tsx,jsx}');
  let violations = 0;

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    // <script src="..."> 와 <link href="..."> 정규식 매칭
    const scriptRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const url = new URL(match[1]);
      if (!WHITELIST.includes(url.hostname)) {
        console.error(`❌ 외부 스크립트 위반: ${file} (도메인: ${url.hostname})`);
        violations++;
      }
    }
  });

  if (violations > 0) {
    console.error(`\n총 ${violations}건의 미승인 외부 리소스가 발견되었습니다.`);
    process.exit(1);
  }
  ```
- [ ] **`.github/workflows/quality.yml` 통합**:
  - `Linting & Formatting` 잡에 이 스크립트를 실행하는 단계 `npm run lint:external` 추가.
- [ ] **SOP 작성**: 새로운 외부 툴(예: CS 채팅툴, 마케팅 트래커 등) 추가 시 보안 검토를 거친 후 화이트리스트 배열을 업데이트하는 절차를 README에 문서화.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 승인된 스크립트만 포함된 상태
- **Given**: 코드베이스에 YouTube API `<script src="https://www.youtube.com/iframe_api">`만 존재함
- **When**: 검사 스크립트 실행
- **Then**: 위반 내역 0건으로 탐지하고 프로세스 종료 코드 0 (Success) 반환

### Scenario 2: 미승인 CDN (예: jQuery) 삽입 적발
- **Given**: 임의의 `.tsx` 파일에 `<script src="https://code.jquery.com/jquery-3.6.0.min.js">` 삽입
- **When**: 검사 스크립트 실행
- **Then**: 에러 메시지와 함께 도메인 `code.jquery.com` 을 지목하고, 프로세스 종료 코드 1 (Fail) 반환

### Scenario 3: 미승인 외부 CSS 폰트 삽입 적발
- **Given**: `<link href="https://fonts.googleapis.com/css2?...">` 삽입 (`next/font`를 사용해야 함)
- **When**: 검사 스크립트 실행
- **Then**: 폰트 외부 로드를 금지하므로 위반 내역으로 적발하고 빌드 실패

### Scenario 4: CI 파이프라인 차단 기능
- **Given**: 미승인 스크립트가 포함된 코드로 PR 생성
- **When**: GitHub Actions에서 `quality.yml` 워크플로우 구동
- **Then**: `Linting & Formatting` 잡에서 실패하여 PR 머지가 자동차단됨

### Scenario 5: 주석 처리된 코드는 스킵하거나 같이 차단
- **Given**: `// <script src="https://evil.com/x.js"></script>` 주석 포함
- **When**: 스크립트 실행
- **Then**: 보수적인 접근으로 주석 내부라도 패턴이 일치하면 적발하거나(권장), AST 분석이 아니므로 정규식으로 안전하게 처리함을 문서에 고지함

### Scenario 6: 내부 상대 경로 스크립트는 허용
- **Given**: `<script src="/local/custom.js"></script>` 삽입
- **When**: 검사 스크립트 실행
- **Then**: URL이 `http` 또는 `https`로 시작하지 않으므로 위반으로 카운트하지 않고 통과

### Scenario 7: 동적 삽입 스크립트 감지 시도
- **Given**: 코드에 `document.createElement('script')` 구문 존재
- **When**: 정규식 스캔
- **Then**: 완벽한 차단은 어려우나, 기본적으로 외부 도메인을 `document.createElement('script').src = "https://..."` 형태로 할당하는 패턴에 대해 경고(Warning)를 출력하는 룰 추가

### Scenario 8: `next/script` 컴포넌트 감지
- **Given**: Next.js의 `<Script src="https://cdn.example.com/..." />` 사용
- **When**: 정규식 스캔
- **Then**: `<Script src=...` 구문도 정확히 파싱하여 화이트리스트 대조 로직 수행

### Scenario 9: 스캔 성능 속도
- **Given**: 200개 이상의 컴포넌트 파일이 있는 레포지토리
- **When**: 스크립트 구동
- **Then**: 전체 검사 소요 시간이 2초 이내로 완료되어 CI 시간에 영향을 주지 않음

### Scenario 10: 화이트리스트 갱신 SOP 문서화
- **Given**: 개발 문서 디렉토리
- **When**: README 또는 `ops/external-scripts-sop.md` 열람
- **Then**: "새로운 스크립트를 추가하려면 보안/성능 영향 평가 후 `check-external-scripts.ts`의 WHITELIST에 사유와 함께 등록해야 함" 이 명시되어 있음

## :gear: Technical & Non-Functional Constraints
- **제한 사항**: 단순 정규식 기반 분석이므로 변수에 URL을 담아 할당하는 등의 교묘한 난독화는 막을 수 없지만, 이는 "실수 방지" 및 "내부 규칙 강제" 목적이므로 허용 한도 내에 있음.
- **Next.js 번들링 권장**: 모든 서드파티 라이브러리는 가급적 npm 모듈로 설치하여 내부 빌드 시스템을 통과시키는 것을 기본 원칙으로 함.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과 및 예외 케이스 점검
- [ ] `scripts/check-external-scripts.ts` 작성 완료
- [ ] `package.json` 스크립트 명령 등록 및 CI 워크플로우 연동
- [ ] 정규식 패턴이 `<script>`, `<link>`, `<Script>` 모두 커버하는지 테스트 파일로 입증
- [ ] 외부 스크립트 정책 SOP 문서화
- [ ] PR 본문에 "REQ-NF-020 외부 폰트/스크립트 0건 강제화" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-CI-001
- **Blocks**: 외부 애널리틱스, 챗봇 등 신규 마케팅 툴 도입 PR

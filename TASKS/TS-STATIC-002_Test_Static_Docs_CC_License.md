# [Feature] TS-STATIC-002: 문서 린터 — CC BY-NC-SA 4.0 명시 + 후킹 키워드 + 모든 .md/.tsx 정적 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-STATIC-002: 문서·코드 정적 린터 — CC BY-NC-SA 4.0 명시 + TS-STATIC-001 후킹 사전 + 모든 .md/.tsx 파일 검사 + CI 통합"
labels: 'feature, test, static, lint, ci, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-STATIC-002] 모든 `.md`, `.tsx`, `.ts` 파일에 대한 정적 린터 — (1) 후킹 키워드 (TS-STATIC-001 사전 활용) + (2) CC BY-NC-SA 4.0 명시 의무 위치 검증 (LICENSE 파일·README·Footer·메일 템플릿) + CI 자동 실행
- **목적**: FW-LINT-001 (콘텐츠 검증) 외 **코드·문서 레벨** 정적 검증. 메일 템플릿·랜딩 페이지·LICENSE 같은 콘텐츠 외 영역에서도 후킹 표현 금지 + CC 라이선스 일관성 검증. **TS-STATIC-001 (키워드 사전) + FW-LINT-004 (3곳 동시 검증) 의 보완** — 본 태스크는 파일 일반 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — 정적 분석 정책
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
- 선행: TS-STATIC-001 (키워드 사전), FW-LINT-001 (콘텐츠 린터 패턴), FW-LINT-004 (CC 3곳 검증), IF-CI-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `scripts/lint-docs-static.ts` 신규 — 문서·코드 정적 린터
- [ ] **검사 대상 파일 정책**:
  ```ts
  const TARGET_GLOBS = [
    '**/*.md',                    // 모든 markdown
    '**/*.tsx',                   // React 컴포넌트
    'lib/email/templates/*.tsx',  // 메일 템플릿 강조
    'app/**/page.tsx',            // 페이지
    'components/**/*.tsx',        // UI 컴포넌트
  ];
  const EXCLUDE_GLOBS = [
    'node_modules/**',
    '.next/**',
    'dist/**',
    'TASKS/**',                   // GitHub Issue 명세는 검사 제외 (후킹 키워드가 정책 설명용으로 등장)
    'lint-rules/**',              // 키워드 사전 자체는 제외
    '__tests__/**',               // 테스트 파일은 별도 (TS-UT-011 의 부정 시나리오에 키워드 등장)
  ];
  ```
- [ ] **(1) 후킹 키워드 검사** — TS-STATIC-001 사전 활용:
  ```ts
  import keywords from '../lint-rules/hooking-keywords.json';
  import { glob } from 'glob';
  import { readFile } from 'node:fs/promises';

  async function checkHookingInDocs(): Promise<{ violations: Violation[] }> {
    const files = await glob(TARGET_GLOBS, { ignore: EXCLUDE_GLOBS });
    const violations: Violation[] = [];

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      for (const [category, words] of Object.entries(keywords.categories)) {
        for (const word of words as string[]) {
          if (content.includes(word)) {
            // line number 추출
            const lines = content.split('\n');
            const lineNum = lines.findIndex(l => l.includes(word)) + 1;
            violations.push({ file, line: lineNum, category, word });
          }
        }
      }
    }

    return { violations };
  }
  ```
- [ ] **(2) CC 라이선스 명시 의무 위치 검증**:
  ```ts
  const REQUIRED_CC_LOCATIONS = [
    { file: 'LICENSE', mustContain: 'CC BY-NC-SA 4.0' },
    { file: 'README.md', mustContain: 'CC BY-NC-SA 4.0' },
    { file: 'components/layout/Footer.tsx', mustContain: 'CC BY-NC-SA 4.0' },
    { file: 'lib/email/templates/newsletterConfirmation.tsx', mustContain: 'CC' },  // 메일 푸터
    // FW-PDF-002 의 PDF 템플릿 — FW-LINT-004 와 정합
  ];

  async function checkCcLocations(): Promise<{ missing: string[] }> {
    const missing: string[] = [];
    for (const loc of REQUIRED_CC_LOCATIONS) {
      try {
        const content = await readFile(loc.file, 'utf-8');
        if (!content.includes(loc.mustContain) && !content.includes('creativecommons.org/licenses/by-nc-sa/4.0')) {
          missing.push(`${loc.file}: "${loc.mustContain}" 또는 URL 패턴 부재`);
        }
      } catch (e) {
        // 파일 없음 — 별도 분류
        missing.push(`${loc.file}: 파일 없음 (CC 명시 위치 미생성)`);
      }
    }
    return { missing };
  }
  ```
- [ ] **통합 CLI**:
  ```ts
  async function lintDocsStatic() {
    const hookingResult = await checkHookingInDocs();
    const ccResult = await checkCcLocations();

    let failCount = 0;

    if (hookingResult.violations.length > 0) {
      console.error(`❌ 후킹 키워드 ${hookingResult.violations.length}건 검출:`);
      hookingResult.violations.forEach(v => {
        console.error(`  ${v.file}:${v.line} [${v.category}] "${v.word}"`);
      });
      failCount += hookingResult.violations.length;
    }

    if (ccResult.missing.length > 0) {
      console.error(`❌ CC 라이선스 ${ccResult.missing.length}곳 누락:`);
      ccResult.missing.forEach(m => console.error(`  ${m}`));
      failCount += ccResult.missing.length;
    }

    if (failCount === 0) {
      console.log('✓ 문서·코드 정적 검증 통과');
      process.exit(0);
    } else {
      console.error(`\n총 ${failCount}건. 수정 필요.`);
      process.exit(1);
    }
  }
  ```
- [ ] **package.json scripts**:
  ```json
  "lint:docs": "tsx scripts/lint-docs-static.ts"
  ```
- [ ] **CI 통합 (IF-CI-001 의 lint Job 또는 별도 Job)**:
  ```yaml
  static-docs-lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run lint:docs
  ```
- [ ] **TS-STATIC-001 / FW-LINT-001 / FW-LINT-004 와의 분담**:
  - **TS-STATIC-001** — 키워드 사전 (정책 정의)
  - **FW-LINT-001** — DB 의 Lesson 콘텐츠 검사 (운영 데이터)
  - **FW-LINT-004** — CC 3곳 정확 검증 (PDF·영상·웹 푸터)
  - **본 태스크 (TS-STATIC-002)** — **파일 일반** 검증 (메일·랜딩·README·LICENSE 등)
- [ ] **excerpt 출력 정책 (FW-LINT-001 와 정합)**:
  - 위반 위치 ±30자 출력 (코드 파일은 행 단위라 짧게)
  - line number 포함
- [ ] **allowlist 정책 (false positive)**:
  - `lint-rules/static-allowlist.json` — 의도적 등장 (정책 설명·테스트 픽스처)
  - PR 리뷰 의무
- [ ] **응답 시간**: 100+ 파일 검사 ≤ 10초

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 코드 — 통과
- **Given**: 모든 .md/.tsx 가 후킹 0 + CC 명시 OK
- **When**: `npm run lint:docs`
- **Then**: 통과 + exit code 0

### Scenario 2: 메일 템플릿 후킹 — Fail
- **Given**: `lib/email/templates/welcome.tsx` 에 "지금 시작!"
- **When**: 실행
- **Then**: ❌ false_urgency 검출 + 파일·line·키워드 출력

### Scenario 3: README CC 누락 — Fail
- **Given**: README.md 에서 CC 표기 제거
- **When**: 실행
- **Then**: ❌ "README.md: CC BY-NC-SA 4.0 부재"

### Scenario 4: LICENSE 파일 자체 누락 — Fail
- **Given**: LICENSE 파일 없음
- **When**: 실행
- **Then**: ❌ "LICENSE: 파일 없음"

### Scenario 5: TASKS/ 폴더 제외 — 정상
- **Given**: TASKS/ 의 명세 파일에 정책 설명용 후킹 키워드 등장
- **When**: 실행
- **Then**: 검출 0 (EXCLUDE_GLOBS 적용)

### Scenario 6: __tests__/ 제외
- **Given**: TS-UT-011 의 부정 시나리오에 키워드
- **When**: 실행
- **Then**: 검출 0

### Scenario 7: 다중 파일 다중 위반
- **Given**: 3개 파일에 각 1건 위반
- **When**: 실행
- **Then**: 3건 출력 + exit code 1

### Scenario 8: line number 정확성
- **Given**: 파일의 12번째 line 에 키워드
- **When**: 실행
- **Then**: 출력 line: 12

### Scenario 9: allowlist 활용
- **Given**: 의도적 키워드 + allowlist 등록
- **When**: 실행
- **Then**: 해당만 skip. 다른 위반 정상 검출

### Scenario 10: 응답 시간 — 100+ 파일 ≤ 10초
- **Given**: 100+ 파일
- **When**: 실행
- **Then**: ≤ 10초

## :gear: Technical & Non-Functional Constraints
- **TS-STATIC-001 / FW-LINT-001 / FW-LINT-004 와 분담 명확**: 본 태스크는 파일 일반
- **EXCLUDE_GLOBS 정책**:
  - TASKS/ — 명세 파일 (정책 설명에 키워드 등장)
  - lint-rules/ — 사전 자체
  - __tests__/ — 테스트의 부정 시나리오
- **CC 의무 위치 4곳**: LICENSE·README·Footer·메일 템플릿
- **allowlist 신중 활용**: PR 리뷰 의무
- **line number 출력**: 수정 가이드
- **응답 시간 ≤ 10초**: 100+ 파일 검사
- **CI 차단 강제**: 위반 0 강제
- **금지**:
  - 사전 검증 (DB 콘텐츠) 와 본 태스크 (파일) 혼동
  - allowlist 무분별 추가
  - line number 미출력 (수정 위치 불명확)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `scripts/lint-docs-static.ts` 구현
- [ ] 후킹 키워드 + CC 의무 위치 통합 검증
- [ ] EXCLUDE_GLOBS 정책 적용 (TASKS·lint-rules·__tests__)
- [ ] CI 통합
- [ ] line number + excerpt 출력
- [ ] allowlist 정책 + 파일
- [ ] 응답 시간 ≤ 10초
- [ ] PR 본문에 "FW-LINT-001 와 보강. 파일 일반 정적 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - TS-STATIC-001 (키워드 사전)
  - FW-LINT-001 (콘텐츠 린터 패턴)
  - FW-LINT-004 (CC 3곳 검증 — 본 태스크와 정합)
  - IF-CI-001 (워크플로)
- **Blocks**:
  - 메일 템플릿·랜딩·README 의 후킹 부재 강제
  - CC 명시 일관성 (운영 외)
- **Related**:
  - REQ-FUNC-037 (CC 라이선스)
  - CON-05 (후킹 금지)

# [Feature] FW-LINT-004: CC BY-NC-SA 4.0 명시 자동 검증 — PDF 푸터 + 영상 설명 + 웹 푸터 3곳

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-LINT-004: CC BY-NC-SA 4.0 명시 자동 검증 — PDF 푸터 + 영상 설명 + 웹 페이지 푸터 3곳 + CI Fail 차단"
labels: 'feature, lint, license, ci, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-LINT-004] CC BY-NC-SA 4.0 라이선스 명시가 (1) PDF 푸터 + (2) 영상 설명 (Lesson.youtubeVideoId 메타) + (3) 웹 페이지 푸터 3곳 모두에 정확히 표기되었는지 자동 검증 + 누락 시 CI Fail
- **목적**: REQ-FUNC-037 (CC 라이선스 3곳 명시) 자동화 검증. 라이선스 명시는 법적 요건 (저작권법) + 콘텐츠 재사용 권리 명확화 — 한 곳이라도 누락 시 라이선스 위반. 본 태스크는 단순 키워드 매칭 외 **3곳 모두 동시 검증** 강제.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC BY-NC-SA 4.0 3곳 명시)
  - `/docs/SRS_V0_9.md#1.4` — REF-15 (CC 라이선스)
- 외부 문서: `https://creativecommons.org/licenses/by-nc-sa/4.0/`
- 선행: CT-DB-003 (Lesson — youtubeVideoId 메타), FW-PDF-002 (PDF 템플릿), FW-LINT-001 (CLI 패턴)
- 짝: TS-STATIC-002 (문서 린터 — CC 명시 검증 사촌)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `scripts/lint-cc-license.ts` 신규 — 3곳 통합 검증
- [ ] **CC 라이선스 표기 표준** (모든 위치 동일):
  ```
  © 2026 경제 판단력 교과서. 본 저작물은 CC BY-NC-SA 4.0 라이선스에 따라 이용 가능합니다.
  https://creativecommons.org/licenses/by-nc-sa/4.0/
  ```
  - 또는 영문 표기:
  ```
  This work is licensed under CC BY-NC-SA 4.0
  ```
  - **본 검증은 "CC BY-NC-SA 4.0" 또는 "creativecommons.org/licenses/by-nc-sa/4.0" 패턴 매칭**
- [ ] **(1) PDF 푸터 검증** — FW-PDF-002 의 템플릿 코드 검사:
  ```ts
  import { readFile } from 'node:fs/promises';

  async function checkPdfFooter(): Promise<{ ok: boolean; reason?: string }> {
    // FW-PDF-002 의 PDF 템플릿 파일 (예: lib/pdf/templates/teacherKit.tsx)
    const pdfTemplatePath = 'lib/pdf/templates/teacherKit.tsx';
    const content = await readFile(pdfTemplatePath, 'utf-8');

    const hasCcText = content.includes('CC BY-NC-SA 4.0') || content.includes('creativecommons.org/licenses/by-nc-sa/4.0');
    return hasCcText
      ? { ok: true }
      : { ok: false, reason: `PDF 템플릿 (${pdfTemplatePath}) 에 CC 라이선스 미포함` };
  }
  ```
- [ ] **(2) 영상 설명 검증** — Lesson 의 video metadata 확인:
  ```ts
  async function checkVideoDescription(): Promise<{ ok: boolean; failedLessons: string[] }> {
    const lessons = await prisma.lesson.findMany({
      select: { lessonId: true, videoDescription: true },  // CT-DB-003 의 컬럼 추가 필요 (별도 후속)
    });

    const failedLessons: string[] = [];
    for (const lesson of lessons) {
      const desc = lesson.videoDescription ?? '';
      const hasCcText = desc.includes('CC BY-NC-SA 4.0');
      if (!hasCcText) failedLessons.push(lesson.lessonId);
    }
    return { ok: failedLessons.length === 0, failedLessons };
  }
  ```
  - **주의** — Lesson 모델에 videoDescription 컬럼 추가 필요 (별도 마이그레이션 PR 또는 본 태스크 PR 통합)
  - 또는 YouTube API 로 실제 video 메타 확인 (별도 후속, 더 무거움)
- [ ] **(3) 웹 페이지 푸터 검증** — Footer 컴포넌트 코드 검사:
  ```ts
  async function checkWebFooter(): Promise<{ ok: boolean; reason?: string }> {
    // 메인 Footer 컴포넌트
    const footerPath = 'components/layout/Footer.tsx';
    const content = await readFile(footerPath, 'utf-8');

    const hasCcText = content.includes('CC BY-NC-SA 4.0') || content.includes('creativecommons.org/licenses/by-nc-sa/4.0');
    return hasCcText
      ? { ok: true }
      : { ok: false, reason: `웹 Footer (${footerPath}) 에 CC 라이선스 미포함` };
  }
  ```
- [ ] **통합 CLI**:
  ```ts
  async function lintCcLicense() {
    const pdfResult = await checkPdfFooter();
    const videoResult = await checkVideoDescription();
    const webResult = await checkWebFooter();

    let failCount = 0;
    if (!pdfResult.ok) {
      console.error(`❌ PDF 푸터: ${pdfResult.reason}`);
      failCount++;
    }
    if (!videoResult.ok) {
      console.error(`❌ 영상 설명: ${videoResult.failedLessons.length}편 lesson 누락 (${videoResult.failedLessons.join(', ')})`);
      failCount++;
    }
    if (!webResult.ok) {
      console.error(`❌ 웹 푸터: ${webResult.reason}`);
      failCount++;
    }

    if (failCount === 0) {
      console.log('✓ CC BY-NC-SA 4.0 명시 3곳 모두 통과');
      process.exit(0);
    } else {
      console.error(`\n총 ${failCount}곳 누락. REQ-FUNC-037 위반.`);
      process.exit(1);
    }
  }
  ```
- [ ] **package.json scripts**:
  ```json
  "lint:cc-license": "tsx scripts/lint-cc-license.ts"
  ```
- [ ] **CI 통합** — 본 스크립트가 기본 quality.yml 또는 별도 license Job:
  ```yaml
  cc-license-lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run db:seed
      - run: npm run lint:cc-license
  ```
- [ ] **TS-STATIC-002 와의 관계**:
  - TS-STATIC-002 — 일반 문서 린터 (전체 파일에 대한 CC 검증)
  - 본 태스크 — **3곳에 한정된** 정확한 위치 검증
  - 두 검증 모두 활용 — 본 태스크는 핵심 3곳, TS-STATIC-002 는 파일 일반
- [ ] **Lesson 의 videoDescription 컬럼 정책**:
  - CT-DB-003 의 후속 마이그레이션으로 추가 또는
  - 본 태스크 PR 에 마이그레이션 포함 (권장)
  - 영상 메타가 DB 에 있어야 자동 검증 가능
- [ ] **위반 발견 시 출력 형식**:
  - 3곳 (PDF·영상·웹) 분리 출력
  - 각 위반의 위치 + 누락된 lesson 목록 (영상의 경우)
  - exit code 1
- [ ] **응답 시간**: 3개 검증 합산 ≤ 5초

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 3곳 모두 통과
- **Given**: PDF 템플릿 + Lesson 10편 모두 + Footer 모두 CC 명시
- **When**: `npm run lint:cc-license`
- **Then**: 통과 출력 + exit code 0

### Scenario 2: PDF 템플릿 누락 — Fail
- **Given**: PDF 템플릿에서 CC 표기 제거
- **When**: 실행
- **Then**: ❌ PDF 푸터 누락 출력

### Scenario 3: 일부 lesson 영상 설명 누락 — Fail
- **Given**: L001~L005 는 OK, L006 의 videoDescription 누락
- **When**: 실행
- **Then**: ❌ 영상 설명 1편 누락 (L006) 출력

### Scenario 4: 모든 lesson 영상 설명 누락 — Fail
- **Given**: 10편 모두 누락
- **When**: 실행
- **Then**: ❌ 10편 누락 출력 + lesson_id 리스트

### Scenario 5: 웹 Footer 누락 — Fail
- **Given**: Footer.tsx 에서 CC 제거
- **When**: 실행
- **Then**: ❌ 웹 푸터 누락 출력

### Scenario 6: 3곳 모두 누락 — Fail (3건 출력)
- **Given**: 3곳 모두 누락
- **When**: 실행
- **Then**: 3건 모두 출력 + exit code 1

### Scenario 7: 영문 표기도 OK
- **Given**: PDF 에 "This work is licensed under CC BY-NC-SA 4.0"
- **When**: 실행
- **Then**: 통과 (영문 표기 인정)

### Scenario 8: URL 만 표기도 OK
- **Given**: Footer 에 `https://creativecommons.org/licenses/by-nc-sa/4.0/` 링크만
- **When**: 실행
- **Then**: 통과 (URL 패턴 매칭)

### Scenario 9: CI 통합
- **Given**: 누락된 PR
- **When**: GitHub Actions
- **Then**: cc-license-lint Job Fail + main 차단

### Scenario 10: 응답 시간 — 5초 이내
- **Given**: 125편 lesson
- **When**: 실행
- **Then**: ≤ 5초

## :gear: Technical & Non-Functional Constraints
- **3곳 모두 동시 검증 — REQ-FUNC-037 강제**: 한 곳이라도 누락 시 Fail. 한 곳만 검증하는 정책 금지
- **표기 표준 다중 매칭**: "CC BY-NC-SA 4.0" 텍스트 또는 URL 패턴 양쪽 인정
- **Lesson.videoDescription 컬럼 의존**: CT-DB-003 의 후속 마이그레이션 또는 본 태스크 PR
- **TS-STATIC-002 와 분담**:
  - 본 태스크 — 3곳에 한정 정확 검증
  - TS-STATIC-002 — 파일 일반 검증
  - 두 검증 모두 활용 (중복이 아닌 보강)
- **응답 시간 ≤ 5초**: 3개 검증 합산
- **CI 차단 강제**: 한 곳이라도 누락 → main 차단
- **법적 정합성**: CC BY-NC-SA 4.0 의 의무 (라이선스 명시) 자동화로 충족
- **금지**:
  - 일부만 검증 (3곳 누락 시 부분 통과 정책)
  - allowlist 추가 (모든 lesson·페이지에 의무)
  - 표기 표준 우회 (단순 키워드 외 추가 허용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `scripts/lint-cc-license.ts` 3곳 통합 검증
- [ ] PDF 템플릿 검증 (FW-PDF-002 와 정합)
- [ ] Lesson.videoDescription 컬럼 추가 (마이그레이션 PR 통합)
- [ ] 웹 Footer 컴포넌트 검증
- [ ] CI 통합 (별도 Job 또는 IF-CI-003)
- [ ] 응답 시간 ≤ 5초 측정
- [ ] TS-STATIC-002 와 분담 정책 문서화
- [ ] PR 본문에 "REQ-FUNC-037 자동화. 3곳 동시 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson — videoDescription 컬럼 추가 필요)
  - FW-PDF-002 (PDF 템플릿)
  - FW-LINT-001 (CLI 패턴)
- **Blocks**:
  - IF-CI-003 (CI 후킹 린터 — 본 스크립트 통합)
  - REQ-FUNC-037 (CC 라이선스 3곳) 자동화 완성
- **Related**:
  - TS-STATIC-002 (문서 린터 — 일반 파일 검증)
  - 콘텐츠 편집 SOP — 신규 lesson 추가 시 3곳 의무

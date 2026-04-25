# [NF] NF-A11Y-006: 글로 읽기 100% — 매체 전환 100% 레슨 제공 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-A11Y-006: 글로 읽기 100% NFR — 전체 레슨 매체 전환 텍스트 콘텐츠 완비 검증"
labels: 'nf, accessibility, text-mode, content, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-006] 글로 읽기 100% 레슨 제공 NFR 검증
- **목적**: REQ-NF-039 (글로 읽기 모드 100% 레슨 제공) + REQ-FUNC-026 (매체 전환 토글) 의 비기능 수준 보장. 모든 레슨(10편 MVP, 향후 125편)에 대해 영상 없이도 **텍스트만으로 학습 목표 달성이 가능한 콘텐츠**가 존재함을 검증. 저시력 사용자(한정숙), 청각장애 학습자, 데이터 부족 환경(오세은) 모두가 영상 의존 없이 학습 가능.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-039 (글로 읽기 100%)
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-026 (매체 전환 토글)
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-023 (3매체 — 영상·글·혼합)
- 페르소나: SH-06 한정숙, SH-07 오세은
- 선행: FR-LES-004 (매체 전환 토글 UI — 구현)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **콘텐츠 완비 검증 스크립트** — `scripts/verify-text-content.ts`:
  ```ts
  import { prisma } from '@/lib/prisma';

  async function verifyTextContent() {
    const lessons = await prisma.lesson.findMany({
      select: { lessonId: true, title: true, textContent: true },
    });

    const results: { lessonId: string; title: string; status: 'PASS' | 'FAIL'; reason?: string }[] = [];

    for (const lesson of lessons) {
      if (!lesson.textContent || lesson.textContent.trim().length === 0) {
        results.push({ lessonId: lesson.lessonId, title: lesson.title, status: 'FAIL', reason: '텍스트 콘텐츠 미존재' });
        continue;
      }

      const wordCount = lesson.textContent.split(/\s+/).length;
      if (wordCount < 100) {
        results.push({ lessonId: lesson.lessonId, title: lesson.title, status: 'FAIL', reason: `단어 수 부족: ${wordCount} < 100` });
        continue;
      }

      results.push({ lessonId: lesson.lessonId, title: lesson.title, status: 'PASS' });
    }

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL');

    console.log(`=== 글로 읽기 100% 검증 ===`);
    console.log(`총 레슨: ${lessons.length}, PASS: ${passed}, FAIL: ${failed.length}`);
    if (failed.length > 0) {
      console.log('\n❌ FAIL 목록:');
      failed.forEach(f => console.log(`  ${f.lessonId} (${f.title}): ${f.reason}`));
      process.exit(1);
    }
    console.log('✅ 전체 PASS — 글로 읽기 100%');
  }

  verifyTextContent();
  ```
- [ ] **Playwright UI 검증** — `tests/nf/text-mode-100.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  const LESSON_IDS = ['L001','L002','L003','L004','L005','L006','L007','L008','L009','L010'];

  for (const lessonId of LESSON_IDS) {
    test(`${lessonId} — 글로 읽기 모드 콘텐츠 존재`, async ({ page }) => {
      await page.goto(`/lessons/${lessonId}`);

      // 매체 전환 토글 클릭 → 글 모드
      const toggle = page.locator('[data-testid="media-toggle"]');
      await toggle.click();

      // 텍스트 콘텐츠 영역 존재 확인
      const textContent = page.locator('[data-testid="text-content"]');
      await expect(textContent).toBeVisible();

      // 최소 텍스트 길이 확인 (의미 있는 콘텐츠)
      const text = await textContent.textContent();
      expect(text!.length).toBeGreaterThan(200); // 최소 200자

      // 영상 숨김 확인
      const video = page.locator('iframe[src*="youtube"]');
      await expect(video).not.toBeVisible();
    });
  }
  ```
- [ ] **콘텐츠 QA 체크리스트** — `docs/qa/text-mode-qa.md`:
  | # | 항목 | 기준 |
  |---|---|---|
  | 1 | 텍스트 존재 | 모든 레슨에 textContent 필드 존재 |
  | 2 | 최소 분량 | 100단어 이상 (의미 있는 요약) |
  | 3 | 영상 내용 반영 | 영상에서 설명한 핵심 개념 텍스트에 포함 |
  | 4 | 차트·수치 텍스트화 | 영상의 차트·수치가 텍스트·표로 제공 |
  | 5 | OX 퀴즈 접근 | 글 모드에서도 OX 퀴즈 접근 가능 |
  | 6 | 학습 목표 달성 | 텍스트만으로 OX 정답 도출 가능 |
- [ ] **린터 연동 (FW-LINT-003)** — 신규 콘텐츠 추가 시 텍스트 미포함 차단:
  ```ts
  // lint: 레슨 시드 데이터에 textContent 필수
  if (!lessonData.textContent || lessonData.textContent.length < 100) {
    throw new Error(`[LINT] ${lessonData.lessonId}: 텍스트 콘텐츠 미포함 또는 부족`);
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전 레슨 텍스트 콘텐츠 존재
- **Given**: 10편 전체 레슨
- **When**: textContent 필드 확인
- **Then**: 10편 모두 존재. FAIL 0건

### Scenario 2: 최소 분량 100단어
- **Given**: 각 레슨 텍스트
- **When**: 단어 수 카운트
- **Then**: 모든 레슨 ≥ 100단어

### Scenario 3: 글 모드 전환 시 텍스트 표시
- **Given**: 레슨 페이지 + 매체 전환
- **When**: 글 모드 선택
- **Then**: 텍스트 콘텐츠 영역 표시. YouTube 숨김

### Scenario 4: OX 퀴즈 글 모드 접근
- **Given**: 글 모드
- **When**: OX 퀴즈 영역 확인
- **Then**: 퀴즈 접근 가능 (영상 시청 없이)

### Scenario 5: 텍스트만으로 OX 정답 도출
- **Given**: L001 글 모드 텍스트
- **When**: OX 문제 풀이
- **Then**: 텍스트 내용으로 정답 판단 가능

### Scenario 6: 차트·수치 텍스트화
- **Given**: 영상 내 차트 등장 구간
- **When**: 글 모드 텍스트 확인
- **Then**: 동등한 정보가 텍스트·표로 제공

### Scenario 7: 신규 레슨 린터 차단
- **Given**: textContent 미포함 신규 레슨
- **When**: 린터 실행
- **Then**: 에러 + 배포 차단

### Scenario 8: 125편 확장 시 검증 스크립트 동작
- **Given**: IF-SCALE-001 (125편 확장)
- **When**: `verify-text-content.ts` 실행
- **Then**: 125편 전수 검증 + FAIL 목록 출력

## :gear: Technical & Non-Functional Constraints
- **콘텐츠 동등성**: 텍스트는 영상의 "대체"가 아닌 "동등 콘텐츠". 학습 목표 달성에 충분해야 함
- **DB 필드**: `Lesson.textContent` — Markdown 또는 HTML 형식
- **최소 기준**: 100단어 이상 (의미 있는 요약·설명)
- **린터 강제**: 신규 콘텐츠 추가 시 textContent 필수 (FW-LINT-003 연동)
- **금지**:
  - "영상을 시청하세요" 만 적힌 placeholder 텍스트
  - 영상 스크립트 그대로 복사 (요약·재구성 필요)
  - textContent 없이 레슨 발행

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] `scripts/verify-text-content.ts` 검증 스크립트
- [ ] Playwright 10편 글 모드 UI 테스트
- [ ] 콘텐츠 QA 체크리스트 6항목 문서
- [ ] 린터 연동 (textContent 필수)
- [ ] 10편 전수 검증 PASS
- [ ] PR 본문에 "REQ-NF-039 글로 읽기 100%. 매체 전환 콘텐츠 완비" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-LES-004 (매체 전환 토글 UI)
- **Blocks**: NF-A11Y-001 (접근성 체크리스트 100%)
- **Related**: REQ-NF-039, REQ-FUNC-026, REQ-FUNC-023 (3매체)

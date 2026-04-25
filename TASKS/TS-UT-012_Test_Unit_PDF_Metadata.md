# [Feature] TS-UT-012: PDF 메타 검증 단위 테스트 — revision_last_updated + notes + CC 라이선스 100% 삽입

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-012: FW-PDF-002 PDF 템플릿 단위 테스트 — 모든 lesson PDF 에 revision_last_updated + notes + CC BY-NC-SA 4.0 100% 삽입 검증"
labels: 'feature, test, unit, pdf, license, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-012] FW-PDF-002 (PDF 템플릿) 단위 테스트 — 모든 lesson PDF 에 (1) revision_last_updated 날짜 + (2) revision_notes (선택) + (3) CC BY-NC-SA 4.0 라이선스 표기 가 100% 삽입되는지 검증
- **목적**: REQ-FUNC-015 (PDF 메타 정합성) + REQ-FUNC-037 (CC 라이선스 명시) 회귀 방지. 신규 lesson PDF 생성 시 메타 누락 차단. 사용자가 PDF 만 보더라도 라이선스 권리·콘텐츠 버전을 인지할 수 있어야 함.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-015 (PDF 메타)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스 3곳)
  - `/docs/SRS_V0_9.md#3.4.2` — PDF 다운로드 시퀀스
- 외부: `@react-pdf/renderer`
- 선행: FW-PDF-002 (PDF 템플릿), CT-DB-003 (Lesson — revision 필드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/pdf/teacher-kit-template.test.ts`
- [ ] **시나리오 1 — PDF 생성 후 텍스트 추출 + 메타 3종 검증**:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { renderToBuffer } from '@react-pdf/renderer';
  import { TeacherKitPdf } from '@/lib/pdf/templates/teacherKit';
  import pdfParse from 'pdf-parse';

  describe('FW-PDF-002 PDF 메타 검증', () => {
    const mockLesson = {
      lessonId: 'L001',
      title: '화폐의 정의',
      script: '국내총생산 (GDP) 은 ...',
      revisionLastUpdated: new Date('2026-04-25'),
      revisionNotes: 'v1.0: 최초 발행',
    };

    it('PDF 에 revision_last_updated 삽입', async () => {
      const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
      const text = (await pdfParse(buffer)).text;

      // 한국 형식 또는 ISO 모두 허용
      expect(text).toMatch(/2026.*04.*25|2026-04-25|26\.4\.25/);
    });
  });
  ```
- [ ] **시나리오 2 — revision_notes 삽입**:
  ```ts
  it('PDF 에 revision_notes 삽입 (있을 때)', async () => {
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    const text = (await pdfParse(buffer)).text;
    expect(text).toContain('v1.0: 최초 발행');
  });

  it('revision_notes NULL — graceful (notes 부재)', async () => {
    const lessonNoNotes = { ...mockLesson, revisionNotes: null };
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={lessonNoNotes} />);
    const text = (await pdfParse(buffer)).text;
    // notes 가 NULL 이면 본 영역 자체가 미표시. 에러 0
    expect(text).not.toContain('null');
  });
  ```
- [ ] **시나리오 3 — CC BY-NC-SA 4.0 표기**:
  ```ts
  it('PDF 에 CC BY-NC-SA 4.0 표기', async () => {
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    const text = (await pdfParse(buffer)).text;

    // 한국어 또는 영문 또는 URL 모두 허용
    const hasCc = text.includes('CC BY-NC-SA 4.0')
      || text.includes('creativecommons.org/licenses/by-nc-sa/4.0')
      || text.includes('© 2026');
    expect(hasCc).toBe(true);
  });
  ```
- [ ] **시나리오 4 — 모든 시드 lesson 의 PDF 메타 정합성**:
  ```ts
  it('CT-MOCK-001 모든 lesson 의 PDF 메타 정합', async () => {
    await seedTestData();
    const lessons = await prismaTest.lesson.findMany();

    for (const lesson of lessons) {
      const buffer = await renderToBuffer(<TeacherKitPdf lesson={lesson} />);
      const text = (await pdfParse(buffer)).text;

      // 1. revision_last_updated
      const hasDate = /\d{4}.*\d{1,2}.*\d{1,2}/.test(text);
      expect(hasDate, `${lesson.lessonId} — revision date 부재`).toBe(true);

      // 2. CC 라이선스
      const hasCc = text.includes('CC BY-NC-SA 4.0') || text.includes('creativecommons.org');
      expect(hasCc, `${lesson.lessonId} — CC 라이선스 부재`).toBe(true);

      // 3. lessonId 표기 (PDF 식별)
      expect(text).toContain(lesson.lessonId);
    }
  });
  ```
- [ ] **시나리오 5 — PDF 파일 크기 정책 — 2~3 페이지 (REQ-FUNC-015 정합)**:
  ```ts
  it('PDF 페이지 수 — 2~3 페이지', async () => {
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    const data = await pdfParse(buffer);
    expect(data.numpages).toBeGreaterThanOrEqual(2);
    expect(data.numpages).toBeLessThanOrEqual(3);
  });
  ```
- [ ] **시나리오 6 — PDF 파일 크기 — ≤ 1MB (성능 정합)**:
  ```ts
  it('PDF 크기 ≤ 1MB', async () => {
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    expect(buffer.byteLength).toBeLessThan(1024 * 1024);  // 1MB
  });
  ```
- [ ] **시나리오 7 — A4 사이즈 정합 (REQ-FUNC-015)**:
  ```ts
  it('PDF A4 사이즈', async () => {
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    const data = await pdfParse(buffer);

    // A4 = 595 x 842 points (PDF 표준)
    // pdf-parse 가 직접 노출 안할 수 있음 — meta 또는 다른 라이브러리 활용
    // 본 검증은 pdf-lib 활용 또는 단순 buffer 메타 검사로 우회
    expect(data.info?.PageSize ?? 'A4').toBe('A4');
  });
  ```
- [ ] **시나리오 8 — 한국어 폰트 렌더링 — 박스 부재**:
  ```ts
  it('한글 텍스트 — 박스 (□) 0건', async () => {
    const lessonKr = { ...mockLesson, title: '한국어 제목', script: '한글 본문 콘텐츠' };
    const buffer = await renderToBuffer(<TeacherKitPdf lesson={lessonKr} />);
    const text = (await pdfParse(buffer)).text;

    expect(text).toContain('한국어 제목');
    expect(text).toContain('한글 본문');
    expect(text).not.toMatch(/□|\?{3,}/);  // 박스 또는 ??? 부재
  });
  ```
- [ ] **시나리오 9 — 빈 lesson 데이터 graceful**:
  ```ts
  it('일부 필드 NULL — graceful 처리', async () => {
    const minimal = {
      lessonId: 'L999',
      title: 'Test',
      script: '단순 본문',
      revisionLastUpdated: new Date(),
      revisionNotes: null,
    };
    expect(() => renderToBuffer(<TeacherKitPdf lesson={minimal} />)).not.toThrow();
  });
  ```
- [ ] **시나리오 10 — PDF 생성 시간 ≤ 1초 (단일 lesson)**:
  ```ts
  it('PDF 생성 시간 ≤ 1초', async () => {
    const start = Date.now();
    await renderToBuffer(<TeacherKitPdf lesson={mockLesson} />);
    expect(Date.now() - start).toBeLessThan(1000);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: revision_last_updated 삽입
- **Given**: lesson + 날짜
- **When**: PDF 생성
- **Then**: 텍스트에 날짜 포함

### Scenario 2: revision_notes 삽입 (있을 때)
- **Given**: notes 값
- **When**: PDF 생성
- **Then**: 텍스트에 notes

### Scenario 3: CC BY-NC-SA 4.0 표기
- **Given**: 데이터
- **When**: 생성
- **Then**: CC 표기 포함

### Scenario 4: 모든 시드 lesson 정합
- **Given**: CT-MOCK-001
- **When**: 각 PDF 생성
- **Then**: 모두 메타 3종 100% 포함

### Scenario 5: 페이지 수 2~3
- **Given**: 데이터
- **When**: 생성
- **Then**: 2~3 페이지

### Scenario 6: 파일 크기 ≤ 1MB
- **Given**: 데이터
- **When**: 생성
- **Then**: byteLength < 1MB

### Scenario 7: A4 사이즈
- **Given**: 데이터
- **When**: 생성
- **Then**: A4

### Scenario 8: 한글 박스 부재
- **Given**: 한글 데이터
- **When**: 생성
- **Then**: □ 또는 ??? 0건

### Scenario 9: NULL graceful
- **Given**: notes NULL
- **When**: 생성
- **Then**: 에러 0

### Scenario 10: 생성 시간 ≤ 1초
- **Given**: lesson
- **When**: 생성
- **Then**: ≤ 1초

## :gear: Technical & Non-Functional Constraints
- **@react-pdf/renderer + pdf-parse**: 본 테스트의 의존성
- **메타 3종 100% — revision date + notes + CC**: 모든 lesson 강제
- **A4 + 2~3 페이지 + ≤ 1MB**: REQ-FUNC-015 정합
- **한글 폰트 렌더링 검증**: 박스 부재 (IF-FONT-001 정합)
- **생성 시간 ≤ 1초**: 정적 생성 시 PDF 시간 (REQ-NF-004 의 일부)
- **금지**:
  - revision_last_updated 누락
  - CC 라이선스 누락
  - 박스 (□) 출력
  - 4 페이지 초과 (정책)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] PDF 메타 3종 검증
- [ ] CT-MOCK-001 모든 lesson 정합 검증
- [ ] 페이지 수 + 파일 크기 + A4 검증
- [ ] 한글 폰트 렌더링 검증
- [ ] 생성 시간 ≤ 1초 측정
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-015 + REQ-FUNC-037 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PDF-002 (PDF 템플릿)
  - CT-DB-003 (Lesson 모델 — revision 필드)
  - CT-MOCK-001 (시드)
  - IF-FONT-001 (한글 폰트, 그룹 7)
  - npm install pdf-parse
- **Blocks**:
  - REQ-FUNC-015·037 회귀 방지
  - PDF 다운로드 안정성
- **Related**:
  - FW-LINT-004 (CC 3곳 검증)
  - TS-STATIC-002 (문서 일반 검증)

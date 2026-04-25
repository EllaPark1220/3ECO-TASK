# [Feature] FR-TF-002: 교사 실사용 사례 공개 페이지 — 본인 동의 사례만 + DOMPurify XSS 방어 + 익명 표시 옵션

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-TF-002: GET /teachers/cases — 본인 동의한 used_in_class=true 피드백 공개 페이지 + DOMPurify sanitize + 익명/실명 옵션 + 페이지네이션"
labels: 'feature, frontend, teacher, public, priority:medium, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-TF-002] `/teachers/cases` 공개 페이지 — 본인 동의 (`isPublicConsent=true`) 한 TeacherFeedback 의 `used_in_class=true` 사례 + comment 본문 + 닉네임 또는 익명 표시 옵션 + DOMPurify XSS 방어 + 페이지네이션
- **목적**: REQ-FUNC-016 (재사용 의사 누적) + 콘텐츠 신뢰도 강화. 다른 교사가 실제로 어떻게 활용했는지 사례 공개 → 신규 교사 outreach 효과. **본인 동의 (`isPublicConsent=true`) 만** 노출 — PII 보호 + 자발적 공개. CON-05 정합 — 사례는 차분한 톤으로 표시.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
- 외부 문서: `https://github.com/cure53/DOMPurify`
- 페르소나: SH-05 장은혜
- 선행: CT-DB-007 (TeacherFeedback — isPublicConsent 컬럼 추가), FW-TF-001 (피드백 진입)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **CT-DB-007 의 후속 마이그레이션 — `isPublicConsent`, `displayMode` 컬럼 추가**:
  ```prisma
  model TeacherFeedback {
    // ... 기존 필드
    isPublicConsent  Boolean  @default(false)  // 공개 동의
    displayMode      String   @default("anonymous")  // "anonymous" | "nickname"
  }
  ```
  - 본 태스크 PR 에 마이그레이션 통합
- [ ] **FW-TF-001 (CT-API-007) 의 Request DTO 확장** — 본인 동의 + 표시 모드 입력:
  - 본 태스크 PR 시점에 CT-API-007 의 Zod schema 갱신:
    ```ts
    export const SubmitTeacherFeedbackRequestSchema = z.object({
      // ... 기존
      is_public_consent: z.boolean().default(false),
      display_mode: z.enum(['anonymous', 'nickname']).default('anonymous'),
    });
    ```
- [ ] **`/teachers/cases` 페이지 (RSC + Server Action 페이지네이션)**:
  ```tsx
  // app/teachers/cases/page.tsx
  import DOMPurify from 'isomorphic-dompurify';
  import { prisma } from '@/lib/db';

  export const revalidate = 600;  // 10분 ISR

  export default async function CasesPage({
    searchParams,
  }: { searchParams: Promise<{ page?: string }> }) {
    const params = await searchParams;
    const page = parseInt(params.page ?? '1');
    const PAGE_SIZE = 10;
    const offset = (page - 1) * PAGE_SIZE;

    // 공개 사례 조회 — DISTINCT ON 으로 가장 최근 피드백 기준
    const cases = await prisma.$queryRaw<Array<{
      id: string;
      lesson_id: string;
      lesson_title: string;
      comment: string | null;
      display_name: string;  // "익명" 또는 nickname
      reported_at: Date;
    }>>`
      WITH latest_feedback AS (
        SELECT DISTINCT ON (tf."teacherId", tf."lessonId")
          tf.id, tf."lessonId", tf.comment, tf."displayMode", tf."reportedAt",
          tf."teacherId", tf."isPublicConsent", tf."usedInClass"
        FROM "TeacherFeedback" tf
        ORDER BY tf."teacherId", tf."lessonId", tf."reportedAt" DESC
      )
      SELECT
        lf.id,
        lf."lessonId" AS lesson_id,
        l.title AS lesson_title,
        lf.comment,
        CASE WHEN lf."displayMode" = 'nickname' THEN u.nickname ELSE '익명 교사' END AS display_name,
        lf."reportedAt" AS reported_at
      FROM latest_feedback lf
      JOIN "Lesson" l ON l."lessonId" = lf."lessonId"
      JOIN "User" u ON u.id = lf."teacherId"
      WHERE lf."isPublicConsent" = true AND lf."usedInClass" = true
      ORDER BY lf."reportedAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;

    return (
      <main className="container">
        <h1>교사 실사용 사례</h1>
        <p>다른 교사들이 본 콘텐츠를 어떻게 활용했는지 확인하세요.</p>
        <ul>
          {cases.map(c => (
            <li key={c.id}>
              <article>
                <header>
                  <h2>{c.lesson_title}</h2>
                  <span>— {c.display_name}, {new Date(c.reported_at).toLocaleDateString('ko-KR')}</span>
                </header>
                {c.comment && (
                  <div
                    // DOMPurify sanitize — XSS 방어
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.comment, { ALLOWED_TAGS: [] }) }}
                    // ALLOWED_TAGS: [] — 모든 HTML 제거 (plain text 만)
                  />
                )}
              </article>
            </li>
          ))}
        </ul>
        <Pagination currentPage={page} hasNext={cases.length === PAGE_SIZE} />
      </main>
    );
  }
  ```
- [ ] **DOMPurify sanitize 정책 — 가장 엄격**:
  - `ALLOWED_TAGS: []` — 모든 HTML 태그 제거 (plain text 만 표시)
  - 사용자가 `<script>` 또는 `<img onerror>` 입력해도 텍스트만 노출
  - `dangerouslySetInnerHTML` 활용해도 sanitize 후라 안전
- [ ] **comment plain text 정책 우선 — dangerouslySetInnerHTML 미사용 옵션**:
  - **권장**: `<p>{c.comment}</p>` 활용 (React 자동 escape, dangerouslySetInnerHTML 미사용)
  - DOMPurify 는 추가 보호 (defense in depth)
  - 본 태스크는 React escape + DOMPurify 양쪽 적용 (가장 안전)
- [ ] **익명 vs 실명 표시 정책**:
  - `displayMode: 'anonymous'` → "익명 교사" 표시
  - `displayMode: 'nickname'` → User.nickname 표시
  - 실명 (real_name) 컬럼 없음 — REQ-NF-014 정합
- [ ] **페이지네이션 정책**:
  - 페이지당 10건
  - URL query parameter `?page=N`
  - 다음 페이지 존재 여부 — `cases.length === PAGE_SIZE`
- [ ] **ISR 정책 — 10분 revalidate**:
  - 새 사례 추가 시 10분 내 반영
  - 정적 생성 + 캐시로 응답 속도 ≤ 100ms
  - 사용자별 무관 (공개 데이터)
- [ ] **외부 인덱싱 정책 — robots.txt allow + sitemap 포함**:
  - 검색엔진에 노출 (콘텐츠 신뢰도 강화 + outreach 효과)
  - sitemap.xml 에 `/teachers/cases` 포함
- [ ] **응답 시간 목표**: p95 ≤ 300ms (ISR cache hit ≤ 50ms)
- [ ] **빈 사례 처리**:
  - 공개 사례 0건 시 "아직 공개된 사례가 없습니다" 메시지

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 공개 사례 정상 표시
- **Given**: isPublicConsent=true + used_in_class=true 피드백 5건
- **When**: `GET /teachers/cases`
- **Then**: 200 + 5건 표시 + 각 사례에 lesson_title, comment, display_name, reported_at

### Scenario 2: 미동의 피드백 미노출
- **Given**: isPublicConsent=false 피드백 10건 + true 2건
- **When**: 호출
- **Then**: 2건만 노출. 미동의 10건 노출 0

### Scenario 3: used_in_class=false 미노출
- **Given**: isPublicConsent=true + used_in_class=false 피드백
- **When**: 호출
- **Then**: 미노출 (실수업 활용 사례만)

### Scenario 4: XSS 시도 — DOMPurify sanitize
- **Given**: comment = `<script>alert(1)</script>안녕하세요`
- **When**: 표시
- **Then**: "안녕하세요" 만 표시 (script 태그 제거)

### Scenario 5: 익명 표시
- **Given**: displayMode='anonymous'
- **When**: 표시
- **Then**: "익명 교사" 표시. nickname 미노출

### Scenario 6: 닉네임 표시
- **Given**: displayMode='nickname' + User.nickname='장은혜'
- **When**: 표시
- **Then**: "장은혜" 표시

### Scenario 7: 페이지네이션
- **Given**: 25건 + ?page=2
- **When**: 호출
- **Then**: 11~20번 사례 표시 + "다음 페이지" 버튼

### Scenario 8: 빈 사례
- **Given**: 공개 사례 0건
- **When**: 호출
- **Then**: "아직 공개된 사례가 없습니다" 메시지

### Scenario 9: ISR cache 정합
- **Given**: 첫 요청 후 새 사례 INSERT
- **When**: 5분 후 재요청
- **Then**: cache hit (이전 결과). 10분 경과 시 revalidate

### Scenario 10: 응답 시간
- **Given**: 100건 사례 + ISR 활성
- **When**: 호출
- **Then**: cache hit ≤ 50ms, miss ≤ 300ms

## :gear: Technical & Non-Functional Constraints
- **본인 동의 강제**: isPublicConsent=true + used_in_class=true 두 조건 모두
- **DOMPurify ALLOWED_TAGS=[]**: HTML 완전 제거 (plain text 만)
- **React escape + DOMPurify 이중**: defense in depth
- **익명/실명 옵션**: 본인 선택. 실명 (real_name) 컬럼 없음
- **DISTINCT ON 가장 최근**: 재제출 반영
- **PII 보호**: comment + nickname (선택) 외 식별자 0
- **ISR 10분**: 응답 속도 + 새 사례 반영 균형
- **검색엔진 인덱싱 허용**: outreach 효과
- **페이지네이션 10건/페이지**: 단일 제작자 운영 부담 최소
- **응답 시간 ≤ 300ms (cache miss), ≤ 50ms (hit)**
- **금지**:
  - 미동의 피드백 노출 (PII 위반)
  - HTML 태그 허용 (XSS 위험)
  - 실명 (real_name) 컬럼 추가 (REQ-NF-014 위반)
  - private 캐시 (공개 페이지에 부적절)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] CT-DB-007 마이그레이션 (isPublicConsent, displayMode)
- [ ] CT-API-007 Zod 확장 (is_public_consent, display_mode)
- [ ] `/teachers/cases` RSC 페이지
- [ ] DOMPurify sanitize (ALLOWED_TAGS=[])
- [ ] 익명/실명 표시 분기
- [ ] 페이지네이션 (10건/페이지)
- [ ] ISR 10분 + sitemap 포함
- [ ] 응답 시간 측정
- [ ] PR 본문에 "본인 동의 사례 공개 + DOMPurify XSS 방어 + 익명 옵션" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback — isPublicConsent, displayMode 추가)
  - CT-API-007 (Zod 확장)
  - FW-TF-001 (데이터 진입)
  - npm install isomorphic-dompurify
- **Blocks**:
  - 검색엔진 인덱싱 (콘텐츠 신뢰도 + outreach)
  - 운영자 검토 SOP — 부적절한 공개 사례 강제 비공개
- **Related**:
  - REQ-FUNC-016 (재사용 의사 누적)
  - 페르소나 SH-05 장은혜 (공개 동의 사례)

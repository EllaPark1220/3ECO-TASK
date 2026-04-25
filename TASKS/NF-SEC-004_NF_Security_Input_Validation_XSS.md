# [Feature] NF-SEC-004: Input Validation + XSS 방어 — Zod schema + DOMPurify + Prisma parameterized

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-SEC-004: Input Validation + XSS 방어 — Zod schema 모든 입력 + DOMPurify sanitize + Prisma parameterized + SQL Injection 차단"
labels: 'nf, security, input-validation, xss, sql-injection, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-004] OWASP Top 10 의 Injection (SQL·NoSQL·OS·LDAP) + XSS (Cross-Site Scripting) 방어 통합 — (1) 모든 외부 입력 Zod schema 검증 + (2) HTML/마크다운 콘텐츠 DOMPurify sanitize + (3) Prisma parameterized 자동 활용 + (4) Content-Type 검증 + (5) `dangerouslySetInnerHTML` 사용 시 sanitize 강제
- **목적**: REQ-NF-015 (Input Validation) 충족. 사용자 입력 (회원가입·피드백 comment·survey notes) 의 안전한 처리 + 외부 API 응답의 XSS 방어. 단일 제작자(CON-08) 가 매 입력 지점 수동 검증할 수 없음 — schema 강제 + lint 자동화.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-015 (Input Validation)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH (Zod 표준)
- 외부:
  - https://owasp.org/www-project-top-ten/
  - https://github.com/cure53/DOMPurify
- 선행: CT-API-001~011 (Zod schema), FR-TF-002 (이미 DOMPurify 활용)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **모든 Server Action·Route Handler 의 Zod 진입 — 정책 강제**:
  ```ts
  // 모든 외부 입력 진입은 Zod parse 의무
  export async function submitSomething(input: unknown) {
    const parsed = SomethingSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.format());
    }
    // ... parsed.data 만 활용
  }
  ```
- [ ] **Zod schema catalog — 모든 입력 표준화**:
  - 회원가입 — email + nickname (CT-API-001 정합)
  - OX 제출 — lesson_id + answer (CT-API-004)
  - Progress sync — lesson_id + position_sec (CT-API-003)
  - Survey — Likert 1~5 (CT-API-008)
  - Teacher Feedback — comment max 500자 (CT-API-007)
  - Newsletter — email (CT-API-009)
  - Content Report — reason max 500자 (FR-LINT-001)
  - 본 태스크는 catalog 명세 + 누락 검증
- [ ] **HTML/Markdown 콘텐츠 DOMPurify sanitize**:
  - 사용자 입력 → DB 저장 직전 sanitize
  - DB 출력 → 화면 렌더 직전 추가 sanitize (defense-in-depth)
  - **권장 — React 자동 escape 우선**, DOMPurify 는 dangerouslySetInnerHTML 활용 시
- [ ] **DOMPurify 활용 정책 — `lib/security/sanitize.ts`**:
  ```ts
  import DOMPurify from 'isomorphic-dompurify';

  /**
   * 가장 엄격 — HTML 모두 제거 (plain text 만)
   * 사용처 — 사용자 코멘트, 자유 텍스트
   */
  export function sanitizePlainText(input: string): string {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  }

  /**
   * 제한적 마크다운 — 안전한 태그만
   * 사용처 — 운영자 작성 콘텐츠 (Lesson script)
   */
  export function sanitizeRichText(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code'],
      ALLOWED_ATTR: ['href'],
      ALLOWED_URI_REGEXP: /^https?:\/\//,  // http(s) URL 만
    });
  }
  ```
- [ ] **Prisma parameterized 자동 활용**:
  - Prisma 의 `findMany({ where })` — 자동 parameterized
  - Raw SQL (`$queryRaw`) — 항상 template literal 형식 활용 (자동 escape)
  - 위반 패턴 — 문자열 concat 활용:
    ```ts
    // ❌ 위험 — SQL Injection
    const result = await prisma.$queryRawUnsafe(`SELECT * FROM User WHERE id = '${userId}'`);

    // ✅ 안전 — parameterized
    const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${userId}`;
    ```
- [ ] **Content-Type 검증 — Server Action·Route Handler**:
  ```ts
  // POST 요청은 application/json 만 허용
  export async function POST(req: Request) {
    const contentType = req.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return makeErrorResponse('INVALID_CONTENT_TYPE', 415);
    }
    // ...
  }
  ```
- [ ] **`dangerouslySetInnerHTML` 사용 정책**:
  - 직접 사용 시 **반드시 sanitize 후**
  - lint 규칙 — `react/no-danger-with-children` + 자체 ESLint plugin (선택, 별도 후속)
  - 본 태스크 — 코드 검토 SOP 에 명시
- [ ] **NF-SEC-004 의 자동 검증 — CI step**:
  ```yaml
  # IF-CI-001 의 추가 step
  - name: Check unsafe Prisma usage
    run: |
      # $queryRawUnsafe 활용 검사
      if grep -rE '\$queryRawUnsafe' lib/ app/; then
        echo "❌ \$queryRawUnsafe 활용 검출. \$queryRaw (template literal) 활용 의무."
        exit 1
      fi
      echo "✓ Prisma raw 쿼리 안전"

  - name: Check unsafe HTML rendering
    run: |
      # dangerouslySetInnerHTML + DOMPurify 미동반 검사
      # 정확한 패턴 매칭은 ESLint plugin 활용 권장
      grep -rB 5 'dangerouslySetInnerHTML' app/ components/ | grep -L 'DOMPurify\|sanitize' || true
      echo "✓ HTML 렌더 검토 완료"
  ```
- [ ] **사용자 입력 길이 제한 — DoS 방어**:
  - comment max 500자
  - notes max 500자
  - email max 254자 (RFC 5321)
  - nickname max 30자
  - 본 제한은 Zod schema 의 `.max()` 강제 + DB 컬럼 `@db.VarChar(N)` 매칭
- [ ] **위반 시 응답 — 표준 에러 (CT-API-001 정합)**:
  - Zod 실패 — 400 + `VALIDATION_ERROR` + 필드별 에러 메시지
  - 길이 초과 — 400 + `INPUT_TOO_LONG`
  - Content-Type 미일치 — 415 + `INVALID_CONTENT_TYPE`
- [ ] **테스트 — 의도적 XSS 페이로드**:
  ```ts
  it('XSS payload — sanitize', () => {
    const malicious = '<script>alert("xss")</script>안녕';
    expect(sanitizePlainText(malicious)).toBe('안녕');
  });

  it('SQL Injection — Prisma 자동 escape', async () => {
    const userInput = "'; DROP TABLE User; --";
    const result = await prisma.user.findMany({ where: { nickname: userInput } });
    // 결과는 빈 배열 (해당 nickname 부재). User 테이블 삭제 안됨
    expect(result).toEqual([]);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Zod schema 누락 입력 — 거부
- **Given**: required 필드 누락
- **When**: Server Action 호출
- **Then**: 400 + VALIDATION_ERROR

### Scenario 2: 잘못된 type — 거부
- **Given**: position_sec 'abc' (string)
- **When**: 호출
- **Then**: 400 + Zod parse error

### Scenario 3: XSS payload — sanitize
- **Given**: comment `<script>alert(1)</script>안녕`
- **When**: sanitizePlainText
- **Then**: '안녕' 만

### Scenario 4: 안전 마크다운 — sanitizeRichText
- **Given**: `<p>안녕 <a href="http://example.com">링크</a></p>`
- **When**: sanitizeRichText
- **Then**: 그대로 보존 (안전 태그)

### Scenario 5: javascript: URL — 차단
- **Given**: `<a href="javascript:alert(1)">click</a>`
- **When**: sanitizeRichText
- **Then**: javascript: URL 제거

### Scenario 6: Prisma SQL Injection — 자동 escape
- **Given**: nickname `'; DROP TABLE User; --`
- **When**: findMany
- **Then**: 빈 배열 + User 테이블 보존

### Scenario 7: $queryRawUnsafe 코드 — CI 차단
- **Given**: lib/ 에 $queryRawUnsafe
- **When**: CI 검사
- **Then**: fail

### Scenario 8: Content-Type 미일치 — 415
- **Given**: text/plain POST
- **When**: 호출
- **Then**: 415 + INVALID_CONTENT_TYPE

### Scenario 9: 길이 초과 — 거부
- **Given**: comment 501자
- **When**: 호출
- **Then**: 400 + INPUT_TOO_LONG

### Scenario 10: dangerouslySetInnerHTML + DOMPurify
- **Given**: 코드 검토
- **When**: dangerouslySetInnerHTML 활용
- **Then**: 동일 line 또는 import 에 DOMPurify 활용 검증

## :gear: Technical & Non-Functional Constraints
- **모든 외부 입력 Zod parse 의무**
- **DOMPurify 2단계 — sanitizePlainText (엄격) + sanitizeRichText (제한)**
- **Prisma parameterized 자동 활용 — $queryRawUnsafe 금지**
- **Content-Type 검증 — application/json 강제 (POST)**
- **길이 제한 — DoS 방어**
- **CI step 자동 검증 — $queryRawUnsafe + dangerouslySetInnerHTML**
- **defense-in-depth — DB 저장 + 화면 렌더 양쪽 sanitize**
- **표준 에러 응답 (CT-API-001 정합)**
- **금지**:
  - $queryRawUnsafe 활용
  - dangerouslySetInnerHTML 직접 (sanitize 없이)
  - Zod 검증 누락
  - 사용자 입력 직접 raw SQL concat
  - javascript: URL 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] lib/security/sanitize.ts 함수 2종
- [ ] 모든 Server Action·Route Handler 의 Zod parse 검증
- [ ] CI step — $queryRawUnsafe + HTML 렌더 검사
- [ ] 길이 제한 + Content-Type 검증
- [ ] 의도적 XSS·SQL Injection 페이로드 테스트
- [ ] PR 본문에 "REQ-NF-015 + OWASP Injection·XSS 대응" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001~011 (Zod schema)
  - FR-TF-002 (DOMPurify 패턴)
  - IF-CI-001 (CI step)
- **Blocks**:
  - REQ-NF-015 충족
  - OWASP Injection·XSS mitigation
- **Related**:
  - NF-SEC-001 (인증)
  - NF-SEC-002 (RLS — defense-in-depth 사촌)
  - NF-SEC-005 (HTTPS·CSP — 추가 방어)

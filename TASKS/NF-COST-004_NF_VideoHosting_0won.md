# [NF] NF-COST-004: 영상 호스팅 0원 검증 — 비유튜브 호스팅 0건 정적 분석

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-COST-004: 영상 호스팅 0원 검증 — 코드 정적 분석 비유튜브 영상 호스팅 0건 (ADR-005)"
labels: 'nf, cost-control, video, static-analysis, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-COST-004] 영상 호스팅 비용 0원 검증
- **목적**: REQ-NF-026 (영상 호스팅 0원) + ADR-005 (YouTube 전용) 충족. 코드베이스에 YouTube 외 영상 호스팅(Vimeo, S3, Cloudflare Stream 등)이 사용되지 않음을 정적 분석으로 자동 검증. YouTube 무료 호스팅에만 의존하여 영상 비용 0원 유지.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.5` — REQ-NF-026
- ADR-005 (YouTube 전용 호스팅 결정)
- 선행: TS-STATIC-001 (정적 분석 기반)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **정적 분석 스크립트** — `scripts/verify-video-hosting.ts`:
  ```ts
  import { globSync } from 'glob';
  import { readFileSync } from 'fs';

  const BANNED_PATTERNS = [
    /vimeo\.com/i,
    /cloudflare.*stream/i,
    /\.s3\..*\.amazonaws\.com.*\.(mp4|webm|mov)/i,
    /wistia\.com/i,
    /mux\.com/i,
    /brightcove/i,
    /<video\s+src/i,  // 자체 호스팅 video 태그
  ];

  const files = globSync('src/**/*.{ts,tsx,js,jsx,md}');
  const violations: { file: string; line: number; match: string }[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(lines[i])) {
          violations.push({ file, line: i + 1, match: lines[i].trim().slice(0, 100) });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('❌ 비유튜브 영상 호스팅 감지:');
    violations.forEach(v => console.error(`  ${v.file}:${v.line} — ${v.match}`));
    process.exit(1);
  }
  console.log('✅ 영상 호스팅 0원 검증 PASS — YouTube 전용');
  ```
- [ ] **CI 통합** — `package.json`:
  ```json
  "lint:video-hosting": "tsx scripts/verify-video-hosting.ts"
  ```
- [ ] **DB 시드 검증**: 레슨 `videoUrl` 필드가 모두 YouTube URL인지 확인
  ```ts
  const lessons = await prisma.lesson.findMany({ select: { lessonId: true, videoUrl: true } });
  for (const l of lessons) {
    if (!l.videoUrl.includes('youtube.com') && !l.videoUrl.includes('youtu.be')) {
      throw new Error(`${l.lessonId}: 비유튜브 URL — ${l.videoUrl}`);
    }
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 코드베이스 — 비유튜브 0건
- **Given**: 전체 소스 정적 분석 → **Then**: BANNED_PATTERNS 매치 0건

### Scenario 2: DB — 전 레슨 YouTube URL
- **Given**: 10편 레슨 videoUrl → **Then**: 모두 youtube.com 또는 youtu.be

### Scenario 3: Vimeo URL 추가 → CI 차단
- **Given**: vimeo.com 포함 코드 push → **Then**: lint:video-hosting 실패

### Scenario 4: 자체 video 태그 → 차단
- **Given**: `<video src="/video.mp4">` → **Then**: 감지 + 차단

### Scenario 5: CI 매 PR 실행
- **Given**: PR push → **Then**: lint:video-hosting 자동 실행

### Scenario 6: 비용 = ₩0 확인
- **Given**: YouTube 호스팅 → **Then**: 영상 비용 ₩0

## :gear: Technical & Non-Functional Constraints
- **YouTube ToS 준수**: 임베디드만 사용 (CDN 직접 캐싱 금지)
- **ADR-005**: 영상 호스팅은 YouTube 전용. 비용 0원
- **금지**: Vimeo, S3, Cloudflare Stream, 자체 비디오 태그

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 정적 분석 스크립트 + CI 통합 + DB 검증

## :construction: Dependencies & Blockers
- **Depends on**: TS-STATIC-001 (정적 분석 기반)
- **Related**: REQ-NF-026, ADR-005

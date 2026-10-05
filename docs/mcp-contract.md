# MCP 계약 — v0.5

stdio MCP와 GUI가 `packages/core/application.ts`의 같은 명령·입력 스키마를 사용한다. 클라이언트는 `tools/list`에서 정확한 제한과 enum을 조회한다.

| 도구 | 입력 | 결과 |
| --- | --- | --- |
| `capabilities_get` | `{}` | 지원 모션·필터·88개 폰트·파티클 10개 스타일/28개 고급 필드·옵션 메타데이터·스타일/그라데이션·SDK 상태 |
| `presets_list` | `{}` | 기본 93개 + 내 프리셋(`group: user`) |
| `preset_save` | projectId, expectedRevision, name | 해당 저장본을 독립적인 내 프리셋으로 보관 |
| `preset_delete` | presetId(UUID) | 내 프리셋만 삭제; 프로젝트·소재 보존 |
| `assets_list` | `{}` | 이미지/폰트 ID, kind, 이름, 크기/패밀리, 원본/실행용 hash |
| `asset_import` | name, dataBase64 | 검사하고 보관한 이미지 또는 폰트 정보 |
| `projects_list` | `{}` | 저장된 프로젝트 |
| `project_create` | name, 선택적 presetId | 새 프로젝트와 revision |
| `project_get` | projectId | 현재 recipe와 revision |
| `project_update` | projectId, expectedRevision, 전체 recipe, 선택적 name | 입력·소재 참조 검증 후 저장 |
| `project_duplicate` | projectId, expectedRevision, name | 새 ID·revision 1의 독립 프로젝트 |
| `project_history` | projectId | currentRevision, limit=30, entries(최근 순, recipe/name/revision/updatedAt) |
| `project_restore` | projectId, expectedRevision, revision | 보관된 revision을 새 revision으로 복원 |
| `code_generate` | projectId, expectedRevision, target | jobId |
| `preview_start` | 위 입력 + 선택적 timeSeconds | 실제 생성 코드의 미리보기 작업 ID |
| `code_validate` | artifactId | 분석·빌드·실행 검증 작업 ID |
| `job_get` | jobId | 상태, artifactId, 오류; 완료 미리보기는 PNG content 포함 |
| `job_cancel` | jobId | 취소 요청 여부 |
| `artifact_get` | artifactId, 선택적 file | manifest 또는 텍스트 소스 |
| `studio_variants` | projectId, expectedRevision, variants[{name,patch}], save=false | 전체 검증 후 recipe·diff 반환; save=true는 독립 프로젝트 일괄 저장 |
| `recipe_diff` | projectId, expectedRevision, recipe | JSON Pointer 경로별 변경 |
| `studio_compare` | projectId, expectedRevision, variants=[], times | 원본·변형의 시간별 수치 샘플 |
| `studio_comparison_start` | projectId, expectedRevision, variants, target, timeSeconds | 실제 생성·미리보기 작업; job.comparisons에 결과 |
| `integration_roots` | {} | CLI에서 허용한 폴더의 ID·이름 |
| `integration_plan` | artifactId, rootId, effectId | planId, expectedHash, 파일 변경·경고 |
| `integration_apply` | planId, expectedHash | 계획 재검증 후 생성물 전용 디렉터리에 적용 |
| `performance_start` | artifactId, frames=120 | 실제 브라우저 측정 작업; job.profileReport에 결과 |


`target`: flutter / phaser / three. 바이너리 이미지·폰트는 생성 디렉터리 및 GUI ZIP에 포함된다. `artifact_get`은 바이너리를 텍스트로 해석하지 않는다.

## 재사용과 복구

총 27개 도구다. `project_create.presetId`는 `presets_list`에서 받은 기본 ID 또는 내 프리셋 UUID를 받는다. 없는 ID는 NOT_FOUND이며 기본값으로 조용히 바꾸지 않는다. `capabilities_get.workspaceFeatures`에서 이력 한도와 재사용 기능을 조회한다.

프로젝트 수정과 복원은 이전 상태를 최대 30개 보관한다. 현재 상태와 이력은 한 파일에 원자적으로 저장한다. 복원은 revision을 되돌리지 않고 새 번호를 부여하며, 복원 직전 상태도 이력에 남긴다. 도입 이전 저장본은 소급 생성하지 않는다. 첫 수정 시 현재 저장본부터 보관한다. 이력 한도를 벗어난 revision은 NOT_FOUND다.

복제는 원본의 이력을 복사하지 않으며 새 프로젝트의 revision 1부터 시작한다. 내 프리셋은 저장 당시 전체 recipe의 독립 사본이다. 이후 원본 수정이나 프리셋 삭제가 이미 만들어진 프로젝트에 전파되지 않는다. 이미지·폰트는 같은 작업 공간의 불변 소재 ID를 공유한다. 프리셋 파일만 다른 작업 공간에 복사하는 이식 기능은 제공하지 않는다. 생성 ZIP에는 기존 방식대로 자산을 포함한다. 복원·복제·프리셋 저장/생성에도 소재 참조 검증을 적용한다.

## 이미지 입력

로컬 파일을 에이전트가 읽고 base64 바이트를 `asset_import`에 전달한다. 서버는 임의 파일 경로나 외부 URL을 받지 않는다. 정지 PNG/JPEG/WebP, 원본 최대 8 MiB, 최대 16,000,000 픽셀. GIF/SVG/애니메이션 WebP/APNG는 거부한다. 확장자가 아니라 실제 디코딩 결과를 검사한다.

원본 바이트는 `.gametool/assets/<id>/original`에 불변 보관한다. EXIF 방향을 반영한 실행용 PNG를 별도로 저장하며 생성 때 hash를 다시 확인한다. 이미지 이름은 표시용이며 파일 경로에 사용하지 않는다. 가져오기는 새 ID를 생성하며 기존 소재를 덮어쓰지 않는다.

## 폰트 입력

TTF/OTF/WOFF/WOFF2는 최대 32 MiB다. 원본은 `original`에 보관하고 WOFF/WOFF2만 실행용 sfnt로 복원한다. 반환된 `kind: font` ID를 `layout.font` 또는 `layout.subFont`에 지정한다. 이미지 ID와 폰트 ID를 잘못 연결하면 INVALID_ASSET이다. 등록 폰트의 실행 파일도 생성 전 hash를 확인한다. 카탈로그 88개는 capabilities의 ID로 지정하며 선택한 변형·한글 대체 폰트·라이선스가 생성물에 포함된다. `local:` 이름은 대상 컴퓨터에도 해당 폰트가 있어야 한다.

## Recipe

schemaVersion=1 기존 텍스트 프로젝트는 새 레이어가 꺼진 기본값으로 호환된다. 기본 문구·색·크기·width/height·enter/hold/exit·effect·distance·loop는 유지한다. 시간 단위는 초, 좌표는 논리 픽셀이다.

- `textVisible`: 텍스트 표시 여부.
- `loopCount`: 0이면 무한, 양수이면 해당 횟수 후 정지. `loop=false`는 1회.
- `frame`: enabled, style(title/box/corners/band/tape/lines/underline/sides/bar), animation(draw/fade/none), duration/textDelay(초), color/width, fillColor/fillOpacity, padding/extend(em), inset(px). outline, softness, sideFade, radius, tapeColor/tapeStripe/tapeSize/tapeSpeed/tapeBlink. 타이틀 틀은 메인만 감싸며 시계 방향으로 그리고 퇴장 시 되감는다. 박스/띠는 서브 문구도 포함한다.
- `typography`: enabled, subText/subSize/subColor, serif, spacing/subSpacing(px), subPosition, align, vertical, x/y, strokeWidth/strokeColor, glow/glowColor, shadow, gradient/gradientColor, fillOpacity, plate/plateColor/plateOpacity, entrance/departure/holdMotion, stagger/order/seed. 기존 stagger는 비율 기반이다. 새 동작은 `motion.enabled=true`로 초 단위 시간을 사용한다.
- `layout`: font/subFont(카탈로그 ID, 폰트 소재 UUID, auto/sans/serif/same, 또는 local:패밀리 이름), weight/subWeight, italic/subItalic, subColorInherited, lineHeight, subGap, autoFit, anchor, marginX/Y, stroke2Width/Color, gradientThird/Color3/Direction, shadowColor/Opacity/Blur/X/Y, glowStrength, glitchColor/Color2, cursorColor.
- `motion`: enabled, inStagger/outStagger(초), outOrder, inEase/outEase, inDirection/outDirection, inPower/outPower/holdPower, outEnabled, subMotion, subDelay(메인 완료에 대한 초), startDelay/endDelay. 새 시간표는 프레임 선행·글자 간격·서브 완료·유지·퇴장을 합산한다. precise 모드의 textDelay는 enter보다 길어도 그대로 반영한다.
- `sequence`: mode(message/trailer/location), reveal(char/solo/spread/line/sweep/all/scroll), wrapChars, pageSplit, cps, glyphDuration, punctPause, linePause, lineInterval, sweepDuration, pageGap, cursor, scrollSpeed/scrollFade, soloSize/soloPause/soloImpact, spreadHold/spreadDuration. trailer는 자동으로 초 단위 시간표를 사용한다. 텍스트 최대 6,000자.
- `backdrop`: type(none/solid/vignette/bottom/top), color, opacity, sync. 미리보기 전용 배경과 달리 생성물에 포함되는 전체 화면 오버레이다.
- `background`: enabled, assetId(null이면 색상), assetIds(최대 8장, 순서 보존), fit, color/endColor, motion, amount, fade, filter. `profile: reference`는 대조한 모션 곡선을 사용하며 기존 저장 데이터의 기본값은 legacy다. `fadeDirection: in/out`으로 색/투명 페이드 방향을 바꾼다. `transitionSource: images/original-filter`로 이미지 간 전환과 원본→필터 전환을 선택한다. 단일 이미지도 원본→가공으로 전환한다. 시퀀스는 첫 장부터 마지막 장까지 진행한 후 반복 주기에서 다시 시작한다.
- `image`: enabled, assetId, fit, x/y(중앙 기준), scale, rotation(도), opacity. 활성화에는 소재 ID가 필수다.
- `particles`: enabled, preset(snow/sparks/confetti), emission(continuous/burst), seed, count(1..500), size, speed, lifetime, gravity, spread, x/y(0..1), color. 눈은 화면 너비 전체에서 방출하며 x/y는 다른 emitter에 적용한다.

### 고급 파티클 (v0.4)

`capabilities_get.particleStyles`는 10개 효과의 id/name/description/settings를, `particleFields`는 28개 고급 필드의 기본값·단위·범위를 반환한다. 프로젝트의 particles에 원하는 settings와 `enabled: true, advanced: true`를 병합해 `project_update`한다. 기본 `preset` enum(snow/sparks/confetti)은 기존 렌더링용으로 유지하며 고급 모양은 `shape`로 선택한다. 새 스타일 ID를 기본 preset에 넣지 않는다.

- `advanced` 기본 false. `shape`: circle/star/spark/ring/diamond/petal/smoke. `blend`: normal/add. `glow`: 0..60 px, `trail`: 0..1초.
- `emitter`: point/box/circle/ring. `areaWidth/areaHeight`: 0..2 화면 비율. `radius`: 0..1, 짧은 변 비율. x/y는 기존 화면 비율을 사용한다.
- `path`: ballistic/orbit/vortex. `direction`: -360..360도, 0=오른쪽·90=아래. `orbitSpeed`: -720..720도/초. 공전·흡입에서는 speed/gravity/direction 대신 반경과 공전 속도를 사용한다.
- `wind`: -1000..1000 px/초. `drag`: 0..10, ballistic 이동 속도에 지수 저항. `turbulence`: 0..200 px. 바람·흔들림은 모든 궤적에 적용한다.
- `sizeEnd`: 시작 크기 대비 0..20배. `sizeVariation/speedVariation`: 0..1, ±비율. `lifeVariation`: 0..0.9. `colorEnd`: #RRGGBB, 수명에 따라 RGB 선형 보간.
- `fadeIn/fadeOut`: 0..1 수명 비율. `opacity`: 0..1. `spin`: -1080..1080도/초. spark는 이동 방향으로 정렬한다.
- `delay`: 0..10초. `prewarm`: 연속 입자를 채운 상태로 시작할지 여부. false는 분산된 시작 시점에 따라 서서히 채운다. `burstInterval`: 0..30초, 0이면 한 번; 양수는 간격마다 폭발을 교체하고 같은 seed의 패턴을 재현한다. `sync`: 전체 등장/퇴장 알파와 동기화할지 여부.

변수는 절대 시간에서 평가하며 잔광은 과거 위치를 다시 계산한 선분이다. 시간 이동 때문에 잔상이 누적되지 않는다. 하나의 emitter와 최대 500개 입자를 지원한다. 3D 볼륨·충돌 시뮬레이션·이미지 입자 텍스처는 이 범위에 포함하지 않는다.

배경→이미지→파티클→패널·프레임→텍스트 순서로 합성한다. `background.fade`는 전체 타임라인의 등장/퇴장 알파를 적용한다. 이름에 black/white가 있는 모션은 전체 진행률에 따라 해당 색으로 전환하고, fade-transparent는 투명해진다. 모션/필터 enum 목록은 capabilities에서 제공한다. 이미지 필터는 로드 때 한 번 계산하고 원본을 보존한다.

## 작업과 오류

수정·생성·미리보기에서 stale expectedRevision은 REVISION_CONFLICT다. 작업은 요청 당시 레시피를 고정하고 새 출력 폴더를 만든다. 상태: queued/running/succeeded/failed/cancelled/interrupted. 서버 재시작 후 미완료 작업은 interrupted다.

생성과 검증은 별개다. 생성만 하면 validation=not_run. code_validate는 소스·자산 hash, 정적 분석, 빌드, 실제 브라우저 실행, 시간별 배경/입자/문자 수치, 외부 요청·HTTP 오류를 검사한다. Flutter는 생성한 fixture·widget test도 실행한다. 변경된 출력은 ARTIFACT_CHANGED, 변경된 원본 보관 실행 이미지는 ASSET_CHANGED, 없는 소재는 ASSET_NOT_FOUND다.

MCP stdout은 프로토콜 전용이다. `node scripts/mcp.mjs`를 사용한다. 클라이언트 설정은 자동 변경하지 않는다. service.json의 연결 토큰은 로그/소스 관리에 포함하지 않는다.

## Studio와 배치 계약

`recipe.studio`는 선택적이며 기존 schemaVersion=1 프로젝트는 변경 없이 유효하다. `studio`에는 enabled/duration/nodes/bindings/events/data/quality/space/worldScale/billboard가 있다. DTO는 `runtimes/shared/studio-types.ts`, 엄격한 검증은 `packages/core/studio-schema.ts`가 기준이다.

노드는 group/text/image/particles/ui이며 최대 64개다. parentId는 존재하는 group만 참조하고 순환은 금지한다. x/y는 중심 기준 논리 픽셀(자식은 부모 로컬), rotation은 도, start/duration과 keyframe.time은 초다. 트랙은 x/y/scale/rotation/opacity/value, 노드당 속성별 하나·키 최대 32개다. 키 시간은 노드 로컬이고 정렬·중복 금지이며 duration을 넘을 수 없다. UI에는 widget, 파티클에는 particles, 활성 이미지에는 assetId가 필요하다.

bindings는 최대 128개이고 text/value/x/y/opacity/visible/state/color를 스칼라 data에 연결한다. events는 최대 128개이고 이름·시점·스칼라 payload만 제공한다. 임의 스크립트는 실행하지 않는다. seek는 조용하며 재생이 통과한 이벤트만 전달한다. 커다란 시간 이동의 이벤트 재생은 최근 256주기로 제한한다.

variants는 1~24개(실제 화면 비교는 1~6개), 중첩 객체는 병합하고 배열은 전체 교체한다. 모든 변형의 스키마·소재를 먼저 확인한다. save=true는 원본을 수정하지 않고 새 프로젝트들을 하나의 batch manifest에 원자적으로 저장한다. 비교 시각은 최대 16개다. 수치 비교는 기존 글자·입자의 개수와 각각 앞 3개 표본(`glyphCount/glyphSample`, `particleCount/particleSample`), Studio 노드별 앞 3개 입자를 반환한다. 화면 비교를 대체하지 않는다.

품질은 low/medium/high, reducedMotion, particleBudget(0~5000), instances(1~32), fpsTarget(15~240)이다. 성능 측정은 30프레임 워밍업 후 30~600프레임을 수집한다. 브라우저 스케줄러/동기 CPU 측정과 텍스처·입자 추정을 분리하며 실제 GPU 메모리·실기기 성능은 측정하지 않는다.

통합은 서비스 CLI `--integration-root`로 허용한 기존 루트만 사용한다. HTTP/MCP로 임의 절대 경로를 입력할 수 없다. effectId는 소문자 영숫자로 시작하는 1~64자의 영숫자·밑줄·하이픈이다. 계획은 메모리에 있으며 재시작하면 다시 만들어야 한다. 계획 이후 변경·기존 소유 파일 편집·경로 이탈·링크는 적용 전에 차단한다. 호스트 의존성 파일과 비소유 파일은 보존한다.

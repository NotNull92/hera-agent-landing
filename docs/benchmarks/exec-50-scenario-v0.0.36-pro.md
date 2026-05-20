# Benchmark: 50회 `exec` C# 명령 실사용 토큰 비용 (Pro v0.0.36)

> 한 줄 요약: **50개의 실제 사용 패턴 exec 명령 = 총 6,923 bytes (~1,711 토큰)**. 명령당 평균 138 bytes / 34 토큰. 36개 (72%) 호출이 5 bytes 이하의 응답을 받음.

- **측정일**: 2026-05-20
- **CLI**: `hera-agent-pro v0.0.36` (Windows, GitHub Release 자산)
- **Connector**: AgentConnector 0.0.41 (git tag `v0.0.36` 시점)
- **Unity**: 6000.3.5f2
- **대상 프로젝트**: NoMoreRolls (실 게임 프로젝트, 활성 씬 `TitleScene.unity`)
- **참고**: 토큰 감축 작업 분석·구현은 [`docs/issues/token-cost-reduction.md`](../issues/token-cost-reduction.md). Lite (`hera-agent v0.0.24`) 의 동일 측정은 [hera-agent/docs/benchmarks/exec-50-scenario-v0.0.24.md](https://github.com/NotNull92/hera-agent/blob/main/docs/benchmarks/exec-50-scenario-v0.0.24.md). 본 문서는 **AFTER 단일** (Pro v0.0.36) 에서 *실 사용 패턴* 50개 누적 측정.

---

## 0. TL;DR

| | 값 |
|---|---:|
| **총 호출 수** | 50 |
| **C# 입력 총합** | 5,527 bytes |
| **응답(stdout+stderr) 총합** | 1,396 bytes |
| **총 왕복 바이트** | **6,923 bytes** |
| **추정 토큰** (chars ÷ 4) | **~1,711 tokens** |
| 호출당 평균 (총 바이트) | 138.5 bytes (34.2 tokens) |
| 호출당 평균 응답 | 27.9 bytes (7.0 tokens) |
| 응답 중간값 | **3 bytes** ("OK\n") |
| 응답 ≤ 5 bytes인 호출 | **36 / 50 (72%)** |
| 가장 큰 호출 | s15 — 594 bytes (UI 계층 생성, 입력이 큰 케이스) |
| 가장 작은 호출 | s38 — 28 bytes (`return Mathf.Sqrt(144f);`) |

**중요한 시사점**:
- Pro v0.0.36 은 lite v0.0.24 와 동일한 토큰 감축 패턴 (배너 suppress + compact JSON + Unity Object shallow + stacktrace user 필터 + console default 20 + truncation 마커 단축 + compile error 축약) 을 모두 갖춤.
- 실 LLM 에이전트 패턴 (씬 검사 + 오브젝트 생성/조작 + 자산 질의 + 일괄 작업) 에서 **응답 측 토큰은 거의 노이즈 수준**.
- `return null;` 패턴이 표준 권고이며, 측정 시나리오의 대다수가 이를 따라 응답 3 bytes (`OK\n`) 로 수렴.
- 토큰 비용의 대부분은 **사용자(에이전트)가 작성한 C# 코드 길이**에 있음 (입력 5,527 vs 응답 1,396).
- 의도적 실수(비활성 GameObject 에 `Find`) 두 건 (s24, s28) 도 v0.0.36 의 user-frame 필터 덕에 **각 414 bytes 로 압축**. 필터 없는 `--stacktrace full` 이었다면 동일 케이스 ~852 bytes.

---

## 1. 측정 환경 및 방법론

### 환경

- CLI v0.0.36 (PATH 설치본). 호출 시 `HERA_AGENT_NO_PATH_CHECK=1` 만 지정 (path 충돌 경고 억제 — bench 측정에 무관한 노이즈).
- Connector 0.0.41 (NoMoreRolls manifest 가 `?path=AgentConnector` 로 main HEAD fetch — v0.0.36 시점 코드).
- 비-TTY (파이프) 호출이라 v0.0.36 의 자동 동작이 그대로 발동:
  - `[hera-agent-pro] compiling...` 배너 stderr **억제됨** (Pro 는 `isHumanCommand()` 화이트리스트로 분류)
  - 응답 JSON **compact 출력** (Pro 의 `shouldCompactJSON()` 가 비-human 명령에서 자동 compact)
  - `Update available` notice **억제됨**

### 측정 단위

- **입력 (input_bytes)**: 각 시나리오 `.cs` 파일의 raw 바이트 (`wc -c`)
- **응답 (output_bytes)**: `hera-agent-pro exec --file <X>.cs 2>&1` 의 stdout + stderr 합산. Claude Code 의 Bash 도구는 양쪽을 합쳐 컨텍스트에 넣기 때문에 합산이 적절.
- **토큰 추정**: 영문 기준 `chars ÷ 4` (OpenAI / Anthropic tokenizer 평균치).

### 측정 절차

```bash
mkdir -p .omc/bench-50-pro
# (50개의 s01.cs ~ s50.cs 작성 — §3 참고)

for i in $(seq -w 1 50); do
    f="s$i.cs"
    input_bytes=$(wc -c < "$f")
    output=$(hera-agent-pro exec --file "$f" </dev/null 2>&1)
    output_bytes=$((${#output} + 1))
    total=$((input_bytes + output_bytes))
    echo "s$i,$input_bytes,$output_bytes,$total"
done
```

> `</dev/null` 리다이렉트 필수. `hera-agent-pro exec --file` 은 stdin 이 비-TTY 일 때 stdin 을 읽으려고 시도하므로, 명시적으로 닫지 않으면 bash `$(...)` 안에서 무한 대기.

원본 CSV: [`exec-50-scenario-results-pro.csv`](./exec-50-scenario-results-pro.csv)

---

## 2. 시나리오 카테고리

총 50개. 실제 LLM 에이전트가 Unity 작업 중 자주 호출할 법한 패턴으로 구성. 모든 생성 오브젝트는 `bench_` 접두사 부여 → 종료 시 일괄 정리 (s50).

| 카테고리 | 시나리오 | 개수 | 누적 입력 | 평균/호출 | 응답 누적 |
|---|---|---:|---:|---:|---:|
| **A** Scene inspection | s01–s08 | 8 | 434 | 54.3 | 175 |
| **B** GameObject creation | s09–s18 | 10 | 2,085 | 208.5 | 30 |
| **C** Component manipulation | s19–s28 | 10 | 888 | 88.8 | 854 |
| **D** Asset/path queries | s29–s35 | 7 | 315 | 45.0 | 180 |
| **E** Math/expression eval | s36–s40 | 5 | 179 | 35.8 | 30 |
| **F** Bulk ops + cleanup | s41–s50 | 10 | 1,626 | 162.6 | 127 |
| **합계** | | **50** | **5,527** | **110.5** | **1,396** |

**관찰**:
- B (GameObject 생성) 가 입력 측에서 가장 많은 바이트를 씀 (UI 계층 / 100개 dummy 생성 등). 하지만 응답은 거의 다 `OK\n` (3B).
- C (Component manipulation) 의 응답 누적이 큰 이유는 의도된 두 NullRef 에러 (s24, s28 — 각 414B). **에이전트가 비활성 GameObject 에 `GameObject.Find` 를 쓰면 null 반환됨을 잊었을 때의 비용 ≈ 414 bytes/회** (v0.0.36 의 user-frame 필터 기준; full 모드면 ~852).
- E (수학식) 가 호출당 평균이 가장 작음 (35.8B 입력) — 짧은 입력 + 짧은 숫자 반환.

---

## 3. 시나리오 상세

### A. Scene inspection (s01–s08)

| # | 시나리오 | 입력 | 응답 | 합계 |
|---|---|---:|---:|---:|
| s01 | `return SceneManager.GetActiveScene().name;` | 43 | 11 | 54 |
| s02 | `return SceneManager.GetActiveScene().rootCount;` | 48 | 2 | 50 |
| s03 | `return Camera.main != null;` | 28 | 5 | 33 |
| s04 | Root GameObject 이름 배열 반환 | 154 | 142 | 296 |
| s05 | `return GameObject.Find("Canvas") != null;` | 42 | 6 | 48 |
| s06 | `return SceneManager.GetActiveScene().isDirty;` | 46 | 5 | 51 |
| s07 | `return SceneManager.sceneCount;` | 32 | 2 | 34 |
| s08 | `return LayerMask.NameToLayer("Default");` | 41 | 2 | 43 |

> s04 만 배열 반환으로 ~140 바이트 (TitleScene 의 root GameObject 이름 리스트). 나머지는 단일 primitive 반환.

### B. GameObject creation (s09–s18) — 입력 크지만 응답은 `OK\n`

| # | 시나리오 | 입력 | 응답 |
|---|---|---:|---:|
| s09 | 빈 GameObject 하나 | 55 | 3 |
| s10 | Light 컴포넌트 GameObject | 81 | 3 |
| s11 | Camera 컴포넌트 GameObject | 80 | 3 |
| s12 | 부모 + 자식 5개 | 196 | 3 |
| s13 | bench_TenDummies (10개) | 202 | 3 |
| s14 | bench_HundredDummies (100개) | 203 | 3 |
| s15 | **Canvas + UIButtonContainer + 3 UIButton** | **591** | 3 |
| s16 | 3×3 Cube grid | 340 | 3 |
| s17 | 20개 GameObject 일렬 배치 | 239 | 3 |
| s18 | Sphere primitive | 98 | 3 |

> s15 가 본 측정의 핵심 모티브 시나리오 (UI 계층 생성: 빈 Canvas + UIButtonContainer + 하위 UIButton 3개). 입력 591B, 응답 3B → **응답 토큰은 사실상 0**, 비용은 사용자가 짠 코드 길이에 있음.

### C. Component manipulation (s19–s28) — 의도된 실수가 비용을 만듦

| # | 시나리오 | 입력 | 응답 | 비고 |
|---|---|---:|---:|---|
| s19 | bench_Empty01 position = (1,2,3) | 100 | 3 | OK |
| s20 | bench_Empty01 rotation Euler(45,0,0) | 106 | 3 | OK |
| s21 | bench_Empty01 localScale (2,2,2) | 102 | 3 | OK |
| s22 | **bench_Empty01.SetActive(false)** | 64 | 3 | OK ← 이후 Find 가 실패 |
| s23 | Find(bench_Empty01) → null 체크 | 78 | 5 | ✓ null 반환 ("null") |
| s24 | bench_Empty01.AddComponent<Rigidbody>() | 84 | **414** | ❌ NullRef |
| s25 | bench_Light01 intensity = 5 | 95 | 3 | OK |
| s26 | bench_Light01 color = red | 98 | 3 | OK |
| s27 | bench_Cam01 fov = 90 | 97 | 3 | OK |
| s28 | bench_Empty01.tag = "Untagged" | 64 | **414** | ❌ NullRef |

> **에이전트의 흔한 실수**: `GameObject.Find` 는 **비활성 오브젝트를 찾지 못함**. s22 이후 bench_Empty01 을 다시 찾는 시도 (s24, s28) 가 NullRef 를 일으킴. v0.0.36 의 `--stacktrace user` 디폴트 필터 덕에 각 에러가 **414 bytes 로 컴팩트**. `--stacktrace full` 이었다면 같은 에러가 ~852 bytes (UnityEngine.* / System.* / (wrapper managed-to-native) 프레임 포함). 즉 두 케이스 합산 ~876 bytes 의 절감.

### D. Asset/path queries (s29–s35)

| # | 시나리오 | 입력 | 응답 |
|---|---|---:|---:|
| s29 | `Application.dataPath` | 29 | 46 |
| s30 | `EditorApplication.applicationPath` | 42 | 62 |
| s31 | `AssetDatabase.GetAllAssetPaths().Length` | 48 | 6 |
| s32 | 활성 씬 경로 | 43 | 34 |
| s33 | `EditorPrefs.GetString("Foo_DoesNotExist", "default-value")` | 67 | 14 |
| s34 | `PlayerSettings.companyName` | 35 | 15 |
| s35 | `AssetDatabase.FindAssets("t:Scene").Length` | 51 | 3 |

> 경로 문자열 반환이라 응답이 30~60 바이트 정도. 정수 반환은 다시 작아짐.

### E. Math/expression (s36–s40) — 가장 작은 호출들

| # | 시나리오 | 입력 | 응답 |
|---|---|---:|---:|
| s36 | `return Time.time;` | 18 | 11 |
| s37 | `return Time.realtimeSinceStartup;` | 34 | 11 |
| s38 | `return Mathf.Sqrt(144f);` | 25 | 3 |
| s39 | `Vector3.Distance(zero, (3,4,0))` | 61 | 2 |
| s40 | `Random.Range(1, 100)` | 41 | 3 |

> 호출당 평균 36B 입력 + 6B 응답 ≈ 10 토큰. 가장 작은 케이스 (s38) 는 28 바이트 한 호출 = ~7 토큰.

### F. Bulk operations + cleanup (s41–s50)

| # | 시나리오 | 입력 | 응답 |
|---|---|---:|---:|
| s41 | 씬의 모든 GameObject 개수 | 90 | 4 |
| s42 | 모든 MeshRenderer 개수 | 92 | 3 |
| s43 | Root y 값 합산 | 147 | 5 |
| s44 | TenDummies 자식 일괄 position+1 | 169 | 3 |
| s45 | Container01 자식 일괄 이름 변경 | 200 | 3 |
| s46 | TenDummies 자식 SetActive(false) | 158 | 3 |
| s47 | HundredDummies 자식 tag 일괄 설정 | 162 | 3 |
| s48 | HundredDummies 짝수 인덱스 개수 | 148 | 3 |
| s49 | bench_Renamed_* 5개 이름 반환 | 215 | 97 |
| s50 | bench_* 일괄 destroy | 245 | 3 |

> s49 가 응답 97B 로 두드러짐 (5개 이름의 JSON 배열). s50 은 cleanup. **100개 dummy 의 일괄 조작도 응답은 3 바이트** — 사용자가 `return null;` 을 사용한 결과.

---

## 4. 분포 분석

### 응답 크기 히스토그램

```
응답 바이트 범위    호출 수    비율
(0–5]                36      72%   ████████████████████████████████████
(5–10]                2       4%   ██
(10–30]               5      10%   █████
(30–100]              4       8%   ████
(100–300]             1       2%   █
(300+)                2       4%   ██
```

**핵심**: 72%의 호출이 5 바이트 이하 응답. 300 바이트 초과는 4% (2건 — 둘 다 의도된 NullRef 케이스).

### 총 바이트 (입력+응답) Top/Bottom

**Top 5 largest**:
| # | 시나리오 | 합계 | 토큰 |
|---|---|---:|---:|
| s15 | UI 계층 생성 | 594 | 148 |
| s24 | Find-on-inactive NullRef | 498 | 124 |
| s28 | Find-on-inactive NullRef | 478 | 119 |
| s16 | 3×3 cube grid | 343 | 85 |
| s49 | 5개 이름 반환 | 312 | 78 |

**Top 5 smallest**:
| # | 시나리오 | 합계 | 토큰 |
|---|---|---:|---:|
| s38 | `Mathf.Sqrt(144)` | 28 | 7 |
| s36 | `Time.time` | 29 | 7 |
| s03 | `Camera.main != null` | 33 | 8 |
| s07 | `sceneCount` | 34 | 8 |
| s08 | `LayerMask.NameToLayer` | 43 | 10 |

---

## 5. 토큰 비용 의미

### 50회 세션 = **약 1,700 토큰**

LLM 에이전트가 위의 50개 작업을 모두 수행하는 **한 세션** 에서 hera-agent-pro 도구 왕복으로 소모하는 토큰은 약 1,700개. 이 중:

- 입력측 (에이전트가 작성한 C# 코드, 에이전트의 출력 토큰): ~1,381 tokens
- 응답측 (hera-agent-pro 응답, 에이전트의 컨텍스트로 들어가는 입력 토큰): ~349 tokens

> 참고: tool_use / tool_result 프레임 자체의 오버헤드 (각 호출당 50–150 토큰) 는 본 측정에 포함되지 않음. 실제 LLM API 비용은 이 위에 더해짐.

### 비교 기준점

- Claude Sonnet 4 입력 1M = $3, 출력 1M = $15 기준
- 50회 세션 ≈ $0.0094 (입력 1,381 × $3/M + 출력 349 × $15/M) = **세 자릿수 분의 1달러**
- 동일 작업을 일일 100세션 = $0.94/일

응답 측 토큰이 워낙 작아서 **vendor lock-in 없이 Claude / GPT / Gemini 어느 곳에서나 비용 부담 없이 사용 가능**.

---

## 6. v0.0.36 (Pro) 이 본 측정에 영향을 준 지점

본 측정은 AFTER 단일이지만, 다음 v0.0.36 변경이 결과에 직접 영향:

| 변경 | 영향 발생 시나리오 | 본 측정에서의 효과 |
|------|------------------|-------------------|
| **A** Banner suppress | 모든 50개 | Pro 는 `isHumanCommand()` 화이트리스트로 처음부터 처리 — 본 측정에 추가 절감 없음 |
| **B** Compact JSON 자동화 | s04, s49 | 응답 배열·구조체에 indent 없음. ~30% 작음 |
| **C** Stacktrace user | s24, s28 (NullRef) | 각 ~852B → 414B = **합산 ~876 bytes 절감** |
| **D** Compile error 축약 | 본 측정엔 해당 없음 | 시나리오 50개 모두 컴파일 성공 |
| **E** Unity Object shallow | 본 측정엔 해당 없음 | 시나리오가 의도적으로 Transform/GameObject 직접 반환을 피함 |
| **F** Truncation 마커 | 본 측정엔 해당 없음 | 100 이상 collection 반환 케이스 없음 |
| **G** Console default 20 | 본 측정엔 해당 없음 | console 명령 미포함 |
| **H** Console 메타 omit | 본 측정엔 해당 없음 | console 명령 미포함 |

**v0.0.36 이전 코드로 동일 50개 시나리오를 돌렸다면 추정**: ~7,800 bytes (현재 6,923 + C 절감분 ~876). 즉 **본 워크로드에서 v0.0.36 → 약 11% 추가 절감** (이미 처리된 A 항목을 제외한 추가 효과).

> Lite (`v0.0.24`, 동일 50개 시나리오, TidyCat 프로젝트) 는 총 6,568 bytes / ~1,622 tokens. Pro 는 거의 동일한 결과 (6,923 bytes / ~1,711 tokens) — Connector 코드가 정렬돼 있어 차이가 작음. 두 케이스의 미세한 입력 바이트 차이는 활성 씬 (TitleScene vs Home) 의 root GameObject 이름 길이 차이에 따른 응답 + 시나리오 텍스트의 사소한 변종 (예: s39 의 `UnityEngine.Random` namespace 명시) 에서 옴.

---

## 7. 재현

### 시나리오 파일

`<NoMoreRolls>/.omc/bench-50-pro/s01.cs` ~ `s50.cs` — 본 리포에는 포함하지 않음 (생성된 임시 측정 파일). `docs/benchmarks/exec-50-scenario-v0.0.36-pro.md` §3 의 시나리오 설명을 참고해 만들면 동일 시나리오.

### 명령

```bash
# 사전 조건
hera-agent-pro --version    # v0.0.36 이상
hera-agent-pro status       # Unity ready

# 측정
cd <NoMoreRolls>/.omc/bench-50-pro
export HERA_AGENT_NO_PATH_CHECK=1
for i in $(seq -w 1 50); do
    f="s$i.cs"
    input_bytes=$(wc -c < "$f")
    output=$(hera-agent-pro exec --file "$f" </dev/null 2>&1)
    output_bytes=$((${#output} + 1))
    echo "s$i,$input_bytes,$output_bytes"
done

# 정리
hera-agent-pro exec </dev/null "var all = UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None).Where(g => g.name.StartsWith(\"bench_\")).ToList(); int n=0; foreach(var g in all){ if(g!=null){ GameObject.DestroyImmediate(g); n++; }} return n;"
```

### 알려진 함정

1. **`</dev/null` 필수**: `hera-agent-pro exec --file` 가 `$(...)` 안에 있을 때 stdin 을 명시 닫지 않으면 무한 대기.
2. **GameObject.Find 은 비활성 오브젝트 무시**: s22 → s24/s28 NullRef 경로. 의도적 보존 (실제 에이전트가 자주 하는 실수의 비용을 보여주기 위함).
3. **csc 콜드 스타트**: 첫 호출은 5~15초 (csc 자체 로딩). 본 측정의 50회는 두 번째 이후만 1~2초.

---

## 8. 결론

**v0.0.36 의 hera-agent-pro 로 LLM 에이전트가 실제 Unity 작업 50회를 수행 시:**

- 약 **1.7K 토큰** 소모 (도구 응답·요청 raw)
- 호출당 평균 **34 토큰**
- 응답의 72%가 5 바이트 이하 — 사실상 노이즈
- 같은 워크로드를 v0.0.36 이전 코드로 돌렸다면 약 11% (~876 bytes) 더 컸을 것
- Lite (`hera-agent v0.0.24`) 와 거의 동일한 결과 — Pro 의 토큰 절감 패턴이 Lite 와 정렬됨

**LLM 에이전트의 코딩 워크플로에 hera-agent-pro 를 통합해도 API 비용 부담이 거의 없음** — 응답 토큰은 미미하고, 비용 대부분은 에이전트가 작성한 C# 코드 (입력 토큰) 에 있음.

---

## 9. 변경 이력

| 날짜 | 버전 | 변경 |
|------|------|------|
| 2026-05-20 | Pro v0.0.36 (initial) | 50개 시나리오 6 카테고리 측정. 총 6,923 bytes / ~1.7K 토큰. NoMoreRolls 프로젝트. |

# Terminal Masking 技術研究

> 狀態：🔮 未來目標
> 最後更新：2026-03-14

---

## 背景

目前 VS Code Extension 只有 Editor Decoration 遮蔽。終端輸出中的 API Key（如 Claude Code terminal、`curl` 回應、`env` 列印）仍然會以明文顯示。Terminal Masking 是完整遮蔽防護的關鍵缺口。

---

## 方案比較

### 方案 A：node-pty Proxy Terminal（主要方案）

**原理**：用 `node-pty` spawn 真實 shell，攔截所有輸出，替換後再送到 VS Code Terminal。

```
VS Code Terminal（使用者看到的，已過濾）
    ↑ writeEmitter.fire(filtered)
代理層（maskSecrets 正則過濾）
    ↑ ptyProcess.onData(raw)
node-pty（真實 shell 程序）
```

**實作要點**：
- 實作 `vscode.Pseudoterminal` 介面
- `ptyProcess.onData()` → `maskSecrets(data)` → `writeEmitter.fire(filtered)`
- 輸入直通：`handleInput(data)` → `ptyProcess.write(data)`
- node-pty 載入三層 fallback：
  1. `require('node-pty')`
  2. VS Code 內建 `vscode.env.appRoot/node_modules.asar.unpacked/node-pty`
  3. `vscode.env.appRoot/node_modules/node-pty`

**優點**：
- 文字在到達終端之前已替換，**安全保證最強**
- 複製貼上拿到的也是遮蔽版
- 螢幕截圖、OBS 錄製都安全
- Tab completion、顏色等 PTY 功能完整保留

**缺點**：
- node-pty 是原生模組，需要編譯環境
- Chunk boundary 問題：PTY 輸出以任意 chunk 到達，可能切斷 secret 中間，需要 ring buffer / lookback window
- 每個 chunk 都跑正則匹配，高輸出量時可能有延遲

**參考實作**：`files_demo/` 目錄（Secret Shield v2）

---

### 方案 B：ANSI Escape Code fg=bg 同色隱藏（降級方案）

**原理**：透過 ANSI escape code 將敏感文字的前景色設為與背景色相同，視覺上不可見。

```
原始輸出：sk-proj-abc123xyz
處理後：  \033[30;40m sk-proj-abc123xyz \033[0m
          ^^^^^^^^^ 黑底黑字，視覺上隱形
```

**靈感來源**：ast-grep 專案使用的 terminal 渲染技術棧：
- `ansi_term` — ANSI escape code 著色
- `crossterm` — 終端控制（alternate screen、游標定位）
- `terminal-light` — 偵測終端背景色（亮色/暗色）

ast-grep 本身未使用 fg=bg 隱藏技術，但其工具棧完全支援此方向。`terminal-light` 的背景色偵測對此方案尤其重要。

**實作要點**：
- 攔截終端輸出（同方案 A 的 Pseudoterminal 或 output interceptor）
- 偵測終端背景色（亮/暗主題）
- 將匹配的 secret 文字包裹在 fg=bg ANSI escape code 中
- 可選：替換為遮蔽文字而非同色隱藏

**優點**：
- 不需要 node-pty 原生模組
- 實作複雜度較低
- 無 chunk boundary 問題（可以在完整行上操作）

**缺點**：
- **安全性較弱**：
  - 使用者選取文字時反白會曝光原始 key
  - 終端主題切換（亮 ↔ 暗）瞬間可能顏色不匹配
  - 部分終端模擬器可能不尊重背景色設定
  - 螢幕錄製軟體可能解析 ANSI code 還原文字
- 依賴正確的背景色偵測
- 不同終端模擬器行為不一致

---

### 方案 C：混合方案（建議）

結合方案 A 和 B 的優勢：

1. **主要路徑**：node-pty proxy 替換敏感文字（安全保證）
2. **Fallback**：無法載入 node-pty 時，使用 `FallbackShieldedTerminal`（`child_process.spawn` + 行模式）
3. **附加層**：在 fallback 模式中，配合 ANSI fg=bg 作為額外視覺隱藏

**載入優先順序**：
```
嘗試 node-pty (proxy terminal, 完整 PTY 功能)
    ↓ 失敗
嘗試 child_process.spawn (行模式, 犧牲 tab completion)
    ↓ 配合
ANSI fg=bg 同色 (附加視覺隱藏)
```

---

## 方案比較矩陣

| 維度 | A: node-pty proxy | B: ANSI fg=bg | C: 混合 |
|------|-------------------|---------------|---------|
| 安全等級 | 最高（文字已替換） | 中（文字仍存在） | 最高 |
| 原生模組依賴 | 需要 node-pty | 不需要 | 可選 |
| PTY 功能完整性 | 完整 | 完整 | 完整（主）/部分（fallback） |
| 選取複製安全 | 安全 | **不安全** | 安全（主）/不安全（fallback） |
| 螢幕截圖安全 | 安全 | 視終端而定 | 安全 |
| 實作複雜度 | 高 | 低 | 高 |
| Chunk boundary | 需處理 | 無（行模式） | 需處理（主）/無（fallback） |

---

## 已知挑戰

### Chunk Boundary 問題
PTY 輸出以任意位元組邊界到達。一個 API key `sk-proj-abc123` 可能被切成 `sk-proj-` 和 `abc123` 兩個 chunk。

**解法**：Ring buffer / lookback window
- 維護最近 N bytes 的緩衝區
- 每次新 chunk 到達時，與緩衝區尾部合併後掃描
- 只輸出確認安全的部分，可能延遲最長 pattern 長度的位元組

### node-pty 編譯環境
| 平台 | 需求 |
|------|------|
| macOS | `xcode-select --install` |
| Windows | `windows-build-tools` |
| Linux | `build-essential` |

### 效能考量
- 每個 chunk 都要跑 regex 匹配
- 高輸出量場景（如 `cat` 大檔案）可能有明顯延遲
- **緩解**：只在 Demo Mode 開啟時啟用 masking；關閉時直通

---

## 技術參考

| 資源 | 說明 |
|------|------|
| `files_demo/shielded-terminal.ts` | 完整 node-pty proxy terminal 實作 |
| `files_demo/extension.ts` | 完整 extension 整合（7 個命令、狀態列、toggle） |
| `files_demo/patterns.ts` | 內建正則模式（Anthropic、OpenAI、AWS、GitHub 等） |
| [ast-grep](https://github.com/ast-grep/ast-grep) | Terminal 渲染技術棧參考（ansi_term、crossterm、terminal-light） |
| [node-pty](https://github.com/microsoft/node-pty) | PTY 原生模組 |
| [crossterm](https://docs.rs/crossterm/) | Rust 跨平台終端控制 |
| [terminal-light](https://crates.io/crates/terminal-light) | 偵測終端背景色（亮/暗） |

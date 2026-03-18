# Contributing to Demo-safe API Key Manager

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build all packages: `npm run build:all`
4. For Swift Core: `cd packages/swift-core && swift build`

## Making Changes

1. Create a feature branch from `main`: `git checkout -b feature/my-feature`
2. Make your changes
3. Ensure linting passes: `npm run lint`
4. Ensure builds succeed: `npm run build:all`
5. Commit with a descriptive message (see Commit Convention below)
6. Push and open a Pull Request

## Adding Platform Support

DemoSafe's Chrome Extension detects and masks API keys on supported platforms. The API key ecosystem is vast — we can't cover every platform alone and welcome community contributions.

**Two files to edit (three if clipboard interception is needed), then build.** Here's the full walkthrough using a fictional "Acme API" as an example:

### Step 1: Add pattern to `capture-patterns.ts`

Edit [`packages/chrome-extension/src/content-scripts/capture-patterns.ts`](packages/chrome-extension/src/content-scripts/capture-patterns.ts) — add one entry to the `CAPTURE_PATTERNS` array:

```typescript
{
    id: 'acme-api',
    serviceName: 'Acme',
    prefix: 'acme_',                              // key prefix for detection
    regex: /acme_[A-Za-z0-9]{32}/g,                // full key format
    confidence: 0.95,                              // 0.0-1.0, use 0.85+ for known prefixes
    minLength: 37,                                 // prefix + min chars
    preHideCSS: `[role="dialog"] code, .api-key-display { visibility: hidden !important; }`,
    platformSelectors: [{
        hostname: 'dashboard.acme.com',            // platform hostname
        selectors: [
            '[role="dialog"] code',                // where the key appears in DOM
            'input.api-key-value',                 // alternative selector
        ],
        attributes: ['value'],                     // read input.value, not just textContent
        watchSelector: '[role="dialog"]',           // MutationObserver target for modals
        strategy: 'modal_watch',                   // modal_watch | flash_notice | always_visible
    }],
},
```

Also add the hostname to `DOMAIN_SERVICE_MAP` in the same file:

```typescript
export const DOMAIN_SERVICE_MAP: Record<string, string[]> = {
    // ... existing entries ...
    'dashboard.acme.com': ['acme-api'],
};
```

### Step 2: Add URL matches to `manifest.json`

Edit [`packages/chrome-extension/manifest.json`](packages/chrome-extension/manifest.json) — add the URL in **two places**:

**a) Pre-hide entry** (prevents flash of plaintext before masking):
```json
{
    "matches": ["https://dashboard.acme.com/*"],
    "css": ["dist/css/prehide-dashboard-acme-com.css"],
    "js": ["dist/content-scripts/pre-hide.js"],
    "run_at": "document_start"
}
```

**b) Masker entry** (the main content script):
```json
{
    "matches": [
        "https://platform.openai.com/*",
        ...
        "https://dashboard.acme.com/*"
    ],
    "js": ["dist/content-scripts/masker.js"],
    "run_at": "document_idle"
}
```

**c) Clipboard-patch entry** (only if the platform copies keys via `navigator.clipboard.writeText` instead of DOM text):
```json
{
    "matches": [
        "https://aistudio.google.com/*",
        ...
        "https://dashboard.acme.com/*"
    ],
    "js": ["dist/content-scripts/clipboard-patch.js"],
    "run_at": "document_start",
    "world": "MAIN"
}
```
This injects into the page context (not the isolated extension world) to intercept programmatic clipboard writes. Skip this if the platform shows keys as visible DOM text.

### Step 3: Build

```bash
npm run build:chrome
```

This auto-generates `dist/css/prehide-dashboard-acme-com.css` from your `preHideCSS` field. No manual CSS file creation needed.

### Step 4: Test

1. Load the updated extension in Chrome (`chrome://extensions` → reload)
2. Turn on Demo Mode in the DemoSafe popup
3. Navigate to the platform and create a test API key
4. Verify: key is masked (or hidden), toast appears, no plaintext flash

### Key considerations

| Concern | How to handle |
|---------|---------------|
| **React/Vue SPA** | Don't replace `input.value` — the framework overwrites it. Use `preHideCSS` to keep the input hidden. |
| **Clipboard API** | If the platform uses `navigator.clipboard.writeText`, the existing `clipboard-patch.ts` (MAIN world) will intercept it. No extra work needed. |
| **Turbo/SPA navigation** | `pre-hide.ts` already listens for `turbo:before-render`. For other SPA routers, the MutationObserver handles dynamic DOM. |
| **Dynamic class names** | Use stable attributes (`role`, `data-*`, `id`, `aria-label`) instead of obfuscated class names. |
| **Subdomains** | Use `https://*.example.com/*` in manifest matches and add subdomain support in `DOMAIN_SERVICE_MAP`. |
| **preHideCSS scope** | Only hide elements that contain **full** keys. Don't hide truncated previews (`sk-...xxxx`) — they never match patterns and stay hidden forever. |
| **Empty prefix** | If your key has no fixed prefix, set `prefix: ''` but keep `confidence` low (< 0.7). Empty prefixes are filtered from `KEY_PREFIXES` to prevent false positives in pre-hide. |

### Automated testing with Claude Code

If you use [Claude Code](https://claude.ai/claude-code), two built-in skills can accelerate platform work:

- **`/analyze-platform <url>`** — Analyzes a platform's DOM structure, identifies key elements and selectors, and generates a draft `capture-patterns.ts` entry.
- **`/test-capture-flow <platform>`** — Runs an end-to-end test: creates a real test key on the platform, measures capture timing, verifies masking and vault storage, then cleans up. If you add a new platform, consider updating this skill's platform table in [`.claude/skills/test-capture-flow/`](.claude/skills/test-capture-flow/) so future contributors can run automated tests for your platform.

See [Supported Platforms](docs/en/13-supported-platforms.md) for the full list and platform-specific quirks.

You can also **open an Issue** describing the platform, key format, and key display URL — we or other contributors can help build the pattern entry.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring (no feature change)
- `test:` — Adding or updating tests
- `chore:` — Build, CI, or tooling changes

Examples:
```
feat: add floating toolbox HUD with hold-to-search
fix: resolve content script pattern matching for Anthropic keys
docs: update IPC protocol spec with new event types
```

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Link related issues if applicable
- Ensure CI passes before requesting review

## Project Structure

| Directory | Language | Description |
|-----------|----------|-------------|
| `packages/swift-core/` | Swift | macOS Menu Bar App |
| `packages/vscode-extension/` | TypeScript | VS Code Extension |
| `packages/chrome-extension/` | TypeScript | Chrome Extension (Manifest V3) |
| `shared/ipc-protocol/` | TypeScript | Shared IPC type definitions |
| `docs/` | Markdown | Architecture and spec documentation |

## Security

- **Never commit real API keys** — use test/fake keys for testing
- **Plaintext keys must never travel over IPC** — this is a hard security rule
- Review [Security Rules](docs/en/03-security/security-rules.md) before working on key-handling code

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Include your macOS version, VS Code version, and Chrome version

## Code of Conduct

Please be respectful and constructive in all interactions. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

/**
 * Pre-hide content script — runs at document_start to hide key elements
 * BEFORE they render. Prevents flash of plaintext keys.
 *
 * Two layers of protection:
 * 1. CSS rules that hide known key containers (visibility: hidden)
 * 2. Instant MutationObserver that hides elements containing key patterns
 *    before the browser can paint them
 *
 * masker.ts restores visibility after masking, or removes CSS if Demo Mode OFF.
 */

const PRE_HIDE_ID = 'demosafe-pre-hide';

// API key prefixes to detect in real-time
const KEY_PREFIXES = ['sk-ant-', 'sk-proj-', 'sk-or-v1-', 'AKIA', 'AIzaSy', 'sk_live_', 'sk_test_', 'ghp_', 'github_pat_', 'hf_', 'xoxb-', 'xoxp-', 'SG.', 'glpat-'];

const platformRules: Record<string, string> = {
    'github.com': `
        code#new-oauth-token,
        code.token,
        .flash code,
        clipboard-copy[value] {
            visibility: hidden !important;
        }
    `,
    'platform.openai.com': `
        [data-state="open"] input[type="text"],
        [data-state="open"] code,
        td.api-key-token .api-key-token-value {
            visibility: hidden !important;
        }
    `,
    'console.anthropic.com': `
        [role="dialog"] .bg-accent-900,
        [role="dialog"] .bg-accent-900 *,
        [role="dialog"] .font-mono {
            visibility: hidden !important;
        }
    `,
    'platform.claude.com': `
        [role="dialog"] .bg-accent-900,
        [role="dialog"] .bg-accent-900 *,
        [role="dialog"] .font-mono {
            visibility: hidden !important;
        }
    `,
    'dashboard.stripe.com': `
        input[type="text"][readonly] {
            visibility: hidden !important;
        }
    `,
    'console.cloud.google.com': `
        services-show-api-key-string,
        mat-dialog-container input,
        mat-dialog-container code {
            visibility: hidden !important;
        }
    `,
    'huggingface.co': `
        .token-value code,
        input[readonly],
        div.flex.gap-2 > input,
        input.font-mono,
        input.truncate {
            visibility: hidden !important;
        }
    `,
    'console.aws.amazon.com': `
        [class*="awsui_input"] input[readonly] {
            visibility: hidden !important;
        }
    `,
    'app.sendgrid.com': `
        [class*="api-key"] input,
        [class*="api-key"] code {
            visibility: hidden !important;
        }
    `,
    'gitlab.com': `
        input#created-personal-access-token,
        .flash-notice code {
            visibility: hidden !important;
        }
    `,
};

// === Layer 1: CSS pre-hide ===
const hostname = window.location.hostname;
const rules = platformRules[hostname];
if (rules) {
    const style = document.createElement('style');
    style.id = PRE_HIDE_ID;
    style.textContent = rules;
    (document.head || document.documentElement).appendChild(style);
    setTimeout(() => {
        const el = document.getElementById(PRE_HIDE_ID);
        if (el) el.remove();
    }, 5000);
}

// === Layer 2: Instant MutationObserver ===
// Catches dynamically created dialogs/elements BEFORE browser paints.
// Runs at document_start — fires synchronously on DOM mutations.

function containsFullKey(text: string): boolean {
    if (text.length < 20) return false;
    // Skip truncated keys (official platform masking like "sk-ant-...KgAA")
    if (text.includes('...') && text.length < 50) return false;
    if (text.includes('****')) return false;
    for (const prefix of KEY_PREFIXES) {
        const idx = text.indexOf(prefix);
        if (idx >= 0) {
            // Check that enough characters follow the prefix (full key, not truncated)
            const afterPrefix = text.slice(idx + prefix.length);
            if (afterPrefix.length >= 15 && !afterPrefix.startsWith('...')) return true;
        }
    }
    return false;
}

function hideElementIfKey(el: Element) {
    // Check text content
    const text = el.textContent || '';
    if (containsFullKey(text)) {
        (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
        el.setAttribute('data-demosafe-prehidden', 'true');
    }
    // Check input value
    if (el.tagName === 'INPUT') {
        const val = (el as HTMLInputElement).value;
        if (val && containsFullKey(val)) {
            (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
            el.setAttribute('data-demosafe-prehidden', 'true');
        }
    }
}

const instantObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const el = node as Element;

            // Only act on dialogs/modals — don't hide list page elements
            const isDialog = el.getAttribute('role') === 'dialog' ||
                el.closest('[role="dialog"]') !== null ||
                el.querySelector('[role="dialog"]') !== null;

            if (isDialog) {
                // Hide all potential key-containing elements inside the dialog
                const targets = el.querySelectorAll('p, code, span, input, pre, .font-mono, .bg-accent-900');
                for (const target of targets) {
                    hideElementIfKey(target);
                }
                // Also check the dialog element itself
                hideElementIfKey(el);
            } else {
                // For non-dialog elements, only hide if it's a very specific key element
                // (e.g., flash notice, clipboard-copy)
                if (el.tagName === 'CLIPBOARD-COPY' || el.id === 'new-oauth-token' ||
                    el.classList.contains('flash')) {
                    hideElementIfKey(el);
                    el.querySelectorAll('code').forEach(c => hideElementIfKey(c));
                }
            }
        }
    }
});

// Start observing as early as possible
if (document.body) {
    instantObserver.observe(document.body, { childList: true, subtree: true });
} else {
    const bodyObserver = new MutationObserver(() => {
        if (document.body) {
            bodyObserver.disconnect();
            instantObserver.observe(document.body, { childList: true, subtree: true });
        }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
}

// Expose cleanup function for masker.ts
(window as unknown as Record<string, unknown>).__demosafe_instant_observer = instantObserver;

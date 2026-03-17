/**
 * Pre-hide content script — runs at document_start to hide key elements
 * BEFORE they render. Prevents flash of plaintext keys.
 *
 * Always injects CSS on supported platforms (no async storage check).
 * masker.ts removes the CSS after masking, or immediately if Demo Mode is OFF.
 */

const PRE_HIDE_ID = 'demosafe-pre-hide';

const platformRules: Record<string, string> = {
    'github.com': `
        code#new-oauth-token,
        code.token,
        .flash code,
        clipboard-copy[value] {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'platform.openai.com': `
        [data-state="open"] input[type="text"],
        [data-state="open"] code,
        td.api-key-token .api-key-token-value {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'console.anthropic.com': `
        [role="dialog"] code,
        [role="dialog"] input {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'platform.claude.com': `
        [role="dialog"] code,
        [role="dialog"] input {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'dashboard.stripe.com': `
        input[type="text"][readonly] {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'console.cloud.google.com': `
        services-show-api-key-string,
        mat-dialog-container input,
        mat-dialog-container code {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'huggingface.co': `
        .token-value code,
        input[readonly],
        div.flex.gap-2 > input,
        input.font-mono,
        input.truncate {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'console.aws.amazon.com': `
        [class*="awsui_input"] input[readonly] {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'app.sendgrid.com': `
        [class*="api-key"] input,
        [class*="api-key"] code {
            color: transparent !important;
            user-select: none !important;
        }
    `,
    'gitlab.com': `
        input#created-personal-access-token,
        .flash-notice code {
            color: transparent !important;
            user-select: none !important;
        }
    `,
};

// Inject synchronously — no async storage check
const hostname = window.location.hostname;
const rules = platformRules[hostname];
if (rules) {
    const style = document.createElement('style');
    style.id = PRE_HIDE_ID;
    style.textContent = rules;
    (document.head || document.documentElement).appendChild(style);
    // Safety: remove after 5s if masker.ts doesn't load
    setTimeout(() => {
        const el = document.getElementById(PRE_HIDE_ID);
        if (el) el.remove();
    }, 5000);
}

# Security policy

## Reporting a vulnerability

Please email **security@graphock.com** with:

- affected version / commit
- browser and OS
- reproduction steps
- impact assessment (what can an attacker read, write, or execute?)

Do not open a public issue for security reports. We aim to acknowledge within 3 business days.

## Threat model (short)

The extension runs on untrusted pages. We assume:

- page content may be hostile (scripts, event handlers, `javascript:` URLs, huge DOMs);
- a malicious page can craft protocol links;
- the desktop app may be older than the extension.

Defenses:

- content scripts run only on user action (`activeTab`);
- captured DOM is sanitized: scripts, handlers and unsafe URLs are removed;
- protocol payloads are schema-validated, size-limited, checksummed and require explicit user
  confirmation in the app;
- the extension performs no network requests of its own (image fetching is opt-in and limited);
- no remote code, no `eval`, no CDN at runtime; packaging rejects `.map` files and secrets.

Out of scope: a fully compromised browser profile, malicious extensions with broader
permissions, or a compromised desktop app install.

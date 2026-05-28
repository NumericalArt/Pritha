# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to the maintainers. Do not open a public issue for secrets, credential leaks or exploitable bugs.

## Secrets Policy

Never commit:

- `.env*` with real values;
- Telegram bot tokens;
- API keys;
- local machine paths;
- `.queue/`;
- `.memory/*.sqlite`;
- `.logs/`;
- exported private chat or user data.

Use `.env.example` for variable names only.

## Untrusted Input

Treat Telegram messages, links, YouTube transcripts, copied text, screenshots and uploaded files as untrusted input. Raw input must not directly control tools, memory promotion or deployment actions.

## Deployment

`launchd`, cloud deployment and long-running services require explicit user approval. Read-only `plan` and `status` commands are allowed; mutating commands must require an explicit confirmation flag.

# Project instructions

## Deployment

- **Two environments (full topology in the machine-global `~/.claude/CLAUDE.md`):**
  - **Dev/test = this host** → https://bryx-test.lumeapps.de. Default target for
    deploying and verifying changes. Flow: `/opt/budp-dev/deploy.sh`.
  - **Production = VPS `194.164.204.249`** → https://budp.lumeapps.de. Never
    deploy there without explicit confirmation.
- Automated tests (`npx vitest`) run locally.

# Project instructions

## Deployment

- **Never start or run a local deployment.** Do not `docker compose up` the app
  stack, `npm run dev`, or otherwise bring the app up on this machine.
- **Always deploy on the VPS.** The app runs at https://budp.lumeapps.de on the
  shared VPS (`root@194.164.204.249`). Deploy and verify there.
- This overrides the global engineering guideline about deploying locally via
  Docker as part of testing. Automated tests (`npx vitest`) still run locally;
  only the running/deployed app must live on the VPS.

# @bmi/mobile — BMI Stooring (Expo React Native, Android R1)

The field app for the BMI Stooring System (TASK-118, FG-15). Built for older
Android (8.0+), outdoors / sunlight / gloves: one task per screen, 48px touch
targets, minimal typing, offline-safe drafts where specified (PRD §7.11). The
app reaches data **only through the NestJS API** (`/api/v1`) — never a database
directly.

## R1 field flows

- **MobileLogin** — signs in and routes to the field menu for the returned role
  (`src/logic/role-menu.ts`).
- **Driver** — inspection, odometer, **breakdown**, history.
- **Field Coordinator (Korlap)** — requests (field draft), purchase.
- **System Admin field menu** — breakdown on a driver's behalf, odometer, history.
- **Shared MobileProfile** — notification settings (push / email, DQ-01) + UI
  language (Indonesian default / English).
- **Mechanic today list (R2, REQ-MOB-010)** — today-scheduled WOs assigned to the
  mechanic, ordered by urgency descending with rolled-over / late first; each row
  carries its urgency pill (text label present, WCAG) and the rolled-over flag.

### Breakdown flow (REQ-PM-005, REQ-MBL-002, REQ-WO-016)

The app captures the driver's location **once** on report, plus a **mandatory
finding note** that becomes the draft's `finding_note`. Submitting calls
`POST /maintenance/breakdowns`; the API pre-seeds exactly one Mobilisasi step at
the captured location and copies the note — the app does **not** re-implement the
drafting. The continuous mechanic GPS trail is **R2 Mobilisasi** only (not here).

## Run

```bash
# Point the app at your API (defaults to the Android-emulator host alias):
#   EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
pnpm --filter @bmi/mobile start      # expo start (Metro)
pnpm --filter @bmi/mobile android    # launch on an Android emulator / device
```

Sign in with a seeded account (dev): e.g. `driver@bmi.test`, `access@bmi.test`,
`sysadmin@bmi.test` — password `Bmi12345` (dummy gateway, Phase 1).

## Verification

- `pnpm --filter @bmi/mobile run typecheck` — type-checks the **pure logic** (API
  client, role routing, field validation, mechanic today ordering, theme, i18n)
  with the repo toolchain, no Expo install required.
- `pnpm --filter @bmi/mobile run test` — Vitest unit tests for the same logic.
- `pnpm --filter @bmi/mobile run typecheck:app` — type-checks the React Native
  screens against the Expo toolchain (requires `pnpm install` to resolve
  `expo` / `react-native`).

# Product

**BMI Stooring System** (short: "BMI Stooring") is Work Order (WO) driven preventive-maintenance software for BMI, a single logistics company running a fleet of ~100 units with ~15 users across 10 roles.

## Core principle

Nothing changes outside an approved, verified Work Order. Every repair, part issue, tyre change, document renewal and purchase happens inside a WO, so cost, stock, tyre history and part age stay traceable per vehicle.

## Roles (10)

Planner, System Admin, Mechanic, Warehouse Manager, Field Coordinator (Korlap), Driver, Supervisor, GM, Accounting, Access Manager. Office roles use the desktop web app; Driver, Field Coordinator and the System Admin field menu use the Android app in Release 1.

## Platforms

- **Web** — desktop, current Chrome and Edge (office roles).
- **Mobile** — Android APK via React Native + Expo (field roles). Built for older phones (Android 8.0+), outdoors, sunlight, gloves, weak signal: one task per screen, large 48px targets, minimal typing, offline drafts/photos. iPhone follows in Release 2.

## Product principles (binding)

1. Nothing happens outside a WO.
2. Configuration over code — WO types, steps, unit layouts, PM packages and capabilities are editable master data, not code.
3. The field screen does one thing: large targets, few inputs, sunlight-readable, offline-safe.
4. Every decision leaves a trail: stamps, timestamps, audit records.
5. Check by people, not guesswork: the verifier compares receipts, photos, position; the system never silently corrects.

## Must-knows

- **UI language:** Indonesian (default) and English, user-selectable. Bilingual required.
- **Accessibility:** WCAG 2.2 AA baseline; status is never conveyed by colour alone (always carries text).
- **Brand:** BMI logo is mandatory on a white tile; primary red `#AD2713`; petrol `#1F4E5F` is the second colour. Full system in `DESIGN.md` — never recolour, stretch, or place the logo directly on brand red.
- **Setup mode:** before go-live only System Admin and Access Manager sign in for bulk master-data import; then a one-way "Go live" switch.

The authoritative product record is `PRD.md` (SDD Spec v2) at the repo root. `PRODUCT.md` is the fuller product summary.

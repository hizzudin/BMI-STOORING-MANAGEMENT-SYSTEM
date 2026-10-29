# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Inferred, to confirm: the design canvas records the desktop web app. The same system also has an Android app for field roles, built with React Native and Expo and installed as an APK; iPhone follows in Release 2. Mobile screens live in the same canvas.)

## Stack

Decided in the SDD Spec v2, section 8.2 (DEC-66, DEC-67): TypeScript monorepo; Next.js web app; React Native with Expo mobile app (Android APK); NestJS API server; PostgreSQL on Google Cloud SQL (Jakarta); Cloudflare R2 for files; Google Cloud Run hosting with Cloudflare in front. Web and mobile reach data only through the API.

## Users

Ten roles of one logistics company (BMI) using BMI Stooring System, about 15 users in total, running a fleet of about 100 units:

- **Planner:** designs WO types and their steps, plans and checks Work Orders (WO), verifies steps.
- **System Admin:** sets up master data before go-live, runs any field task, verifies steps.
- **Mechanic:** executes Mechanic Action and Part Replacement steps; can draft WOs.
- **Warehouse Manager:** issues parts from stock, receives goods, counts stock and tyres.
- **Field Coordinator (Korlap):** turns driver requests into draft WOs, buys parts outside and records the receipt, follows fleet availability; works mostly from a phone.
- **Driver:** daily inspection with odometer, breakdown reports; phone only.
- **Supervisor and GM:** approve WOs and warehouse documents.
- **Accounting:** issues invoices to customers.
- **Access Manager:** manages accounts, roles and capabilities.

Office roles work on a desktop browser. Driver, Field Coordinator and the System Admin field menu work on Android phones in Release 1.

## Product Purpose

Work Order driven preventive maintenance for the fleet: every repair, part issue, tyre change, document renewal and purchase happens inside an approved WO, so cost, stock, tyre history and part age stay traceable per vehicle. Success means PM on time, no stock or tyre that cannot be explained, and every WO billed to the right customer.

## Positioning

The WO is assembled from configurable assignment modules (Stock, Part Purchase, Mechanic Action, Part Replacement, Document) whose order the Planner designs per WO type; the chassis map is drawn from data for any unit type (tractor head, trailer tail, wingbox rigid truck, Hilux safety patrol pickup), and nothing changes stock, tyres or cost outside an approved WO.

## Operating Context

- Unit kinds: Powered (tractor head, wingbox rigid truck, pickup, van) with odometer; Towed (trailer tail) without odometer, counted in days only.
- Field work happens outdoors, in direct sunlight, with dirty or gloved hands, on older Android phones (Android 8.0 Oreo and up), with weak signal; drafts and photos are kept offline.
- Some field users are not used to smartphones: one task per screen, few steps, plain text.
- Documents produced: WO digital document (PDF), invoice PDF (numbered NNNN/BMI/dd-mm-yy), stock card exports.
- Setup mode before go-live (only System Admin and Access Manager sign in, bulk import of master data), then a one-way Go live.

## Capabilities and Constraints

- The full product record is the SDD Spec v2 (claude.ai artifact MDgdPEzWtLEQbq3PMhbWtg); the design canvas is artifact LvDdr6ZffShqyddQUYHG4w. Every design change is mirrored into the spec.
- UI language: Indonesian and English, chosen by the user, Indonesian as default. Current canvas screens are in English and need the Indonesian version.
- Desktop web in current Chrome and Edge; no branches; single company.
- Open: cloud account owners and domain (spec Q-03).

## Brand Commitments

- Product name: **BMI Stooring System** (short form "BMI Stooring"); replaces the working name Fleet PM System (spec DEC-81).
- The BMI logo (client file, `canvas/project/bmi-logo.png`) is mandatory: on a white tile over dark surfaces, grayscale on printed WO documents and invoices; never stretched, recoloured or placed directly on the brand red.
- Brand colours, binding (spec 7.8): from the logo, primary red #AD2713, dark red #8A1D0C, gold #C09D11 (dark surfaces only). Palette Petrol Complement (DEC-84): petrol #1F4E5F as the second colour (links, info, icons, charts), petrol ink #14262E for the frame, mist #E6EFF1 for selection. Status red #B91C1C stays separate; a status always carries its text. Full system in DESIGN.md.

## Evidence on Hand

- 143 reference screens in the design canvas, plus the SDD Spec v2 with requirements, acceptance criteria and schema.
- BMI logo file supplied by the client (`canvas/project/bmi-logo.png`). No real customer names, user photos or fleet photos; example plates and names in the canvas are placeholders.

## Product Principles

1. Nothing happens outside a WO: stock, tyres, cost and part age change only through approved, verified steps.
2. Configuration over code: WO types, steps, unit layouts, PM packages and capabilities are data the Planner or System Admin can change.
3. The field screen does one thing: large targets, few inputs, readable in sunlight, safe offline.
4. Every decision leaves a trail: stamps, timestamps and audit records that the GM can trust.
5. Check by people, not by guesswork: the verifier compares receipts, photos and position; the system never silently corrects.

## Accessibility & Inclusion

- Mobile screens for Driver, Field Coordinator and System Admin: readable in direct sunlight (high contrast), touch targets at least 48 px for gloved or dirty hands, minimal typing, simple one-task flows for users new to smartphones.
- Status never by colour alone (tyre map and pills carry text).
- Bilingual UI (Indonesian default, English).
- WCAG 2.2 AA as the baseline for web and mobile.

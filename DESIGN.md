---
name: BMI Stooring System
description: Work Order driven fleet maintenance for BMI, on desktop web and an Android field app. Palette: Petrol Complement (DEC-84).
colors:
  brand-red: "#AD2713"
  brand-red-deep: "#8A1D0C"
  brand-gold: "#C09D11"
  gold-light: "#F2D98A"
  petrol: "#1F4E5F"
  ink: "#14262E"
  ink-raised: "#1F3640"
  stone: "#CBD5DA"
  stone-muted: "#93A4AC"
  text: "#1F2937"
  text-muted: "#4B5563"
  text-subtle: "#6B7280"
  border-strong: "#9CA3AF"
  border: "#E5E7EB"
  divider: "#F3F4F6"
  page: "#F4F7F8"
  surface: "#FFFFFF"
  mist: "#E6EFF1"
  mist-light: "#F0F5F6"
  frost: "#F7FAFB"
  steel-edge: "#A9BEC5"
  success: "#15803D"
  success-bg: "#DCFCE7"
  success-text: "#14532D"
  warning: "#B45309"
  warning-bg: "#FEF3C7"
  warning-text: "#78350F"
  danger: "#B91C1C"
  danger-bg: "#FEE2E2"
  danger-tint: "#FEF2F2"
  danger-text: "#7F1D1D"
  info-bg: "#DCEBEF"
  info-text: "#1F4E5F"
  neutral-pill-text: "#374151"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  metric:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  body-mobile:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  page: "22px"
components:
  button-primary:
    backgroundColor: "{colors.brand-red}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.brand-red-deep}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.mist}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-danger-hover:
    backgroundColor: "{colors.danger-tint}"
  button-mobile:
    backgroundColor: "{colors.brand-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px"
  card-mobile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px"
  pill-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info-text}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-neutral:
    backgroundColor: "{colors.border}"
    textColor: "{colors.neutral-pill-text}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  nav-sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stone}"
    width: "200px"
  nav-sidebar-collapsed:
    backgroundColor: "{colors.ink}"
    width: "64px"
  nav-item-active:
    backgroundColor: "{colors.brand-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 10px"
  nav-item-hover:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.surface}"
  row-selected:
    backgroundColor: "{colors.mist}"
  row-hover:
    backgroundColor: "{colors.mist-light}"
---

# Design System: BMI Stooring System

## Overview

**Creative North Star: "The Workshop Logbook"**

BMI Stooring System looks like a well-kept workshop logbook: dense, ruled, legible at a glance, and every entry signed. Pages are white sheets on a pale page, divided by thin rules rather than boxes inside boxes. Information sits in label and value pairs, tables with one fact per column, and step cards in the order the work happens. The BMI red is the ink of authority. It marks the one action that moves the work forward, the page you are on, and the stamp that makes a decision official. A deep petrol, the complement of that red, is the second ink: it frames every screen, marks information and links, and colors the navigation icons. Everything else stays in quiet cool greys and the pale mist of a logbook page.

The system is built for Operate mode. Office staff scan Work Orders, stock and approvals on desktop all day; drivers, field coordinators and mechanics use an Android phone outdoors, in sunlight, sometimes with gloves. Density is high on desktop (13 px body, compact rows) and generous on the phone (15 px body, 48 px targets). The brand lives in precise details: the red stamp, the logo on its white tile, tabular numerals, and a petrol-black frame around every screen.

Motion only confirms what the user just did or explains a change of state. There is one authored moment: when an approver approves, the stamp is pressed into the box with the time.

**Key Characteristics:**
- Petrol-black frame (sidebar, mobile header) around white working sheets on a cool pale page.
- Two inks: BMI red for authority, petrol for information; they never swap roles.
- One red action per region; status carries its own text and soft tint.
- Flat surfaces with hairline borders; shadow only for floating dialogs.
- Label and value rows, one fact per table column, tabular numerals.
- Outline icons beside text labels, never alone (except the collapsed rail).
- Every decision ends in a visible stamp: who, which role, when.

## Colors

Petrol Complement: one brand red and its complement, a deep petrol, over cool neutrals, with soft tints that belong only to status.

### Primary
- **BMI Ledger Red** (brand-red): the primary action of a region, the active navigation item, the active tab underline, focus rings, links, the approval stamp border and the step badge numbers. Taken from the BMI logo. White text on it reaches 6.8:1.
- **Oxblood Seal** (brand-red-deep): hover and pressed state of primary actions and an approved button.

### Secondary
- **Harbour Petrol** (petrol): the complement of BMI red (OKLCH hue about 225 against 31). In-text links, info and In Progress pills (as text on a pale petrol tint), the module icons on step cards and the WO designer, the Settings icon tiles, and the first series of any chart in Reports. Never used for the primary action or for an error.
- **Logo Gold** (brand-gold): an accent from the logo, allowed only on dark surfaces (ink header, sidebar). It fails contrast on white (2.6:1) and is never text or a thin line on a light surface.
- **Straw Highlight** (gold-light): text selection and the focus ring on dark surfaces.

### Neutral
- **Petrol Ink** (ink): the web sidebar, the mobile header and the dialog scrim (at 55%). The frame of every screen; white text on it is 15.6:1.
- **Raised Petrol** (ink-raised): hover on dark navigation.
- **Fog** (stone) and **Muted Fog** (stone-muted): text on the dark navigation, and the quieter collapse control.
- **Graphite** (text): main text and headings.
- **Slate Note** (text-muted): secondary text, table headers, hints. The default for anything that is not the main value.
- **Faint Slate** (text-subtle): the lightest grey allowed for text (4.8:1 on white).
- **Pencil Line** (border-strong): input and secondary button borders, dashed stamp outline before a decision.
- **Hairline** (border): card borders, table header rules, neutral pills.
- **Ruled Line** (divider): row rules inside cards and tables.
- **Page** (page): the background behind working sheets. **Sheet** (surface): cards, inputs, tables.
- **Logbook Mist** (mist): selected rows and list items, info panels, Settings icon tiles, secondary button hover.
- **Pale Mist** (mist-light) and **Frost** (frost): row hover, hover on list cards, the stamped box after approval.
- **Steel Edge** (steel-edge): border of a hovered list card.

### Status
Status colors are a separate family from the brand. Each status pairs a soft background with a dark text of the same hue, plus a strong tone for maps and toggles.
- **Pass Green** (success, success-bg, success-text): Active, Valid, Verified, Pass, Normal tyres.
- **Caution Amber** (warning, warning-bg, warning-text): Due soon, Warning, Repair, Pending Approval.
- **Alarm Red** (danger, danger-bg, danger-tint, danger-text): Act now, Expired, Blocked, Rejected, Returned, Fail, destructive buttons.
- **Notice Petrol** (info-bg, info-text): In Progress, Open, version and info pills, in the petrol second ink.
- **Neutral Grey** (border, neutral-pill-text): Draft, Locked, Not required, role chips.

### Named Rules
**The Stamp Ink Rule.** BMI red is for the action that moves the work forward, the place you are, and the stamp of a decision. Never use it for decoration, large fills or status.

**The Second Ink Rule.** Petrol carries information, never authority: links, info states, icons and chart series. It is never a primary button and never an error. Red and petrol never swap roles.

**The Two Reds Rule.** Brand red (#AD2713) and alarm red (#B91C1C) look alike, so they never share a role. Alarm red appears only with a status word or an explicit destructive verb, and destructive buttons are outlined, never filled.

**The Words First Rule.** A status is always written. Color only reinforces the text: pills, tyre maps and toggles all carry their label.

## Typography

**Body Font:** the platform sans (system-ui, with -apple-system and Segoe UI fallbacks). One family for everything.

**Character:** neutral, fast to render on older Android phones, and familiar to users who are not used to smartphones. Hierarchy comes from size and weight, not from a second face.

### Hierarchy
- **Headline** (700, 22px, 1.25): page title, one per page, top left. Mobile header titles use 19 to 20px.
- **Title** (700, 15px, 1.3): card headings and section headings inside a page.
- **Metric** (700, 20px, tabular numerals): counts and amounts on dashboard cards and summaries.
- **Body** (400, 13px, 1.45): all desktop text, tables, forms. Values that matter are set in 600 or 700, not in a larger size.
- **Body Mobile** (400, 15px, 1.45): all phone text; inputs and primary buttons on the phone use 15 to 16px.
- **Label** (600, 12px): table headers, pills, small buttons, hints under values.

### Named Rules
**The One Face Rule.** The system font carries the whole product. Weight (400, 600, 700) and size steps do the work; no display face, no monospace costume.

**The Counting Rule.** Numbers that are compared or added (quantities, km, Rp, dates in tables) use tabular numerals and stay on one line; dates, WO numbers, SKUs and plates never wrap.

## Layout

Desktop screens are 1200 px wide: a fixed 200 px ink sidebar and a main area with 22 px padding. The sidebar collapses to a 64 px icon rail with a toggle at its foot, saved per user; the main area takes the freed width. Pages follow a small set of patterns: a list page (header with the primary action, tabs, a filter row, the table), a master-detail page (list left, detail right; selecting never leaves the page), a step screen (context banner, the form, an action bar aligned right), and a form page (cards in data-entry order, a bottom bar with Cancel, Save draft, main action).

Grids are two columns of roughly 1.6 to 1 (work on the left, context and rules on the right) or three equal columns for Settings and summaries. Spacing steps are 4, 6, 8, 12 and 16 px, with 22 px for page padding; related fields sit 8 to 12 px apart, separate cards 12 to 14 px.

Mobile screens are 390 by 844 px: an ink header with role, name and title, a single column of cards with 16 px side padding, and a bottom bar of four or five icon-and-label destinations. One task per screen; the primary action is full width at the bottom of the content.

### Named Rules
**The One Fact Per Column Rule.** Each data item has its own sortable column; never two items in one cell or two lines of different facts.

## Elevation & Depth

Flat by default. Surfaces are separated by hairline borders and the contrast between the pale page and white sheets, not by shadow. Depth appears only when something truly floats above the page: a dialog over its scrim.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 10px 30px rgba(0,0,0,.25)`): dialogs over the 55% petrol-ink scrim (Cancel WO, Void, Deactivate, Scrap, Worn out).
- **Panel lift** (`box-shadow: 0 8px 24px rgba(0,0,0,.12)`): side panels such as the column chooser.

### Named Rules
**The Flat Sheet Rule.** Cards never carry a resting shadow and are never nested inside another card. If a region needs separation, use a rule or a mist tint.

## Shapes

Gently rounded and businesslike. Controls (buttons, inputs, selects) use small corners (6px); cards and panels use 8px; mobile cards use 10px; pills and step-number badges are fully round. Borders are 1px hairlines. The stamp box is dashed before a decision and becomes a solid 2px red line once stamped. The chassis map is drawn from data: rails and axles as plain bars, tyres as rounded rectangles colored by status, with a dashed outline for Act now.

**The No Stripe Rule.** No thick colored border on one side of a card, list item or alert. Emphasis comes from a tint, a pill or the step badge.

## Components

### Buttons
Firm and tidy: one filled red button per region, everything else outlined.
- **Shape:** gently rounded (6px); 8px 14px padding on desktop, at least 48px tall on the phone.
- **Primary:** BMI Ledger Red with white 600 text. Hover and pressed turn Oxblood Seal; pressing nudges the button down 1px and scales it to 98%.
- **Secondary:** white with a Pencil Line border and Graphite text; hover fills with Logbook Mist.
- **Danger:** outlined in alarm red with red text and an explicit verb (Cancel WO, Void reading, Deactivate part); hover fills with the danger tint. Never filled.
- **Icon buttons:** Add and Back carry a 16px plus or arrow icon before the word; the label stays on one line.
- **Focus:** a 2px brand-red ring offset by 2px.

### Chips and Pills
- **Status pill:** fully round, 12px 600 text, soft status background with dark same-hue text. Always contains the status word.
- **Urgency / WO priority pill:** the WO's priority (urgency) label is shown as a status pill that always carries its text label (The Words First Rule; status is never colour alone). Map the four priorities onto the existing pills: **Urgent** → `pill-danger` (red) with the word "Urgent"; **High** → `pill-warning` (amber) with "High"; **Normal** → `pill-info` (petrol) with "Normal"; **Low** → `pill-neutral` with "Low". Alarm red on the Urgent pill still appears only beside its status word (The Two Reds Rule).
- **Module chip (WO designer):** white, Pencil Line border, 8px corners, the module icon in Harbour Petrol beside its name and a one-line description; hover shows a red border and a grab cursor.

### Cards / Containers
- **Corner Style:** 8px (desktop), 10px (mobile).
- **Background:** white Sheet on the Page background.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 14px; rows inside use Ruled Line dividers and 5 to 10px vertical padding.
- **Panels:** info panels in Logbook Mist, warnings in amber, errors in red tint, all 8px with 10px padding and no border.

### Inputs / Fields
- **Style:** white, 1px Pencil Line border, 6px corners, 7px 8px padding, 13px text (15px on the phone, full width). Labels sit above the field in 600.
- **Hover / Focus:** the border darkens on hover; focus shows a 2px brand-red outline and red border.
- **Disabled:** grey divider background with muted text.
- **Checkboxes and radios:** native controls tinted brand red.

### Navigation
- **Web sidebar:** Petrol Ink, Fog text at 14px. The BMI logo on a white tile with "BMI Stooring System" beside it. Each item has an 18px outline icon and its name; the active item is filled BMI red with white text; hover is Raised Petrol. A waiting count sits at the right edge as a small red pill (white with red text on the active item). Collapse menu sits at the foot.
- **Collapsed rail:** 64px, icons only, names as tooltips, the count on the icon's corner, the logo tile alone at the top.
- **Tabs:** text tabs on a hairline; the active tab is red, bold and underlined 2px; hover shows a stone underline. Vehicle detail tabs carry a 16px icon.
- **Mobile bottom bar:** white with a hairline top, four or five destinations, a 24px icon above a 12px label; the active one is red and bold with a short red bar along the top edge.

### Step Card
The heart of a Work Order. One card per step, in order: the module icon and "n Module" title, a status pill, who submitted or is assigned, and the step action. The step waiting for the current user has a red border and pulses twice when the WO opens. Locked steps say what they wait for.

### Approval Stamp
A dashed box that says whose stamp will be placed ("Approved by Supervisor: Budi S."). On Approve, the box turns solid red on Pale Mist and the stamp is pressed in with the time (about 450ms, a slight scale and rotation settling flat); Reject dims. With reduced motion it simply fades in.

### Chassis Map
One drawing component for every unit type, generated from the layout: front at the top, rails, axles and tyres as status-colored rounded rectangles with their position code below. Alerts are numbered badges on the tyre and in the alert list beside it. Read only everywhere except the Part Replacement step.

## Do's and Don'ts

### Do:
- **Do** keep one filled BMI red button per region; make every other action secondary or outlined.
- **Do** use petrol for links, info states, navigation icons and the first chart series.
- **Do** write every status as text inside its pill; color only reinforces it.
- **Do** place the logo on a white tile on dark surfaces and in grayscale on printed WO documents and invoices.
- **Do** use tabular numerals and single-line dates, WO numbers, SKUs and plates in tables.
- **Do** give every phone target at least 48px and every Pass/Fail control at least 44px tall.
- **Do** put an outline icon beside the label in navigation, step cards, Settings items and Add or Back buttons, from the one icon set (24px grid, 2px stroke).
- **Do** keep motion to feedback (100 to 200ms), dialogs (about 300ms) and the stamp (about 450ms), with a reduced-motion fade.

### Don't:
- **Don't** fill a destructive button with red, or use brand red for an error or status.
- **Don't** use Logo Gold as text or a thin line on white.
- **Don't** use petrol for a primary action or an error, or red for information.
- **Don't** add resting shadows to cards, nest cards, or add thick side stripes to cards, list items or alerts.
- **Don't** use emoji or text glyphs as icons, or show an icon without its label outside the collapsed rail.
- **Don't** put two facts in one table cell or let a date wrap across lines.
- **Don't** use a grey lighter than Faint Slate (#6B7280) for text on white.
- **Don't** stretch, recolor or crop the logo, or place it directly on brand red.

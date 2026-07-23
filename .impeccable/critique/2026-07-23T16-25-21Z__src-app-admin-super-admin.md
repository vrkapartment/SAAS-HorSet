---
target: Super Admin section (page.tsx, plans/page.tsx, tax-templates pages)
total_score: 21
p0_count: 2
p1_count: 2
timestamp: 2026-07-23T16-25-21Z
slug: src-app-admin-super-admin
---
Method: dual-agent (A: afe59ce3edf3bf4b9 · B: a15f0230fd5b80dc5)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live LINE quota/countdown/retry-status are good, but every load state is a spinner and multiple independent "รีเฟรชข้อมูล" buttons per tab give no sense of overall freshness — worsened by the redundant-fetch issue below. |
| 2 | Match System / Real World | 3 | Thai domain vocabulary solid; flagship heading is bare English ("Super Admin Console") against the project's Thai-first UI rule. |
| 3 | User Control and Freedom | 2 | Destructive delete goes through a raw browser `confirm()` with no undo; no soft-delete affordance surfaced despite the schema supporting it. |
| 4 | Consistency and Standards | 1 | Per-page accent colors (purple/emerald/teal/green), two competing card idioms, gradient text on a heading — contradicts the project's own DESIGN.md on nearly every axis. |
| 5 | Error Prevention | 2 | Good confirm-step in the tax mapping tool; but the payment-approval modal unlocks a paying account with a single click and zero confirmation. |
| 6 | Recognition Rather Than Recall | 3 | Consistent masked-secret (••••) convention across every credential field; icon+label tabs aid scanning. |
| 7 | Flexibility and Efficiency of Use | 1 | No bulk actions, no keyboard shortcuts, search present on only 2 of ~7 tables. |
| 8 | Aesthetic and Minimalist Design | 1 | Every card stacks a colored icon chip + blurred glow blob + gradient overlay; compounds into high visual noise for what's fundamentally CRUD tables and forms. |
| 9 | Error Recovery | 3 | Error banners give a Thai explanation plus the raw backend message — useful, if unpolished. |
| 10 | Help and Documentation | 2 | The tax-mapping help page is excellent and thorough, but it's the *only* help surface; LINE OA, Google Drive OAuth, and SlipOK setup — equally non-trivial — get none. |
| **Total** | | **21/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: Yes, a Linear/Stripe-fluent user would pause repeatedly — this reads as five separately-built screens stitched under one nav rather than one product. Concrete tells: gradient text on the H1 (`page.tsx:1027`, explicitly banned by this project's own DESIGN.md), an off-palette purple hero/tab-active color for the whole console (`page.tsx:1020-1029,1064`) with no basis in the documented blue/indigo/teal/emerald/amber/red palette, a *different* signature accent per sub-page (purple console / emerald plans / teal tax-templates / green LINE tab), glassmorphism applied as the default card treatment everywhere rather than the "subtle, reserved" use DESIGN.md calls for, decorative `animate-pulse` on static icons that never change state, a repeated tiny-uppercase-eyebrow badge on every page header, and two competing "premium card" implementations coexisting on the same screen (evidence of different sessions never reconciled). There's also a literal proofreading miss sitting inside the flashiest element on the page: "แผงควบคุม**ควบคุมควบคุม**ระบบสูงสุด" (`page.tsx:1025`).

**Deterministic scan**: 11 findings across the 6 scanned files, concentrated almost entirely in `page.tsx` (8 of 11) — `ai-color-palette` ×6 (purple gradients at lines 1484, 1585, 2415), `gray-on-color` ×2, `design-system-color` ×2, `gradient-text` ×1 (line 1027). `plans/page.tsx`, `tax-templates/page.tsx`, `mapping/help/page.tsx`, and `SaasPaymentReviewModal.tsx` came back clean. Cross-checking against this project's own DESIGN.md hex values, 3 of the 11 are likely false positives (indigo+blue gradient at `page.tsx:1585` — both are documented brand colors, not an AI-purple tell; two `gray-on-color` hits where the "gray" is actually a 10%-opacity tint or near-black `slate-950`, not the washed-out-gray failure the rule targets). The remaining 8 are genuine, including two the LLM pass didn't independently cite: inline `style={{ color: "#fbbf24" }}` at `mapping/page.tsx:446,471` — an ad-hoc hex that doesn't match the project's own `amber-500`/`amber-600` already used two lines away in the same file.

**Visual overlays**: Unavailable — no browser automation tool is exposed in this session, so no live-page screenshot or injected overlay was attempted. All findings above are static code evidence (file:line), not fabricated visual claims.

## Overall Impression

The bones are fine — Thai-first copy, a real domain model (workspaces/subscriptions/tax templates), and at least one genuinely excellent screen (tax-mapping help). What's actually wrong is that **every feature pass picked its own color and its own loading/empty-state convention**, so a Super Admin walking from the main console → Plans → Tax Templates experiences four different "brands" in one session. The single biggest opportunity isn't more visual polish — it's enforcing the one design system that's already documented in this repo's own `DESIGN.md` and retiring every off-palette color and bolted-on card idiom that drifted from it.

## What's Working

- **Tax field-mapping tool** (`mapping/page.tsx`): rendering the real PDF with color-coded clickable overlay boxes and a live coverage counter is a genuinely clever, direct-manipulation solution to an inherently fiddly problem — and its "move this mapping?" confirm step is scoped exactly to the one place data-loss risk is real, not sprinkled everywhere out of caution.
- **Consistent secret-masking convention**: every credential field (Google service key, Drive OAuth secret, SlipOK API key, LINE tokens) uses the same "show •••• if saved, clear to replace" pattern — the one piece of interaction vocabulary that survived every bolted-on integration panel intact.
- **The mapping help page** (`mapping/help/page.tsx`): numbered walkthrough, realistic UI mock, legend, FAQ, explicit warnings about irreversible steps. Best-designed single screen in the section and the template the other three integrations (LINE, Drive, SlipOK) should be following, not the exception.

## Priority Issues

**[P0] Off-palette accent colors contradict the project's own documented design system**
- **What**: Purple hero/tabs on the console (`page.tsx:1020-1029,1064`), a distinct green identity for the LINE tab (`page.tsx:1890-2242`), emerald as the "Plans" page identity (`plans/page.tsx:481-524`), teal as the "Tax Templates" identity — none of this per-page branding exists in DESIGN.md's blue/indigo/teal(functional)/emerald/amber/red tokens.
- **Why it matters**: The whole point of writing DESIGN.md was to stop exactly this — a Super Admin sees what feels like four different apps depending which tab they're on.
- **Fix**: Recolor console chrome to the documented blue/indigo pair; reserve emerald/amber/red strictly for status semantics; retire purple and green from this surface entirely.
- **Suggested command**: `/impeccable colorize`

**[P0] Loading states are spinners everywhere; DESIGN.md explicitly bans this**
- **What**: `animate-spin` is the only loading treatment across every file (`page.tsx:1040,1226,1487,1588`; `plans/page.tsx:507,567,731,836,931-941,1128,1292`; `mapping/page.tsx:247-253` full-page centered spinner). Zero `animate-pulse` skeletons exist anywhere in the section.
- **Why it matters**: DESIGN.md states this in plain Thai: use skeleton screens, not spinners. It's broken on every initial load in every file reviewed.
- **Fix**: Replace primary loading states with `animate-pulse` row/card skeletons shaped like the final layout; spinners can stay for small inline button feedback only.
- **Suggested command**: `/impeccable polish`

**[P1] Redundant data fetching — the same data is fetched 3× per page load, auth is re-checked 5×**
- **What**: This is my own finding, verified directly in the code, and it's the concrete shape of "รู้สึกว่ามีการดึงข้อมูลซ้อนกัน." On a single `/super-admin` page load with LINE configured, `loadData()` in `page.tsx` awaits four server actions **sequentially** (`getSuperAdminDataAction` → `getSystemSettingsAction` → `getSuperAdminLineSettingsAction` → then fires `loadLineQuota()`/`loadLineProfiles()`). Each of those five actions independently calls `getCurrentUserProfileAction()` (a full `auth.getUser()` + `profiles` table round trip) to re-verify the super_admin role — **5 separate auth checks for one page view**, none of them cached or shared. Worse: the single-row `super_admin_line_settings` table gets queried **three separate times** in the same load — once in `getSuperAdminLineSettingsAction` (all fields), again in `getSuperAdminLineQuotaAction` (`channel_access_token, quota_exceeded_behavior`), and a third time in `getSuperAdminLineProfilesAction` (`channel_access_token` again). `plans/page.tsx` has the same shape: `loadData`, `loadSubscriptionsData`, `loadCatalogPlans`, `loadHorsetQuota` are four independently-triggered loaders, each backed by an action that re-checks role from scratch.
- **Why it matters**: Every page visit pays for 5 auth round-trips and 3 fetches of one row that could be 1 fetch each — this is the literal cause of the sluggish, "stacked on top of each other" loading feel, and it compounds every time a new feature adds one more `loadX()` on top instead of extending an existing fetch.
- **Fix**: Add a single `getSuperAdminLineBootstrapAction()` that checks role once and returns settings + quota + profiles together (or at minimum, parallelize the existing sequential awaits with `Promise.all` and pass the already-fetched settings row into `loadLineQuota`/`loadLineProfiles` instead of having each refetch it). Same treatment for `plans/page.tsx`'s four independent loaders.
- **Suggested command**: `/impeccable optimize`

**[P1] Irreversible, high-stakes actions have no in-system confirmation or undo**
- **What**: Approving/rejecting a subscription payment is one click with no confirmation (`SaasPaymentReviewModal.tsx:228-243`); workspace/user deletion drops out of the styled UI into a native browser `confirm()` (`page.tsx:775,796`).
- **Why it matters**: These are the two most consequential action types in the entire surface (money and account access) — they currently get *less* friction than a routine refresh button.
- **Fix**: Add a styled two-step confirmation for payment approve/reject; replace native `confirm()` with an in-app modal stating what's affected before deleting; surface a brief "Undo" toast given the schema already supports soft delete.
- **Suggested command**: `/impeccable harden`

**[P2] Tables horizontal-scroll on mobile instead of collapsing to a card list**
- **What**: Subscriptions/Payments/Catalog tables (`plans/page.tsx:572,642,744`) and the Users table (`page.tsx:1270`) all wrap in `overflow-x-auto` rather than switching to a stacked card layout under the mobile breakpoint.
- **Why it matters**: This is one of the more concrete, checkable rules in the project's own DESIGN.md, and it's broken in every data table reviewed.
- **Fix**: Build a `<640px` card-list variant per table, reusing the same row data.
- **Suggested command**: `/impeccable layout`

## Persona Red Flags

**Alex (impatient power admin managing many workspaces)**
- No bulk select/delete/reassign anywhere — every operation is one row, one click (`page.tsx:1124-1198,1270-1363`; `plans/page.tsx:757-810`).
- Zero search/filter on the Subscriptions, Payments, and Catalog tables (`plans/page.tsx:572-627,642-707,744-811`) — only Workspaces and Users have a search box.
- No `Esc`-to-close or keyboard nav on any of the five modals.
- Refresh is manual and siloed per section — four separate refresh buttons across `plans/page.tsx` alone, no "sync everything," no staleness indicator.

**Sam (accessibility-dependent: keyboard, screen reader, contrast)**
- Focus rings are effectively removed (`focus:outline-none` + only a border-color change) — a weak indicator for keyboard-only navigation (`page.tsx:1117,1216,1409`).
- The notification toggle is a plain `<button>` with no `role="switch"`/`aria-checked` (`page.tsx:2189-2202`) — a screen reader announces "button," not on/off state.
- Icon-only controls (plan-active toggle, quota refresh) rely on `title` alone, not `aria-label`.
- Pastel-on-dark status badges (`bg-emerald-500/20 text-emerald-400`, `bg-amber-500/20 text-amber-400`) likely fail WCAG AA against the near-black backgrounds they sit on.
- None of the five modals declare `role="dialog"`/`aria-modal="true"` or manage initial focus.

## Minor Observations

- Typo sitting in the flashiest element on the page: "แผงควบคุม**ควบคุมควบคุม**ระบบสูงสุด" (`page.tsx:1025`).
- Inconsistent input types for equally sensitive secrets: LINE Channel Access Token is `type="text"` (`page.tsx:2016`) while SlipOK API Key is `type="password"` (`plans/page.tsx:909`).
- Tax-year placeholders mix Buddhist ("2569") and Gregorian ("2026") calendars in the same screen with no label clarifying which is expected (`tax-templates/page.tsx:312,358`).
- Dead markup: an empty hidden `<p>` tag (`page.tsx:1719-1720`).
- LINE settings lives buried as tab #5 inside the main console while Plans and Tax Templates each got a dedicated route — inconsistent IA for features of comparable complexity.
- Some icon-only touch targets shrink below the 44px minimum at the `md:` breakpoint (`p-3 md:p-1.5` pattern), landing in the touch-tablet gap.
- Undocumented inline hex `#fbbf24` in the tax-mapping picker (`mapping/page.tsx:446,471`) where the same file already uses the Tailwind `amber-500` token two lines away — pick one.

## Questions to Consider

1. If every page-specific accent color (purple, green, emerald, teal) were stripped and rebuilt with only DESIGN.md's blue/indigo tokens, would you still know which sub-page you're on — or was the per-page color quietly compensating for missing navigation, not adding brand value?
2. Alex's real job is managing *many* workspaces at once — what's the single most-repeated action (bulk plan changes? mass payment review?), and would a day spent on one bulk-action toolbar move "feels not pretty yet" further than another pass on gradients and glows?
3. The tax-mapping help page is the best-designed screen in this whole surface. What did it get right that the LINE/Drive/SlipOK setup panels — equally complex integrations — don't, and could that same template close the gap on all three?

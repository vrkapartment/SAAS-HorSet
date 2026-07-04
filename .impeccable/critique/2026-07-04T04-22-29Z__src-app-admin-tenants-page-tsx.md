---
target: src/app/(admin)/tenants/page.tsx
total_score: 31
p0_count: 1
p1_count: 1
timestamp: 2026-07-04T04-22-29Z
slug: src-app-admin-tenants-page-tsx
---
Method: dual-agent (A: 28f4b5e1-8542-4562-a094-24168409e29d · B: 2c721e30-358a-4fa9-8909-59e3641deb41)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | n/a |
| 2 | Match System / Real World | 4 | n/a |
| 3 | User Control and Freedom | 3 | Deleting an old tenant log is permanent and irreversible (though guarded by confirmation modal). |
| 4 | Consistency and Standards | 2 | Inconsistent visual weights (over-bolding) and mixed containers (blur `glass-panel` vs sharp borders). |
| 5 | Error Prevention | 3 | Date inputs lack validation in the Edit Modal (allows contractEnd to be before contractStart). |
| 6 | Recognition Rather Than Recall | 2 | Fragile CSV import date-prefix rules require admins to explicitly memorize or copy `'` characters. |
| 7 | Flexibility and Efficiency | 3 | Dual views (Grid vs Table) are solid, but lacking inline keyboard shortcuts or quick-filters limits power-users. |
| 8 | Aesthetic and Minimalist Design | 2 | Severe action button clutter in header (5 buttons), excessive tiny uppercase labels, and nested panels. |
| 9 | Error Recovery | 4 | Precision line-by-line CSV validation modal and guided troubleshooting manual are industry best practices. |
| 10 | Help and Documentation | 4 | Superb step-by-step SQL patch guides, template downloads, and dynamic privacy panels. |
| **Total** | | **31/40** | **Good** |

---

# Anti-Patterns Verdict

*   **LLM Assessment**: The page carries strong visual and logical layout structure, but retains several classic **AI Slop tells**:
    *   **Glassmorphism overload (`glass-panel`)**: Used decoratively for primary layout panels, creating unnecessary contrast strain.
    *   **Action button wall**: 5 secondary buttons crammed side-by-side in the top-right creates high decision friction.
    *   **Typography "Volume Fatigue"**: Pervasive `font-black` (900) and `font-extrabold` (800) weights on minor labels and button texts makes everything "shout".
    *   **Arbitrary hexes**: Inline `#FFAF00` color codes bypass design tokens.
    *   **Aggressive Thai name truncation**: Rigid `max-w-[180px]` clips Thai names, breaking identity recognition.

*   **Deterministic Scan (detect.mjs)**:
    *   Found **2 warnings of `ai-color-palette`** on line 1703 of `src/app/(admin)/tenants/page.tsx` for utilizing a generic `bg-gradient-to-r from-indigo-600 to-violet-600` gradient and corresponding hover states on the template guide modal's confirmation button.

*   **Visual Overlays**:
    *   No live browser-overlay presentation was performed; review was completed using source code parsing and CLI detector scanning.

---

# Overall Impression

The page's floor-by-floor physical grouping is brilliant and maps perfectly to a property manager's real-world mental model. However, the interface suffers from action button clutter in the header and visual stress caused by shouting typography weights. Consolidating CSV features and implementing responsive name containers represent the single biggest design opportunities to elevate the interface.

---

# What's Working

1.  **Floor-Based Grouping (Chunking)**: Structuring active tenants by physical building floors is highly intuitive and matches the real-world domain beautifully.
2.  **Guided Troubleshooting (Supabase Patch)**: The "Table tenants_old Not Found" placeholder acts as a masterclass in graceful error recovery by displaying precise, copyable SQL patch instructions.
3.  **Client-Side Compliance Masks (PDPA Toggle)**: The dynamic toggle to show/hide sensitive tenant telephone and Line ID info offers immediate privacy assurance during standard walk-throughs.

---

# Priority Issues (P0 - P3)

### 🚨 [P0] Name: Hardcoded Aggressive Truncation of Thai Names
*   **Why it matters**: Severe pixel-based truncation (`truncate max-w-[180px]`) cuts off long Thai names, hiding crucial identity data and requiring admins to open modals or hover just to read a name.
*   **Fix**: Remove the hardcoded width restriction and replace with flexible flexbox/grid layout handling.
*   **Suggested command**: `/impeccable typeset`

### ⚠️ [P1] Name: Wall of Action Buttons in Header
*   **Why it matters**: Cramming 5 secondary buttons side-by-side in the top right (Download CSV, Upload CSV, CSV Guide, PDPA, Refresh) scatters focus, raising cognitive load and decision time.
*   **Fix**: Consolidate CSV Actions into a single, cohesive "Manage CSV" dropdown button menu.
*   **Suggested command**: `/impeccable layout`

### ⚠️ [P2] Name: Overuse of Heavy Typographic Weights (Volume Fatigue)
*   **Why it matters**: Overusing `font-black` (900) and `font-extrabold` (800) across minor labels, badges, and modal inputs flattens visual hierarchy and tires the reader.
*   **Fix**: Standardize minor labels and input contents to `font-medium` or `font-normal`, reserving the heaviest weights purely for key stats and page headers.
*   **Suggested command**: `/impeccable typeset`

### ℹ️ [P3] Name: Non-Semantic Hardcoded Hex Colors
*   **Why it matters**: Raw `#FFAF00` hex codes bypass Tailwind's compiler and break dark mode adaptation.
*   **Fix**: Map highlight colors to semantic classes (`text-amber-500` or `dark:text-amber-400`).
*   **Suggested command**: `/impeccable colorize`

---

# Persona Red Flags

*   **Alex (The Impatient Power User)**: When Alex goes to edit room assignments, they are faced with a custom, unsearchable dropdown list containing 100+ rooms. Lacking keyword filtering, Alex must scroll through long lists manually, slowing down high-volume workflows.
*   **Jordan (The Confused First-Timer)**: Jordan prepares their Excel spreadsheet, but Excel strips the single quote prefix from date columns. Upon uploading, the strict format parser triggers intimidating syntax errors, forcing Jordan to fix Excel's quirks rather than the software parsing natural date strings gracefully.
*   **Sam (The Accessibility-Dependent Admin)**: Sam navigates the Edit Modal using keyboard tabbing. Because the Room Selection dropdown is built using custom button divs without ARIA listbox roles or arrow-key listeners, Sam cannot view, focus, or select rooms.

---

# Minor Observations

1.  **Hardcoded Workspace Cookie Fallbacks**: Having hardcoded development workspace UUIDs as fallbacks can route users to incorrect database spaces if cookies fail.
2.  **Date Order Vulnerability**: Users can set lease end dates before start dates in the edit modal without any UI warning or blocker.

---

# Questions to Consider

1.  *Can we eliminate the friction of Excel templates entirely?* An in-app datasheet grid editor could let admins copy-paste or edit rows directly with immediate validation.
2.  *Should historical tenants be siloed in a separate graveyard?* Unifying active and past leases under a single Tenant Profile would let admins see a cohesive move timeline.

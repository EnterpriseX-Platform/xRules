# xRules — next build round (starts 27 Nov 2026, 03:00)

Rawi, 26 Nov: "look at all of this, then start at 3 AM; also develop the UX/UI; build it all in this one round."
Rules that still apply: QA via Jenkins FactoryX/xrules first, check on screen, UAT (BB_UAT/xrules) only when Rawi says;
English UI; CUID ids; no native select / file picker; no guide lines under titles; no spinners; Carbon look (xRules on Carbon page).

## Positioning (from the Pega / FICO / IBM ODM comparison Rawi pasted)
- Pega: real-time next-best-action tied to workflow; adaptive models; expensive, lock-in.
- FICO: credit risk, scorecards, fraud, strongest analytics.
- IBM ODM: purest rule engine, business-language rules (Decision Center), most used in government (tax, welfare).
- xRules aims at: ODM-class business rules in plain words + FICO-style scorecards/calculation + Pega-style strategy
  and simulation, light to run (Rust + Postgres), self-hosted, strong for government (budget, eligibility).

## What to build (one round, in this order)
1. **"Topic" (เรื่อง) as the business unit** inside a project: groups its decisions (rules, calculations,
   strategy flow), its test cases, live results and approval state. Topic overview page with tabs, one business
   question each: Who qualifies → Calculate → Rank / allocate → Test → Simulate → Request approval.
   Business words for rule kinds: "Who qualifies" (decision table/sentences), "How much" (calculation),
   "Which one" (strategy).
2. **Calculations in terms**: formula builder picking terms and functions (sum, average, round, min, max, if);
   result becomes a new vocabulary term usable by other rules; per-item and whole-set (aggregate) results;
   computed results in sentence rules ("approved limit = monthly income × 10"); explanation shows the working.
3. **Strategy steps on the flow canvas**: Items (from a data set) → Filter (sentence condition) → Score (rule or
   model) → Rank (one visible formula with weight sliders) → Pick top N / allocate until a budget is used.
   Test run shows values on each box and "why filtered" per item.
4. **Simulation in business terms** on a data set: counts, money, reach; side-by-side current vs draft; attached
   to the approval review.
5. **Model health as a traffic light** on the Models page (plain sentence; AUC thresholds: <52 red, ≥70 good).
6. **Start from a description**: new Topic from a typed description → draft terms, rules and test cases (LLM if
   configured; otherwise a template list: loan approval, budget screening, eligibility).
7. **Role-based home**: business sees their topics, failing tests, data requests; approver sees reviews;
   developer sees data requests, API errors; layers/tabs hidden by role.
8. **"Request this data"**: from a sentence, ask for a missing term; developer inbox; meanwhile test with
   sample values.
9. **UX/UI pass across every page** using the xRules on Carbon page: one page header pattern, tables, empty
   states with a first action, panels, keyboard shortcuts (⌘K palette actions, ? sheet), English copy.
   Remaining items from the QA walk-through: Simulations explanation text and native date input,
   Monitor numbers, Versions duplicates, QA e2e junk data (ask before deleting).

## Done means
Each item on QA (Jenkins), walked on screen end to end with the budget example
(requests → filter → score → allocate within budget → simulate → approve), screenshots of key screens,
deck "xRules vs Pega" updated with the study + comparison slide, short report to Rawi in Thai.

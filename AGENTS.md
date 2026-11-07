<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Public customer actions (AI analysis, order submit) go only through server functions in `src/lib/orcaobra/public.functions.ts`; anonymous users have no table access. Why: protects customer contacts and enforces abuse limits server-side.
- Admin pages read/write via the browser client under RLS (`is_staff`/`has_role`); roles live only in `user_roles`, written never by the app. Why: no self-promotion.
- Pure business rules (limits, suggestion cap, masking, indicators) live in `src/lib/orcaobra/rules.ts` with tests beside it. Why: one tested source of truth.
- AI receives only order text/answers, built solely in `src/lib/orcaobra/ai-prompts.ts` with `maskContacts`, and may only pick reviewed+active rule ids. Why: privacy promises on /privacidade must stay testable; no invented products.
- Server logs never include raw database error details or customer fields; log codes only. Why: Postgres details can echo whole rows with contacts.
- Database triggers guard test classification changes, limit non-admin order updates to status/internal notes/follow-up dates (`guard_staff_request_update`, exception only for service_role), and invalidate reviewed rule content on edits. Why: browser controls cannot enforce authorization or approval invariants.
- Requested products and service descriptions are distinct; stored clarifications are the source for unanswered questions. Why: avoid invented line items and redundant AI calls.
- Abuse-limit origin ids are HMAC-SHA256 (`originId` in `rules.ts`) keyed by the `ORIGIN_HASH_SECRET` env secret, failing closed when it is missing. Why: an unkeyed IP hash can be reversed by guessing IPs.
- Deleting a real order goes only through `deleteQuoteRequest` in `src/lib/orcaobra/admin.functions.ts` (admin re-check, exact protocol, caller's RLS, cascades to child tables); never add automatic deletion. Why: irreversible action needs server-side authorization and explicit human confirmation.
- Fonts are self-hosted via `@fontsource` imports in `src/styles.css`; no third-party font CDNs. Why: visitor IPs must not reach Google.
- Orders are written only by the database function `submit_quote_request` (service_role only), called from `runSubmit` in `src/lib/orcaobra/submit.ts`; it accepts a closed field list, owns the per-origin submit limit under an advisory lock, and checks idempotent recovery (same key + content hash + origin, 24h) before the limit. Why: no partial orders, no race on the limit, retries never duplicate or leak orders. DB tests: `scripts/db-tests/` (rolled back).
- Phase-one store attribution uses nullable store foreign keys on rules and AI usage with temporary pilot defaults, while global settings and abuse logs stay global and child rows derive their store from the order; this does not provide store isolation. Why: preserve current writes without duplicating ownership or pretending global controls are per-store.

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
- AI receives only order text/answers (contacts masked) and may only pick reviewed+active rule ids. Why: privacy and no invented products.

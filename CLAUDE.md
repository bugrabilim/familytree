# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev            # Next.js dev server (writes/re-adds the AGENTS.md block)
npm run build          # production build — run before pushing; catches route/type errors
npm run lint           # eslint (flat config, eslint.config.mjs)
npm test               # runs every tests/*.test.mts, stops at first failure
npx tsc --noEmit       # typecheck (do this alongside build)

# single test file:
node --experimental-strip-types tests/<name>.test.mts
```

Tests are plain scripts (no framework): each file counts `ok/fail` and `process.exit(1)` on failure. Because they run under `node --experimental-strip-types`, a test's target lib may only use **type-only** `@/` imports (stripped at runtime) plus normally-resolvable packages (`nanoid`, `jose`). A lib with a runtime `@/…` value import cannot be unit-tested this way — keep testable domain logic dependency-light.

## Big picture

Turkish family-tree app. **Next.js 16 App Router** on Vercel. Read `AGENTS.md` — this Next version diverges from training data; consult `node_modules/next/dist/docs/` before writing framework code.

**Middleware lives in `proxy.ts`, not `middleware.ts`** — it wraps NextAuth `auth()`. It redirects unauthenticated non-public requests to `/login`; the public allow-list and the `Bearer`-token pass-through for `/api/*` are both there. Static-asset extensions and marketing/legal routes are public.

**Storage is layered.** Vercel Blob is the source of truth (`family-data-<treeId>.json`, `users.json`, per-founder registries) via `lib/blob.ts`. Supabase (`lib/db.ts`, dual-write mirror, migration "Faz 3" — see `docs/SUPABASE-GECIS.md`) is written best-effort but the app still reads from Blob. Cloudinary holds media (photos/video/audio). Locally, without Blob/Supabase env, most data routes error — full end-to-end flows need the real env.

**Auth & multi-tenancy.** NextAuth v5 credentials provider (`auth.ts`, family surname + password; verification logic is shared in `lib/credentials.ts`). A founder's `accountId` **is** their home `treeId`; founders can own multiple trees. `resolveActiveTree()` (`lib/tree-context.ts`) is the single entry every API route/server component uses to get `{ accountId, treeId, role, isFounder }` — it resolves the session from **either** the NextAuth cookie (web) **or** an `Authorization: Bearer` JWT (native mobile, `lib/mobile-token.ts`), and picks the active tree from the `soyagaci_tree` cookie or `x-tree-id` header. Adding Bearer support here means every existing route works for mobile with no per-route change.

**The privacy "view" layer is not optional.** `PrivacyContext` + `lib/privacy.ts` expose `view(person)` which returns a masked copy (living people / confidential records / field-level `privateFields` hidden). UI must render people through `view()` so hidden data never reaches the DOM; aggregates/maps/book/print all do this.

**Domain logic is framework-agnostic pure TS** in `lib/`: `relations` (kinship graph, Turkish relation naming, blood degrees), `tree-layout` (dagre + "union" nodes that keep couples adjacent), `date`, `name` (pre-1934 patronymic vs surname handling), `siblings`, `fan`, `roles`, `places` (equirectangular projection + gazetteer + `googleMapsUrl`). These are shared by the web UI and the native app.

**Views.** `app/tree/Workspace.tsx` is the client orchestrator holding all state; `TopBar` switches `ViewKey` tabs (`agac`/`soy`/`yelpaze`/`zaman`/`liste`/`harita`/`panel`) and opens the `kitap` book as a modal. The tree (`FamilyTree.tsx`) is React Flow (`@xyflow/react`) with a custom `PersonNode`; a `union` node type links spouses. `PedigreeView` (soy), `FanChart`, `PlacesMap`, `PanelView`, `BookView`, `PrintView` are the others. Person cards are portrait (avatar / name / birth year only) and get a rainbow background for LGBT+ people (`lib/identity.ts`).

**AI** (`lib/gemini.ts`, `lib/ai-*.ts`, `app/api/ai/*`) is optional (Gemini key); routes are editor-only, gated by `resolveActiveTree`, and rate-limited per account via `lib/rate-limit.ts`. Multimodal import accepts images/PDF/Excel/Word/text.

**Native mobile app** lives in `apps/mobile/` (Expo / React Native, its own toolchain and `package.json`). It is **excluded from the root `tsconfig` and eslint** (`"apps"`), so it never touches the web build. It talks to the same backend through `/api/mobile/login|register` (JWT) + `Bearer` on every call. See `docs/MOBIL-NATIVE-PLAN.md` and `apps/mobile/README.md`.

## Conventions that bite

- **i18n is always TR + EN.** Strings live in `lib/i18n-dict.ts` as two parallel objects; add both halves whenever you add a key (there's a standing rule and a test enforcing parity). UI reads via `useT()` (`lib/i18n.tsx`).
- **Adding a `Person` field** touches several places: `types/family.ts`, `components/PersonForm.tsx` (state + input + save payload), both API routes (`app/api/family/person/route.ts` POST and `app/api/family/person/[id]/route.ts` PUT — note PUT uses `?? existing`, so send `""`/`null` explicitly to allow clearing), and `PersonDrawer.tsx` for display.
- **Canonical site URL** comes from `lib/site.ts` (`NEXT_PUBLIC_SITE_URL` → Vercel prod → localhost); metadata/OG/sitemap/robots depend on it.
- **The demo account** (`DEMO_USER_ID` in `lib/demo-account.ts`, data in `lib/demo-data.ts`) is a public shared playground; `/` renders the landing unless a real (non-demo) session exists.
- Env reference and deploy steps: `.env.local.example`, `docs/LANSMAN-CHECKLIST.md`. Backups: `docs/YEDEKLEME.md` + `scripts/backup.mjs`.

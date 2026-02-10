# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal blog website (5km.studio) built with Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS. Uses Sanity CMS for content, PostgreSQL (Neon) + Drizzle ORM for data, Clerk v6 for auth, Upstash Redis for rate limiting, and Resend for email.

## Essential Commands

```bash
pnpm dev          # Start dev server (port 3000)
pnpm dev:turbo    # Dev with Turbo mode
pnpm build        # Production build
pnpm lint         # ESLint (uses simple-import-sort, unused-imports plugins)
pnpm db:generate  # Generate Drizzle migrations
pnpm db:push      # Push schema to Neon PostgreSQL
pnpm dev:email    # React Email dev server (port 3333)
```

No test framework is configured. Use `SKIP_ENV_VALIDATION=1` to skip env validation during builds without all env vars set.

## Architecture

### App Router Layout Groups

- `app/(main)/` — Public pages (blog, projects, guestbook, newsletters, about) with shared Header/Footer layout
- `app/(main)/(auth)/` — Clerk sign-in/sign-up pages
- `app/admin/` — Protected dashboard (requires `user.publicMetadata.siteOwner`), manages comments, newsletters, subscribers
- `app/studio/` — Sanity CMS Studio (excluded from middleware matcher)
- `app/api/` — API routes with rate limiting via Upstash Redis

### Path Alias

`~/` maps to project root (configured in tsconfig.json). All internal imports use `~/` prefix (e.g., `~/lib`, `~/components`, `~/db`).

### Content Pipeline

- **Blog posts & projects**: Managed in Sanity CMS, fetched via GROQ queries in `sanity/queries.ts`
- **Post types**: Defined in `sanity/schemas/` (post, project, category, blockContent, settings)
- **Settings singleton**: Site-wide config (projects list, hero photos, resume) stored as Sanity settings document
- **Rich text**: Rendered with `@portabletext/react`, custom components in `components/portable-text/`
- **Markdown import**: Post documents have "导入 Markdown" action in Studio. Conversion pipeline: Markdown → HTML (unified/remark/rehype) → Portable Text (`@portabletext/block-tools`). Supports GFM tables, fenced code blocks, LaTeX math, images. See `sanity/lib/markdownToPortableText.ts` and `sanity/plugins/importMarkdown.tsx`.

### Database Layer

- Schema: `db/schema.ts` — 4 tables: `subscribers`, `newsletters`, `comments`, `guestbook`
- Queries: `db/queries/` — Query functions used by API routes
- DTOs: `db/dto/` — Data transfer objects with Hashids encoding for public IDs
- Connection: `db/index.ts` — Neon serverless PostgreSQL

### Key Patterns

- **Env validation**: `env.mjs` uses Zod schemas, validates server/client env vars separately. Import `env` from `~/env.mjs`.
- **Rate limiting**: `lib/redis.ts` exports `ratelimit` and `redis` (Upstash). Used in all public API routes.
- **Email notifications**: React Email templates in `emails/`, sent via Resend for new comments/guestbook entries.
- **ID obfuscation**: Public-facing IDs use Hashids (`db/dto/`), not raw database IDs.
- **Animations**: Framer Motion used throughout for page transitions and UI interactions.
- **State**: Valtio for client-side global state, @tanstack/react-query v5 (`app/QueryProvider.tsx`) for server state.

### Middleware

`middleware.ts` runs Clerk `clerkMiddleware` with IP blocking and geo-tracking (Upstash Redis). Geo info read from `x-vercel-ip-*` headers (Next.js 15 removed `req.geo`/`req.ip`). IP obtained via `getIP()` helper from `~/lib/ip`. Public routes are explicitly listed via `createRouteMatcher`; all others require auth.

### ESLint Rules

- `simple-import-sort/imports`: **error** — imports must be auto-sorted
- `unused-imports/no-unused-imports`: **error** — no unused imports allowed
- `@typescript-eslint/consistent-type-imports`: **warn** — use `type` keyword for type-only imports
- `strict: false` in tsconfig

### Deployment

- Vercel deployment with Turbo build support
- Social media redirects configured in `next.config.mjs`
- RSS feed available at `/feed`, `/rss`, `/rss.xml` (all rewrite to `/feed.xml`)

## Environment Variables

All required vars are in `.env.example`. Key services: Clerk (auth), Neon (DB), Sanity (CMS), Resend (email), Upstash (Redis/rate-limit).

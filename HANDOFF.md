# BrawlBox — Architecture & Handoff

> Written 2026-05-31. Living doc for the frontend/backend split, cloud infra, and the brawlbox.gg domain. Read this first in any new session that touches infra, repos, or deployment.

## 0. TL;DR — where we are

- **Product**: `ftg` (working name) → **BrawlBox**, a browser-native 2D fighting game + AI-assisted character creator. Engine (phase 1) is complete and rollback-ready. Creator (phase 2) is mid-build.
- **This session's decision**: split the monorepo into **`brawlbox-web`** (frontend) and **`brawlbox-api`** (backend), host the frontend on **Cloudflare Pages**, build the backend as **AWS serverless**, and put the app on **brawlbox.gg**.
- **Domain**: Cloudflare zone for `brawlbox.gg` already exists, status **pending** — waiting on a GoDaddy nameserver change (see §6). Then it auto-activates.
- **Not yet done**: the actual repo split, any AWS resource creation, the backend code. This doc is the plan; next session executes it.

## 1. Current codebase state (what becomes the frontend)

Single repo `github.com/ada-powerful/ftg`, branch `main`. Stack: TS strict, Vite 6, PixiJS 8, React 19, Tailwind v4 + shadcn, Zod, Vitest, bun. 166 tests green; `typecheck`, `test`, `build` all pass.

- `src/engine/` — pure deterministic simulation (no DOM/pixi). **Runs in the browser; stays in the frontend.**
- `src/render`, `src/input`, `src/runtime`, `src/game` — Pixi rendering + loop + `mountGame`.
- `src/creator/` — React creator UI (key entry, prompt → character, sprite gen, playtest, IndexedDB).
- `src/ai/` — BYOK provider clients: `llm.ts`/`openai.ts` (character JSON), `image.ts` (gpt-image per-frame), `fal.ts` (nano-banana-2 template retexture), `keystore.ts`. **These move behind the backend proxy over time (§5).**
- `src/components/`, `characters/` — shadcn UI, base character + atlas.
- M2.2 sprite pipeline is mid-pivot: from per-frame gpt-image → **template retexturing via fal nano-banana-2/edit** (`fal.ts` done + verified; `detectFrames.ts` done). See project memory + `PHASE_2_PLAN.md`. Remaining: template manifest, sheet slicing, reference upload/gen, App rewire.

## 2. Repo split plan

| Repo | Contents | Host | CI |
|---|---|---|---|
| **brawlbox-web** | current `ftg` minus nothing structural — engine, render, input, runtime, game, creator, ai (clients), components, characters. Rebrand `ftg`→BrawlBox. | Cloudflare Pages | existing GH Actions (typecheck/test/build) |
| **brawlbox-api** | NEW. AWS serverless backend: auth, secrets/provider proxy, character storage + sharing, preset template serving. | AWS (us-west-2) | GH Actions → CDK deploy |
| **brawlbox-shared** (optional) | the `Character` Zod schema + shared types, consumed by both. Start by copying `engine/schema.ts`; promote to a package only if drift hurts. | npm/git | — |

Mechanics: the simplest path is **rename `ftg` → `brawlbox-web`** (GitHub repo rename keeps history + remote redirects), then create an empty **`brawlbox-api`** under `ada-powerful`. The engine does NOT move — it's browser code. "Splitting the scope" = the backend is a brand-new codebase, not extracted from existing files.

## 3. Frontend — Cloudflare Pages

- Connect `brawlbox-web` GitHub repo to a Cloudflare Pages project (Cloudflare dash → Workers & Pages → Create → Pages → connect repo). Build command `bun run build`, output dir `dist/`, build system v2 (bun supported).
- Custom domains: `brawlbox.gg` + `www.brawlbox.gg` → the Pages project (Cloudflare auto-creates the DNS once the zone is active — §6).
- Env vars (Pages project settings): `VITE_API_BASE_URL=https://api.brawlbox.gg`. Once the proxy lands, **drop client-side provider keys** — no more `OPENAI_API_KEY`/`FAL_API_Key` in the browser. Until then BYOK still works (`getEnvKey`/key card).

## 4. Backend — AWS serverless (`brawlbox-api`)

**AWS account: `tintin-prod` → 180970910446. Region: `us-west-2` (override the profile's ap-northeast-1 default; always pass `--region us-west-2`).**

```
aws sts get-caller-identity --profile tintin-prod            # 180970910446
aws <svc> ... --profile tintin-prod --region us-west-2
```

Architecture (serverless):

- **API Gateway (HTTP API)** → **Lambda** (Node 20 / TS; one router lambda with Hono, or per-route). Routes:
  - `POST /generate/character` — LLM proxy (OpenAI), Zod-validated, retry loop server-side.
  - `POST /generate/sprites` — fal nano-banana-2 proxy: template + reference → sheet (keys live server-side).
  - `GET /templates` — list/serve preset action templates + frame manifests.
  - `GET/POST/DELETE /characters` — user character CRUD + sharing/gallery.
- **DynamoDB**: `characters` (pk=`userId`, sk=`characterId`), `users` (profile), optional `shares`/gallery GSI.
- **S3**: bucket(s) for atlases, generated sheets, and preset template sheets (template art lives here, NOT in git — copyright). Optionally fronted by CloudFront.
- **Secrets Manager**: `brawlbox/openai` + `brawlbox/fal` provider keys (migrated out of `.env`). Lambda reads at cold start, caches.
- **Cognito** (auth) — see §5.
- **IaC: AWS CDK (TypeScript)** — matches the stack; `cdk bootstrap aws://180970910446/us-west-2 --profile tintin-prod` first. (Terraform is the alternative; CDK recommended for TS parity.)

## 5. Auth — Cognito + Google + Facebook

- **Cognito User Pool** with hosted UI (or custom screens) + an App Client for the SPA (PKCE).
- Federated identity providers: **Google** and **Facebook**. Requires OAuth apps the user must create:
  - Google Cloud Console → OAuth 2.0 client (web). Authorized redirect: the Cognito hosted-UI callback (`https://<domain>.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`). Note client id/secret.
  - Facebook Developers → app → Facebook Login → valid OAuth redirect = same Cognito callback. Note app id/secret.
- Frontend uses Cognito tokens (JWT) as `Authorization: Bearer` to the API; API Gateway JWT authorizer validates.
- **`ai/` migration**: today the browser calls OpenAI/fal directly (BYOK). Post-auth, the browser calls `brawlbox-api` with its Cognito token; the lambda holds the provider keys. Keep BYOK as a fallback/dev path behind a flag.

## 6. Domain & DNS — brawlbox.gg (Cloudflare)

**Status: Cloudflare zone exists, `pending`.** Cloudflare account id + API token are in `.env` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`). Token is active; it can read zones + edit DNS but **cannot create zones** (zone already created, so fine).

Assigned Cloudflare nameservers:
- `shaz.ns.cloudflare.com`
- `yichun.ns.cloudflare.com`

**ACTION REQUIRED (user, at GoDaddy):**
1. GoDaddy → My Products → **brawlbox.gg** → **Manage DNS** (or Domain Settings → Nameservers).
2. Nameservers → **Change** → **"I'll use my own nameservers"**.
3. Replace GoDaddy's NS with the two Cloudflare NS above. Save.
4. Propagation: usually <1h (up to 48h). Cloudflare auto-flips the zone `pending → active`.

**Validate (any session):**
```
dig +short NS brawlbox.gg                 # expect shaz/yichun.ns.cloudflare.com
CF=$(grep -E '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2-)
curl -s "https://api.cloudflare.com/client/v4/zones?name=brawlbox.gg" \
  -H "Authorization: Bearer $CF" | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['status'])"
```

**DNS records (after active):**
- `brawlbox.gg` + `www` → created automatically when the Cloudflare Pages custom domain is attached (§3).
- `api.brawlbox.gg` → CNAME to the API Gateway custom-domain target (set up with §4; needs an ACM cert — regional cert in us-west-2 for a regional API Gateway custom domain).

## 7. Credentials inventory

| Secret | Today | Target |
|---|---|---|
| `OPENAI_API_KEY` | `.env` (gitignored), browser via Vite `envPrefix` (dev-only) | AWS Secrets Manager `brawlbox/openai` |
| `FAL_API_Key` | `.env` (note odd casing) | Secrets Manager `brawlbox/fal` |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `.env` | CI secret / local only |
| AWS | `~/.aws` profile `tintin-prod` | CI via OIDC role (GitHub → AWS) |
| Google / Facebook OAuth | not yet created | Cognito IdP config + Secrets Manager |

`.env` is gitignored and must never be committed. Long-term, only the frontend's `VITE_API_BASE_URL` is public.

## 8. Next-session task list (priority order)

1. **Finish the GoDaddy NS change** (user) and confirm `brawlbox.gg` is Active in Cloudflare.
2. **Repo split**: rename `ftg` → `brawlbox-web`; rebrand strings; create empty `ada-powerful/brawlbox-api`.
3. **Cloudflare Pages**: connect `brawlbox-web`, deploy, attach `brawlbox.gg` + `www`. Confirm the live site.
4. **brawlbox-api scaffold**: CDK app (`cdk bootstrap` first), HTTP API + a health lambda, deploy to us-west-2, custom domain `api.brawlbox.gg` (ACM cert + Cloudflare CNAME).
5. **Secrets proxy**: move OpenAI + fal keys to Secrets Manager; implement `/generate/character` + `/generate/sprites`; point the frontend `ai/` clients at the API (keep BYOK behind a flag).
6. **Cognito auth**: user pool + Google + Facebook IdPs (create the OAuth apps), JWT authorizer on the API, login UI in the frontend.
7. **Storage/sharing**: DynamoDB `characters` + S3 atlases; `/characters` CRUD; migrate creator persistence from IndexedDB → API (IndexedDB becomes an offline cache).
8. **Resume M2.2**: template manifest + sheet slicing + reference upload/gen + App rewire (now calling the fal proxy). See `PHASE_2_PLAN.md` / project memory.

## 9. Open decisions / notes

- IaC tool: **CDK (TS)** recommended; confirm vs Terraform before scaffolding.
- Shared `Character` schema: copy first, package later if it drifts.
- Cloudflare ↔ API Gateway: decide proxied (orange) vs DNS-only (grey) for `api.` — start DNS-only to avoid double-proxy/cert friction.
- Region pinned **us-west-2** for all BrawlBox resources despite `tintin-prod`'s ap-northeast-1 default.
- Cost posture: serverless scales to zero; main standing costs are Route-less (DynamoDB on-demand, S3, Cognito MAU free tier). No always-on compute.
- Copyright: preset MUGEN template sheets live in **S3**, never in git.

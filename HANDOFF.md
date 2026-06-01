# BrawlBox — Architecture & Handoff

> Written 2026-05-31. Living doc for the frontend/backend split, cloud infra, and the brawlbox.gg domain. Read this first in any new session that touches infra, repos, or deployment.

## 0. TL;DR — where we are

- **Product**: `ftg` (working name) → **BrawlBox**, a browser-native 2D fighting game + AI-assisted character creator. Engine (phase 1) is complete and rollback-ready. Creator (phase 2) is mid-build.
- **This session's decision**: split the monorepo into **`brawlbox-web`** (frontend, Cloudflare Pages), **`brawlbox-api`** (AWS serverless backend), and **`brawlbox-infra`** (**Terraform** for all AWS resources). CI/CD via GitHub Actions on every repo (AWS auth through GitHub OIDC, no static keys). App lives on **brawlbox.gg**.
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

| Repo                           | Contents                                                                                                                                                                                            | Host             | CI/CD                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| **brawlbox-web**               | current `ftg` minus nothing structural — engine, render, input, runtime, game, creator, ai (clients), components, characters. Rebrand `ftg`→BrawlBox.                                               | Cloudflare Pages | GH Actions: typecheck/test/build → Cloudflare Pages deploy                          |
| **brawlbox-api**               | NEW. App code for the serverless backend: Lambda handlers (auth, secrets/provider proxy, character storage + sharing, preset template serving).                                                     | AWS (us-west-2)  | GH Actions: build/test → upload Lambda artifact to S3 → trigger infra apply         |
| **brawlbox-infra**             | NEW. **Terraform** for ALL AWS resources (Cognito, API Gateway, Lambda wiring, DynamoDB, S3, Secrets Manager, ACM, IAM + GitHub OIDC roles) + remote state. Single source of truth for cloud infra. | AWS (us-west-2)  | GH Actions: `terraform plan` on PR, `terraform apply` on main (OIDC, env-protected) |
| **brawlbox-shared** (optional) | the `Character` Zod schema + shared types, consumed by web + api. Start by copying `engine/schema.ts`; promote to a package only if drift hurts.                                                    | npm/git          | —                                                                                   |

Mechanics: **rename `ftg` → `brawlbox-web`** (GitHub repo rename keeps history + remote redirects), then create empty **`brawlbox-api`** and **`brawlbox-infra`** under `ada-powerful`. The engine does NOT move — it's browser code. "Splitting the scope" = the backend + infra are brand-new codebases, not extracted from existing files.

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
- **IaC: Terraform**, all of it in `brawlbox-infra` (§8). Remote state in S3 + DynamoDB lock (one-time bootstrap below). Lambda code is built in `brawlbox-api`, published as a versioned artifact to an S3 bucket, and referenced by Terraform.

## 5. Auth — Cognito + Google + Facebook

- **Cognito User Pool** with hosted UI (or custom screens) + an App Client for the SPA (PKCE).
- Federated identity providers: **Google** and **Facebook**. Requires OAuth apps the user must create:
  - Google Cloud Console → OAuth 2.0 client (web). Authorized redirect: the Cognito hosted-UI callback (`https://<domain>.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`). Note client id/secret.
  - Facebook Developers → app → Facebook Login → valid OAuth redirect = same Cognito callback. Note app id/secret.
- Frontend uses Cognito tokens (JWT) as `Authorization: Bearer` to the API; API Gateway JWT authorizer validates.
- **`ai/` migration**: today the browser calls OpenAI/fal directly (BYOK). Post-auth, the browser calls `brawlbox-api` with its Cognito token; the lambda holds the provider keys. Keep BYOK as a fallback/dev path behind a flag.

### Creating the Google & Facebook OAuth apps (USER ACTION)

Both need the **Cognito hosted-UI callback** URL. Pick a Cognito domain prefix (e.g. `brawlbox`) so the callback is:
`https://brawlbox.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`
(Decide the prefix in Terraform first, or use the default `*.auth.us-west-2.amazoncognito.com`. The same value goes into both providers below.)

**Google** (console.cloud.google.com):

1. Create/select a project → **APIs & Services → OAuth consent screen** → External → fill app name, support email, `brawlbox.gg` as authorized domain.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized JavaScript origins: `https://brawlbox.gg`. Authorized redirect URI: the Cognito `…/oauth2/idpresponse` URL above.
4. Save the **Client ID** + **Client secret** → into Terraform var / Secrets Manager (`brawlbox/google-oauth`).

**Facebook** (developers.facebook.com):

1. **Create App** → type "Consumer" → add the **Facebook Login** product.
2. Facebook Login → Settings → **Valid OAuth Redirect URIs**: the Cognito `…/oauth2/idpresponse` URL.
3. App domains: `brawlbox.gg`. Set the app **Live** (not Dev) before public use.
4. From Settings → Basic, save **App ID** + **App Secret** → Terraform var / Secrets Manager (`brawlbox/facebook-oauth`).

Then in `brawlbox-infra`: add both as Cognito User Pool Identity Providers (`google`, `facebook`), map email/name attributes, and enable them on the SPA app client. Cognito federation needs `email` scope from both.

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

| Secret                                           | Today                                                        | Target                                |
| ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------- |
| `OPENAI_API_KEY`                                 | `.env` (gitignored), browser via Vite `envPrefix` (dev-only) | AWS Secrets Manager `brawlbox/openai` |
| `FAL_API_Key`                                    | `.env` (note odd casing)                                     | Secrets Manager `brawlbox/fal`        |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `.env`                                                       | CI secret / local only                |
| AWS                                              | `~/.aws` profile `tintin-prod`                               | CI via OIDC role (GitHub → AWS)       |
| Google / Facebook OAuth                          | not yet created                                              | Cognito IdP config + Secrets Manager  |

`.env` is gitignored and must never be committed. Long-term, only the frontend's `VITE_API_BASE_URL` is public.

## 8. CI/CD & IaC (GitHub Actions + Terraform)

**Auth to AWS uses GitHub OIDC — no long-lived AWS keys in GitHub.** `brawlbox-infra` provisions an IAM OIDC provider for `token.actions.githubusercontent.com` and per-repo roles scoped by `sub` (repo + branch). Workflows assume the role via `aws-actions/configure-aws-credentials` with `role-to-assume`.

**Terraform remote state (one-time bootstrap).** Chicken-and-egg: the state backend can't be in the state it stores. Bootstrap once with local state (or a tiny `bootstrap/` config):

```
# in brawlbox-infra, region us-west-2, profile tintin-prod
aws s3api create-bucket --bucket brawlbox-tfstate-180970910446 \
  --region us-west-2 --create-bucket-configuration LocationConstraint=us-west-2 --profile tintin-prod
aws s3api put-bucket-versioning --bucket brawlbox-tfstate-180970910446 \
  --versioning-configuration Status=Enabled --profile tintin-prod
aws dynamodb create-table --table-name brawlbox-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST \
  --region us-west-2 --profile tintin-prod
```

Then `terraform { backend "s3" { bucket=… key="brawlbox/terraform.tfstate" region="us-west-2" dynamodb_table="brawlbox-tflock" } }`.

**`brawlbox-infra` layout** (suggested):

```
brawlbox-infra/
  backend.tf              # S3 remote state + lock
  providers.tf            # aws region us-west-2
  variables.tf  outputs.tf
  github_oidc.tf          # OIDC provider + roles for web/api/infra repos
  modules/
    cognito/      # user pool, google+facebook IdPs, app client, hosted domain
    api/          # HTTP API Gateway, JWT authorizer, custom domain api.brawlbox.gg, ACM
    lambdas/      # functions referencing the artifact in S3 by version
    data/         # DynamoDB (characters, users), S3 (assets, templates, artifacts)
    secrets/      # Secrets Manager: openai, fal, google-oauth, facebook-oauth
  envs/prod/      # composition + tfvars
```

**Workflows (GitHub Actions), one per repo:**

- **brawlbox-web** — `bun install && bun run typecheck && bun run test && bun run build`, then deploy to Cloudflare Pages. Easiest is Pages' native Git integration (auto-build on push); or `cloudflare/pages-action` using repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- **brawlbox-api** — build/test Lambda, zip, `aws s3 cp` the artifact to the artifact bucket with a version key, then trigger infra (`peter-evans/repository-dispatch` → infra `apply`, or bump a `lambda_version` tfvar via PR). Assumes the `brawlbox-api` OIDC role.
- **brawlbox-infra** — on PR: `terraform fmt -check`, `init`, `validate`, `plan` (comment plan). On `main`: `terraform apply` gated by a protected GitHub Environment (manual approval). Assumes the `brawlbox-infra` OIDC role.

Skeleton (infra apply job):

```yaml
permissions: { id-token: write, contents: read }
jobs:
  apply:
    runs-on: ubuntu-latest
    environment: prod            # require reviewers
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: ${{ secrets.AWS_INFRA_ROLE_ARN }}, aws-region: us-west-2 }
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init && terraform apply -auto-approve
```

## 9. Next-session task list (priority order)

1. **Finish the GoDaddy NS change** (user) and confirm `brawlbox.gg` is Active in Cloudflare.
2. ✅ **DONE (2026-05-31)** **Repos** (all **private**). GitHub `ftg` renamed → `ada-powerful/brawlbox-web` (history + redirects kept; local `origin` updated; local dir stays `/home/tq/repos/ftg`). Created empty `ada-powerful/brawlbox-api`, and `ada-powerful/brawlbox-infra` (infra scaffold pushed, default branch `main`). User-facing strings rebranded `ftg`→BrawlBox (title, `package.json` name, creator header, system prompt, base char author). **Left intentionally**: localStorage key `ftg.apiKey.openai` + IndexedDB name `ftg` (renaming orphans users' saved key/characters); internal `FtgDB` type + historical doc references. GH Actions secrets set: `AWS_INFRA_ROLE_ARN` (brawlbox-infra), `AWS_API_ROLE_ARN` (brawlbox-api); `prod` env created but **can't enforce required reviewers on the free plan** → infra `apply` switched to manual `workflow_dispatch` as the gate.
3. ✅ **DONE (2026-06-01)** **Cloudflare Pages** — zone went **active** (GoDaddy NS change propagated). Created a **direct-upload** Pages project `brawlbox-web` (native GitHub OAuth connect isn't doable headless, so we use the documented Actions-deploy fallback). `dist/` deployed → `brawlbox-web.pages.dev` (HTTP 200, title "BrawlBox — character creator", confirming the rebrand). Web CI/CD: `.github/workflows/deploy.yml` (typecheck/test/build → `wrangler pages deploy` via `cloudflare/wrangler-action`) — **verified green** on push to main using repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Custom domains: created proxied CNAMEs `brawlbox.gg` + `www` → `brawlbox-web.pages.dev`; attached **`brawlbox.gg`** to the project (cert provisioning via Google CA). **`www.brawlbox.gg` attach keeps failing with Cloudflare error 8000000** (apex succeeded with the identical setup — looks like a CF-side transient/subdomain quirk); retry the attach (DNS CNAME already in place) or add a www→apex redirect rule. Now that the zone is active, **task #5's `api.brawlbox.gg` is also unblockable** (flip `enable_api_custom_domain=true`).
4. ✅ **DONE (2026-05-31)** **Terraform bootstrap**. State bucket `brawlbox-tfstate-180970910446` (versioned, encrypted, public-access blocked) + `brawlbox-tflock` DynamoDB lock created via CLI. `brawlbox-infra` Terraform scaffolded **locally at `/home/tq/repos/brawlbox-infra`** (git-initialized, 1 commit, **not yet pushed** — needs the empty GitHub repo from task #2) and applied. Created OIDC deploy roles:
   - `arn:aws:iam::180970910446:role/brawlbox-infra-deploy` (AdministratorAccess) → GH secret `AWS_INFRA_ROLE_ARN`
   - `arn:aws:iam::180970910446:role/brawlbox-api-deploy` (S3 writes to `brawlbox-artifacts-180970910446`) → GH secret `AWS_API_ROLE_ARN`
   - The GitHub OIDC **provider already existed** account-wide; it's referenced as a data source, not created. `brawlbox-web` has no AWS role (Cloudflare-only).
   - Infra `plan`(PR)/`apply`(main, protected `prod` env) workflow committed. Remaining: push the repo (task #2), set the two GH secrets, create the `prod` environment.
5. ✅ **DONE (2026-05-31)** **brawlbox-api + infra scaffold**. `brawlbox-api`: Hono router Lambda, `/health` live + generation/templates/characters routes stubbed 501; ESM bundle (`bun build`, Node 20) → `dist/lambda.zip`; `deploy.yml` OIDC-uploads `lambda/api-<sha>.zip` to the artifact bucket on push to main. Infra modules `data` (artifact bucket `brawlbox-artifacts-180970910446`, versioned/encrypted/private), `lambdas` (fn `brawlbox-api`, nodejs20.x, code from S3 key `var.lambda_artifact_key`), `api` (HTTP API GW, `$default`→Lambda). **Live & verified**: `https://7hlhhmx1sl.execute-api.us-west-2.amazonaws.com/health` → 200. **Custom domain `api.brawlbox.gg` is gated OFF** (`enable_api_custom_domain=false`) — DNS-blocked; ACM cert + APIGW domain + mapping + validation/target outputs are coded and ready. **Rollout model**: CI publishes `lambda/api-<sha>.zip`; bump `lambda_artifact_key` in infra + run the `apply` workflow (workflow_dispatch). First deploy used a two-phase apply (`-target=module.data` → upload `api-bootstrap.zip` → full apply).
6. ⏳ **PARTLY DONE (2026-06-01)** **Secrets proxy** — character generation done, sprites pending. `POST /generate/character` is live: builds the prompt + runs the Zod-feedback retry loop server-side, OpenAI key from Secrets Manager `brawlbox/openai` (value set via CLI, never in TF). Schema + prompt copied into brawlbox-api (copy-first decision). Frontend: `src/ai/backend.ts` + `VITE_API_BASE_URL` → backend mode (no client key for character gen; key card now sprite-only). **Deployed & verified**: brawlbox.gg generates via backend, CORS OK, ~47s/gen. **Key infra finding**: synchronous LLM gen exceeds API Gateway's hard 30s cap (even gpt-4o-mini ~50s), so generation uses a **Lambda Function URL** (`https://qke5v7s6olia2j6q4tqm5xig4q0kzswz.lambda-url.us-west-2.on.aws`, 120s timeout, native CORS); API GW (30s) stays for fast routes + the future custom domain. Model is gpt-4o-mini (env `OPENAI_MODEL`). **Still TODO**: (a) `/generate/sprites` — fal proxy needs the FAL key (NOT in `.env`) + async job infra (sequential image calls blow even 120s); sprite gen is **still client-side BYOK** for now. (b) Real auth (Cognito, task #7) — generation endpoint is currently unauthenticated, guarded only by stage throttling + CORS. (c) Long gen UX (~47s) — consider streaming/progress.
7. **Cognito auth**: user pool + Google + Facebook IdPs (create the OAuth apps per §5), JWT authorizer on the API, login UI in the frontend.
8. **Storage/sharing**: DynamoDB `characters` + S3 atlases; `/characters` CRUD; migrate creator persistence from IndexedDB → API (IndexedDB becomes an offline cache).
9. **Resume M2.2**: template manifest + sheet slicing + reference upload/gen + App rewire (now calling the fal proxy). See `PHASE_2_PLAN.md` / project memory.

## 10. Open decisions / notes

- **IaC tool: Terraform** (decided), all in `brawlbox-infra`. Remote state in S3 + DynamoDB lock.
- Lambda deploy handoff: api repo uploads a versioned artifact to S3; infra references it. Decide trigger mechanism (repository_dispatch vs tfvar bump) when wiring §8.
- Shared `Character` schema: copy first, package later if it drifts.
- Cloudflare ↔ API Gateway: decide proxied (orange) vs DNS-only (grey) for `api.` — start DNS-only to avoid double-proxy/cert friction.
- Region pinned **us-west-2** for all BrawlBox resources despite `tintin-prod`'s ap-northeast-1 default.
- Cost posture: serverless scales to zero; main standing costs are Route-less (DynamoDB on-demand, S3, Cognito MAU free tier). No always-on compute.
- Copyright: preset MUGEN template sheets live in **S3**, never in git.

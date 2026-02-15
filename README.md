# Telegram Ads Marketplace

A decentralized advertising marketplace built as a **Telegram Mini App**. Connects advertisers with Telegram channel owners for transparent, escrow-protected ad placements — powered by TON blockchain payments.

**Live Demo:** [@devsproutfolders_bot](https://t.me/devsproutfolders_bot)
**Domain:** [sproutfolders.com](https://sproutfolders.com)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Key Design Decisions](#key-design-decisions)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [AI Disclosure](#ai-disclosure)

---

## Features

### For Channel Owners
- **List channels** on the marketplace with pricing, categories, and ad format settings
- **Browse advertiser briefs** — search, filter by category/language, sort by budget
- **Apply to campaigns** with proposed pricing and cover letter
- **Content approval flow** — submit ad drafts, handle revision requests
- **Automated ad posting** via bot (channel admin integration)
- **Channel verification** via MTProto — real subscriber stats from Telegram API
- **Reviews & ratings** from advertisers after completed deals
- **Folder listings** — create and monetize Telegram folder collections

### For Advertisers
- **Create campaigns** with budgets, targeting (categories, languages), and public briefs
- **Browse channels** with filters (subscribers, price, language, category)
- **Create deals** directly or receive applications from channel owners
- **Content approval** — review drafts before publication
- **Escrow protection** — funds locked until ad is verified as posted
- **Dispute resolution** with admin mediation and appeal system
- **Budget tracking** with low-budget notifications

### Platform
- **TON wallet integration** — deposits, withdrawals, escrow via TON Connect
- **Automated escrow release** — funds released after 48h verification period
- **Post verification** — bot checks that ads remain published before releasing funds
- **Multi-language UI** — English and Russian
- **Telegram notifications** — real-time updates via bot messages
- **Admin moderation panel** — approve channels/folders, resolve disputes, handle appeals
- **Role-based access** — users, moderators, admins

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Telegram Users                        │
│              (Mini App in Telegram WebView)                │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼─────────────────────────────────┐
│                    Nginx (Reverse Proxy)                   │
│         TLS termination · Rate limiting · Static files     │
├───────────┬──────────────────┬────────────────────────────┤
│  Static   │   /api/v1/*      │    /storage/*               │
│  React    │   (proxy)        │    (MinIO proxy)            │
│  SPA      │                  │                             │
└───────────┼──────────────────┼────────────────────────────┘
            │                  │
┌───────────▼──────────┐  ┌───▼──────────┐
│   NestJS API Server  │  │    MinIO      │
│   (REST + Auth +     │  │  (S3 storage) │
│    Business Logic)   │  └──────────────┘
└───┬──────┬───────────┘
    │      │
    │   ┌──▼─────────────┐   ┌─────────────────────┐
    │   │   PostgreSQL    │   │    Redis + BullMQ    │
    │   │   (Prisma ORM)  │   │    (Job Queues)      │
    │   └────────────────┘   └──────┬──────────────┘
    │                               │
┌───▼───────────┐  ┌───────────────▼──────────────────┐
│  Grammy Bot   │  │        Background Workers         │
│  (/start +    │  │  ┌─────────────────────────────┐  │
│   WebApp      │  │  │ Notification Processor      │  │
│   launcher)   │  │  │ Escrow Release Scheduler    │  │
│               │  │  │ Deposit Watcher (TON)       │  │
└───────────────┘  │  │ Withdrawal Processor (TON)  │  │
                   │  │ Post Scheduler              │  │
                   │  └─────────────────────────────┘  │
                   └───────────────┬───────────────────┘
                                   │
                   ┌───────────────▼───────────────────┐
                   │       MTProto Worker               │
                   │  (Telegram API via user session)    │
                   │  Channel stats · Folder sync ·     │
                   │  Auto-posting · Post verification   │
                   └───────────────────────────────────┘
```

### Data Flow — Deal Lifecycle

```
Advertiser creates deal → PENDING
  ↓ Channel owner approves
Funds locked in escrow → CONTENT_PENDING
  ↓ Channel owner submits draft
Draft review → CONTENT_SUBMITTED
  ↓ Advertiser approves content
Ad posted to channel → POSTED
  ↓ 48h verification passes (bot verifies post exists)
Funds released → RELEASED
```

If at any point something goes wrong, either party can open a **DISPUTE**, which is resolved by an admin. Both parties can **APPEAL** admin decisions within 48 hours.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| **State** | TanStack Query (server), Zustand (client) |
| **Telegram SDK** | @telegram-apps/sdk-react, TON Connect UI |
| **API** | NestJS 10, class-validator, Swagger |
| **Auth** | Telegram WebApp HMAC-SHA256 validation, JWT |
| **Database** | PostgreSQL 16, Prisma ORM |
| **Queue** | Redis 7, BullMQ |
| **Bot** | Grammy 1.21 |
| **Telegram API** | telegram (MTProto), grammy |
| **Blockchain** | TON (@ton/core, @ton/crypto) |
| **Storage** | MinIO (S3-compatible) |
| **Build** | Turborepo, pnpm workspaces |
| **Deploy** | Docker Compose, Nginx, Let's Encrypt |

---

## Project Structure

```
telegram-ads-marketplace/
├── apps/
│   ├── api/                 # NestJS REST API (15 modules)
│   │   └── src/
│   │       ├── modules/     # auth, users, channels, campaigns, deals,
│   │       │                # escrow, folders, placements, reviews,
│   │       │                # wallet, notifications, appeals, health
│   │       └── common/      # guards, decorators, prisma, storage, notifications
│   ├── bot/                 # Grammy Telegram bot (WebApp launcher)
│   ├── web/                 # React Mini App (14 pages)
│   │   └── src/
│   │       ├── pages/       # Channels, Campaigns, Deals, Briefs, Folders,
│   │       │                # Profile, Moderation, Notifications...
│   │       ├── components/  # Modals, UI kit, shared components
│   │       ├── i18n/        # English + Russian translations
│   │       └── api/         # Axios client with auth interceptor
│   ├── workers/             # BullMQ background processors
│   │   └── src/processors/  # notifications, escrow-release, deposits,
│   │                        # withdrawals, scheduler, ad-poster
│   └── mtproto-worker/      # Telegram MTProto integration
│       └── src/services/    # channel-stats, folder-sync, autopost,
│                            # post-verification, stats-scheduler
├── libs/
│   ├── prisma-client/       # Prisma schema (18 models) + client
│   ├── shared-types/        # Enums, constants, interfaces, DTOs
│   ├── security/            # Encryption, sanitization, auth validation
│   ├── ton-utils/           # TON wallet, proof validation, memo generation
│   └── queue-contracts/     # BullMQ job type definitions
├── docker/
│   ├── Dockerfile.*         # Multi-stage production builds (5 services)
│   ├── docker-compose.yml   # Development environment
│   ├── docker-compose.prod.yml  # Production (isolated networks, read-only)
│   └── nginx/               # Reverse proxy config, static hosting
├── scripts/                 # Secret generation, session management
├── turbo.json               # Turborepo build pipeline
└── pnpm-workspace.yaml      # Monorepo workspace definition
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** + Docker Compose
- **Telegram Bot** — create via [@BotFather](https://t.me/BotFather), enable Mini App
- (Optional) **Telegram API credentials** — from [my.telegram.org](https://my.telegram.org) for MTProto features

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/telegram-ads-marketplace.git
cd telegram-ads-marketplace
pnpm install
```

### 2. Configure environment

```bash
# Create docker env from example
cp .env.example docker/.env

# Edit with your values (at minimum):
nano docker/.env
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `MINI_APP_URL` | Your domain (e.g., `https://yourdomain.com`) |
| `JWT_SECRET` | Random string, min 32 chars |
| `DB_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |

**Optional (for full features):**

| Variable | Description |
|----------|-------------|
| `TELEGRAM_API_ID` | For MTProto — channel verification, auto-posting |
| `TELEGRAM_API_HASH` | For MTProto |
| `TON_MASTER_WALLET_MNEMONIC` | 24-word TON wallet mnemonic for escrow |
| `TON_API_KEY` | TONCentre API key |

### 3. Start with Docker

```bash
# Development (with hot reload)
cd docker
docker compose up -d

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Build frontend
pnpm build --filter=@tam/web

# Copy frontend to nginx
cp -r apps/web/dist/* docker/nginx/html/
```

### 4. Configure SSL (production)

Place your SSL certificates in `docker/nginx/ssl/`:
```bash
docker/nginx/ssl/fullchain.pem
docker/nginx/ssl/privkey.pem
```

Or use Let's Encrypt with certbot.

### 5. Configure the bot

Set your Mini App URL in @BotFather:
1. `/mybots` → Select your bot → **Bot Settings** → **Menu Button** → set URL to your domain
2. Enable **Inline Mode** if needed

### 6. Access

- **Mini App**: Open your bot in Telegram, tap "Open App"
- **API Docs** (dev only): `https://yourdomain.com/api/docs`
- **MinIO Console**: `http://localhost:9001` (dev only)

---

## Deployment

### Production Docker Compose

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```

Production differences from development:
- Isolated Docker networks (internal services not exposed)
- Read-only containers with `security_opt: no-new-privileges`
- Redis: dangerous commands disabled
- Only nginx ports exposed (80, 443)
- Separate volumes for MTProto sessions and nginx cache

### Rebuild after code changes

```bash
# Rebuild all services
pnpm build

# Copy frontend
cp -r apps/web/dist/* docker/nginx/html/

# Restart backend services
docker compose restart api workers

# Reload nginx (for frontend changes)
docker exec tam-nginx nginx -s reload
```

---

## Key Design Decisions

### Telegram Mini App over standalone web app
The entire UI runs inside Telegram's WebView. This gives native-feeling UX, seamless auth (no login forms), push notifications via bot, and direct access to the target audience — Telegram channel owners and advertisers.

### TON escrow over traditional payments
Using TON blockchain enables trustless escrow: funds are locked on-chain when a deal is approved and released automatically after verification. No bank accounts, no payment processors, works globally.

### MTProto Worker as a separate service
Advanced Telegram features (reading channel stats, syncing folder contents, verifying posts exist) require the MTProto API, which needs a user session. We isolated this into a separate microservice to keep the main API stateless and to manage the MTProto session lifecycle independently.

### BullMQ for async operations
Financial operations (escrow lock/release, deposits, withdrawals), notifications, and scheduled tasks run through Redis-backed queues. This ensures reliability — failed jobs retry with exponential backoff, and nothing blocks the API.

### Content approval flow
Instead of posting ads directly, we added a draft review step (CONTENT_PENDING → CONTENT_SUBMITTED → approved/revised). This protects both parties: advertisers verify content before it goes live, and channel owners understand exactly what will be posted.

### Monorepo with shared libraries
Using Turborepo + pnpm workspaces lets us share types, security utilities, and queue contracts across 5 apps while keeping builds fast with caching.

---

## Known Limitations

- **Single-region deployment** — currently runs on one server; no horizontal scaling or CDN
- **TON wallet mnemonic stored server-side** — the master wallet mnemonic is stored as an environment variable; a production system should use HSM or secure enclave
- **MTProto session fragility** — the Telegram user session can expire or get invalidated, requiring manual re-authentication
- **No real-time updates** — the frontend polls for updates; WebSocket or SSE would improve UX
- **Limited analytics** — basic stats only; no dashboard for conversion tracking or ROI measurement
- **Single-language content moderation** — no automated content policy enforcement
- **No automated tests in CI** — test infrastructure is set up (Jest) but test coverage is minimal
- **Bundle size** — the frontend is a single chunk (~390KB gzipped); code splitting would help

---

## Roadmap

### Near-term improvements
- **WebSocket notifications** — real-time deal status updates and messages without polling
- **Campaign analytics dashboard** — impressions, clicks, conversion tracking for advertisers
- **Channel owner analytics** — earnings reports, deal history charts, audience growth correlation with ads
- **Multi-step campaign wizard** — guided campaign creation with budget calculator and audience estimator
- **Bulk deal management** — create deals for multiple channels at once from a campaign
- **Advanced search** — full-text search across channels and briefs with relevance scoring

### Medium-term features
- **Payment milestones** — split payments for long-running campaigns (e.g., 50% on post, 50% after 7 days)
- **Automated content moderation** — AI-based review of ad content for policy violations
- **Channel recommendations** — ML-based matching between campaigns and channels based on audience overlap
- **Referral program** — incentivize channel owners to invite other channels to the platform
- **Multi-currency support** — USDT on TON, Notcoin, and other Jettons alongside native TON
- **Public API** — REST API for third-party integrations and automation tools
- **Telegram Stars payments** — integrate Telegram's native payment system as an alternative to TON

### Long-term vision
- **Decentralized dispute resolution** — community-based arbitration with staked voting
- **Cross-platform expansion** — support for other messaging platforms (Discord, WhatsApp channels)
- **Ad format marketplace** — templates, creative tools, and A/B testing built into the platform
- **Programmatic advertising** — automated bidding and placement based on channel metrics and targeting
- **DAO governance** — platform governance token for fee structure decisions and feature prioritization

---

## AI Disclosure

Approximately **95% of the code in this project was written with AI assistance** (Claude by Anthropic). This includes:

- All application code (API, bot, frontend, workers, libraries)
- Database schema design
- Docker configuration and deployment setup
- Security implementation
- This README

Human involvement focused on:
- Product vision and feature requirements
- Architecture decisions and technology choices
- Code review, testing, and QA
- Deployment and infrastructure management
- Bug reporting and prioritization

---

## License

MIT

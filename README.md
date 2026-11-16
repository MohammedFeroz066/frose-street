# FROSE Street (street.frostech.com)

> Ultra-Fast Mobile POS for Street Food Vendors, Stalls, Carts & Kiosks.

Part of the **FROSE Restaurant Platform** ecosystem.

## Overview
FROSE Street transforms two basic Android smartphones into a complete high-speed restaurant management system:
- **Phone 1 (Billing):** Counter cash/UPI register, menu grid, token generator, daily Galla.
- **Phone 2 (Kitchen):** Always-awake KDS lane, FIFO order cards, audio chimes, one-tap "Ready".
- **Phone 3 (Packaging - Optional):** Order pickup queue, customer handover matching.

## Architecture
- **Server:** Fastify 5 + TypeScript monolith (`apps/street/server`)
- **Client:** Progressive Web App (`apps/street/client`) hosted on Cloudflare Pages (`street.frostech.com`)
- **Shared:** Common types and financial utilities (`apps/street/shared`)
- **Database:** PostgreSQL 16 (integer paise math for 100% precision)
- **Real-Time:** WebSockets for sub-100ms order dispatch
- **Offline / Local Mode:** P2P direct hotspot connection between phones (zero internet dependency)

## Portals
1. `🧾 BILLING` (`/billing`) — Fast 3-second grid billing & daily shift closure
2. `📦 PACKAGING & SERVING` (`/packaging`) — Ready order pickup & delivery
3. `🍳 KITCHEN` (`/kitchen`) — Big-button kitchen display screen

## Development
```bash
# Run tests
pnpm --filter @frose/street test

# Type check
pnpm --filter @frose/street typecheck

# Start development server
pnpm --filter @frose/street dev
```

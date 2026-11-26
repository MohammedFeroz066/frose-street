# FROSE Street — Production VPS Launch Checklist (1 GB / 2 GB India VPS)

Minimal, zero-fluff deployment guide for Ubuntu 22.04 / 24.04 (Mumbai / Bengaluru / Hyderabad VPS) with Docker, PostgreSQL 16, and Caddy 2 automatic HTTPS.

---

## 1. DNS & Firewall
1. Point an `A` record for your domain (e.g. `pos.yourdomain.in`) to your VPS public IPv4.
2. Open only ports `22` (SSH), `80` (HTTP ACME challenge), and `443` (HTTPS):
   ```bash
   ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
   ```
3. Do **not** expose PostgreSQL port `5432` publicly (`docker-compose.prod.yml` binds it to internal Docker network only).

## 2. Generate Secrets & Ed25519 Keypair
Create `.env` in the repository root (never commit `.env` to git):

```bash
# Generate strong DB & JWT secrets
openssl rand -hex 32   # Use for POSTGRES_PASSWORD
openssl rand -hex 32   # Use for APP_USER_PASSWORD
openssl rand -hex 32   # Use for JWT_SECRET

# Generate Ed25519 PEM keypair for JWT signing (optional if using rotated keys)
openssl genpkey -algorithm Ed25519 -out ed25519-private.pem
openssl pkey -in ed25519-private.pem -pubout -out ed25519-public.pem
```

Required `.env` variables:
```env
NODE_ENV=production
APP_DOMAIN=pos.yourdomain.in
ALLOWED_ORIGINS=https://pos.yourdomain.in
POSTGRES_DB=frose_street
POSTGRES_USER=frose_owner
POSTGRES_PASSWORD=<generated-hex>
APP_USER_PASSWORD=<generated-hex>
DATABASE_MIGRATION_URL=postgresql://frose_owner:<generated-hex>@postgres:5432/frose_street
DATABASE_URL=postgresql://app_user:<generated-app-user-hex>@postgres:5432/frose_street
JWT_SECRET=<generated-hex>
```

## 3. Build, Migrate & Bootstrap Admin
```bash
# 1. Start PostgreSQL first
docker compose -f docker-compose.prod.yml up -d postgres

# 2. Run migrations (creates schema + RLS policies + app_user role)
docker compose -f docker-compose.prod.yml run --rm app \
  node dist/server/src/db/cli.js latest

# 3. Create initial Super Admin (interactive or env-configured)
docker compose -f docker-compose.prod.yml run --rm app \
  node dist/scripts/create-admin.js

# 4. Start App + Caddy HTTPS reverse proxy
docker compose -f docker-compose.prod.yml up -d --build
```

## 4. Automated Daily Backups (Cron)
Make the backup script executable and schedule a daily `03:30 IST` (`22:00 UTC`) cron job:
```bash
chmod +x deploy/backup-pg.sh
(crontab -l 2>/dev/null; echo "0 22 * * * /opt/frose-street/deploy/backup-pg.sh >> /var/log/frose-backup.log 2>&1") | crontab -
```
To enable off-site Cloudflare R2 / S3 sync, export `BACKUP_S3_URI=s3://your-bucket/frose-backups` in cron or environment.

## 5. Smoke Verification
```bash
curl -fsS https://pos.yourdomain.in/health
curl -fsS https://pos.yourdomain.in/health/ready
```
Both should return HTTP `200` with `"status":"ok"`.

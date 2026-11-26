#!/usr/bin/env bash
set -euo pipefail

# FROSE Street — Daily Automated PostgreSQL Backup (14-day local retention + optional S3/R2 sync)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/frose-street}"
PG_CONTAINER="${PG_CONTAINER:-frose-postgres}"
PG_DB="${POSTGRES_DB:-frose_street}"
PG_USER="${POSTGRES_USER:-frose_owner}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +'%Y-%m-%d_%H-%M-%S')"
OUT_FILE="${BACKUP_DIR}/frose-${PG_DB}-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +'%FT%TZ')] Starting pg_dump for ${PG_DB}..."
docker exec "${PG_CONTAINER}" pg_dump -U "${PG_USER}" -Fc "${PG_DB}" > "${OUT_FILE}"

# Verify non-empty archive
if [ ! -s "${OUT_FILE}" ]; then
  echo "[$(date -u +'%FT%TZ')] ERROR: Backup file ${OUT_FILE} is empty!" >&2
  exit 1
fi

echo "[$(date -u +'%FT%TZ')] Backup created: ${OUT_FILE} ($(du -h "${OUT_FILE}" | cut -f1))"

# Prune backups older than RETENTION_DAYS
find "${BACKUP_DIR}" -type f -name "frose-${PG_DB}-*.dump" -mtime +"${RETENTION_DAYS}" -delete

# Optional off-site S3 / Cloudflare R2 sync
if [ -n "${BACKUP_S3_URI:-}" ] && command -v aws >/dev/null 2>&1; then
  echo "[$(date -u +'%FT%TZ')] Syncing to ${BACKUP_S3_URI}..."
  aws s3 cp "${OUT_FILE}" "${BACKUP_S3_URI}/" --only-show-errors
fi

echo "[$(date -u +'%FT%TZ')] Backup job complete."

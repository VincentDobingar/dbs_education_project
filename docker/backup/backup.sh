#!/bin/sh
# Sauvegarde Postgres périodique (pg_dump) pour docker-compose.prod.yml.
#
# Restauration manuelle (depuis un hôte ayant accès réseau au service `postgres`) :
#   gunzip -c edumanage-TIMESTAMP.sql.gz | PGPASSWORD=<POSTGRES_PASSWORD> \
#     psql -h postgres -U edumanage -d edumanage
#
# Toujours tester une restauration sur une base jetable avant d'en avoir besoin pour de vrai.
set -eu

BACKUP_DIR="/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump_file="$BACKUP_DIR/edumanage-$timestamp.sql.gz"

  echo "[backup] $(date -u +%FT%TZ) starting dump -> $dump_file"
  # Rôle propriétaire (edumanage), pas edumanage_app : un dump via le rôle applicatif
  # RLS-restreint ne verrait que ce que RLS laisse passer sans contexte tenant posé
  # (zéro ligne sur toute table tenant-scopée), donc un dump incomplet silencieux.
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U edumanage -d edumanage \
    | gzip > "$dump_file.tmp"
  mv "$dump_file.tmp" "$dump_file"
  echo "[backup] dump complete ($(du -h "$dump_file" | cut -f1))"

  find "$BACKUP_DIR" -name 'edumanage-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
  echo "[backup] pruned local dumps older than $RETENTION_DAYS days"

  # Hors-site, optionnel mais fortement recommandé : sans ceci, les dumps ne vivent
  # que sur le volume `backups` de ce même VPS — une perte du serveur emporte les
  # sauvegardes avec le reste. Voir .env.production.example pour BACKUP_REMOTE et
  # les variables RCLONE_CONFIG_* à fournir pour la destination choisie.
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    echo "[backup] syncing to $BACKUP_REMOTE"
    rclone copy "$dump_file" "$BACKUP_REMOTE" \
      || echo "[backup] WARNING: hors-site sync failed, dump kept locally only"
  fi
}

while true; do
  run_backup || echo "[backup] WARNING: backup run failed, will retry next cycle"
  sleep "$((INTERVAL_HOURS * 3600))"
done

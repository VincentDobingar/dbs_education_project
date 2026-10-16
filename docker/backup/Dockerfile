# Image dédiée, minimale : même version majeure que le service postgres (16) pour
# que pg_dump parle toujours la même version que le serveur qu'il sauvegarde.
FROM postgres:16-alpine

RUN apk add --no-cache gzip rclone

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

ENTRYPOINT ["/usr/local/bin/backup.sh"]

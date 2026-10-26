FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

RUN apk add --no-cache age aws-cli rsync
COPY backup.sh backup-loop.sh verify-restore.sh check-originals.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/backup-loop.sh \
    /usr/local/bin/verify-restore.sh /usr/local/bin/check-originals.sh

ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]

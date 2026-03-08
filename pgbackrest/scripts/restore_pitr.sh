set -euo pipefail

# Usage: restore_pitr.sh "2026-02-20 13:10:00+00"
TARGET="${1:?Provide target timestamp, e.g. '2026-02-20 13:10:00+00'}"

rm -rf /var/lib/postgresql/data/*
pgbackrest --stanza=crm --type=time --target="${TARGET}" --pg1-path=/var/lib/postgresql/data restore
echo "PITR restore completed to: ${TARGET}"
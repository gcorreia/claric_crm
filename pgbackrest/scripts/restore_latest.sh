set -euo pipefail

# Restore into db_restore PGDATA (container must be stopped for postgres, we keep it sleeping)
# This wipes restore volume and restores latest backup.
rm -rf /var/lib/postgresql/data/*
pgbackrest --stanza=crm --pg1-path=/var/lib/postgresql/data restore
echo "Restore completed (latest)."
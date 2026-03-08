set -euo pipefail
pgbackrest --stanza=crm --type=full backup
pgbackrest --stanza=crm info
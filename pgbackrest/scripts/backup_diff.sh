set -euo pipefail
pgbackrest --stanza=crm --type=diff backup
pgbackrest --stanza=crm info
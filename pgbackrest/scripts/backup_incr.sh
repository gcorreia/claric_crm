set -euo pipefail
pgbackrest --stanza=crm --type=incr backup
pgbackrest --stanza=crm info
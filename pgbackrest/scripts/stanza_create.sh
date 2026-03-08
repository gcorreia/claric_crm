set -euo pipefail
pgbackrest --stanza=crm stanza-create
pgbackrest --stanza=crm check
set -euo pipefail

cmd="${1:-start}"

migrate() {
  # Prefer admin URL for migrations when provided
  if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
    export DATABASE_URL="${MIGRATION_DATABASE_URL}"
  fi

  alembic upgrade head

  # One-shot grants: garante que crm_app consiga ler/escrever nas tabelas já criadas
  python -m scripts.grant_privileges
}

start() {
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
}

case "$cmd" in
  start)
    start
    ;;
  migrate)
    migrate
    ;;
  migrate-and-start)
    migrate
    start
    ;;
  *)
    echo "Usage: sh ./start.sh [start|migrate|migrate-and-start]"
    exit 2
    ;;
esac
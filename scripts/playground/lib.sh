# Shared helpers for the playground scripts. Source, do not run.
PLAYGROUND_NS="evdb-playground"
PLAYGROUND_CONTEXT="docker-desktop"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

require_context() {
  local ctx
  ctx="$(kubectl config current-context 2>/dev/null || true)"
  if [[ "$ctx" != "$PLAYGROUND_CONTEXT" ]]; then
    echo "Refusing to run: kubectl context is '$ctx', expected '$PLAYGROUND_CONTEXT'." >&2
    echo "Switch with: kubectl config use-context $PLAYGROUND_CONTEXT" >&2
    exit 1
  fi
}

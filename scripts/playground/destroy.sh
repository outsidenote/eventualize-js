#!/usr/bin/env bash
# Deletes the playground namespace, including the Postgres volume and all data.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_context
kubectl delete namespace "$PLAYGROUND_NS" --ignore-not-found

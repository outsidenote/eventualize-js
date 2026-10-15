#!/usr/bin/env bash
# Builds the playground images and deploys them to Docker Desktop Kubernetes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_context

echo "==> Building images"
docker build -f "$ROOT/apps/playground/backend/Dockerfile" --target runtime -t evdb-playground-backend:local "$ROOT"
docker build -f "$ROOT/apps/playground/backend/Dockerfile" --target migrate -t evdb-playground-migrate:local "$ROOT"
docker build -f "$ROOT/apps/playground/frontend/Dockerfile" -t evdb-playground-frontend:local "$ROOT"

echo "==> Loading images into the cluster"
# Docker Desktop's kind-based Kubernetes runs nodes as containers with their own
# containerd, which cannot see images in the Docker daemon. Import them into every node.
# A node named "docker-desktop" is the legacy shared-daemon mode: images are already visible.
nodes="$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}')"
if [[ -z "$nodes" ]]; then
  echo "No Kubernetes nodes found; is Kubernetes enabled in Docker Desktop?" >&2
  exit 1
fi
for node in $nodes; do
  if [[ "$node" == "docker-desktop" ]]; then
    continue
  fi
  if ! docker inspect --type container "$node" >/dev/null 2>&1; then
    echo "Node '$node' is not a Docker container; cannot import images into it." >&2
    exit 1
  fi
  for img in evdb-playground-backend evdb-playground-migrate evdb-playground-frontend; do
    echo "    ${img}:local -> $node"
    docker save "${img}:local" | docker exec -i "$node" ctr -n k8s.io images import --all-platforms - >/dev/null
  done
done

echo "==> Applying manifests"
# A Job's pod template is immutable; delete it so the migration runs again.
if kubectl get namespace "$PLAYGROUND_NS" >/dev/null 2>&1; then
  kubectl delete job migrate -n "$PLAYGROUND_NS" --ignore-not-found
fi
kubectl apply -k "$ROOT/apps/playground/k8s"

echo "==> Waiting for migration"
kubectl wait --for=condition=complete job/migrate -n "$PLAYGROUND_NS" --timeout=300s \
  || { kubectl logs job/migrate -n "$PLAYGROUND_NS" >&2 || true; exit 1; }

echo "==> Rolling out"
# Same :local tag, so force new pods to pick up the rebuilt images.
kubectl rollout restart deployment/backend deployment/frontend -n "$PLAYGROUND_NS"
kubectl rollout status deployment/backend -n "$PLAYGROUND_NS" --timeout=180s
kubectl rollout status deployment/frontend -n "$PLAYGROUND_NS" --timeout=180s

echo "==> Smoke check"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8080/api/health >/dev/null; then
    echo "Playground ready: http://localhost:8080"
    exit 0
  fi
  sleep 2
done
echo "Smoke check failed: http://localhost:8080/api/health did not answer" >&2
kubectl get pods -n "$PLAYGROUND_NS" >&2
exit 1

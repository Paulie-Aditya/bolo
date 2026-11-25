#!/usr/bin/env bash
# Spin up a throwaway kind cluster and deploy the Bolo voice canary.
#   bash k8s/bootstrap.sh
# Then connect it to NudgeBee by running the install command shown in
# app.nudgebee.com -> Add Kubernetes Account -> Shell Script (it carries your agent key).
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v kind >/dev/null; then
  curl -sLo /tmp/kind https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-amd64 && chmod +x /tmp/kind && sudo mv /tmp/kind /usr/local/bin/kind
fi
command -v helm >/dev/null || (curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash)
kind get clusters | grep -q '^bolo$' || kind create cluster --name bolo --config - <<KIND
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
KIND
kubectl apply -f bolo-canary.yaml
kubectl -n bolo rollout status deploy/bolo-voice-canary --timeout=120s
kubectl get pods -A
echo "Cluster ready. Now paste the NudgeBee agent install command."

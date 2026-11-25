#!/usr/bin/env bash
# Spin up a throwaway kind cluster, deploy the Bolo voice canary, and connect it to NudgeBee.
#   bash k8s/bootstrap.sh <nudgebee-agent-auth-key>
# (Admin -> Integrations -> Kubernetes Clusters -> Add K8s Account in app.nudgebee.com)
set -euo pipefail
KEY="${1:?usage: bootstrap.sh <nudgebee-agent-key>}"
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
curl -sLo /tmp/nb-installation.sh https://raw.githubusercontent.com/nudgebee/k8s-agent/main/installation.sh
bash /tmp/nb-installation.sh -a "$KEY" -d true
kubectl get pods -A

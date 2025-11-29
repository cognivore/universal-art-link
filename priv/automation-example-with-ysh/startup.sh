#!/bin/bash
set -euo pipefail

# =============================================================================
# Iocaine GCE Instance Startup Script
# Installs Nix, builds iocaine, configures systemd service, and prepares Caddy
# =============================================================================

DOMAIN="@@DOMAIN@@"
IOCAINE_PORT="@@IOCAINE_PORT@@"
REPO_URL="@@REPO_URL@@"
REPO_BRANCH="@@REPO_BRANCH@@"

log() { echo "[startup $(date +%H:%M:%S)] $*"; }

# =============================================================================
# System Update
# =============================================================================

log "Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "Installing prerequisites"
apt-get install -y curl ca-certificates gnupg lsb-release git build-essential

# =============================================================================
# Install Nix
# =============================================================================

log "Installing Nix via Determinate Systems installer"
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm

# Load Nix profile for the remainder of the script
if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  export HOME=${HOME:-/root}
  # shellcheck source=/dev/null
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi

# =============================================================================
# Clone and Build Iocaine
# =============================================================================

log "Cloning iocaine-classifier repository"
IOCAINE_HOME="/opt/iocaine"
mkdir -p "${IOCAINE_HOME}"
git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${IOCAINE_HOME}/repo"

log "Building iocaine with Nix"
cd "${IOCAINE_HOME}/repo/priv/iocaine"

# Build using nix develop to get the Rust toolchain
nix develop --command cargo build --release

# Copy binary to standard location
cp target/release/iocaine /usr/local/bin/iocaine
chmod +x /usr/local/bin/iocaine

# Copy default data
mkdir -p /etc/iocaine
cp -r data/defaults/* /etc/iocaine/

# =============================================================================
# Configure Iocaine
# =============================================================================

log "Configuring iocaine"

# Create metrics config directory
mkdir -p /etc/iocaine/config.d
mkdir -p /var/lib/iocaine

# Main config: http-server with metrics enabled
cat > /etc/iocaine/config.kdl <<IOCAINE_CONFIG
http-server default {
    bind "127.0.0.1:${IOCAINE_PORT}"
    use handler-from=default metrics=default:metrics
}

declare-handler default language=roto
IOCAINE_CONFIG

# Prometheus metrics server config (separate file for --config-path)
log "Configuring iocaine prometheus metrics"
cat > /etc/iocaine/config.d/metrics.kdl <<METRICS_CONFIG
// Enable prometheus metrics on port 42042
// Exposes qmk_requests, qmk_garbage_generated, qmk_ruleset_hits
prometheus-server default:metrics {
    bind "0.0.0.0:42042"
    persist-path "/var/lib/iocaine/default.metrics.json"
    persist-interval "1h"
}
METRICS_CONFIG

# =============================================================================
# Create Systemd Service
# =============================================================================

log "Creating iocaine systemd service"
cat > /etc/systemd/system/iocaine.service <<SERVICE
[Unit]
Description=Iocaine - AI Bot Poison Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/etc/iocaine
ExecStart=/usr/local/bin/iocaine -c /etc/iocaine/config.kdl --config-path /etc/iocaine/config.d start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable iocaine
systemctl start iocaine

log "Waiting for iocaine to start..."
sleep 3
if systemctl is-active --quiet iocaine; then
  log "Iocaine started successfully on port ${IOCAINE_PORT}"
else
  log "ERROR: Iocaine failed to start"
  journalctl -u iocaine --no-pager -n 50
fi

# =============================================================================
# Install Caddy (without auto-start)
# =============================================================================

log "Installing Caddy from official repo (without auto-start)"
install -d -m 0755 /usr/share/keyrings
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -y

# Prevent services from auto-starting during package installation
cat > /usr/sbin/policy-rc.d <<'POLICY'
#!/bin/sh
exit 101
POLICY
chmod +x /usr/sbin/policy-rc.d
apt-get install -y caddy
rm -f /usr/sbin/policy-rc.d

# =============================================================================
# Configure Caddy (but don't start yet)
# =============================================================================

log "Configuring Caddy (reverse proxy to iocaine on :${IOCAINE_PORT}, service stopped)"
cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    reverse_proxy 127.0.0.1:${IOCAINE_PORT}
    log {
        output file /var/log/caddy/access.log
    }
}
CADDY

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# Ensure Caddy is not running and not enabled (wait for DNS)
systemctl stop caddy || true
systemctl disable caddy || true

# =============================================================================
# Summary
# =============================================================================

# Fetch external IP from GCP metadata
IP=""
if command -v curl >/dev/null 2>&1; then
  IP=$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)
fi

log "========================================"
log "Provisioning complete!"
log "========================================"
log "Iocaine running on: 127.0.0.1:${IOCAINE_PORT}"
log "Caddy installed but NOT started (waiting for DNS)"
log ""
log "Configure DNS: ${DOMAIN} -> ${IP:-<external-ip>}"
log "After DNS is set, run ./caddy.ysh from your workstation."
log "========================================"


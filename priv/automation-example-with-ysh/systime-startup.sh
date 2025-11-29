#!/bin/bash
set -euo pipefail

# =============================================================================
# Systime Echo Server Startup Script
# Simple Python HTTP server that echoes request info + Linux system time
# Used as the "human" origin for CloudFront (legitimate traffic passes through)
# =============================================================================

DOMAIN="@@DOMAIN@@"
PORT="@@PORT@@"

log() { echo "[systime $(date +%H:%M:%S)] $*"; }

# =============================================================================
# System Update
# =============================================================================

log "Updating system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 curl ca-certificates gnupg lsb-release

# =============================================================================
# Install Caddy for HTTPS
# =============================================================================

log "Installing Caddy"
install -d -m 0755 /usr/share/keyrings
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -y
apt-get install -y caddy

# =============================================================================
# Create Python Echo Server
# =============================================================================

log "Creating Python echo server"
mkdir -p /opt/systime

cat > /opt/systime/server.py << 'PYSERVER'
#!/usr/bin/env python3
"""
systime echo server - returns request info + system time
System time obtained via Linux syscall (clock_gettime) for realistic behavior
Includes Prometheus metrics endpoint on /metrics
"""
import json
import time
import socket
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# Thread-safe metrics storage
class Metrics:
    def __init__(self):
        self._lock = threading.Lock()
        self.requests_total = 0
        self.requests_by_method = {"GET": 0, "POST": 0, "HEAD": 0, "OTHER": 0}
        self.bytes_sent = 0
        self.request_duration_sum = 0.0
        self.request_duration_count = 0
        self.start_time = time.time()

    def record_request(self, method, bytes_sent, duration):
        with self._lock:
            self.requests_total += 1
            key = method if method in self.requests_by_method else "OTHER"
            self.requests_by_method[key] += 1
            self.bytes_sent += bytes_sent
            self.request_duration_sum += duration
            self.request_duration_count += 1

    def get_prometheus(self):
        with self._lock:
            uptime = time.time() - self.start_time
            lines = [
                "# HELP systime_requests_total Total HTTP requests handled",
                "# TYPE systime_requests_total counter",
                f"systime_requests_total {self.requests_total}",
                "",
                "# HELP systime_requests_by_method HTTP requests by method",
                "# TYPE systime_requests_by_method counter",
            ]
            for method, count in self.requests_by_method.items():
                lines.append(f'systime_requests_by_method{{method="{method}"}} {count}')
            lines.extend([
                "",
                "# HELP systime_bytes_sent_total Total bytes sent in responses",
                "# TYPE systime_bytes_sent_total counter",
                f"systime_bytes_sent_total {self.bytes_sent}",
                "",
                "# HELP systime_request_duration_seconds_sum Sum of request durations",
                "# TYPE systime_request_duration_seconds_sum counter",
                f"systime_request_duration_seconds_sum {self.request_duration_sum:.6f}",
                "",
                "# HELP systime_request_duration_seconds_count Count of requests for duration",
                "# TYPE systime_request_duration_seconds_count counter",
                f"systime_request_duration_seconds_count {self.request_duration_count}",
                "",
                "# HELP systime_uptime_seconds Server uptime in seconds",
                "# TYPE systime_uptime_seconds gauge",
                f"systime_uptime_seconds {uptime:.2f}",
                "",
            ])
            return "\n".join(lines)

METRICS = Metrics()

class EchoHandler(BaseHTTPRequestHandler):
    def _send_response(self, body_content=None):
        start = time.time()

        # Get system time via Linux syscall (clock_gettime)
        systime_ns = time.clock_gettime_ns(time.CLOCK_REALTIME)
        systime_sec = time.clock_gettime(time.CLOCK_REALTIME)

        # Get client IP (handle X-Forwarded-For from CloudFront)
        client_ip = self.client_address[0]
        if "X-Forwarded-For" in self.headers:
            client_ip = self.headers["X-Forwarded-For"].split(",")[0].strip()

        response = {
            "systime": {
                "unix_timestamp": systime_sec,
                "unix_timestamp_ns": systime_ns,
                "iso8601": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(systime_sec)),
                "human": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(systime_sec)),
            },
            "request": {
                "method": self.command,
                "path": self.path,
                "client_ip": client_ip,
                "headers": dict(self.headers),
            },
            "server": {
                "hostname": socket.gethostname(),
                "service": "systime.fere.me",
            },
        }

        if body_content:
            response["request"]["body"] = body_content

        body = json.dumps(response, indent=2).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Systime-Timestamp", str(systime_sec))
        self.send_header("X-Systime-Server", "systime.fere.me")
        self.send_header("Cache-Control", "public, max-age=10")
        self.end_headers()
        self.wfile.write(body)

        duration = time.time() - start
        METRICS.record_request(self.command, len(body), duration)

    def _send_metrics(self):
        body = METRICS.get_prometheus().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/metrics":
            self._send_metrics()
        else:
            self._send_response()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else ""
        self._send_response(body)

    def do_HEAD(self):
        start = time.time()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Systime-Server", "systime.fere.me")
        self.send_header("Cache-Control", "public, max-age=10")
        self.end_headers()
        duration = time.time() - start
        METRICS.record_request("HEAD", 0, duration)

    def log_message(self, format, *args):
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] {args[0]}")

if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8080), EchoHandler)
    print("systime echo server starting on 127.0.0.1:8080")
    print("Prometheus metrics available at /metrics")
    server.serve_forever()
PYSERVER

chmod +x /opt/systime/server.py

# =============================================================================
# Create Systemd Service
# =============================================================================

log "Creating systemd service"
cat > /etc/systemd/system/systime.service << SERVICE
[Unit]
Description=systime echo server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/systime/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable systime
systemctl start systime

log "Waiting for systime to start..."
sleep 2
if systemctl is-active --quiet systime; then
  log "systime started successfully on port ${PORT}"
else
  log "ERROR: systime failed to start"
  journalctl -u systime --no-pager -n 20
fi

# =============================================================================
# Configure Caddy (wait for DNS before enabling)
# =============================================================================

log "Configuring Caddy (but not starting - waiting for DNS)"
cat > /etc/caddy/Caddyfile << CADDY
${DOMAIN} {
    reverse_proxy 127.0.0.1:${PORT}
    log {
        output file /var/log/caddy/access.log
    }
}
CADDY

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# Don't start Caddy yet - DNS needs to be configured first
systemctl stop caddy || true
systemctl disable caddy || true

# =============================================================================
# Summary
# =============================================================================

IP=""
if command -v curl >/dev/null 2>&1; then
  IP=$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)
fi

log "========================================"
log "systime server setup complete!"
log "========================================"
log "Python server running on 127.0.0.1:${PORT}"
log "Caddy configured but NOT started (DNS pending)"
log ""
log "Configure DNS: ${DOMAIN} -> ${IP:-<external-ip>}"
log "After DNS is set, enable Caddy for HTTPS"
log "========================================"



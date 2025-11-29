#!/bin/bash
set -euo pipefail

# =============================================================================
# Load Test Coordinator Startup Script
# Installs Grafana + InfluxDB 1.x + Caddy from apt (NO compilation required)
# InfluxDB 1.x is used for native k6 compatibility (no token auth needed)
# Startup time: ~2-3 minutes
# =============================================================================

GRAFANA_PORT="@@GRAFANA_PORT@@"
INFLUXDB_PORT="@@INFLUXDB_PORT@@"
RECEIVER_PORT="@@RECEIVER_PORT@@"
INFLUXDB_DATABASE="@@INFLUXDB_DATABASE@@"
COORDINATOR_DOMAIN="@@COORDINATOR_DOMAIN@@"

log() { echo "[coordinator $(date +%H:%M:%S)] $*"; }

# =============================================================================
# System Update
# =============================================================================

log "Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "Installing prerequisites"
apt-get install -y curl ca-certificates gnupg lsb-release apt-transport-https software-properties-common jq

# =============================================================================
# Install Caddy (for TLS reverse proxy - no compilation)
# =============================================================================

log "Installing Caddy"

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list

apt-get update -y
apt-get install -y caddy

log "Caddy installed"

# =============================================================================
# Install InfluxDB 1.x (NOT 2.x - for native k6 compatibility)
# =============================================================================

log "Installing InfluxDB 1.x"

# Add InfluxData repository for 1.x
curl -s https://repos.influxdata.com/influxdata-archive.key | gpg --dearmor -o /usr/share/keyrings/influxdb-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/influxdb-archive-keyring.gpg] https://repos.influxdata.com/debian stable main" | tee /etc/apt/sources.list.d/influxdb.list

apt-get update -y

# Install InfluxDB 1.x (package name is 'influxdb', NOT 'influxdb2')
apt-get install -y influxdb

# Configure InfluxDB to bind to all interfaces for k6 workers
cat > /etc/influxdb/influxdb.conf << 'INFLUXCONF'
[meta]
  dir = "/var/lib/influxdb/meta"

[data]
  dir = "/var/lib/influxdb/data"
  wal-dir = "/var/lib/influxdb/wal"

[http]
  enabled = true
  bind-address = ":8086"
  auth-enabled = false
INFLUXCONF

# Start InfluxDB
systemctl enable influxdb
systemctl start influxdb

# Wait for InfluxDB to be ready
log "Waiting for InfluxDB to start..."
for i in {1..30}; do
  if curl -sf http://localhost:${INFLUXDB_PORT}/ping >/dev/null 2>&1; then
    log "InfluxDB is ready"
    break
  fi
  sleep 1
done

# Create k6 database with retention policy (idempotent)
log "Creating k6 database..."
influx -execute "CREATE DATABASE ${INFLUXDB_DATABASE}" || true
influx -execute "CREATE RETENTION POLICY autogen ON ${INFLUXDB_DATABASE} DURATION 7d REPLICATION 1 DEFAULT" || log "Retention policy already exists (OK)"

log "InfluxDB 1.x installed and configured (no auth required)"

# =============================================================================
# Install Grafana (from official repo - no compilation)
# =============================================================================

log "Installing Grafana"

# Remove conflicting apt source from influxdata-archive-keyring package
rm -f /etc/apt/sources.list.d/influxdata.list

# Create keyrings directory if it doesn't exist
mkdir -p /etc/apt/keyrings

# Download and install GPG key (non-interactive, pipe through tee - proven to work)
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | tee /etc/apt/keyrings/grafana.gpg > /dev/null

echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | tee /etc/apt/sources.list.d/grafana.list

apt-get update -y
apt-get install -y grafana

# =============================================================================
# Install Prometheus (for iocaine metrics scraping)
# =============================================================================

log "Installing Prometheus"
apt-get install -y prometheus

log "Configuring Prometheus to scrape iocaine metrics"
cat > /etc/prometheus/prometheus.yml << PROM_CONFIG
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: iocaine
    static_configs:
      - targets: ["chunky.melira.fere.me:42042"]
        labels:
          service: iocaine
          environment: production

  - job_name: systime
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets: ["systime.fere.me:443"]
        labels:
          service: systime
          environment: production
    metrics_path: /metrics
PROM_CONFIG

systemctl enable prometheus
systemctl restart prometheus
log "Prometheus installed and configured"

# =============================================================================
# Configure Grafana
# =============================================================================

# Configure Grafana to serve from subpath /grafana
cat > /etc/grafana/grafana.ini << GRAFANA_CONFIG
[server]
http_port = ${GRAFANA_PORT}
root_url = https://${COORDINATOR_DOMAIN}/grafana/
serve_from_sub_path = true

[security]
admin_user = admin
admin_password = admin

[auth.anonymous]
enabled = true
org_role = Viewer

[dashboards]
default_home_dashboard_path = /var/lib/grafana/dashboards/loadtest.json
GRAFANA_CONFIG

# Create dashboards directory
mkdir -p /var/lib/grafana/dashboards
mkdir -p /etc/grafana/provisioning/dashboards
mkdir -p /etc/grafana/provisioning/datasources

# Provision InfluxDB datasource (InfluxQL mode for v1.x)
cat > /etc/grafana/provisioning/datasources/influxdb.yaml << DATASOURCE
apiVersion: 1
datasources:
  - name: InfluxDB
    uid: influxdb
    type: influxdb
    access: proxy
    url: http://localhost:${INFLUXDB_PORT}
    database: ${INFLUXDB_DATABASE}
    isDefault: true
DATASOURCE

# Provision Prometheus datasource (for iocaine metrics)
cat > /etc/grafana/provisioning/datasources/prometheus.yaml << DATASOURCE
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: false
DATASOURCE

# Dashboard provisioning config
cat > /etc/grafana/provisioning/dashboards/default.yaml << DASHPROV
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
DASHPROV

# Create k6 load test dashboard with InfluxQL queries - uses 'worker' tag for per-worker breakdown
cat > /var/lib/grafana/dashboards/loadtest.json << 'DASHBOARD'
{
  "annotations": {"list": []},
  "editable": true,
  "graphTooltip": 1,
  "panels": [
    {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 0}, "id": 100, "title": "📊 AGGREGATE - All Workers Combined", "type": "row"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}, "custom": {"drawStyle": "line", "fillOpacity": 20, "lineWidth": 2}, "unit": "reqps"}}, "gridPos": {"h": 8, "w": 12, "x": 0, "y": 1}, "id": 1, "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_reqs\" WHERE $timeFilter GROUP BY time(1s) fill(0)", "rawQuery": true, "refId": "A"}], "title": "🚀 Total Request Rate", "type": "timeseries"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"custom": {"drawStyle": "line", "fillOpacity": 20}, "unit": "ms"}}, "gridPos": {"h": 8, "w": 12, "x": 12, "y": 1}, "id": 2, "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT mean(\"value\") FROM \"http_req_duration\" WHERE $timeFilter GROUP BY time(1s) fill(null)", "rawQuery": true, "refId": "A"}], "title": "⏱️ Response Time (All Workers)", "type": "timeseries"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"thresholds": {"steps": [{"color": "green"}]}}}, "gridPos": {"h": 4, "w": 4, "x": 0, "y": 9}, "id": 3, "options": {"colorMode": "value", "graphMode": "area", "reduceOptions": {"calcs": ["sum"]}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_reqs\" WHERE $timeFilter", "rawQuery": true, "refId": "A"}], "title": "📨 Total Requests", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"thresholds": {"steps": [{"color": "green"}, {"color": "red", "value": 1}]}}}, "gridPos": {"h": 4, "w": 4, "x": 4, "y": 9}, "id": 4, "options": {"colorMode": "value", "graphMode": "area", "reduceOptions": {"calcs": ["sum"]}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_req_failed\" WHERE (\"traffic_type\" = 'bot' OR \"traffic_type\" = 'garbage') AND $timeFilter", "rawQuery": true, "refId": "A"}], "title": "🚫 Failed IOCAINE", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"thresholds": {"steps": [{"color": "green"}, {"color": "red", "value": 1}]}}}, "gridPos": {"h": 4, "w": 4, "x": 8, "y": 9}, "id": 5, "options": {"colorMode": "value", "graphMode": "area", "reduceOptions": {"calcs": ["sum"]}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_req_failed\" WHERE \"traffic_type\" = 'human' AND $timeFilter", "rawQuery": true, "refId": "A"}], "title": "🚫 Failed ORIGIN", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "decbytes", "thresholds": {"steps": [{"color": "blue"}]}}}, "gridPos": {"h": 4, "w": 4, "x": 12, "y": 9}, "id": 6, "options": {"colorMode": "value", "graphMode": "area", "reduceOptions": {"calcs": ["sum"]}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"data_received\" WHERE $timeFilter", "rawQuery": true, "refId": "A"}], "title": "📥 Data Received", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "ms", "thresholds": {"steps": [{"color": "green"}, {"color": "yellow", "value": 200}, {"color": "red", "value": 500}]}}}, "gridPos": {"h": 4, "w": 4, "x": 16, "y": 9}, "id": 7, "options": {"colorMode": "value", "reduceOptions": {"calcs": ["mean"]}}, "targets": [{"query": "SELECT mean(\"value\") FROM \"http_req_duration\" WHERE $timeFilter", "rawQuery": true, "refId": "A"}], "title": "⚡ Avg Latency", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "ms", "thresholds": {"steps": [{"color": "green"}, {"color": "yellow", "value": 500}, {"color": "red", "value": 1000}]}}}, "gridPos": {"h": 4, "w": 4, "x": 20, "y": 9}, "id": 8, "options": {"colorMode": "value", "reduceOptions": {"calcs": ["max"]}}, "targets": [{"query": "SELECT percentile(\"value\", 95) FROM \"http_req_duration\" WHERE $timeFilter", "rawQuery": true, "refId": "A"}], "title": "📈 P95 Latency", "type": "stat"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"custom": {"drawStyle": "line", "fillOpacity": 30, "stacking": {"mode": "normal"}}, "unit": "reqps"}}, "gridPos": {"h": 8, "w": 24, "x": 0, "y": 13}, "id": 9, "options": {"legend": {"calcs": ["mean", "sum"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_reqs\" WHERE $timeFilter GROUP BY time(1s), \"worker\" fill(0)", "rawQuery": true, "refId": "A"}], "title": "📈 Request Rate by Worker (Stacked)", "type": "timeseries"},
    {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 21}, "id": 200, "title": "🔧 Per-Worker Details", "type": "row"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "reqps"}}, "gridPos": {"h": 6, "w": 12, "x": 0, "y": 22}, "id": 201, "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_reqs\" WHERE $timeFilter GROUP BY time(1s), \"worker\" fill(0)", "rawQuery": true, "refId": "A"}], "title": "Request Rate per Worker", "type": "timeseries"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "ms"}}, "gridPos": {"h": 6, "w": 12, "x": 12, "y": 22}, "id": 202, "options": {"legend": {"calcs": ["mean", "p95"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT mean(\"value\") FROM \"http_req_duration\" WHERE $timeFilter GROUP BY time(1s), \"worker\" fill(null)", "rawQuery": true, "refId": "A"}], "title": "Response Time per Worker", "type": "timeseries"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "short"}}, "gridPos": {"h": 6, "w": 12, "x": 0, "y": 28}, "id": 203, "options": {"legend": {"calcs": ["sum"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"http_req_failed\" WHERE $timeFilter GROUP BY time(1s), \"worker\" fill(0)", "rawQuery": true, "refId": "A"}], "title": "Failed Requests per Worker", "type": "timeseries"},
    {"datasource": {"type": "influxdb", "uid": "influxdb"}, "fieldConfig": {"defaults": {"unit": "decbytes"}}, "gridPos": {"h": 6, "w": 12, "x": 12, "y": 28}, "id": 204, "options": {"legend": {"calcs": ["sum"], "displayMode": "table", "placement": "right"}}, "targets": [{"query": "SELECT sum(\"value\") FROM \"data_received\" WHERE $timeFilter GROUP BY time(1s), \"worker\" fill(0)", "rawQuery": true, "refId": "A"}], "title": "Data Received per Worker", "type": "timeseries"}
  ],
  "refresh": "5s",
  "schemaVersion": 38,
  "tags": ["k6", "loadtest", "cloudfront"],
  "time": {"from": "now-15m", "to": "now"},
  "title": "Melira Load Test",
  "uid": "melira-loadtest",
  "version": 1
}
DASHBOARD

# Create Iocaine AI Bot Defense dashboard (Prometheus-based)
# Includes qmk_* metrics for request tracking, garbage generation, ruleset hits
log "Creating Iocaine Bot Defense dashboard..."
cat > /var/lib/grafana/dashboards/iocaine.json << 'IOCAINE_DASHBOARD'
{
  "annotations": {"list": []},
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "thresholds"}, "mappings": [], "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}]}, "unit": "reqps"}},
      "gridPos": {"h": 4, "w": 6, "x": 0, "y": 0},
      "id": 1,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(irate(qmk_requests[1m]))", "refId": "A"}],
      "title": "Request Rate",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "thresholds"}, "mappings": [], "thresholds": {"mode": "absolute", "steps": [{"color": "red", "value": null}]}, "unit": "short"}},
      "gridPos": {"h": 4, "w": 6, "x": 6, "y": 0},
      "id": 2,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(qmk_requests)", "refId": "A"}],
      "title": "Total Requests",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "thresholds"}, "mappings": [], "thresholds": {"mode": "absolute", "steps": [{"color": "orange", "value": null}]}, "unit": "decbytes"}},
      "gridPos": {"h": 4, "w": 6, "x": 12, "y": 0},
      "id": 3,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(qmk_garbage_generated)", "refId": "A"}],
      "title": "Garbage Generated",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "thresholds"}, "mappings": [], "thresholds": {"mode": "absolute", "steps": [{"color": "purple", "value": null}]}, "unit": "percent"}},
      "gridPos": {"h": 4, "w": 6, "x": 18, "y": 0},
      "id": 4,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "100 * sum(qmk_ruleset_hits{outcome=\"garbage\"}) / sum(qmk_ruleset_hits)", "refId": "A"}],
      "title": "Bot Detection Rate",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}, "custom": {"drawStyle": "line", "fillOpacity": 20, "lineInterpolation": "smooth", "lineWidth": 2, "showPoints": "never", "stacking": {"mode": "none"}}, "unit": "reqps"}},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 4},
      "id": 5,
      "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "desc"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "irate(qmk_requests[1m])", "legendFormat": "{{host}}", "refId": "A"}],
      "title": "Request Rate by Host",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}}, "overrides": [{"matcher": {"id": "byName", "options": "garbage"}, "properties": [{"id": "color", "value": {"fixedColor": "red", "mode": "fixed"}}]}, {"matcher": {"id": "byName", "options": "default"}, "properties": [{"id": "color", "value": {"fixedColor": "green", "mode": "fixed"}}]}]},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 4},
      "id": 6,
      "options": {"displayLabels": ["percent"], "legend": {"displayMode": "table", "placement": "right", "showLegend": true, "values": ["value", "percent"]}, "pieType": "pie"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (outcome) (qmk_ruleset_hits)", "legendFormat": "{{outcome}}", "refId": "A"}],
      "title": "Traffic Classification",
      "type": "piechart"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}, "custom": {"drawStyle": "line", "fillOpacity": 20, "lineInterpolation": "smooth", "lineWidth": 2, "showPoints": "never", "stacking": {"mode": "normal"}}, "unit": "short"}},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 12},
      "id": 7,
      "options": {"legend": {"calcs": ["sum"], "displayMode": "table", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "desc"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "irate(qmk_ruleset_hits{outcome=\"garbage\"}[1m])", "legendFormat": "{{ruleset}}", "refId": "A"}],
      "title": "Bot Detection by Ruleset",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}}, "overrides": [{"matcher": {"id": "byName", "options": "ai.robots.txt"}, "properties": [{"id": "color", "value": {"fixedColor": "dark-red", "mode": "fixed"}}]}, {"matcher": {"id": "byName", "options": "default"}, "properties": [{"id": "color", "value": {"fixedColor": "dark-green", "mode": "fixed"}}]}]},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 12},
      "id": 8,
      "options": {"displayLabels": ["name", "percent"], "legend": {"displayMode": "table", "placement": "right", "showLegend": true, "values": ["value", "percent"]}, "pieType": "donut"},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (ruleset) (qmk_ruleset_hits)", "legendFormat": "{{ruleset}}", "refId": "A"}],
      "title": "Ruleset Distribution",
      "type": "piechart"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}, "custom": {"drawStyle": "line", "fillOpacity": 20, "lineInterpolation": "smooth", "lineWidth": 2, "showPoints": "never"}, "unit": "Bps"}},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 20},
      "id": 9,
      "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi", "sort": "desc"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "irate(qmk_garbage_generated[1m])", "legendFormat": "{{host}}", "refId": "A"}],
      "title": "Garbage Generation Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"color": {"mode": "palette-classic"}, "custom": {"drawStyle": "line", "fillOpacity": 10, "lineWidth": 1, "showPoints": "never"}, "unit": "decbytes"}},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 20},
      "id": 10,
      "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "list", "placement": "bottom", "showLegend": true}, "tooltip": {"mode": "multi"}},
      "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "process_resident_memory_bytes{job=\"iocaine\"}", "legendFormat": "Resident Memory", "refId": "A"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "process_virtual_memory_bytes{job=\"iocaine\"}", "legendFormat": "Virtual Memory", "refId": "B"}],
      "title": "Memory Usage",
      "type": "timeseries"
    }
  ],
  "refresh": "10s",
  "schemaVersion": 38,
  "tags": ["iocaine", "security", "ai-defense"],
  "templating": {"list": []},
  "time": {"from": "now-1h", "to": "now"},
  "timepicker": {},
  "timezone": "",
  "title": "Iocaine - AI Bot Defense",
  "uid": "iocaine-metrics",
  "version": 2
}
IOCAINE_DASHBOARD

# Create Systime Human Traffic dashboard (Prometheus-based)
# Tracks requests to systime.fere.me - the "human" origin for legitimate traffic
log "Creating Systime Human Traffic dashboard..."
cat > /var/lib/grafana/dashboards/systime.json << 'SYSTIME_DASHBOARD'
{
  "annotations": {"list": []},
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"axisBorderShow": false, "axisLabel": "", "fillOpacity": 20, "lineWidth": 2},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}]},
          "unit": "reqps"
        },
        "overrides": []
      },
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
      "id": 1,
      "options": {"legend": {"calcs": ["mean", "max"], "displayMode": "table", "placement": "bottom"}, "tooltip": {"mode": "multi"}},
      "title": "Request Rate",
      "type": "timeseries",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "rate(systime_requests_total[1m])",
        "refId": "A",
        "legendFormat": "requests/sec"
      }]
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"axisBorderShow": false, "fillOpacity": 30, "stacking": {"mode": "normal"}},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}]},
          "unit": "reqps"
        }
      },
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
      "id": 2,
      "options": {"legend": {"calcs": ["mean"], "displayMode": "table", "placement": "bottom"}, "tooltip": {"mode": "multi"}},
      "title": "Requests by Method",
      "type": "timeseries",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "rate(systime_requests_by_method[1m])",
        "refId": "A",
        "legendFormat": "{{method}}"
      }]
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "thresholds"},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}, {"color": "yellow", "value": 1000}, {"color": "red", "value": 10000}]},
          "unit": "short"
        }
      },
      "gridPos": {"h": 4, "w": 6, "x": 0, "y": 8},
      "id": 3,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "title": "Total Requests",
      "type": "stat",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "systime_requests_total",
        "refId": "A"
      }]
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "thresholds"},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}]},
          "unit": "bytes"
        }
      },
      "gridPos": {"h": 4, "w": 6, "x": 6, "y": 8},
      "id": 4,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "title": "Bytes Sent",
      "type": "stat",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "systime_bytes_sent_total",
        "refId": "A"
      }]
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "thresholds"},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}]},
          "unit": "s"
        }
      },
      "gridPos": {"h": 4, "w": 6, "x": 12, "y": 8},
      "id": 5,
      "options": {"colorMode": "value", "graphMode": "none", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": false}, "textMode": "auto"},
      "title": "Uptime",
      "type": "stat",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "systime_uptime_seconds",
        "refId": "A"
      }]
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "thresholds"},
          "mappings": [],
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": null}, {"color": "yellow", "value": 0.01}, {"color": "red", "value": 0.1}]},
          "unit": "s"
        }
      },
      "gridPos": {"h": 4, "w": 6, "x": 18, "y": 8},
      "id": 6,
      "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto", "reduceOptions": {"calcs": ["mean"], "fields": "", "values": false}, "textMode": "auto"},
      "title": "Avg Response Time",
      "type": "stat",
      "targets": [{
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "expr": "systime_request_duration_seconds_sum / systime_request_duration_seconds_count",
        "refId": "A"
      }]
    }
  ],
  "refresh": "5s",
  "schemaVersion": 38,
  "tags": ["systime", "human-traffic"],
  "templating": {"list": []},
  "time": {"from": "now-15m", "to": "now"},
  "timepicker": {},
  "timezone": "browser",
  "title": "Systime - Human Traffic Origin",
  "uid": "systime-metrics",
  "version": 1,
  "weekStart": ""
}
SYSTIME_DASHBOARD

chown -R grafana:grafana /var/lib/grafana/dashboards

# Start Grafana
systemctl enable grafana-server
systemctl start grafana-server

log "Grafana installed and configured"

# =============================================================================
# Configure Caddy for TLS reverse proxy
# =============================================================================

log "Configuring Caddy for TLS"

# Use 'route' instead of 'handle' - route processes in order (first match wins)
# while handle uses path-based priority which breaks catch-all redirects
cat > /etc/caddy/Caddyfile << CADDYFILE
${COORDINATOR_DOMAIN} {
    route /grafana/* {
        reverse_proxy localhost:${GRAFANA_PORT}
    }
    route /grafana {
        reverse_proxy localhost:${GRAFANA_PORT}
    }
    route /* {
        redir /grafana/ permanent
    }
}
CADDYFILE

# Restart Caddy to pick up config
systemctl restart caddy
systemctl enable caddy

log "Caddy configured with TLS"

# =============================================================================
# Summary
# =============================================================================

# Get external IP
IP=""
if command -v curl >/dev/null 2>&1; then
  IP=$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)
fi

log "========================================"
log "Coordinator setup complete!"
log "========================================"
log ""
log "Domain: ${COORDINATOR_DOMAIN}"
log ""
log "Services (via TLS):"
log "  Grafana:  https://${COORDINATOR_DOMAIN}/grafana"
log "    Login:  admin / admin"
log ""
log "Services (direct IP access):"
log "  Grafana:   http://${IP:-<external-ip>}:${GRAFANA_PORT}"
log "  InfluxDB:  http://${IP:-<external-ip>}:${INFLUXDB_PORT}"
log ""
log "InfluxDB (no auth required):"
log "  Database: ${INFLUXDB_DATABASE}"
log ""
log "k6 output config (simple!):"
log "  k6 run --out influxdb=http://${IP:-<external-ip>}:${INFLUXDB_PORT}/${INFLUXDB_DATABASE} script.js"
log ""
log "========================================"

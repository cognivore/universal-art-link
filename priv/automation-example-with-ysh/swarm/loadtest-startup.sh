#!/bin/bash
set -euo pipefail

# =============================================================================
# Load Generator VM Startup Script
# Installs k6 and prepares the machine for load testing
# Outputs metrics to InfluxDB 1.x on coordinator for live Grafana dashboards
# =============================================================================

TARGET_URL="@@TARGET_URL@@"
TEST_DURATION="@@TEST_DURATION@@"
VUS_PER_SCENARIO="@@VUS_PER_SCENARIO@@"
COORDINATOR_IP="@@COORDINATOR_IP@@"
INFLUXDB_PORT="@@INFLUXDB_PORT@@"
INFLUXDB_DATABASE="@@INFLUXDB_DATABASE@@"
WORKER_ID="@@WORKER_ID@@"

log() { echo "[loadgen $(date +%H:%M:%S)] $*"; }

# =============================================================================
# System Update
# =============================================================================

log "Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "Installing prerequisites"
apt-get install -y curl ca-certificates gnupg lsb-release jq

# =============================================================================
# Install k6
# =============================================================================

log "Installing k6 from official repository"

# Add k6 GPG key and repository
curl -s https://dl.k6.io/key.gpg | gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | tee /etc/apt/sources.list.d/k6.list

apt-get update -y
apt-get install -y k6

# Verify installation
log "k6 version: $(k6 version)"

# =============================================================================
# Create Load Test Scripts
# =============================================================================

log "Creating load test directory"
mkdir -p /opt/loadtest/results
chmod -R 777 /opt/loadtest  # Allow SSH users to write results
cd /opt/loadtest

# =============================================================================
# Split Test Scenario
# Tests CloudFront iocaine classifier with mixed traffic
# =============================================================================

cat > /opt/loadtest/split-test.js << 'K6SCRIPT'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics for classification tracking
const thiefResponses = new Counter('thief_responses');
const garbageResponses = new Counter('garbage_responses');
const humanResponses = new Counter('human_responses');
const classificationLatency = new Trend('classification_latency');

// Known AI bot user agents (from iocaineClassifier.js)
const BOT_USER_AGENTS = [
  'Mozilla/5.0 GPTBot/1.0',
  'Mozilla/5.0 (compatible; ChatGPT-User/1.0)',
  'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
  'Mozilla/5.0 (compatible; Anthropic-AI/1.0)',
  'CCBot/2.0 (https://commoncrawl.org/faq/)',
  'Mozilla/5.0 (compatible; PerplexityBot/1.0)',
  'Bytespider (https://zhanzhang.toutiao.com/)',
];

// Fake browser UAs (missing sec-fetch-mode = garbage)
const FAKE_BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36',
];

// Legitimate browser UAs (with sec-fetch-mode)
const HUMAN_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getHeader(headers, name) {
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

/**
 * Detect which origin responded based on response characteristics.
 * CloudFront Functions set headers on REQUEST, not RESPONSE.
 * We detect routing by checking response markers:
 *   - Iocaine (Caddy): text/html content, no x-systime-server
 *   - Systime (Python): application/json, x-systime-server present
 */
function detectOrigin(res) {
  const contentType = getHeader(res.headers, 'content-type').toLowerCase();
  const systimeServer = getHeader(res.headers, 'x-systime-server');
  const server = getHeader(res.headers, 'server').toLowerCase();

  if (systimeServer) return 'systime';
  if (server.includes('python') || server.includes('basehttp')) return 'systime';
  if (contentType.includes('application/json')) return 'systime';
  if (contentType.includes('text/html')) return 'iocaine';
  return 'unknown';
}

// Scenario: Known AI bots - should route to iocaine
export function botTraffic() {
  const ua = randomElement(BOT_USER_AGENTS);
  const start = Date.now();

  const res = http.get(__ENV.TARGET_URL, {
    headers: {
      'User-Agent': ua,
    },
    tags: { traffic_type: 'bot', worker: __ENV.WORKER_ID },
  });

  classificationLatency.add(Date.now() - start);

  const origin = detectOrigin(res);
  const routedToIocaine = origin === 'iocaine';

  check(res, {
    'bot: status is 200': (r) => r.status === 200,
    'bot: routed to iocaine': () => routedToIocaine,
  });

  if (routedToIocaine) {
    thiefResponses.add(1);
  }

  sleep(0.1);
}

// Scenario: Fake browsers (scrapers hiding as browsers) - should route to iocaine
export function garbageTraffic() {
  const ua = randomElement(FAKE_BROWSER_USER_AGENTS);
  const start = Date.now();

  const res = http.get(__ENV.TARGET_URL, {
    headers: {
      'User-Agent': ua,
      // Intentionally NOT sending Sec-Fetch-Mode
    },
    tags: { traffic_type: 'garbage', worker: __ENV.WORKER_ID },
  });

  classificationLatency.add(Date.now() - start);

  const origin = detectOrigin(res);
  const routedToIocaine = origin === 'iocaine';

  check(res, {
    'garbage: status is 200': (r) => r.status === 200,
    'garbage: routed to iocaine': () => routedToIocaine,
  });

  if (routedToIocaine) {
    garbageResponses.add(1);
  }

  sleep(0.1);
}

// Scenario: Legitimate human traffic - should route to systime
export function humanTraffic() {
  const ua = randomElement(HUMAN_USER_AGENTS);
  const start = Date.now();

  const res = http.get(__ENV.TARGET_URL, {
    headers: {
      'User-Agent': ua,
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Dest': 'document',
    },
    tags: { traffic_type: 'human', worker: __ENV.WORKER_ID },
  });

  classificationLatency.add(Date.now() - start);

  const origin = detectOrigin(res);
  const routedToSystime = origin === 'systime';

  check(res, {
    'human: status is 200': (r) => r.status === 200,
    'human: routed to systime': () => routedToSystime,
  });

  if (routedToSystime) {
    humanResponses.add(1);
  }

  sleep(0.1);
}

export const options = {
  scenarios: {
    // 40% bots - should be classified as 'thief'
    known_bots: {
      executor: 'constant-vus',
      exec: 'botTraffic',
      vus: Math.ceil(__ENV.VUS * 0.4) || 20,
      duration: __ENV.DURATION || '60s',
    },
    // 30% fake browsers - should be classified as 'garbage'
    fake_browsers: {
      executor: 'constant-vus',
      exec: 'garbageTraffic',
      vus: Math.ceil(__ENV.VUS * 0.3) || 15,
      duration: __ENV.DURATION || '60s',
    },
    // 30% humans - should pass through
    humans: {
      executor: 'constant-vus',
      exec: 'humanTraffic',
      vus: Math.ceil(__ENV.VUS * 0.3) || 15,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export function handleSummary(data) {
  return {
    '/opt/loadtest/results/summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { metrics } = data;
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║               IOCAINE SPLIT TEST RESULTS                     ║',
    '╠══════════════════════════════════════════════════════════════╣',
  ];

  if (metrics.thief_responses) {
    lines.push(`║  Thief (bots) responses:    ${String(metrics.thief_responses.values.count).padStart(10)} ║`);
  }
  if (metrics.garbage_responses) {
    lines.push(`║  Garbage (fake) responses:  ${String(metrics.garbage_responses.values.count).padStart(10)} ║`);
  }
  if (metrics.human_responses) {
    lines.push(`║  Human (passed) responses:  ${String(metrics.human_responses.values.count).padStart(10)} ║`);
  }

  lines.push('╠══════════════════════════════════════════════════════════════╣');

  if (metrics.http_reqs) {
    lines.push(`║  Total requests:            ${String(metrics.http_reqs.values.count).padStart(10)} ║`);
    lines.push(`║  Requests/sec:              ${String(metrics.http_reqs.values.rate.toFixed(2)).padStart(10)} ║`);
  }

  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    lines.push(`║  Latency p50:               ${String(dur.med.toFixed(2) + 'ms').padStart(10)} ║`);
    lines.push(`║  Latency p95:               ${String(dur['p(95)'].toFixed(2) + 'ms').padStart(10)} ║`);
    lines.push(`║  Latency p99:               ${String(dur['p(99)'].toFixed(2) + 'ms').padStart(10)} ║`);
  }

  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}
K6SCRIPT

# =============================================================================
# Create Configuration
# =============================================================================

cat > /opt/loadtest/config.env << ENVFILE
TARGET_URL="${TARGET_URL}"
TEST_DURATION="${TEST_DURATION}"
VUS_PER_SCENARIO="${VUS_PER_SCENARIO}"
COORDINATOR_IP="${COORDINATOR_IP}"
INFLUXDB_PORT="${INFLUXDB_PORT}"
INFLUXDB_DATABASE="${INFLUXDB_DATABASE}"
WORKER_ID="${WORKER_ID}"
INFLUXDB_URL="http://${COORDINATOR_IP}:${INFLUXDB_PORT}/${INFLUXDB_DATABASE}"
ENVFILE

# =============================================================================
# Create Run Script (outputs to InfluxDB 1.x - simple, no auth needed!)
# =============================================================================

cat > /opt/loadtest/run-test.sh << 'RUNSCRIPT'
#!/bin/bash
set -euo pipefail

source /opt/loadtest/config.env

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_DIR="/opt/loadtest/results/${TIMESTAMP}"
mkdir -p "${RESULT_DIR}"

echo "Starting load test..."
echo "Target: ${TARGET_URL}"
echo "Duration: ${TEST_DURATION}"
echo "VUs per scenario: ${VUS_PER_SCENARIO}"
echo "Coordinator: ${COORDINATOR_IP}:${INFLUXDB_PORT}"
echo "Worker ID: ${WORKER_ID}"
echo ""

# InfluxDB 1.x URL format: http://host:port/database
INFLUX_OUTPUT="influxdb=${INFLUXDB_URL}"

echo "InfluxDB output: ${INFLUX_OUTPUT}"
echo ""

cd /opt/loadtest

# Run k6 with InfluxDB 1.x output (simple URL format, no auth!)
# Also save JSON locally for post-test analysis
k6 run \
  --out "${INFLUX_OUTPUT}" \
  --out "json=${RESULT_DIR}/metrics.json" \
  -e TARGET_URL="${TARGET_URL}" \
  -e DURATION="${TEST_DURATION}" \
  -e VUS="${VUS_PER_SCENARIO}" \
  -e WORKER_ID="${WORKER_ID}" \
  split-test.js 2>&1 | tee "${RESULT_DIR}/output.log"

# Copy summary to result dir
cp results/summary.json "${RESULT_DIR}/" 2>/dev/null || true

echo ""
echo "Results saved to: ${RESULT_DIR}"
echo "Files:"
ls -la "${RESULT_DIR}"
RUNSCRIPT

chmod +x /opt/loadtest/run-test.sh

# =============================================================================
# Create Systemd Service (for remote triggering)
# =============================================================================

cat > /etc/systemd/system/loadtest.service << SERVICE
[Unit]
Description=k6 Load Test Runner
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/opt/loadtest
ExecStart=/opt/loadtest/run-test.sh
StandardOutput=journal
StandardError=journal
Environment="HOME=/root"

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload

# =============================================================================
# Summary
# =============================================================================

log "========================================"
log "Load generator setup complete!"
log "========================================"
log ""
log "Worker ID:     ${WORKER_ID}"
log "Target URL:    ${TARGET_URL}"
log "Coordinator:   ${COORDINATOR_IP}:${INFLUXDB_PORT}"
log "Database:      ${INFLUXDB_DATABASE}"
log "k6 version:    $(k6 version)"
log ""
log "To run a test manually:"
log "  /opt/loadtest/run-test.sh"
log ""
log "Or via systemd:"
log "  sudo systemctl start loadtest"
log ""
log "Metrics stream to InfluxDB 1.x (no auth required!)"
log "Results also saved locally to /opt/loadtest/results/"
log "========================================"

/**
 * Iocaine Split Test Scenario
 *
 * Tests CloudFront iocaine classifier with mixed traffic patterns:
 * - 40% known AI bots (should route to iocaine - HTML garbage)
 * - 30% fake browsers (should route to iocaine - HTML garbage)
 * - 30% legitimate humans (should route to systime - JSON response)
 *
 * Classification Detection:
 *   CloudFront Functions set headers on REQUEST to origin, not RESPONSE.
 *   We detect routing by checking response characteristics:
 *   - Iocaine (bot/garbage): text/html content-type, no x-systime-server
 *   - Systime (human): application/json, x-systime-server header present
 *
 * Usage:
 *   k6 run -e TARGET_URL=https://xxx.cloudfront.net split-test.js
 *
 * Environment variables:
 *   TARGET_URL  - CloudFront distribution URL (required)
 *   DURATION    - Test duration (default: 60s)
 *   VUS         - Virtual users per scenario type (default: 50)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

// =============================================================================
// Custom Metrics
// =============================================================================

// Classification counters
const thiefResponses = new Counter("thief_responses");
const garbageResponses = new Counter("garbage_responses");
const humanResponses = new Counter("human_responses");

// Misclassification tracking
const botMisclassified = new Counter("bot_misclassified");
const garbageMisclassified = new Counter("garbage_misclassified");
const humanMisclassified = new Counter("human_misclassified");

// Classification accuracy rates
const botAccuracy = new Rate("bot_classification_accuracy");
const garbageAccuracy = new Rate("garbage_classification_accuracy");
const humanAccuracy = new Rate("human_classification_accuracy");

// Latency by traffic type
const botLatency = new Trend("bot_latency");
const garbageLatency = new Trend("garbage_latency");
const humanLatency = new Trend("human_latency");

// =============================================================================
// User Agent Pools
// =============================================================================

// Known AI bot user agents (from iocaineClassifier.js patterns)
const BOT_USER_AGENTS = [
	"Mozilla/5.0 GPTBot/1.0",
	"Mozilla/5.0 (compatible; ChatGPT-User/1.0)",
	"Mozilla/5.0 (compatible; ClaudeBot/1.0)",
	"Mozilla/5.0 (compatible; Anthropic-AI/1.0)",
	"CCBot/2.0 (https://commoncrawl.org/faq/)",
	"Mozilla/5.0 (compatible; PerplexityBot/1.0)",
	"Bytespider (https://zhanzhang.toutiao.com/)",
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 GPTBot/1.0",
	"Mozilla/5.0 (compatible; AmazonBot/0.1)",
	"Mozilla/5.0 (compatible; Googlebot/2.1)",
	"cohere-ai",
	"meta-externalagent/1.0",
	"PerplexityBot/1.0",
];

// Fake browser UAs - scrapers hiding as browsers (missing sec-fetch-mode)
const FAKE_BROWSER_USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
];

// Legitimate browser UAs (with proper sec-fetch headers)
const HUMAN_USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
	"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
];

// =============================================================================
// Utilities
// =============================================================================

function randomElement(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function getHeader(headers, name) {
	// CloudFront may return headers in different cases
	return (
		headers[name] ||
		headers[name.toLowerCase()] ||
		headers[name.toUpperCase()] ||
		""
	);
}

/**
 * Detect which origin responded based on response characteristics.
 *
 * CloudFront Functions set x-cloudfront-iocaine-* headers on the REQUEST,
 * not the RESPONSE. We detect routing by checking response markers:
 *
 * - Iocaine (Caddy): text/html content, no x-systime-server header
 * - Systime (Python): application/json content, x-systime-server header present
 */
function detectOrigin(res) {
	const contentType = getHeader(res.headers, "content-type").toLowerCase();
	const systimeServer = getHeader(res.headers, "x-systime-server");
	const server = getHeader(res.headers, "server").toLowerCase();

	// Systime identifies itself with x-systime-server header
	if (systimeServer) {
		return "systime";
	}

	// Python BaseHTTP server = systime
	if (server.includes("python") || server.includes("basehttp")) {
		return "systime";
	}

	// JSON content = systime (systime returns JSON, iocaine returns HTML)
	if (contentType.includes("application/json")) {
		return "systime";
	}

	// HTML content = iocaine (iocaine returns garbage HTML)
	if (contentType.includes("text/html")) {
		return "iocaine";
	}

	// Default: unknown
	return "unknown";
}

// =============================================================================
// Test Scenarios
// =============================================================================

/**
 * Scenario: Known AI bots
 * Expected: Routed to iocaine origin (HTML garbage response)
 */
export function botTraffic() {
	const ua = randomElement(BOT_USER_AGENTS);
	const start = Date.now();

	const res = http.get(__ENV.TARGET_URL, {
		headers: {
			"User-Agent": ua,
		},
		tags: { traffic_type: "bot", expected_class: "thief" },
	});

	const latency = Date.now() - start;
	botLatency.add(latency);

	// Detect which origin responded (iocaine = correct for bots)
	const origin = detectOrigin(res);
	const routedToIocaine = origin === "iocaine";

	// Track classification
	if (routedToIocaine) {
		thiefResponses.add(1);
		botAccuracy.add(1);
	} else {
		botMisclassified.add(1);
		botAccuracy.add(0);
	}

	check(res, {
		"bot: status is 200": (r) => r.status === 200,
		"bot: routed to iocaine": () => routedToIocaine,
	});

	sleep(0.1 + Math.random() * 0.1);
}

/**
 * Scenario: Fake browsers (scrapers hiding as browsers)
 * Expected: Routed to iocaine origin (HTML garbage response)
 */
export function garbageTraffic() {
	const ua = randomElement(FAKE_BROWSER_USER_AGENTS);
	const start = Date.now();

	const res = http.get(__ENV.TARGET_URL, {
		headers: {
			"User-Agent": ua,
			// Intentionally NOT sending Sec-Fetch-Mode headers
			// This is how we detect scrapers pretending to be browsers
		},
		tags: { traffic_type: "garbage", expected_class: "garbage" },
	});

	const latency = Date.now() - start;
	garbageLatency.add(latency);

	// Detect which origin responded (iocaine = correct for fake browsers)
	const origin = detectOrigin(res);
	const routedToIocaine = origin === "iocaine";

	// Track classification
	if (routedToIocaine) {
		garbageResponses.add(1);
		garbageAccuracy.add(1);
	} else {
		garbageMisclassified.add(1);
		garbageAccuracy.add(0);
	}

	check(res, {
		"garbage: status is 200": (r) => r.status === 200,
		"garbage: routed to iocaine": () => routedToIocaine,
	});

	sleep(0.1 + Math.random() * 0.1);
}

/**
 * Scenario: Legitimate human traffic
 * Expected: Routed to systime origin (JSON response with x-systime-server)
 */
export function humanTraffic() {
	const ua = randomElement(HUMAN_USER_AGENTS);
	const start = Date.now();

	const res = http.get(__ENV.TARGET_URL, {
		headers: {
			"User-Agent": ua,
			// Real browsers send these headers
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "none",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-User": "?1",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		tags: { traffic_type: "human", expected_class: "human" },
	});

	const latency = Date.now() - start;
	humanLatency.add(latency);

	// Detect which origin responded (systime = correct for humans)
	const origin = detectOrigin(res);
	const routedToSystime = origin === "systime";

	// Track classification
	if (routedToSystime) {
		humanResponses.add(1);
		humanAccuracy.add(1);
	} else {
		humanMisclassified.add(1);
		humanAccuracy.add(0);
	}

	check(res, {
		"human: status is 200": (r) => r.status === 200,
		"human: routed to systime": () => routedToSystime,
	});

	sleep(0.1 + Math.random() * 0.1);
}

// =============================================================================
// Test Configuration
// =============================================================================

const vus = parseInt(__ENV.VUS) || 50;
const duration = __ENV.DURATION || "60s";

export const options = {
	scenarios: {
		// 40% bots - should be classified as 'thief'
		known_bots: {
			executor: "constant-vus",
			exec: "botTraffic",
			vus: Math.ceil(vus * 0.4),
			duration: duration,
			gracefulStop: "10s",
		},
		// 30% fake browsers - should be classified as 'garbage'
		fake_browsers: {
			executor: "constant-vus",
			exec: "garbageTraffic",
			vus: Math.ceil(vus * 0.3),
			duration: duration,
			gracefulStop: "10s",
		},
		// 30% humans - should pass through
		humans: {
			executor: "constant-vus",
			exec: "humanTraffic",
			vus: Math.ceil(vus * 0.3),
			duration: duration,
			gracefulStop: "10s",
		},
	},
	thresholds: {
		http_req_duration: ["p(95)<2000"],
		http_req_failed: ["rate<0.05"],
		bot_classification_accuracy: ["rate>0.95"],
		garbage_classification_accuracy: ["rate>0.90"],
		human_classification_accuracy: ["rate>0.95"],
	},
};

// =============================================================================
// Summary Handler
// =============================================================================

export function handleSummary(data) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

	return {
		[`/opt/loadtest/results/summary-${timestamp}.json`]: JSON.stringify(
			data,
			null,
			2,
		),
		stdout: generateTextSummary(data),
	};
}

function generateTextSummary(data) {
	const { metrics } = data;

	const lines = [
		"",
		"╔══════════════════════════════════════════════════════════════════════════╗",
		"║                    IOCAINE CLASSIFIER LOAD TEST RESULTS                  ║",
		"╠══════════════════════════════════════════════════════════════════════════╣",
		"║                         CLASSIFICATION SUMMARY                           ║",
		"╠══════════════════════════════════════════════════════════════════════════╣",
	];

	const thiefCount = metrics.thief_responses?.values?.count ?? 0;
	const garbageCount = metrics.garbage_responses?.values?.count ?? 0;
	const humanCount = metrics.human_responses?.values?.count ?? 0;
	const botMiss = metrics.bot_misclassified?.values?.count ?? 0;
	const garbageMiss = metrics.garbage_misclassified?.values?.count ?? 0;
	const humanMiss = metrics.human_misclassified?.values?.count ?? 0;

	lines.push(
		`║  Thief (bots) correct:      ${String(thiefCount).padStart(8)}  |  missed: ${String(botMiss).padStart(6)}          ║`,
	);
	lines.push(
		`║  Garbage (fake) correct:    ${String(garbageCount).padStart(8)}  |  missed: ${String(garbageMiss).padStart(6)}          ║`,
	);
	lines.push(
		`║  Human (passed) correct:    ${String(humanCount).padStart(8)}  |  missed: ${String(humanMiss).padStart(6)}          ║`,
	);

	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);
	lines.push(
		"║                         ACCURACY RATES                                   ║",
	);
	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);

	const botAcc = metrics.bot_classification_accuracy?.values?.rate ?? 0;
	const garbageAcc = metrics.garbage_classification_accuracy?.values?.rate ?? 0;
	const humanAcc = metrics.human_classification_accuracy?.values?.rate ?? 0;

	lines.push(
		`║  Bot detection accuracy:    ${(botAcc * 100).toFixed(2).padStart(8)}%                              ║`,
	);
	lines.push(
		`║  Garbage detection accuracy:${(garbageAcc * 100).toFixed(2).padStart(8)}%                              ║`,
	);
	lines.push(
		`║  Human passthrough accuracy:${(humanAcc * 100).toFixed(2).padStart(8)}%                              ║`,
	);

	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);
	lines.push(
		"║                         PERFORMANCE METRICS                              ║",
	);
	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);

	const reqs = metrics.http_reqs?.values ?? {};
	const dur = metrics.http_req_duration?.values ?? {};

	lines.push(
		`║  Total requests:            ${String(reqs.count ?? 0).padStart(8)}                              ║`,
	);
	lines.push(
		`║  Requests/sec:              ${String((reqs.rate ?? 0).toFixed(2)).padStart(8)}                              ║`,
	);
	lines.push(
		`║  Latency p50:               ${String((dur.med ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);
	lines.push(
		`║  Latency p95:               ${String((dur["p(95)"] ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);
	lines.push(
		`║  Latency p99:               ${String((dur["p(99)"] ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);

	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);
	lines.push(
		"║                       LATENCY BY TRAFFIC TYPE                            ║",
	);
	lines.push(
		"╠══════════════════════════════════════════════════════════════════════════╣",
	);

	const botLat = metrics.bot_latency?.values ?? {};
	const garbageLat = metrics.garbage_latency?.values ?? {};
	const humanLat = metrics.human_latency?.values ?? {};

	lines.push(
		`║  Bot traffic p95:           ${String((botLat["p(95)"] ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);
	lines.push(
		`║  Garbage traffic p95:       ${String((garbageLat["p(95)"] ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);
	lines.push(
		`║  Human traffic p95:         ${String((humanLat["p(95)"] ?? 0).toFixed(2) + "ms").padStart(10)}                            ║`,
	);

	lines.push(
		"╚══════════════════════════════════════════════════════════════════════════╝",
	);
	lines.push("");

	return lines.join("\n");
}



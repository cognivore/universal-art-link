# Iocaine Load Test Infrastructure

Deploy the complete iocaine classifier load testing stack: CloudFront edge classifier, dual-origin backends (iocaine for bots, systime for humans), and distributed k6 swarm.

**Written in YSH (Oils shell)** for declarative, functional-style infrastructure scripting.

## Architecture

```
                              ┌─────────────────┐
                              │   CloudFront    │
                              │  (Edge Function)│
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
    │ iocaine (bots)  │     │ systime (humans)│     │   Coordinator   │
    │  n2-standard-4  │     │    e2-micro     │     │    e2-medium    │
    │  Caddy -> Rust  │     │  Caddy -> Python│     │ Grafana+InfluxDB│
    └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                             │
                            ┌────────────────────────────────┼────────────────────────────────┐
                            ▼                ▼               ▼               ▼                ▼
                    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                    │  loadgen ×3 │  │  loadgen ×2 │  │  loadgen ×2 │  │  loadgen ×2 │  │    total    │
                    │  EU (London)│  │  US Central │  │  Asia (TW)  │  │  Australia  │  │   9 VMs     │
                    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

## Prerequisites

### Install Nix

All system dependencies (ysh, gcloud, aws, jq, dig, passveil, etc.) are provisioned automatically via Nix.

**macOS (graphical installer):**

Download [Determinate.pkg](https://docs.determinate.systems/getting-started/individuals/) — double-click to install.

**macOS / Linux (terminal):**
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

After installation, restart your shell.

### Install direnv + nix-direnv

direnv automatically activates the Nix development environment when you enter the project directory.

```bash
# Install direnv and nix-direnv via Nix
nix profile install nixpkgs#direnv nixpkgs#nix-direnv

# Add to your shell rc file (~/.zshrc or ~/.bashrc):
eval "$(direnv hook zsh)"   # for zsh
eval "$(direnv hook bash)"  # for bash

# Create nix-direnv config
mkdir -p ~/.config/direnv
echo 'source $HOME/.nix-profile/share/nix-direnv/direnvrc' >> ~/.config/direnv/direnvrc
```

Restart your shell, then:

```bash
cd iocaine-classifier
direnv allow
```

That's it! All tools (ysh, gcloud, aws, jq, passveil, etc.) are now available automatically.

### Required Secrets (passveil)

All secrets are fetched at runtime via `passveil`. Add them once:

| Secret Path | Contents | Purpose |
|-------------|----------|---------|
| `porkbun.com/api` | Line 1: `pk1_...`<br>Line 2: `sk1_...` | Porkbun DNS API credentials |
| `aws.amazon.com/.../access_key/...` | Line 1: AWS Access Key ID<br>Line 2: AWS Secret Access Key | CloudFront deployment (path in `lib/config.ysh`) |
| `geosurge.ai/github.com/api/token/geomancer/meta-iocaine-ro` | GitHub PAT | Clone private iocaine repo on VM startup |

```bash
# Add Porkbun credentials
passveil add porkbun.com/api
# Enter: pk1_... (line 1), sk1_... (line 2)

# Add AWS credentials (check lib/config.ysh for exact path)
passveil add aws.amazon.com/jons@geosurge.ai/390844751914/access_key/SSMIAMCIAMI5

# Add GitHub token for private repo access
passveil add geosurge.ai/github.com/api/token/geomancer/meta-iocaine-ro
```

### Authentication

| Service | How to Authenticate |
|---------|---------------------|
| **GCP** | `gcloud auth login` — billing account auto-linked by script |
| **AWS** | Credentials from passveil, or fallback to `aws configure` |
| **Porkbun** | API keys in passveil at `porkbun.com/api` |

## Zero-Click Deployment

```bash
cd ad-hoc-server-provisioning
./deploy.ysh full
```

The script will:
1. Provision iocaine VM (`n2-standard-4`, 4 vCPU, 16GB) with DNS + TLS
2. Provision systime VM (`e2-micro`) with DNS + TLS
3. Deploy CloudFront distribution with classifier edge function
4. Provision coordinator VM (`e2-medium`, Grafana + InfluxDB)
5. Provision k6 load test swarm (9× `e2-medium` across 4 regions)

### Run Load Tests

```bash
# After deployment
./loadtest.ysh run

# With custom duration and VUs
./loadtest.ysh run --duration 120s --vus 100
```

#### What are VUs?

**VUs (Virtual Users)** are simulated concurrent users executing the test scenario in parallel.

- Each VU runs the test script independently in its own "thread"
- VUs loop continuously for the test duration
- More VUs = more concurrent load

**VUs vs RPS:**
- VUs control *concurrency* (simultaneous connections)
- RPS (requests/second) is the *result* — depends on server response time
- Fast server + 50 VUs → high RPS
- Slow server + 50 VUs → low RPS

In this project, `vus_per_scenario: 50` means 50 virtual users per traffic type (bot vs human), testing classifier behavior under concurrent mixed traffic.

## Prefixed Deployments

`--prefix` creates a completely isolated copy of the infrastructure — separate GCP project, DNS records, CloudFront resources. Use it to test changes without affecting production.

```bash
./deploy.ysh full --prefix 20251127
./destroy.ysh --full --prefix 20251127
```

## Teardown

```bash
# Full cleanup (all 12+ VMs + DNS + CloudFront)
./destroy.ysh --full

# Delete just the swarm (keep coordinator + origins)
./destroy.ysh --swarm-only

# Delete just the coordinator
./destroy.ysh --coordinator-only

# With prefix
./destroy.ysh --full --prefix 20251127
```

## Scripts Reference

### Main Scripts

| Script | Purpose |
|--------|---------|
| `deploy.ysh` | Full deployment: iocaine + systime + CloudFront + coordinator + swarm |
| `destroy.ysh` | Teardown: `--full`, `--swarm-only`, `--coordinator-only` |
| `loadtest.ysh` | Run k6 load tests and collect results |

### Component Scripts

| Script | Purpose |
|--------|---------|
| `provision.ysh` | Create iocaine GCE instance (compiles Rust, ~10 min) |
| `provision-systime.ysh` | Create systime (human origin) GCE instance |
| `dns.ysh` | Porkbun DNS management for iocaine |
| `caddy.ysh` | DNS verification + TLS activation |
| `aws/cloudfront.ysh` | CloudFront distribution management |
| `aws/deploy-function.ysh` | Deploy classifier edge function |
| `swarm/coordinator.ysh` | Grafana + InfluxDB coordinator VM |
| `swarm/provision-swarm.ysh` | k6 load generator VMs (9 instances) |
| `swarm/collect-results.ysh` | Aggregate results from swarm |

### Configuration & Startup

| File | Purpose |
|------|---------|
| `lib/config.ysh` | GCP, DNS, swarm configuration |
| `lib/aws-config.ysh` | AWS/CloudFront credentials and config |
| `startup.sh` | Iocaine VM init (Nix, Rust, cargo build) |
| `systime-startup.sh` | Systime VM init (Python server) |
| `swarm/coordinator-startup.sh` | Coordinator init (Grafana, InfluxDB, Caddy) |
| `swarm/loadtest-startup.sh` | Swarm worker init (k6) |

### Regression Tests

| Script | Purpose |
|--------|---------|
| `regression-0001-dns-fail.ysh` | DNS creation failure isolation |
| `regression-0002-test-validation.ysh` | Classification detection by response characteristics |

## Cost Estimate

### Full Deployment (12 VMs)

| Resource | Spec | Quantity | Monthly Cost |
|----------|------|----------|--------------|
| **iocaine** | n2-standard-4 (4 vCPU, 16GB) | 1 | ~$100 |
| **systime** | e2-micro (0.25 vCPU, 1GB) | 1 | ~$5 |
| **coordinator** | e2-medium (2 vCPU, 4GB) | 1 | ~$25 |
| **k6 swarm** | e2-medium (2 vCPU, 4GB) | 9 | ~$225 |
| **Boot disks** | 10-30GB SSD | 12 | ~$15 |
| **Network egress** | Variable | — | ~$10-50 |
| **CloudFront** | Free tier (10M requests) | — | ~$0 |

**Total: ~$380-420/month** for full load test infrastructure.

### Minimal Deployment (iocaine only)

| Resource | Spec | Quantity | Monthly Cost |
|----------|------|----------|--------------|
| **iocaine** | n2-standard-4 | 1 | ~$100 |
| **Boot disk** | 30GB SSD | 1 | ~$3 |

**Total: ~$103/month** for iocaine only.

### Cost-Saving Tips

- Use `destroy.ysh --swarm-only` after tests to stop the 9 swarm VMs (~$225/mo savings)
- Run prefixed deployments only when needed, destroy immediately after
- Swarm VMs can be recreated in ~2 minutes when needed

## Troubleshooting

### Check VM status

```bash
# Iocaine
gcloud compute ssh iocaine-chunky --zone=europe-west2-b \
  --command "sudo systemctl status iocaine"

# Systime
gcloud compute ssh systime-server --zone=europe-west2-b \
  --command "sudo systemctl status systime"

# Coordinator (Grafana)
gcloud compute ssh loadtest-coordinator --zone=europe-west2-b \
  --command "sudo systemctl status grafana-server"
```

### View logs

```bash
# Iocaine service logs
gcloud compute ssh iocaine-chunky --zone=europe-west2-b \
  --command "sudo journalctl -u iocaine -f"

# Startup script logs
gcloud compute ssh iocaine-chunky --zone=europe-west2-b \
  --command "sudo journalctl -u google-startup-scripts -f"

# Caddy TLS logs
gcloud compute ssh iocaine-chunky --zone=europe-west2-b \
  --command "sudo journalctl -u caddy -f"
```

### Test iocaine directly (SSH tunnel)

```bash
# Create SSH tunnel to bypass Caddy
gcloud compute ssh iocaine-chunky --zone=europe-west2-b \
  -- -L 8080:localhost:42069

# In another terminal - test bot detection
curl -v -A "GPTBot/1.0" http://localhost:8080/
```

### DNS propagation issues

```bash
# Check DNS from multiple resolvers
dig +short chunky.melira.fere.me @8.8.8.8      # Google
dig +short chunky.melira.fere.me @1.1.1.1      # Cloudflare (Porkbun uses this)

# Flush local DNS cache (macOS)
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

### Verify CloudFront classification

```bash
# Bot request → should get HTML from iocaine
curl -sI -A "GPTBot/1.0" "https://YOUR-DISTRIBUTION.cloudfront.net/" | head -5

# Human request → should get JSON from systime
curl -sI -A "Mozilla/5.0 Chrome/120" -H "Sec-Fetch-Mode: navigate" \
  "https://YOUR-DISTRIBUTION.cloudfront.net/" | head -5
```

## Security Notes

- **iocaine** binds to `127.0.0.1:42069` (localhost only)
- **systime** binds to `127.0.0.1:8080` (localhost only)
- External access only through Caddy with automatic Let's Encrypt TLS
- GCP firewall allows only ports 80 and 443
- All secrets fetched from passveil at runtime, never stored in scripts
- GitHub token is read-only and scoped to iocaine repo only

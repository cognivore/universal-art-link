#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: configure-caddy.sh <domain> [doc_root]

Ensures that Caddy is installed on Ubuntu and configures it to serve the
Universal Artistic Link site for the provided domain. The optional doc_root
argument defaults to /var/www/universal-artistic-link/dist.
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

fatal() {
  >&2 printf 'Error: %s\n' "$1"
  exit 1
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fatal "Run this script as root (try via sudo)."
  fi
}

require_ubuntu() {
  if [[ ! -r /etc/os-release ]]; then
    fatal "Cannot detect operating system (missing /etc/os-release)."
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  local id_like=${ID_LIKE:-}
  local id=${ID:-}
  if [[ "${id,,}" != "ubuntu" && "${id_like,,}" != *ubuntu* ]]; then
    fatal "This script only supports Ubuntu hosts."
  fi
}

apt_updated=0
apt_update_if_needed() {
  if [[ $apt_updated -eq 0 ]]; then
    log "Updating apt metadata"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt_updated=1
  fi
}

ensure_packages() {
  local missing=()
  for pkg in "$@"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
  if ((${#missing[@]} > 0)); then
    apt_update_if_needed
    log "Installing packages: ${missing[*]}"
    apt-get install -y "${missing[@]}"
  fi
}

ensure_caddy_repository() {
  local list_file=/etc/apt/sources.list.d/caddy-stable.list
  local keyring=/usr/share/keyrings/caddy-stable-archive-keyring.asc
  if [[ -f $list_file && -f $keyring ]]; then
    return
  fi
  ensure_packages curl debian-keyring debian-archive-keyring apt-transport-https
  log "Adding official Caddy repository"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | tee "$keyring" >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee "$list_file" >/dev/null
  apt_updated=0
}

ensure_caddy_installed() {
  if command -v caddy >/dev/null 2>&1; then
    return
  fi
  ensure_caddy_repository
  ensure_packages caddy
  log "Enabling and starting Caddy"
  systemctl enable --now caddy
}

escape_regex() {
  sed -e 's/[.[\\*^$+?{|()]/\\&/g' <<<"$1"
}

configure_site() {
  local domain=$1
  local doc_root=$2
  local caddyfile=/etc/caddy/Caddyfile
  local escaped domain_regex
  escaped=$(escape_regex "$domain")
  domain_regex="^\\s*${escaped}\\s*\\{"
  mkdir -p /etc/caddy
  touch "$caddyfile"
  if grep -Eq "$domain_regex" "$caddyfile"; then
    log "Caddyfile already contains a block for $domain; skipping"
    return
  fi
  log "Adding site block for $domain -> $doc_root"
  cat <<SITE >>"$caddyfile"

$domain {
    root * $doc_root
    file_server
    encode gzip zstd
}
SITE
  if command -v caddy >/dev/null 2>&1; then
    log "Formatting Caddyfile"
    caddy fmt --overwrite "$caddyfile"
  fi
}

reload_caddy() {
  if systemctl is-active --quiet caddy; then
    log "Reloading Caddy"
    systemctl reload caddy
  else
    log "Starting Caddy"
    systemctl start caddy
  fi
}

main() {
  local domain=${1:-}
  local doc_root=${2:-/var/www/universal-artistic-link/dist}
  if [[ -z $domain ]]; then
    usage
    exit 1
  fi
  require_root
  require_ubuntu
  ensure_packages ca-certificates
  ensure_caddy_installed
  log "Ensuring document root $doc_root exists"
  mkdir -p "$doc_root"
  configure_site "$domain" "$doc_root"
  reload_caddy
  log "Done. $domain is now served from $doc_root"
}

main "$@"

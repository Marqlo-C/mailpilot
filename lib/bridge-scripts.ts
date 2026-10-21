/**
 * Shared helpers for zero-clone Ollama bridge script generation.
 * Scripts download a standalone cloudflared binary — no Node.js / npx required.
 */

const DEFAULT_HOST = "mailpilot-prod.vercel.app";

export function resolveBridgeApiBase(request: Request): string {
  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const host = hostHeader?.split(",")[0]?.trim() || DEFAULT_HOST;
  const protoHeader = request.headers.get("x-forwarded-proto");
  const protocol =
    protoHeader?.split(",")[0]?.trim() ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Escape a value for safe inclusion inside a double-quoted bash string. */
export function escapeBashDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

/** Escape a value for safe inclusion inside a PowerShell double-quoted string. */
export function escapePowerShellDoubleQuoted(value: string): string {
  return value
    .replace(/`/g, "``")
    .replace(/\$/g, "`$")
    .replace(/"/g, '`"')
    .replace(/\r/g, "")
    .replace(/\n/g, "`n");
}

export function buildMacBridgeScript(opts: {
  email: string;
  secret: string;
  apiBase: string;
}): string {
  const email = escapeBashDoubleQuoted(opts.email);
  const secret = escapeBashDoubleQuoted(opts.secret);
  const apiBase = escapeBashDoubleQuoted(opts.apiBase);

  return `#!/usr/bin/env bash
set -euo pipefail

EMAIL="${email}"
SECRET="${secret}"
API_BASE="${apiBase}"

if [ -z "$EMAIL" ] || [ -z "$SECRET" ]; then
  echo "Error: Missing email or secret in bridge command."
  exit 1
fi

echo "Checking local Ollama on port 11434..."
if ! curl -s --max-time 3 "http://127.0.0.1:11434/api/tags" > /dev/null; then
  echo "Ollama is not running at http://127.0.0.1:11434."
  echo "  Please open the Ollama desktop app first."
  exit 1
fi
echo "Local Ollama is running."

# Emit a JSON array of model names from localhost /api/tags (no cloud dependency).
collect_models_json() {
  local tags
  tags=\$(curl -sS --max-time 3 "http://127.0.0.1:11434/api/tags" 2>/dev/null || true)
  if [ -z "\$tags" ]; then
    echo "[]"
    return
  fi
  printf '%s' "\$tags" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(json.dumps([m.get("name") or m.get("model") or "" for m in d.get("models",[]) if (m.get("name") or m.get("model"))]))
except Exception:
  print("[]")' 2>/dev/null || echo "[]"
}

build_bridge_payload() {
  local models_json="\$1"
  EMAIL="\$EMAIL" TUNNEL_URL="\$TUNNEL_URL" SECRET="\$SECRET" MODELS_JSON="\$models_json" python3 - <<'PY'
import json, os
print(json.dumps({
  "email": os.environ["EMAIL"],
  "ollamaUrl": os.environ["TUNNEL_URL"],
  "bridgeSecret": os.environ["SECRET"],
  "models": json.loads(os.environ.get("MODELS_JSON") or "[]"),
}))
PY
}

# Resolve cloudflared: system PATH → /tmp cache → download
if command -v cloudflared >/dev/null 2>&1; then
  CF_PATH="$(command -v cloudflared)"
  echo "Found system cloudflared at $CF_PATH"
elif [ -x "/tmp/cloudflared" ]; then
  CF_PATH="/tmp/cloudflared"
  echo "Using cached /tmp/cloudflared"
else
  echo "Downloading standalone tunnel client..."
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  CF_PATH="/tmp/cloudflared"

  if [ "$OS" = "darwin" ]; then
    # Cloudflare ships macOS builds as .tgz tarballs
    TAR_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
    if [ "$ARCH" = "arm64" ]; then
      ARM_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
      if curl -sLI -f "$ARM_URL" > /dev/null 2>&1; then
        TAR_URL="$ARM_URL"
      fi
    fi
    if ! curl -fsSL "$TAR_URL" | tar -xz -C /tmp; then
      echo "Failed to download and extract cloudflared."
      exit 1
    fi
    # tar may extract as cloudflared or cloudflared-darwin-*
    if [ ! -f "$CF_PATH" ]; then
      EXTRACTED=$(find /tmp -maxdepth 1 -type f -name 'cloudflared*' | head -n 1 || true)
      if [ -n "$EXTRACTED" ] && [ "$EXTRACTED" != "$CF_PATH" ]; then
        mv "$EXTRACTED" "$CF_PATH"
      fi
    fi
    chmod +x "$CF_PATH"
    xattr -d com.apple.quarantine "$CF_PATH" 2>/dev/null || true
  else
    case "$ARCH" in
      aarch64|arm64) CF_BIN="cloudflared-linux-arm64" ;;
      x86_64)        CF_BIN="cloudflared-linux-amd64" ;;
      *)
        echo "Unsupported Linux architecture: $ARCH"
        exit 1
        ;;
    esac
    if ! curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_BIN" -o "$CF_PATH"; then
      echo "Failed to download cloudflared."
      exit 1
    fi
    chmod +x "$CF_PATH"
  fi

  if [ ! -x "$CF_PATH" ]; then
    echo "cloudflared binary missing after download."
    exit 1
  fi
fi

echo "Launching Cloudflare Quick Tunnel..."
TUNNEL_LOG=$(mktemp)
"$CF_PATH" tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

cleanup() {
  echo ""
  echo "Disconnecting bridge from MailPilot..."
  curl -s -X POST "$API_BASE/api/settings/ollama-bridge" \\
    -H "Content-Type: application/json" \\
    -d "{\\"email\\":\\"$EMAIL\\",\\"action\\":\\"disconnect\\",\\"bridgeSecret\\":\\"$SECRET\\"}" > /dev/null 2>&1 || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
  echo "Bridge closed cleanly. Goodbye!"
}
trap cleanup EXIT INT TERM

TUNNEL_URL=""
for _ in $(seq 1 50); do
  TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com' "$TUNNEL_LOG" | head -n 1 || true)
  if [ -n "$TUNNEL_URL" ]; then break; fi
  sleep 0.5
done

if [ -z "$TUNNEL_URL" ]; then
  echo "Failed to establish Cloudflare tunnel within 25s."
  cat "$TUNNEL_LOG" 2>/dev/null || true
  exit 1
fi

echo "Public Tunnel: $TUNNEL_URL"

# Prove Ollama on this machine and push model list to MailPilot.
# Prod/Vercel often cannot reach trycloudflare.com — CLI models are the source of truth.
MODELS_JSON=$(collect_models_json)
echo "Local models: $MODELS_JSON"

printf "Registering bridge with MailPilot... "
PAYLOAD=$(build_bridge_payload "$MODELS_JSON")

RESP=$(curl -s -X POST "$API_BASE/api/settings/ollama-bridge" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD")

if echo "$RESP" | grep -q '"success":true'; then
  echo "ok"
  echo ""
  echo "=========================================================="
  echo "MAILPILOT LOCAL OLLAMA BRIDGE ACTIVE"
  echo "  Connected account: $EMAIL"
  echo "  Tunnel URL: $TUNNEL_URL"
  echo "=========================================================="
  echo "Keep this terminal window open while using MailPilot."
  echo "Press Ctrl+C when finished to close the bridge."
  echo ""
  wait "$TUNNEL_PID" 2>/dev/null || true
else
  echo "FAILED"
  echo ""
  echo "Error from MailPilot: $RESP"
  exit 1
fi
`;
}

export function buildWinBridgeScript(opts: {
  email: string;
  secret: string;
  apiBase: string;
}): string {
  const email = escapePowerShellDoubleQuoted(opts.email);
  const secret = escapePowerShellDoubleQuoted(opts.secret);
  const apiBase = escapePowerShellDoubleQuoted(opts.apiBase);

  return `$email = "${email}"
$secret = "${secret}"
$apiUrl = "${apiBase}/api/settings/ollama-bridge"

if (-not $email -or -not $secret) {
    Write-Host "Error: Missing email or secret in bridge command." -ForegroundColor Red
    exit 1
}

Write-Host "Checking local Ollama on port 11434..." -ForegroundColor Cyan
try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -ErrorAction Stop
    $modelNames = @($tags.models | ForEach-Object { $_.name } | Where-Object { $_ })
    Write-Host "Local Ollama is running. Models: $($modelNames -join ', ')" -ForegroundColor Green
} catch {
    Write-Host "Cannot connect to local Ollama at http://127.0.0.1:11434" -ForegroundColor Red
    Write-Host "Please ensure the Ollama desktop app is open and running." -ForegroundColor Yellow
    exit 1
}

$cfPath = "$env:TEMP\\cloudflared.exe"
if (-not (Test-Path $cfPath)) {
    Write-Host "Downloading standalone tunnel client..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    try {
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfPath -UseBasicParsing
    } catch {
        Write-Host "Failed to download cloudflared. Please check your internet connection." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Launching Cloudflare Quick Tunnel..." -ForegroundColor Cyan
$tempLog = [System.IO.Path]::GetTempFileName()
$proc = Start-Process -FilePath $cfPath -ArgumentList "tunnel --url http://127.0.0.1:11434" -RedirectStandardError $tempLog -NoNewWindow -PassThru

$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $tempLog) {
        $content = Get-Content $tempLog -Raw -ErrorAction SilentlyContinue
        if ($content -match '(https://[a-zA-Z0-9-]+\\.trycloudflare\\.com)') {
            $tunnelUrl = $Matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "Failed to establish Cloudflare tunnel." -ForegroundColor Red
    if (Test-Path $tempLog) {
        Get-Content $tempLog -ErrorAction SilentlyContinue | Write-Host
    }
    if ($proc -and -not $proc.HasExited) { $proc.Kill() }
    exit 1
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " OLLAMA BRIDGE ONLINE" -ForegroundColor Green
Write-Host " Tunnel URL: $tunnelUrl" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

try {
    $body = @{ email = $email; ollamaUrl = $tunnelUrl; bridgeSecret = $secret; models = $modelNames } | ConvertTo-Json
    Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    Write-Host "Successfully linked! Your local GPU is handling requests." -ForegroundColor Green
    Write-Host "Keep this PowerShell window open. Press Ctrl+C to disconnect." -ForegroundColor Yellow
} catch {
    Write-Host "Failed to register tunnel URL with MailPilot: $_" -ForegroundColor Red
    if ($proc -and -not $proc.HasExited) { $proc.Kill() }
    exit 1
}

try {
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "Shutting down tunnel..." -ForegroundColor Yellow
    try {
        $body = @{ email = $email; action = "disconnect"; bridgeSecret = $secret } | ConvertTo-Json
        Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 3
    } catch {}
    if ($proc -and -not $proc.HasExited) { $proc.Kill() }
    Remove-Item $tempLog -Force -ErrorAction SilentlyContinue
    Write-Host "Disconnected cleanly. Goodbye!" -ForegroundColor Green
}
`;
}

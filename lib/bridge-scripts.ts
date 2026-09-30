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

  return `$ErrorActionPreference = "Stop"

$Email = "${email}"
$Secret = "${secret}"
$ApiBase = "${apiBase}"

if (-not $Email -or -not $Secret) {
    Write-Error "Missing email or secret in bridge command."
    exit 1
}

Write-Host "Checking local Ollama on port 11434..." -ForegroundColor Cyan
try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 3
    $names = @()
    if ($tags.models) {
        $names = $tags.models | ForEach-Object { $_.name }
    }
    Write-Host ("Local Ollama is running. Models: " + (($names -join ", ") -replace '^$', 'none')) -ForegroundColor Green
} catch {
    Write-Host "Ollama is not running at http://127.0.0.1:11434." -ForegroundColor Red
    Write-Host "  Please launch the Ollama desktop app first."
    exit 1
}

$cfPath = Join-Path $env:TEMP "cloudflared.exe"
if (-not (Test-Path $cfPath)) {
    Write-Host "Downloading standalone tunnel client..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfPath -UseBasicParsing
}

Write-Host "Launching Cloudflare Quick Tunnel..." -ForegroundColor Cyan
$tempLog = [System.IO.Path]::GetTempFileName()

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $cfPath
$psi.Arguments = "tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::Start($psi)

$logWriter = [System.IO.StreamWriter]::new($tempLog, $false)
$handler = {
    param($sender, $e)
    if (-not [string]::IsNullOrEmpty($e.Data)) {
        $logWriter.WriteLine($e.Data)
        $logWriter.Flush()
    }
}
$outHandler = [System.Diagnostics.DataReceivedEventHandler]$handler
$errHandler = [System.Diagnostics.DataReceivedEventHandler]$handler
$proc.add_OutputDataReceived($outHandler)
$proc.add_ErrorDataReceived($errHandler)
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

$tunnelUrl = $null
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    while (-not $tunnelUrl -and $stopwatch.ElapsedMilliseconds -lt 25000) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $tempLog) {
            $content = Get-Content $tempLog -Raw -ErrorAction SilentlyContinue
            if ($content -match '(https://[a-zA-Z0-9-]+\\.trycloudflare\\.com)') {
                $tunnelUrl = $matches[1]
            }
        }
    }

    if (-not $tunnelUrl) {
        Write-Host "Failed to establish Cloudflare tunnel within 25s." -ForegroundColor Red
        if (Test-Path $tempLog) {
            Get-Content $tempLog -ErrorAction SilentlyContinue | Write-Host
        }
        exit 1
    }

    Write-Host "Public Tunnel: $tunnelUrl" -ForegroundColor Green

    # Prove Ollama locally — do not depend on Vercel reaching Cloudflare.
    $modelNames = @()
    try {
        $localTags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 3
        if ($localTags.models) {
            $modelNames = @($localTags.models | ForEach-Object { $_.name } | Where-Object { $_ })
        }
    } catch {}
    Write-Host ("Local models: " + (($modelNames -join ", ") -replace '^$', 'none'))

    Write-Host -NoNewline "Registering bridge with MailPilot... "

    $bodyObj = @{
        email = $Email
        ollamaUrl = $tunnelUrl
        bridgeSecret = $Secret
        models = $modelNames
    }
    $body = $bodyObj | ConvertTo-Json -Compress

    try {
        $resp = Invoke-RestMethod -Uri "$ApiBase/api/settings/ollama-bridge" -Method Post -Body $body -ContentType "application/json"
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error from MailPilot: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }
        exit 1
    }

    if ($resp.success) {
        Write-Host "ok" -ForegroundColor Green
        Write-Host ""
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host "MAILPILOT LOCAL OLLAMA BRIDGE ACTIVE" -ForegroundColor Green
        Write-Host "  Connected account: $Email"
        Write-Host "  Tunnel URL: $tunnelUrl"
        Write-Host "=========================================================="
        Write-Host "Keep this terminal window open while using MailPilot."
        Write-Host "Press Ctrl+C when finished to close the bridge."
        Write-Host ""

        while (-not $proc.HasExited) {
            Start-Sleep -Seconds 1
        }
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error from MailPilot: $($resp | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
} finally {
    Write-Host ""
    Write-Host "Disconnecting bridge from MailPilot..." -ForegroundColor Yellow
    try {
        $dcBody = @{
            email = $Email
            action = "disconnect"
            bridgeSecret = $Secret
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$ApiBase/api/settings/ollama-bridge" -Method Post -Body $dcBody -ContentType "application/json" -TimeoutSec 5 | Out-Null
    } catch {}

    try { $logWriter.Close() } catch {}
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $tempLog -Force -ErrorAction SilentlyContinue
    Write-Host "Bridge closed cleanly. Goodbye!" -ForegroundColor Green
}
`;
}

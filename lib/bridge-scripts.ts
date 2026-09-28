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

MODELS_JSON=$(curl -s --max-time 5 "http://127.0.0.1:11434/api/tags" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\\n' ',' | sed 's/,$//' || true)
echo "Local Ollama active. Models detected: \${MODELS_JSON:-none}"

# Detect OS + CPU for the official standalone cloudflared binary
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$OS-$ARCH" in
  darwin-arm64)   CF_BIN="cloudflared-darwin-arm64" ;;
  darwin-x86_64)  CF_BIN="cloudflared-darwin-amd64" ;;
  linux-aarch64|linux-arm64) CF_BIN="cloudflared-linux-arm64" ;;
  linux-x86_64)   CF_BIN="cloudflared-linux-amd64" ;;
  *)
    echo "Unsupported platform: $OS/$ARCH"
    exit 1
    ;;
esac

CF_PATH="/tmp/cloudflared"
if [ ! -x "$CF_PATH" ]; then
  echo "Downloading standalone tunnel client ($CF_BIN)..."
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_BIN" -o "$CF_PATH"
  chmod +x "$CF_PATH"
fi

echo "Launching Cloudflare Quick Tunnel..."
TUNNEL_LOG=$(mktemp)
"$CF_PATH" tunnel --url http://127.0.0.1:11434 > "$TUNNEL_LOG" 2>&1 &
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
echo "Registering bridge with MailPilot..."

RESP=$(curl -s -X POST "$API_BASE/api/settings/ollama-bridge" \\
  -H "Content-Type: application/json" \\
  -d "{\\"email\\":\\"$EMAIL\\",\\"ollamaUrl\\":\\"$TUNNEL_URL\\",\\"bridgeSecret\\":\\"$SECRET\\"}")

if echo "$RESP" | grep -q '"success":true'; then
  echo ""
  echo "=========================================================="
  echo "MAILPILOT LOCAL OLLAMA BRIDGE ACTIVE"
  echo "  Connected account: $EMAIL"
  echo "  Inferences are now routed straight to your local GPU."
  echo "=========================================================="
  echo "Keep this terminal window open while using MailPilot."
  echo "  Press Ctrl+C when finished to close the bridge."
  echo ""
  wait "$TUNNEL_PID" || true
else
  echo "Registration failed: $RESP"
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
$psi.Arguments = "tunnel --url http://127.0.0.1:11434"
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
    Write-Host "Registering bridge with MailPilot..." -ForegroundColor Cyan

    $body = @{
        email = $Email
        ollamaUrl = $tunnelUrl
        bridgeSecret = $Secret
    } | ConvertTo-Json

    $resp = Invoke-RestMethod -Uri "$ApiBase/api/settings/ollama-bridge" -Method Post -Body $body -ContentType "application/json"

    if ($resp.success) {
        Write-Host ""
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host "MAILPILOT LOCAL OLLAMA BRIDGE ACTIVE" -ForegroundColor Green
        Write-Host "  Connected account: $Email"
        Write-Host "  Inferences are now routed straight to your local GPU."
        Write-Host "=========================================================="
        Write-Host "Keep this terminal window open while using MailPilot."
        Write-Host "  Press Ctrl+C when finished to close the bridge."
        Write-Host ""

        while (-not $proc.HasExited) {
            Start-Sleep -Seconds 1
        }
    } else {
        Write-Host "Registration failed." -ForegroundColor Red
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

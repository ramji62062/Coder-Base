import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const baseUrl = `${protocol}://${host}`;
  const osParam = req.nextUrl.searchParams.get("os")?.toLowerCase();

  // Windows PowerShell Installer
  if (osParam === "win" || osParam === "windows") {
    const psScript = `# CodeTogether Local Terminal Companion - Windows Setup
$ErrorActionPreference = "SilentlyContinue"
Write-Host "🚀 Installing CodeTogether Local Terminal Companion for Windows..." -ForegroundColor Cyan

$ctDir = Join-Path $HOME ".codetogether"
if (!(Test-Path $ctDir)) { New-Item -ItemType Directory -Path $ctDir -Force | Out-Null }
Set-Location $ctDir

$agentUrl = "${baseUrl}/api/agent/download"
$agentPath = Join-Path $ctDir "agent.js"
Write-Host "📥 Downloading agent script..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath

$pkgJson = @'
{
  "name": "codetogether-local-agent",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "ws": "^8.18.0"
  }
}
'@
Set-Content -Path (Join-Path $ctDir "package.json") -Value $pkgJson

Write-Host "📦 Installing agent dependencies (ws)..." -ForegroundColor Cyan
npm install --no-audit --no-fund --silent

# Register Windows Protocol Handler in Registry
New-Item -Path "HKCU:\\Software\\Classes\\codetogether" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\codetogether" -Name "(Default)" -Value "URL:CodeTogether Protocol"
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\codetogether" -Name "URL Protocol" -Value ""
New-Item -Path "HKCU:\\Software\\Classes\\codetogether\\shell\\open\\command" -Force | Out-Null
$vbsPath = Join-Path $ctDir "launch.vbs"
$vbsContent = "CreateObject(\`"Wscript.Shell\`").Run \`"node \`"\`"" + $agentPath + "\`"\`"\`", 0, False"
Set-Content -Path $vbsPath -Value $vbsContent
$cmd = "wscript.exe \`"" + $vbsPath + "\`""
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\codetogether\\shell\\open\\command" -Name "(Default)" -Value $cmd

# Stop any running instances and start
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*node*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process node -ArgumentList "\`"$agentPath\`"" -WindowStyle Hidden

Write-Host "✅ CodeTogether Local Terminal Companion installed and running!" -ForegroundColor Green
Write-Host "✨ You can now click 'Allow & Launch Terminal' on the website." -ForegroundColor Yellow
`;
    return new NextResponse(psScript, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // macOS and Linux Bash Installer
  const script = `#!/bin/bash
set -e

echo "🚀 Installing CodeTogether Local Terminal Companion..."
mkdir -p "$HOME/.codetogether"
cd "$HOME/.codetogether"

# Download latest agent script
curl -fsSL "${baseUrl}/api/agent/download" -o "$HOME/.codetogether/agent.js" || {
  echo "⚠️ Failed to download agent script."
  exit 1
}

# Create package.json and install required dependencies in ~/.codetogether
cat << 'PKG_EOF' > "$HOME/.codetogether/package.json"
{
  "name": "codetogether-local-agent",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "ws": "^8.18.0"
  },
  "optionalDependencies": {
    "node-pty": "^1.1.0"
  }
}
PKG_EOF

echo "📦 Installing agent dependencies (ws)..."
npm install --no-audit --no-fund --silent >/dev/null 2>&1 || npm install ws --no-audit --no-fund --silent >/dev/null 2>&1 || true

# Register Protocol Launcher
if [ "$(uname)" = "Darwin" ]; then
  APP_DIR="$HOME/Applications/CodeTogetherLauncher.app"
  mkdir -p "$APP_DIR/Contents/MacOS"
  
  cat << 'LAUNCHER_EOF' > "$APP_DIR/Contents/MacOS/CodeTogetherLauncher"
#!/bin/bash
node "$HOME/.codetogether/agent.js" >/dev/null 2>&1 &
LAUNCHER_EOF
  chmod +x "$APP_DIR/Contents/MacOS/CodeTogetherLauncher"

  cat << 'PLIST_EOF' > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>CodeTogetherLauncher</string>
    <key>CFBundleIdentifier</key>
    <string>com.codetogether.launcher</string>
    <key>CFBundleName</key>
    <string>CodeTogether Launcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSBackgroundOnly</key>
    <true/>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>CodeTogether URL</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>codetogether</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST_EOF

  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR" 2>/dev/null || true
elif [ "$(uname)" = "Linux" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat << LINUX_EOF > "$HOME/.local/share/applications/codetogether.desktop"
[Desktop Entry]
Name=CodeTogether Launcher
Exec=node $HOME/.codetogether/agent.js %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/codetogether;
LINUX_EOF
  xdg-mime default codetogether.desktop x-scheme-handler/codetogether 2>/dev/null || true
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

# Kill any existing agent to prevent port conflicts
pkill -f "$HOME/.codetogether/agent.js" 2>/dev/null || true
sleep 0.5

# Launch in background
nohup node "$HOME/.codetogether/agent.js" > "$HOME/.codetogether/agent.log" 2>&1 &

echo "✅ CodeTogether Local Terminal Companion installed and running!"
echo "✨ You can now click 'Allow & Launch Terminal' on the website."
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

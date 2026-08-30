#!/bin/bash
set -e

# CodeTogether Protocol Registration for macOS
APP_DIR="$HOME/Applications/CodeTogetherLauncher.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# Create launcher script
cat << 'LAUNCHER_EOF' > "$MACOS_DIR/CodeTogetherLauncher"
#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const url = process.argv[2] || "";
let roomId = "default";
let port = 8765;
let token = "";

try {
  if (url && url.startsWith("codetogether://")) {
    const parsed = new URL(url);
    roomId = parsed.searchParams.get("roomId") || "default";
    port = parseInt(parsed.searchParams.get("port"), 10) || 8765;
    token = parsed.searchParams.get("token") || "";
  }
} catch (e) {}

const agentScript = path.resolve(__dirname, "../../agent/index.js");
const defaultAgent = path.join(os.homedir(), ".codetogether", "agent.js");
const targetScript = fs.existsSync(agentScript) ? agentScript : defaultAgent;

if (fs.existsSync(targetScript)) {
  const child = spawn(process.execPath || "node", [targetScript, "--port", String(port), "--token", token], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
LAUNCHER_EOF

chmod +x "$MACOS_DIR/CodeTogetherLauncher"

# Create Info.plist with URL Scheme
cat << 'PLIST_EOF' > "$CONTENTS_DIR/Info.plist"
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
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
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

# Register with macOS Launch Services
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR" 2>/dev/null || true

# Copy standalone agent script to ~/.codetogether/agent.js
mkdir -p "$HOME/.codetogether"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$CURRENT_DIR/agent/index.js" ]; then
  cp "$CURRENT_DIR/agent/index.js" "$HOME/.codetogether/agent.js"
fi

echo "✅ CodeTogether Protocol (codetogether://) successfully registered on macOS!"

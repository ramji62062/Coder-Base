@echo off
setlocal
echo Registering codetogether:// protocol for Windows...

set "AGENT_DIR=%USERPROFILE%\.codetogether"
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"
copy /Y "%~dp0..\agent\index.js" "%AGENT_DIR%\agent.js" >nul 2>&1

reg add "HKCU\Software\Classes\codetogether" /ve /d "URL:CodeTogether Protocol" /f
reg add "HKCU\Software\Classes\codetogether" /v "URL Protocol" /d "" /f
reg add "HKCU\Software\Classes\codetogether\shell\open\command" /ve /d "node.exe \"%AGENT_DIR%\agent.js\"" /f

echo CodeTogether Protocol (codetogether://) successfully registered on Windows!

# CodeTogether Local Agent

The **CodeTogether Local Agent** allows you to connect a real local terminal (e.g. `zsh`, `bash`, `powershell`) running directly on your computer to CodeTogether, and automatically saves project files to your local machine on `Ctrl+S` / `Cmd+S`.

## How to Start the Local Agent

From your project directory, run:

```bash
npm run agent
```

or with custom flags:

```bash
node agent/index.js --dir /path/to/your/project --port 8765
```

### Options:

| Flag | Description | Default |
|---|---|---|
| `-d, --dir <path>` | Authorized workspace directory path | Current working directory |
| `-p, --port <port>` | Port to listen on | `8765` |
| `-t, --token <token>` | Custom security token | Auto-generated in `.codetogether-agent.json` |
| `-h, --host <host>` | Host interface (bound locally) | `127.0.0.1` |
| `--help` | Show command line options | |

## Connecting in CodeTogether Browser UI

1. Open CodeTogether in your browser.
2. In the bottom **Terminal** panel, click **Local Terminal** mode.
3. Click **Connect Local Terminal**.
4. Read and approve the permission dialog by clicking **Allow & Connect**.
5. Your local shell will connect with full interactive support (`cd`, `Ctrl+C`, `npm`, `git`, etc.) and your editor edits will save directly to your local files.

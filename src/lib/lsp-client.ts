// Real LSP intellisense client for CodeTogether.
//
// Connects to the dedicated `/ws/lsp` WebSocket channel (fully separate from
// the terminal byte stream and the editor/collab channel). It speaks real
// LSP JSON-RPC with the language server running inside the session container
// and drives Monaco's own language features: diagnostics (squiggles),
// type-aware completion, hover docs, go-to-definition, find references, rename.
//
// This is the equivalent of monaco-languageclient but implemented directly
// against Monaco's provider API so it coexists cleanly with @monaco-editor/react
// and the collaborative-editing layer (no separate editor instance is created).

import type * as Monaco from "monaco-editor";

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

function langToLsp(language: string): string {
  if (["typescript", "ts", "tsx", "javascript", "js", "jsx"].includes(language)) return "typescript";
  if (["python", "py"].includes(language)) return "python";
  return language;
}

function docUri(activeFileName: string): string {
  const p = activeFileName.replace(/\\/g, "/").replace(/^\/+/, "");
  return `file:///workspace/${p}`;
}

export class LspClient {
  private monaco: typeof Monaco;
  private getEditor: () => any;
  private getActiveFile: () => string;
  private getLanguage: () => string;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private connected = false;
  private disposed = false;
  private activeUri = "";
  private language = "typescript";
  private lastText = "";
  private registered = new Set<string>();
  private changeSub: any = null;

  constructor(opts: {
    monaco: typeof Monaco;
    getEditor: () => any;
    getActiveFile: () => string;
    getLanguage: () => string;
  }) {
    this.monaco = opts.monaco;
    this.getEditor = opts.getEditor;
    this.getActiveFile = opts.getActiveFile;
    this.getLanguage = opts.getLanguage;
  }

  // ── Lifecycle ──
  connect(roomId: string, token: string, userId: string, language: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.language = langToLsp(language);
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/lsp?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}&language=${encodeURIComponent(this.language)}&userId=${encodeURIComponent(userId)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) { ws.close(); return; }
      this.connected = true;
      this.sendInitialize();
    };
    ws.onmessage = (ev) => this.handleMessage(ev);
    ws.onclose = () => { this.connected = false; };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  dispose() {
    this.disposed = true;
    if (this.changeSub) { try { this.changeSub.dispose(); } catch {} this.changeSub = null; }
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }

  // Close the current channel (e.g. to re-bind to a different language server)
  // without tearing down the client for reuse.
  disconnect() {
    if (this.changeSub) { try { this.changeSub.dispose(); } catch {} this.changeSub = null; }
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.connected = false;
  }

  // Called by the host editor when the active file changes so we open/close the
  // right document on the language server (keeps diagnostics/completions scoped
  // to the file actually being edited — including during live collaboration).
  setActiveFile(fileName: string) {
    const newUri = docUri(fileName);
    if (newUri === this.activeUri) return;
    if (this.activeUri && this.connected) {
      this.notify("textDocument/didClose", {
        textDocument: { uri: this.activeUri },
      });
    }
    this.activeUri = newUri;
    this.openActive();
  }

  setLanguage(language: string) {
    this.language = langToLsp(language);
  }

  private currentModel() {
    const editor = this.getEditor();
    return editor && editor.getModel ? editor.getModel() : null;
  }

  private openActive() {
    const model = this.currentModel();
    if (!model || !this.connected) return;
    const text = model.getValue();
    this.lastText = text;
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: this.activeUri,
        languageId: this.language,
        version: 1,
        text,
      },
    });
    this.ensureSubscriptions();
  }

  // ── Monaco change subscription ──
  private ensureSubscriptions() {
    if (this.changeSub) return;
    const editor = this.getEditor();
    if (!editor || !editor.onDidChangeModelContent) return;
    this.changeSub = editor.onDidChangeModelContent(() => {
      const model = this.currentModel();
      if (!model || !this.connected || !this.activeUri) return;
      const text = model.getValue();
      this.lastText = text;
      // Full-document sync — simplest and robust for collaborative editing.
      this.notify("textDocument/didChange", {
        textDocument: { uri: this.activeUri, version: Date.now() },
        contentChanges: [{ text }],
      });
    });
  }

  // ── JSON-RPC plumbing ──
  private send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private request(method: string, params: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("LSP timeout"));
        }
      }, 8000);
    });
  }

  private notify(method: string, params: any) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private handleMessage(ev: MessageEvent) {
    let msg: any;
    try { msg = JSON.parse(ev.data as string); } catch { return; }
    const isResponse = msg.id !== undefined && msg.id !== null && !msg.method;
    if (isResponse) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(msg.error);
        else p.resolve(msg.result);
      }
      return;
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      this.applyDiagnostics(msg.params);
      return;
    }
    // Server-to-client requests (e.g. client/registerCapability,
    // workspace/configuration) must be answered or the server hangs / disables
    // features. Respond with sensible empty results.
    if (msg.method && msg.id !== undefined && msg.id !== null) {
      let result: any = {};
      if (msg.method === "workspace/configuration") {
        const items = (msg.params && msg.params.items) || [];
        result = items.map(() => ({}));
      }
      this.send({ jsonrpc: "2.0", id: msg.id, result });
    }
  }

  private applyDiagnostics(params: any) {
    if (!params || !params.uri) return;
    const model = this.monaco.editor.getModels().find((m) => m.uri.toString() === params.uri);
    if (!model) return;
    const markers = (params.diagnostics || []).map((d: any) => {
      const range = d.range;
      const start = this.toPosition(range.start);
      const end = this.toPosition(range.end);
      return {
        startLineNumber: start.line,
        startColumn: start.character,
        endLineNumber: end.line,
        endColumn: end.character,
        message: d.message || "",
        severity: this.severity(d.severity),
        source: d.source || "lsp",
        code: d.code ? String(d.code) : undefined,
      };
    });
    this.monaco.editor.setModelMarkers(model, "codetogether-lsp", markers);
  }

  private severity(s?: number): number {
    const monaco = this.monaco;
    switch (s) {
      case 1: return monaco.MarkerSeverity.Error;
      case 2: return monaco.MarkerSeverity.Warning;
      case 3: return monaco.MarkerSeverity.Info;
      case 4: return monaco.MarkerSeverity.Hint;
      default: return monaco.MarkerSeverity.Error;
    }
  }

  private toPosition(p: any) {
    return { line: Math.max(1, (p.line || 1)), character: Math.max(1, (p.character || 1)) };
  }

  private toMonacoRange(r: any) {
    const s = this.toPosition(r.start);
    const e = this.toPosition(r.end);
    return new this.monaco.Range(s.line, s.character, e.line, e.character);
  }

  // ── Capabilities handshake ──
  private sendInitialize() {
    this.request("initialize", {
      processId: null,
      rootUri: "file:///workspace",
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          completion: { completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] }, contextSupport: true },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true },
        },
        workspace: { workspaceFolders: true, didChangeConfiguration: { dynamicRegistration: true } },
      },
      workspaceFolders: [{ uri: "file:///workspace", name: "workspace" }],
    }).then(() => {
      this.notify("initialized", {});
      this.openActive();
      this.registerProviders();
    }).catch(() => {});
  }

  // ── Monaco feature providers (registered once per language id) ──
  private registerProviders() {
    const monaco = this.monaco;
    const langId = this.language;
    // One language SERVER may back several Monaco language ids (e.g. the TS
    // server drives both `typescript` and `javascript` files).
    const aliasIds =
      langId === "typescript" ? ["typescript", "javascript", "typescriptreact", "javascriptreact"] : [langId];
    for (const id of aliasIds) {
      if (this.registered.has(id)) continue;
      this.registered.add(id);
    }
    if (this.registered.has(`${langId}:done`)) return;
    this.registered.add(`${langId}:done`);

    const client = this;

    monaco.languages.registerCompletionItemProvider(langId, {
      provideCompletionItems: async (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const result = await client.request("textDocument/completion", {
          textDocument: { uri: client.activeUri },
          position: { line: position.lineNumber, character: position.column },
        });
        if (!result) return { suggestions: [] };
        const items = Array.isArray(result) ? result : (result.items || []);
        const suggestions = items.map((it: any) => {
          const kind = client.completionKind(it.kind);
          const insertText = it.insertText || it.label;
          return {
            label: it.label,
            kind,
            detail: it.detail || "",
            documentation: client.docString(it.documentation),
            insertText,
            insertTextRules: it.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            sortText: it.sortText,
          };
        });
        return { suggestions };
      },
    });

    monaco.languages.registerHoverProvider(langId, {
      provideHover: async (model: any, position: any) => {
        const result = await client.request("textDocument/hover", {
          textDocument: { uri: client.activeUri },
          position: { line: position.lineNumber, character: position.column },
        });
        if (!result || !result.contents) return null;
        const contents = client.hoverContents(result.contents);
        return { contents };
      },
    });

    monaco.languages.registerDefinitionProvider(langId, {
      provideDefinition: async (model: any, position: any) => {
        const result = await client.request("textDocument/definition", {
          textDocument: { uri: client.activeUri },
          position: { line: position.lineNumber, character: position.column },
        });
        return client.toLocations(result);
      },
    });

    monaco.languages.registerReferenceProvider(langId, {
      provideReferences: async (model: any, position: any) => {
        const result = await client.request("textDocument/references", {
          textDocument: { uri: client.activeUri },
          position: { line: position.lineNumber, character: position.column },
          context: { includeDeclaration: true },
        });
        return client.toLocations(result);
      },
    });

    monaco.languages.registerRenameProvider(langId, {
      provideRenameEdits: async (model: any, position: any, newName: string) => {
        const result = await client.request("textDocument/rename", {
          textDocument: { uri: client.activeUri },
          position: { line: position.lineNumber, character: position.column },
          newName,
        });
        if (!result || !result.changes) return null;
        const edits: any = {};
        for (const [uri, changes] of Object.entries<any>(result.changes)) {
          const m = monaco.editor.getModels().find((mm) => mm.uri.toString() === uri);
          if (!m) continue;
          edits[uri] = changes.map((c: any) => ({ range: client.toMonacoRange(c.range), text: c.newText }));
        }
        return { edits };
      },
    });
  }

  private toLocations(result: any): any[] {
    if (!result) return [];
    const arr = Array.isArray(result) ? result : [result];
    return arr
      .filter((l: any) => l && l.uri)
      .map((l: any) => ({
        uri: this.monaco.Uri.parse(l.uri),
        range: this.toMonacoRange(l.range),
      }));
  }

  private hoverContents(contents: any): any {
    if (typeof contents === "string") return { value: contents };
    if (Array.isArray(contents)) {
      const first = contents[0];
      if (typeof first === "string") return { value: first };
      if (first && first.value) return { value: first.value, isTrusted: true };
    }
    if (contents && contents.value) return { value: contents.value, isTrusted: true };
    return { value: "" };
  }

  private docString(d: any): any {
    if (!d) return undefined;
    if (typeof d === "string") return d;
    if (d.value) return { value: d.value, isTrusted: true };
    return undefined;
  }

  private completionKind(k?: number): number {
    const monaco = this.monaco;
    const K = monaco.languages.CompletionItemKind;
    const map: Record<number, number> = {
      1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field,
      6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
      11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet,
      16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
      21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter,
    };
    return map[k || 1] || K.Text;
  }
}

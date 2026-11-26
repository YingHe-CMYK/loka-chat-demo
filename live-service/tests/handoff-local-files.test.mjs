// sites/loka-chat-pages/live-service/src/handoff/local-files.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// sites/loka-chat-pages/live-service/src/handoff/local-files.ts
var MAX_LOCAL_FILES = 500;
var MAX_LOCAL_ENTRIES = 2500;
var MAX_LOCAL_DEPTH = 12;
var MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
var MAX_PREVIEW_BYTES = 128 * 1024;
var MAX_PREVIEW_CHARS = 64e3;
var textExtensions = /* @__PURE__ */ new Set(["txt", "text", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "log", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "html", "css", "scss", "xml", "sql", "sh", "toml", "ini", "rst"]);
var ignoredDirectories = /* @__PURE__ */ new Set(["node_modules", "vendor", "dist", "build", "coverage", "__pycache__"]);
function excludedPath(path) {
  return path.replaceAll("\\", "/").split("/").some((part) => part.startsWith(".") || ignoredDirectories.has(part.toLowerCase()) || /^(id_rsa|id_ed25519|client_secret.*|credentials\.json)$/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part));
}
function safeLocalPath(raw) {
  const path = raw.replaceAll("\\", "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return path;
}
function entryStatus(name, size) {
  if (!textExtensions.has(name.split(".").at(-1)?.toLowerCase() || "")) return "unsupported";
  return size > MAX_TEXT_FILE_BYTES ? "large" : "text";
}
function checkAbort(signal) {
  signal?.throwIfAborted();
}
function permissionFailure(error) {
  return error instanceof Error && ["NotAllowedError", "SecurityError"].includes(error.name);
}
async function scanDirectory(directory2, signal) {
  const source = { name: directory2.name, mode: "folder", status: "connected", files: [], skipped: 0, limited: false, directory: directory2 };
  let visited = 0;
  async function walk(handle2, prefix, depth) {
    checkAbort(signal);
    for await (const child of handle2.values()) {
      checkAbort(signal);
      if (++visited > MAX_LOCAL_ENTRIES || source.files.length >= MAX_LOCAL_FILES) {
        source.limited = true;
        return;
      }
      const path = safeLocalPath(prefix + child.name);
      if (!path || excludedPath(path)) {
        source.skipped++;
        continue;
      }
      if (child.kind === "directory") {
        if (depth >= MAX_LOCAL_DEPTH) {
          source.limited = true;
          source.skipped++;
          continue;
        }
        await walk(child, path + "/", depth + 1);
      } else {
        try {
          const file = await child.getFile();
          checkAbort(signal);
          source.files.push({ path, name: child.name, size: file.size, modified: file.lastModified, status: entryStatus(child.name, file.size), handle: child });
        } catch (error) {
          checkAbort(signal);
          if (permissionFailure(error)) throw error;
          source.files.push({ path, name: child.name, size: 0, modified: 0, status: "unavailable", handle: child });
        }
      }
      if (visited >= MAX_LOCAL_ENTRIES || source.files.length >= MAX_LOCAL_FILES) {
        source.limited = true;
        return;
      }
    }
  }
  await walk(directory2, "", 0);
  source.files.sort((left, right) => left.path.localeCompare(right.path));
  return source;
}
function importLocalFiles(files, mode) {
  const folderName = mode === "folder" ? files.find((file) => file.webkitRelativePath)?.webkitRelativePath.split("/")[0] : "";
  const source = { name: folderName || (mode === "folder" ? "\u6240\u9009\u6587\u4EF6\u5939" : "\u5BFC\u5165\u7684\u6587\u4EF6"), mode, status: "connected", files: [], skipped: 0, limited: false };
  const seen = /* @__PURE__ */ new Set();
  for (const file of files.slice(0, MAX_LOCAL_ENTRIES)) {
    const relative = mode === "folder" && file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name;
    const path = safeLocalPath(relative);
    if (!path || excludedPath(path) || seen.has(path)) {
      source.skipped++;
      continue;
    }
    if (source.files.length >= MAX_LOCAL_FILES) {
      source.limited = true;
      break;
    }
    seen.add(path);
    source.files.push({ path, name: file.name, size: file.size, modified: file.lastModified, status: entryStatus(file.name, file.size), file });
  }
  if (files.length > MAX_LOCAL_ENTRIES) source.limited = true;
  source.files.sort((left, right) => left.path.localeCompare(right.path));
  return source;
}
async function readLocalEntry(entry2) {
  if (entry2.status !== "text") throw new Error(entry2.status === "large" ? "\u6587\u4EF6\u8D85\u8FC7 2 MB\uFF0C\u8BF7\u9009\u62E9\u8F83\u5C0F\u7684\u6587\u672C\u6587\u4EF6\u3002" : "\u5F53\u524D\u4EC5\u652F\u6301\u6587\u672C\u6587\u4EF6\u9884\u89C8\u3002");
  const file = entry2.handle ? await entry2.handle.getFile() : entry2.file;
  if (!file) throw new Error("\u6587\u4EF6\u8BBF\u95EE\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error("\u6587\u4EF6\u8D85\u8FC7 2 MB\uFF0C\u8BF7\u9009\u62E9\u8F83\u5C0F\u7684\u6587\u672C\u6587\u4EF6\u3002");
  const bytes = new Uint8Array(await file.slice(0, MAX_PREVIEW_BYTES).arrayBuffer());
  const partial = file.size > bytes.length;
  let encoding = "UTF-8", text = "";
  if (bytes[0] === 255 && bytes[1] === 254) encoding = "UTF-16LE";
  else if (bytes[0] === 254 && bytes[1] === 255) encoding = "UTF-16BE";
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: partial });
  } catch {
    try {
      encoding = "GB18030";
      text = new TextDecoder("gb18030", { fatal: true }).decode(bytes, { stream: partial });
    } catch {
      throw new Error("\u65E0\u6CD5\u8BC6\u522B\u6587\u4EF6\u7F16\u7801\uFF0C\u8BF7\u4F7F\u7528 UTF-8 \u6587\u672C\u6587\u4EF6\u3002");
    }
  }
  let controls = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controls++;
  }
  if (text.includes("\0") || controls > Math.max(2, text.length * 0.02)) throw new Error("\u8FD9\u4E2A\u6587\u4EF6\u5305\u542B\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF0C\u65E0\u6CD5\u4F5C\u4E3A\u6587\u672C\u9884\u89C8\u3002");
  return { text: text.slice(0, MAX_PREVIEW_CHARS), encoding, truncated: partial || text.length > MAX_PREVIEW_CHARS, size: file.size };
}

// sites/loka-chat-pages/live-service/src/handoff/local-files.test.ts
function handle(name, text = "hello") {
  return { kind: "file", name, getFile: async () => new File([text], name) };
}
function directory(name, children) {
  return { kind: "directory", name, async *values() {
    yield* children;
  } };
}
function entry(file) {
  return importLocalFiles([file], "files").files[0];
}
test("local paths stay relative and private/dependency entries are excluded", () => {
  for (const path of ["../outside.txt", "docs/../../outside.txt", "/root/file.txt", "C:\\secret.txt", "a\0b.txt"]) assert.equal(safeLocalPath(path), null);
  assert.equal(safeLocalPath("notes\\\u65E5\u62A5.md"), "notes/\u65E5\u62A5.md");
  for (const path of [".env", ".git/config", "src/node_modules/dep.txt", "client_secret_google.json", "key.pem"]) assert.equal(excludedPath(path), true);
  assert.equal(excludedPath("notes/\u65E5\u62A5.md"), false);
});
test("directory scanning reads metadata only, skips private folders and preserves relative paths", async () => {
  let bodies = 0, hiddenReads = 0;
  const textFile = new File(["body"], "notes.md");
  Object.defineProperty(textFile, "arrayBuffer", { value: () => {
    bodies++;
    throw new Error("Unexpected body read");
  } });
  const root = directory("selected", [{ kind: "file", name: "notes.md", getFile: async () => textFile }, directory("docs", [handle("meeting.txt")]), { kind: "file", name: ".env", getFile: async () => {
    hiddenReads++;
    throw new Error();
  } }, directory("node_modules", [handle("private.txt")])]);
  const source = await scanDirectory(root);
  assert.deepEqual(source.files.map((file) => file.path), ["docs/meeting.txt", "notes.md"]);
  assert.equal(source.skipped, 2);
  assert.equal(bodies, 0);
  assert.equal(hiddenReads, 0);
});
test("large directories and cancelled scans are bounded", async () => {
  const root = directory("large", Array.from({ length: MAX_LOCAL_FILES + 50 }, (_, index) => handle(`${index}.txt`)));
  const source = await scanDirectory(root);
  assert.equal(source.files.length, MAX_LOCAL_FILES);
  assert.equal(source.limited, true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scanDirectory(root, controller.signal), { name: "AbortError" });
});
test("empty and unreadable folders do not create invented file content", async () => {
  assert.equal((await scanDirectory(directory("empty", []))).files.length, 0);
  const root = directory("gone", [{ kind: "file", name: "gone.txt", getFile: async () => {
    throw new DOMException("gone", "NotFoundError");
  } }]);
  assert.equal((await scanDirectory(root)).files[0].status, "unavailable");
  const denied = { kind: "directory", name: "denied", async *values() {
    yield* [];
    throw new DOMException("denied", "NotAllowedError");
  } };
  await assert.rejects(scanDirectory(denied), { name: "NotAllowedError" });
});
test("folder imports preserve paths, deduplicate and support standalone file imports", () => {
  const file = new File(["text"], "test.md");
  Object.defineProperty(file, "webkitRelativePath", { value: "folder/notes/test.md" });
  const source = importLocalFiles([file, file, new File(["secret"], ".env")], "folder");
  assert.equal(source.name, "folder");
  assert.equal(source.files[0].path, "notes/test.md");
  assert.equal(source.skipped, 2);
  assert.equal(importLocalFiles([new File(["{}"], "plain.json")], "files").files[0].path, "plain.json");
});
test("UTF-8/UTF-16/GB18030 text is decoded without interpreting HTML", async () => {
  assert.equal((await readLocalEntry(entry(new File(["<script>untrusted</script>\n\u4F60\u597D"], "note.md")))).text, "<script>untrusted</script>\n\u4F60\u597D");
  assert.equal((await readLocalEntry(entry(new File([new Uint8Array([255, 254, 65, 0, 66, 0])], "utf16.txt")))).text, "AB");
  const gb = await readLocalEntry(entry(new File([new Uint8Array([196, 227, 186, 195])], "gb.txt")));
  assert.equal(gb.text, "\u4F60\u597D");
  assert.equal(gb.encoding, "GB18030");
});
test("text previews cap memory and reject binary/unsupported/oversize files", async () => {
  const preview = await readLocalEntry(entry(new File(["a".repeat(2e5)], "long.txt")));
  assert.equal(preview.text.length, MAX_PREVIEW_CHARS);
  assert.equal(preview.truncated, true);
  await assert.rejects(readLocalEntry(entry(new File([new Uint8Array([0, 1, 2, 3, 4])], "binary.txt"))), /二进制/);
  await assert.rejects(readLocalEntry(entry(new File(["pdf"], "document.pdf"))), /文本文件/);
  await assert.rejects(readLocalEntry(entry(new File(["a".repeat(MAX_TEXT_FILE_BYTES + 1)], "big.txt"))), /2 MB/);
});
test("native file handles read the latest contents and detect revoked access", async () => {
  let text = "old";
  const fileHandle = { kind: "file", name: "live.txt", getFile: async () => new File([text], "live.txt") };
  const source = await scanDirectory(directory("folder", [fileHandle]));
  text = "new";
  assert.equal((await readLocalEntry(source.files[0])).text, "new");
  fileHandle.getFile = async () => {
    throw new DOMException("revoked", "NotAllowedError");
  };
  await assert.rejects(readLocalEntry(source.files[0]), { name: "NotAllowedError" });
});

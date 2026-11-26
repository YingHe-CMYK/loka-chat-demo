const MAX_LOCAL_FILES = 500;
const MAX_LOCAL_ENTRIES = 2500;
const MAX_LOCAL_DEPTH = 12;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 128 * 1024;
const MAX_PREVIEW_CHARS = 64e3;
const textExtensions = /* @__PURE__ */ new Set(["txt", "text", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "log", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "html", "css", "scss", "xml", "sql", "sh", "toml", "ini", "rst"]);
const ignoredDirectories = /* @__PURE__ */ new Set(["node_modules", "vendor", "dist", "build", "coverage", "__pycache__"]);
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
function localFileError(error) {
  if (permissionFailure(error)) return "\u6CA1\u6709\u83B7\u5F97\u6587\u4EF6\u8BBF\u95EE\u6743\u9650\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6587\u4EF6\u5939\uFF0C\u6216\u4F7F\u7528\u6587\u4EF6\u5BFC\u5165\u3002";
  if (error instanceof Error && error.name === "NotFoundError") return "\u6587\u4EF6\u5DF2\u88AB\u79FB\u52A8\u6216\u5220\u9664\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u76EE\u5F55\u3002";
  if (error instanceof Error && error.name === "NotReadableError") return "\u6587\u4EF6\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u5173\u95ED\u5360\u7528\u5B83\u7684\u7A0B\u5E8F\u540E\u91CD\u8BD5\u3002";
  return error instanceof Error && error.message ? error.message : "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002";
}
async function scanDirectory(directory, signal) {
  const source = { name: directory.name, mode: "folder", status: "connected", files: [], skipped: 0, limited: false, directory };
  let visited = 0;
  async function walk(handle, prefix, depth) {
    checkAbort(signal);
    for await (const child of handle.values()) {
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
  await walk(directory, "", 0);
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
async function readLocalEntry(entry) {
  if (entry.status !== "text") throw new Error(entry.status === "large" ? "\u6587\u4EF6\u8D85\u8FC7 2 MB\uFF0C\u8BF7\u9009\u62E9\u8F83\u5C0F\u7684\u6587\u672C\u6587\u4EF6\u3002" : "\u5F53\u524D\u4EC5\u652F\u6301\u6587\u672C\u6587\u4EF6\u9884\u89C8\u3002");
  const file = entry.handle ? await entry.handle.getFile() : entry.file;
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
export {
  MAX_LOCAL_DEPTH,
  MAX_LOCAL_ENTRIES,
  MAX_LOCAL_FILES,
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_CHARS,
  MAX_TEXT_FILE_BYTES,
  entryStatus,
  excludedPath,
  importLocalFiles,
  localFileError,
  permissionFailure,
  readLocalEntry,
  safeLocalPath,
  scanDirectory
};

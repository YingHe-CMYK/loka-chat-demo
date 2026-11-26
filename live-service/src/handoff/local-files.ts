export const MAX_LOCAL_FILES = 500
export const MAX_LOCAL_ENTRIES = 2500
export const MAX_LOCAL_DEPTH = 12
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024
export const MAX_PREVIEW_BYTES = 128 * 1024
export const MAX_PREVIEW_CHARS = 64000

export type LocalFileHandle = { kind: 'file'; name: string; getFile: () => Promise<File> }
export type LocalDirectoryHandle = { kind: 'directory'; name: string; values: () => AsyncIterable<LocalDirectoryHandle | LocalFileHandle> }
export type LocalEntry = { path: string; name: string; size: number; modified: number; status: 'text' | 'unsupported' | 'large' | 'unavailable'; file?: File; handle?: LocalFileHandle }
export type LocalSource = { name: string; mode: 'folder' | 'files'; status: 'connected' | 'reselect'; files: LocalEntry[]; skipped: number; limited: boolean; directory?: LocalDirectoryHandle }
export type LocalPreview = { text: string; encoding: string; truncated: boolean; size: number }
export type PickerWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'read' }) => Promise<LocalDirectoryHandle> }

const textExtensions = new Set(['txt', 'text', 'md', 'markdown', 'json', 'csv', 'tsv', 'yaml', 'yml', 'log', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'html', 'css', 'scss', 'xml', 'sql', 'sh', 'toml', 'ini', 'rst'])
const ignoredDirectories = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', '__pycache__'])
export function excludedPath(path: string) {
  return path.replaceAll('\\', '/').split('/').some(part => part.startsWith('.') || ignoredDirectories.has(part.toLowerCase()) || /^(id_rsa|id_ed25519|client_secret.*|credentials\.json)$/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part))
}
export function safeLocalPath(raw: string) {
  const path = raw.replaceAll('\\', '/')
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0') || path.split('/').some(part => !part || part === '.' || part === '..')) return null
  return path
}
export function entryStatus(name: string, size: number): LocalEntry['status'] {
  if (!textExtensions.has(name.split('.').at(-1)?.toLowerCase() || '')) return 'unsupported'
  return size > MAX_TEXT_FILE_BYTES ? 'large' : 'text'
}
function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted() }
export function permissionFailure(error: unknown) { return error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name) }
export function localFileError(error: unknown) {
  if (permissionFailure(error)) return '没有获得文件访问权限，请重新选择文件夹，或使用文件导入。'
  if (error instanceof Error && error.name === 'NotFoundError') return '文件已被移动或删除，请重新读取目录。'
  if (error instanceof Error && error.name === 'NotReadableError') return '文件暂时无法读取，请关闭占用它的程序后重试。'
  return error instanceof Error && error.message ? error.message : '暂时无法读取文件，请重新选择。'
}

export async function scanDirectory(directory: LocalDirectoryHandle, signal?: AbortSignal): Promise<LocalSource> {
  const source: LocalSource = { name: directory.name, mode: 'folder', status: 'connected', files: [], skipped: 0, limited: false, directory }
  let visited = 0
  async function walk(handle: LocalDirectoryHandle, prefix: string, depth: number): Promise<void> {
    checkAbort(signal)
    for await (const child of handle.values()) {
      checkAbort(signal)
      if (++visited > MAX_LOCAL_ENTRIES || source.files.length >= MAX_LOCAL_FILES) { source.limited = true; return }
      const path = safeLocalPath(prefix + child.name)
      if (!path || excludedPath(path)) { source.skipped++; continue }
      if (child.kind === 'directory') {
        if (depth >= MAX_LOCAL_DEPTH) { source.limited = true; source.skipped++; continue }
        await walk(child, path + '/', depth + 1)
      } else {
        try {
          const file = await child.getFile(); checkAbort(signal)
          source.files.push({ path, name: child.name, size: file.size, modified: file.lastModified, status: entryStatus(child.name, file.size), handle: child })
        } catch (error) {
          checkAbort(signal)
          if (permissionFailure(error)) throw error
          source.files.push({ path, name: child.name, size: 0, modified: 0, status: 'unavailable', handle: child })
        }
      }
      if (visited >= MAX_LOCAL_ENTRIES || source.files.length >= MAX_LOCAL_FILES) { source.limited = true; return }
    }
  }
  await walk(directory, '', 0)
  source.files.sort((left, right) => left.path.localeCompare(right.path))
  return source
}

export function importLocalFiles(files: File[], mode: 'folder' | 'files'): LocalSource {
  const folderName = mode === 'folder' ? files.find(file => file.webkitRelativePath)?.webkitRelativePath.split('/')[0] : ''
  const source: LocalSource = { name: folderName || (mode === 'folder' ? '所选文件夹' : '导入的文件'), mode, status: 'connected', files: [], skipped: 0, limited: false }
  const seen = new Set<string>()
  for (const file of files.slice(0, MAX_LOCAL_ENTRIES)) {
    const relative = mode === 'folder' && file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name
    const path = safeLocalPath(relative)
    if (!path || excludedPath(path) || seen.has(path)) { source.skipped++; continue }
    if (source.files.length >= MAX_LOCAL_FILES) { source.limited = true; break }
    seen.add(path)
    source.files.push({ path, name: file.name, size: file.size, modified: file.lastModified, status: entryStatus(file.name, file.size), file })
  }
  if (files.length > MAX_LOCAL_ENTRIES) source.limited = true
  source.files.sort((left, right) => left.path.localeCompare(right.path))
  return source
}

export async function readLocalEntry(entry: LocalEntry): Promise<LocalPreview> {
  if (entry.status !== 'text') throw new Error(entry.status === 'large' ? '文件超过 2 MB，请选择较小的文本文件。' : '当前仅支持文本文件预览。')
  const file = entry.handle ? await entry.handle.getFile() : entry.file
  if (!file) throw new Error('文件访问已结束，请重新选择。')
  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error('文件超过 2 MB，请选择较小的文本文件。')
  const bytes = new Uint8Array(await file.slice(0, MAX_PREVIEW_BYTES).arrayBuffer())
  const partial = file.size > bytes.length
  let encoding = 'UTF-8', text = ''
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'UTF-16LE'
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'UTF-16BE'
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: partial }) }
  catch {
    try { encoding = 'GB18030'; text = new TextDecoder('gb18030', { fatal: true }).decode(bytes, { stream: partial }) }
    catch { throw new Error('无法识别文件编码，请使用 UTF-8 文本文件。') }
  }
  let controls = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controls++
  }
  if (text.includes('\0') || controls > Math.max(2, text.length * .02)) throw new Error('这个文件包含二进制内容，无法作为文本预览。')
  return { text: text.slice(0, MAX_PREVIEW_CHARS), encoding, truncated: partial || text.length > MAX_PREVIEW_CHARS, size: file.size }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LOCAL_FILES, MAX_PREVIEW_CHARS, MAX_TEXT_FILE_BYTES, excludedPath, importLocalFiles, readLocalEntry, safeLocalPath, scanDirectory, type LocalDirectoryHandle, type LocalFileHandle } from './local-files'

function handle(name: string, text = 'hello'): LocalFileHandle { return { kind: 'file', name, getFile: async () => new File([text], name) } }
function directory(name: string, children: Array<LocalFileHandle | LocalDirectoryHandle>): LocalDirectoryHandle { return { kind: 'directory', name, async *values() { yield* children } } }
function entry(file: File) { return importLocalFiles([file], 'files').files[0] }

test('local paths stay relative and private/dependency entries are excluded', () => {
  for (const path of ['../outside.txt', 'docs/../../outside.txt', '/root/file.txt', 'C:\\secret.txt', 'a\0b.txt']) assert.equal(safeLocalPath(path), null)
  assert.equal(safeLocalPath('notes\\日报.md'), 'notes/日报.md')
  for (const path of ['.env', '.git/config', 'src/node_modules/dep.txt', 'client_secret_google.json', 'key.pem']) assert.equal(excludedPath(path), true)
  assert.equal(excludedPath('notes/日报.md'), false)
})
test('directory scanning reads metadata only, skips private folders and preserves relative paths', async () => {
  let bodies = 0, hiddenReads = 0
  const textFile = new File(['body'], 'notes.md')
  Object.defineProperty(textFile, 'arrayBuffer', { value: () => { bodies++; throw new Error('Unexpected body read') } })
  const root = directory('selected', [{ kind: 'file', name: 'notes.md', getFile: async () => textFile }, directory('docs', [handle('meeting.txt')]), { kind: 'file', name: '.env', getFile: async () => { hiddenReads++; throw new Error() } }, directory('node_modules', [handle('private.txt')])])
  const source = await scanDirectory(root)
  assert.deepEqual(source.files.map(file => file.path), ['docs/meeting.txt', 'notes.md'])
  assert.equal(source.skipped, 2); assert.equal(bodies, 0); assert.equal(hiddenReads, 0)
})
test('large directories and cancelled scans are bounded', async () => {
  const root = directory('large', Array.from({ length: MAX_LOCAL_FILES + 50 }, (_, index) => handle(`${index}.txt`)))
  const source = await scanDirectory(root)
  assert.equal(source.files.length, MAX_LOCAL_FILES); assert.equal(source.limited, true)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(scanDirectory(root, controller.signal), { name: 'AbortError' })
})
test('empty and unreadable folders do not create invented file content', async () => {
  assert.equal((await scanDirectory(directory('empty', []))).files.length, 0)
  const root = directory('gone', [{ kind: 'file', name: 'gone.txt', getFile: async () => { throw new DOMException('gone', 'NotFoundError') } }])
  assert.equal((await scanDirectory(root)).files[0].status, 'unavailable')
  const denied: LocalDirectoryHandle = { kind: 'directory', name: 'denied', async *values() { yield* []; throw new DOMException('denied', 'NotAllowedError') } }
  await assert.rejects(scanDirectory(denied), { name: 'NotAllowedError' })
})
test('folder imports preserve paths, deduplicate and support standalone file imports', () => {
  const file = new File(['text'], 'test.md'); Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/notes/test.md' })
  const source = importLocalFiles([file, file, new File(['secret'], '.env')], 'folder')
  assert.equal(source.name, 'folder'); assert.equal(source.files[0].path, 'notes/test.md'); assert.equal(source.skipped, 2)
  assert.equal(importLocalFiles([new File(['{}'], 'plain.json')], 'files').files[0].path, 'plain.json')
})
test('UTF-8/UTF-16/GB18030 text is decoded without interpreting HTML', async () => {
  assert.equal((await readLocalEntry(entry(new File(['<script>untrusted</script>\n你好'], 'note.md')))).text, '<script>untrusted</script>\n你好')
  assert.equal((await readLocalEntry(entry(new File([new Uint8Array([255,254,65,0,66,0])], 'utf16.txt')))).text, 'AB')
  const gb = await readLocalEntry(entry(new File([new Uint8Array([0xc4,0xe3,0xba,0xc3])], 'gb.txt')))
  assert.equal(gb.text, '你好'); assert.equal(gb.encoding, 'GB18030')
})
test('text previews cap memory and reject binary/unsupported/oversize files', async () => {
  const preview = await readLocalEntry(entry(new File(['a'.repeat(200000)], 'long.txt')))
  assert.equal(preview.text.length, MAX_PREVIEW_CHARS); assert.equal(preview.truncated, true)
  await assert.rejects(readLocalEntry(entry(new File([new Uint8Array([0,1,2,3,4])], 'binary.txt'))), /二进制/)
  await assert.rejects(readLocalEntry(entry(new File(['pdf'], 'document.pdf'))), /文本文件/)
  await assert.rejects(readLocalEntry(entry(new File(['a'.repeat(MAX_TEXT_FILE_BYTES + 1)], 'big.txt'))), /2 MB/)
})
test('native file handles read the latest contents and detect revoked access', async () => {
  let text = 'old'
  const fileHandle: LocalFileHandle = { kind: 'file', name: 'live.txt', getFile: async () => new File([text], 'live.txt') }
  const source = await scanDirectory(directory('folder', [fileHandle])); text = 'new'
  assert.equal((await readLocalEntry(source.files[0])).text, 'new')
  fileHandle.getFile = async () => { throw new DOMException('revoked', 'NotAllowedError') }
  await assert.rejects(readLocalEntry(source.files[0]), { name: 'NotAllowedError' })
})

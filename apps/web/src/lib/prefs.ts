function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export const prefs = {
  name: () => read('gs:name') ?? '',
  setName: (v: string) => write('gs:name', v),
  muted: () => read('gs:muted') === '1',
  setMuted: (v: boolean) => write('gs:muted', v ? '1' : '0'),
  mirror: () => read('gs:mirror') !== '0',
  setMirror: (v: boolean) => write('gs:mirror', v ? '1' : '0'),
  hd: () => read('gs:hd') === '1',
  setHd: (v: boolean) => write('gs:hd', v ? '1' : '0'),
  diagnostics: () => read('gs:diagnostics') === '1',
  setDiagnostics: (v: boolean) => write('gs:diagnostics', v ? '1' : '0'),
}

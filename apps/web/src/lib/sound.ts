let ac: AudioContext | null = null

function ctx() {
  ac ??= new AudioContext()
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

function blip(freq: number, dur: number, gain = 0.08) {
  const a = ctx()
  const o = a.createOscillator()
  const g = a.createGain()
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + dur)
}

export const sound = {
  unlock: () => void ctx(),
  tick: () => blip(880, 0.08),
  shutter() {
    const a = ctx()
    const len = Math.floor(a.sampleRate * 0.12)
    const buf = a.createBuffer(1, len, a.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
    const src = a.createBufferSource()
    const g = a.createGain()
    g.gain.value = 0.25
    src.buffer = buf
    src.connect(g).connect(a.destination)
    src.start()
  },
}

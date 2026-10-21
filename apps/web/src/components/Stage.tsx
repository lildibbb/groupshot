import type { Peer, Scene } from '@groupshot/protocol'
import { useEffect, useRef, useState } from 'react'
import { loadAssets } from '@/lib/assets'
import { isPacked, PortraitEngine, Unpacker } from '@/lib/portrait/engine'
import type { PortraitState } from '@/lib/portrait/usePortrait'
import { drawScene, personRects, sceneLight } from '@/lib/scene'
import { tile } from '@/templates/layout'
import type { Rect } from '@/templates/types'

export type CaptureSource = HTMLVideoElement | HTMLCanvasElement
interface Props {
  slot: Rect
  peers: Peer[]
  me: string
  localStream: MediaStream | null
  localPortrait: HTMLCanvasElement | null
  localState: PortraitState
  onRetryLocal: () => void
  remoteStreams: Record<string, MediaStream>
  filter: string
  mirror: boolean
  scene: Scene
  onLocalVideo: (el: CaptureSource | null) => void
  children?: React.ReactNode
}

export function Stage({
  slot,
  peers,
  me,
  localStream,
  localPortrait,
  localState,
  onRetryLocal,
  remoteStreams,
  filter,
  mirror,
  scene,
  onLocalVideo,
  children,
}: Props) {
  const backdrop = useRef<HTMLCanvasElement>(null)
  const unit = { x: 0, y: 0, w: slot.w, h: slot.h }
  const wantsCutout = scene !== 'original'
  const shared = wantsCutout && (Boolean(localPortrait) || peers.length > 1)
  const tiles = shared ? personRects(unit, peers.length) : tile(unit, Math.max(1, peers.length))
  useEffect(() => {
    const canvas = backdrop.current
    if (!canvas || !shared) return
    canvas.width = 1200
    canvas.height = Math.round((1200 * slot.h) / slot.w)
    const ctx = canvas.getContext('2d')
    if (ctx) drawScene(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, scene)
    let live = true
    if (ctx && scene === 'studio') {
      void loadAssets(['scene-studio']).then((assets) => {
        if (live) drawScene(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, scene, assets['scene-studio'])
      })
    }
    return () => {
      live = false
    }
  }, [scene, shared, slot.w, slot.h])
  return (
    <div className="camera-stage" style={{ aspectRatio: `${slot.w} / ${slot.h}` }}>
      {shared && <canvas ref={backdrop} className="absolute inset-0 size-full" tabIndex={-1} aria-hidden="true" />}
      {peers.map((p, i) => {
        const r = tiles[i]!
        const isMe = p.id === me
        const name = isMe ? `${p.name} (you)` : p.name
        const style = { transform: isMe && mirror ? 'scaleX(-1)' : undefined, filter }
        return (
          <div
            key={p.id}
            className={`person-layer ${shared ? 'cutout' : ''}`}
            style={{
              left: `${(r.x / unit.w) * 100}%`,
              top: `${(r.y / unit.h) * 100}%`,
              width: `${(r.w / unit.w) * 100}%`,
              height: `${(r.h / unit.h) * 100}%`,
            }}
          >
            {isMe ? (
              wantsCutout ? (
                <LocalPortrait
                  canvas={localPortrait}
                  state={localState}
                  stream={localStream}
                  onRetry={onRetryLocal}
                  onSource={onLocalVideo}
                  style={style}
                />
              ) : (
                <RawVideo stream={localStream} style={style} onSource={onLocalVideo} />
              )
            ) : shared ? (
              <RemotePortrait
                stream={remoteStreams[p.id] ?? null}
                light={sceneLight(scene)}
                style={style}
                name={p.name}
              />
            ) : (
              <RawVideo stream={remoteStreams[p.id] ?? null} style={style} />
            )}
            {!(isMe ? localStream : remoteStreams[p.id]) && (
              <div className="camera-waiting">
                <p>{isMe ? 'Your spot in the frame' : `Waiting for ${p.name}’s camera`}</p>
              </div>
            )}
            <span className="person-name">{name}</span>
          </div>
        )
      })}
      {children}
    </div>
  )
}

function RawVideo({
  stream,
  style,
  onSource,
}: {
  stream: MediaStream | null
  style: React.CSSProperties
  onSource?: (el: CaptureSource | null) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = video.current!
    el.srcObject = stream
    if (stream) void el.play().catch(() => {})
    onSource?.(stream ? el : null)
    return () => {
      el.srcObject = null
      onSource?.(null)
    }
  }, [stream, onSource])
  return <video ref={video} muted playsInline autoPlay className="person-media" style={style} />
}

function Mounted({ canvas, style }: { canvas: HTMLCanvasElement; style: React.CSSProperties }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current!
    canvas.className = 'person-media'
    el.appendChild(canvas)
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas)
    }
  }, [canvas])
  useEffect(() => {
    canvas.style.transform = style.transform ?? ''
    canvas.style.filter = String(style.filter ?? '')
  }, [canvas, style.transform, style.filter])
  return <div ref={host} className="size-full" />
}

function LocalPortrait({
  canvas,
  state,
  stream,
  onRetry,
  onSource,
  style,
}: {
  canvas: HTMLCanvasElement | null
  state: PortraitState
  stream: MediaStream | null
  onRetry: () => void
  onSource: (el: CaptureSource | null) => void
  style: React.CSSProperties
}) {
  if (canvas) return <Mounted canvas={canvas} style={style} />
  return (
    <>
      <RawVideo stream={stream} style={style} onSource={onSource} />
      {stream && (
        <div className="cutout-chip" role="status">
          {state === 'error' ? (
            <>
              <span>Cutout unavailable here, using your camera</span>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </>
          ) : (
            <span>
              <i className="cutout-spin" aria-hidden="true" /> Cutting you out…
            </span>
          )}
        </div>
      )}
    </>
  )
}

function RemotePortrait({
  stream,
  light,
  style,
  name,
}: {
  stream: MediaStream | null
  light: string | null
  style: React.CSSProperties
  name: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const el = video.current!
    el.srcObject = stream
    setCanvas(null)
    setFailed(false)
    if (!stream) return
    setBlocked(false)
    void el.play().catch(() => setBlocked(true))
    let alive = true
    let cleanup = () => {}
    let current: 'packed' | 'raw' | null = null
    const begin = () => {
      if (!alive || !el.videoWidth) return
      const kind = isPacked(el) ? 'packed' : 'raw'
      if (kind === current) return
      current = kind
      cleanup()
      cleanup = () => {}
      setCanvas(null)
      if (kind === 'packed') {
        const u = new Unpacker(el)
        u.start()
        cleanup = () => u.close()
        setCanvas(u.canvas)
        return
      }
      void PortraitEngine.create(el)
        .then((engine) => {
          if (!alive || current !== 'raw') return engine.close()
          engine.setLight(light)
          engine.start(() => alive && current === 'raw' && setCanvas(engine.canvas))
          cleanup = () => engine.close()
        })
        .catch(() => alive && setFailed(true))
    }
    begin()
    el.addEventListener('loadeddata', begin)
    el.addEventListener('resize', begin)
    return () => {
      alive = false
      el.removeEventListener('loadeddata', begin)
      el.removeEventListener('resize', begin)
      cleanup()
      el.srcObject = null
    }
  }, [stream, light])
  return (
    <>
      <video
        ref={video}
        muted
        playsInline
        autoPlay
        className={canvas ? 'segmentation-source' : 'remote-raw'}
        style={canvas ? undefined : style}
      />
      {canvas && <Mounted canvas={canvas} style={style} />}
      {!canvas && stream && (
        <div className="segmentation-status" role="status">
          <p>{failed ? `${name}’s cutout couldn’t start here.` : `Cutting out ${name}…`}</p>
        </div>
      )}
      {blocked && (
        <button
          type="button"
          className="remote-play"
          onClick={() => void video.current?.play().then(() => setBlocked(false))}
        >
          Tap to see {name}
        </button>
      )}
    </>
  )
}

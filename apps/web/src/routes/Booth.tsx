import {
  type CameraState,
  isSessionComplete,
  type Output,
  type Peer,
  type RoomState,
  sessionEndsAt,
  TIMER_OPTIONS,
} from '@groupshot/protocol'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ConversationCards } from '@/components/ConversationCards'
import { Countdown, Flash } from '@/components/Countdown'
import { Cursors } from '@/components/Cursors'
import { DrawTogether } from '@/components/DrawTogether'
import { GamePanel } from '@/components/GamePanel'
import {
  CameraOffIcon,
  EffectIcon,
  FrameIcon,
  InviteIcon,
  KioskIcon,
  MirrorIcon,
  RoomIcon,
  SoundIcon,
  TimerIcon,
} from '@/components/Icons'
import { InviteSheet } from '@/components/InviteSheet'
import { KnowMeQuiz } from '@/components/KnowMeQuiz'
import { Logo } from '@/components/Logo'
import { PoseCoach, PoseReference, poses, posesFor, shuffled } from '@/components/PoseGuide'
import { Review } from '@/components/Review'
import { SignalAnimation } from '@/components/SignalAnimation'
import { type CaptureSource, Stage } from '@/components/Stage'
import { TemplatePicker } from '@/components/TemplatePicker'
import { getRoom, normalizeCode } from '@/lib/api'
import { type CameraStatus, cameraHints, cameraMessages, captureFrame, useCamera } from '@/lib/camera'
import { recordBurst, toSprite, videoSupported } from '@/lib/clip'
import { warmCompositor } from '@/lib/compose'
import { FILTERS, filterCss } from '@/lib/filters'
import { markTried } from '@/lib/path'
import { hdSupported } from '@/lib/portrait/rvm'
import { usePortrait } from '@/lib/portrait/usePortrait'
import { scheduledRoundAt } from '@/lib/pose-challenge'
import { prefs } from '@/lib/prefs'
import { forgetRoom, savedRoom, seatLikelyHeld } from '@/lib/rejoin'
import { useSampleCamera } from '@/lib/sample-camera'
import { SCENES, sceneLight } from '@/lib/scene'
import { sound } from '@/lib/sound'
import { serverNow, uploadKey, useBooth } from '@/lib/store'
import { getTemplate } from '@/templates'

const GRACE_MS = 8000

const OUTPUTS: { id: Output; label: string; icon: string }[] = [
  { id: 'photo', label: 'Photo', icon: '◉' },
  { id: 'boomerang', label: 'Boomerang', icon: '∞' },
  { id: 'live', label: 'Live', icon: '▶' },
]

export default function Booth({ mode }: { mode: 'solo' | 'room' }) {
  const params = useParams()
  const code = mode === 'room' ? normalizeCode(params.code ?? '') : null
  const [resumable] = useState(() => {
    const saved = mode === 'room' && code ? savedRoom(code) : null
    return saved && seatLikelyHeld(saved) ? saved : null
  })
  const [name, setName] = useState(() => resumable?.name || prefs.name() || (mode === 'solo' ? 'You' : ''))
  const [entered, setEntered] = useState(mode === 'solo' || (Boolean(prefs.name()) && !resumable))
  const [checkError, setCheckError] = useState<string | null>(null)
  const status = useBooth((s) => s.status)
  const navigate = useNavigate()
  useEffect(() => {
    warmCompositor()
  }, [])
  useEffect(() => {
    if (!entered) return
    const booth = useBooth.getState()
    if (mode === 'solo') {
      booth.joinSolo(name)
      const selected = new URLSearchParams(window.location.search).get('template')
      if (selected) booth.updateSettings({ templateId: getTemplate(selected).id })
      return () => booth.leave()
    }
    if (!code) {
      setCheckError('Check your invite. Room codes look like SNAP-42.')
      return
    }
    let cancelled = false
    getRoom(code)
      .then(() => !cancelled && booth.connect(code, name))
      .catch((err: Error) => !cancelled && setCheckError(err.message))
    return () => {
      cancelled = true
      booth.leave()
    }
  }, [entered, mode, code])
  if (checkError)
    return (
      <EntryScreen>
        <SignalAnimation
          state={
            status === 'closed'
              ? 'error'
              : status === 'connecting' || status === 'reconnecting'
                ? 'connecting'
                : 'waiting'
          }
        />
        <h1>No booth here</h1>
        <p className="muted">{checkError}</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          Back to the lobby
        </button>
      </EntryScreen>
    )
  if (!entered && resumable)
    return (
      <EntryScreen>
        <div className="grid gap-5">
          <span className="stamp muted">Room {code} · your seat is saved</span>
          <h1>Welcome back, {resumable.name}</h1>
          <p className="muted">
            You dropped out of this room a moment ago. Rejoin to pick up where you left off, with your photos so far.
          </p>
          <div className="grid gap-3">
            <button
              type="button"
              className="btn-primary"
              autoFocus
              onClick={() => {
                sound.unlock()
                setEntered(true)
              }}
            >
              Rejoin room
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                forgetRoom()
                navigate('/')
              }}
            >
              Leave this room
            </button>
          </div>
        </div>
      </EntryScreen>
    )
  if (!entered)
    return (
      <EntryScreen>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            prefs.setName(name.trim())
            sound.unlock()
            setEntered(true)
          }}
        >
          <span className="stamp muted">Invitation · {code}</span>
          <h1>Step inside</h1>
          <div className="field">
            <label htmlFor="guest-name">Your name on the strip</label>
            <input
              id="guest-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoComplete="given-name"
              placeholder="Your name"
            />
          </div>
          <p className="muted">Your camera stays off until you turn it on.</p>
          <button type="submit" className="btn-primary" disabled={!name.trim()}>
            Enter the booth
          </button>
        </form>
      </EntryScreen>
    )
  return <Studio mode={mode} />
}

function Studio({ mode }: { mode: 'solo' | 'room' }) {
  const { room, me, status, error, remoteStreams, localShots, localClips, uploads, uploadError, clearError } = useBooth(
    useShallow((s) => ({
      room: s.room,
      me: s.me,
      status: s.status,
      error: s.error,
      remoteStreams: s.remoteStreams,
      localShots: s.localShots,
      localClips: s.localClips,
      uploads: s.uploads,
      uploadError: s.uploadError,
      clearError: s.clearError,
    })),
  )
  const actions = useBooth.getState()
  const camera = useCamera()
  const source = useRef<CaptureSource | null>(null)
  const [rawReady, setRawReady] = useState(false)
  const [hd, setHd] = useState(() => prefs.hd() && hdSupported())
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(prefs.diagnostics)
  const [diagnostics, setDiagnostics] = useState({ fps: 0, frameMs: 0, segmentationMs: 0 })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [search] = useSearchParams()
  const [activityDismissed, setActivityDismissed] = useState(false)
  const [muted, setMuted] = useState(prefs.muted)
  const [mirror, setMirror] = useState(prefs.mirror)
  const [flashAt, setFlashAt] = useState(0)
  const [captureError, setCaptureError] = useState('')
  const [drawer, setDrawer] = useState<'frames' | 'effects' | 'room' | 'timer' | null>(null)
  const [, force] = useState(0)
  const session = room?.session ?? null
  const settings = room?.settings
  const isHost = room?.hostId === me
  const t = getTemplate(settings?.templateId ?? 'classic-strip')
  const filter = filterCss(settings?.filter ?? 'none')
  const taken = session ? session.shots.filter((s) => s[me]).length : 0
  const sample = useSampleCamera(taken)
  const lastAt = session ? sessionEndsAt(session) : 0
  const retaking = Boolean(session?.retakeRounds?.length)
  const reviewing = Boolean(session && (isSessionComplete(session) || serverNow() > lastAt + GRACE_MS))
  const shooting = Boolean(session && !reviewing)
  const shared = (settings?.scene ?? 'original') !== 'original'
  const portrait = usePortrait(
    sample.stream ?? camera.stream,
    shared,
    hd,
    sceneLight(settings?.scene ?? 'original'),
    mirror,
  )
  useEffect(() => portrait.engine?.setDiagnosticsEnabled(diagnosticsEnabled), [portrait.engine, diagnosticsEnabled])
  useEffect(() => {
    if (!diagnosticsEnabled || !portrait.engine) return
    const poll = () => setDiagnostics(portrait.engine?.diagnostics() ?? { fps: 0, frameMs: 0, segmentationMs: 0 })
    const id = window.setInterval(poll, 1000)
    poll()
    return () => window.clearInterval(id)
  }, [portrait.engine, diagnosticsEnabled])
  useEffect(() => {
    if (room?.activity) markTried(room.activity.id)
  }, [room?.activity?.id])
  useEffect(() => {
    if (reviewing) markTried('photobooth')
  }, [reviewing])
  const alone = (room?.peers.length ?? 0) < 2
  useEffect(() => {
    if (mode === 'room' && search.get('play') && alone && isHost) setInviteOpen(true)
  }, [mode, isHost])
  useEffect(() => {
    if (room?.activity?.phase === 'answer') setActivityDismissed(false)
  }, [room?.activity?.phase, room?.activity?.round])
  const cameraReady = (camera.status === 'live' || Boolean(sample.stream)) && (portrait.state === 'ready' || rawReady)
  const cameraState = toCameraState(camera.status, Boolean(sample.stream), cameraReady)
  useEffect(() => actions.setCamera(cameraState), [cameraState, actions.setCamera])
  const names = useMemo(() => Object.fromEntries((room?.peers ?? []).map((p) => [p.id, p.name])), [room?.peers])
  const rawVideo = useRef<CaptureSource | null>(null)
  const onSource = useCallback((el: CaptureSource | null) => {
    rawVideo.current = el
    setRawReady(Boolean(el))
  }, [])
  source.current = portrait.engine?.canvas ?? rawVideo.current
  const engineRef = useRef(portrait.engine)
  engineRef.current = portrait.engine
  const packed = useMemo(
    () => (mode === 'room' && portrait.engine ? portrait.engine.packedStream() : null),
    [mode, portrait.engine],
  )
  useEffect(
    () => () => {
      for (const t of packed?.getTracks() ?? []) t.stop()
    },
    [packed],
  )
  const onTick = useCallback(() => sound.tick(), [])
  const current = useRef({ mirror, muted, filter })
  current.current = { mirror, muted, filter }
  const [deal, setDeal] = useState(0)
  const people = session?.peerIds.length ?? room?.peers.length ?? 1
  const plan = useMemo(() => {
    const fit = posesFor(people)
    const order = shuffled(fit, seeded(`${room?.code ?? 'solo'}:${deal}:${people}`))
    return Array.from({ length: t.slots.length }, (_, i) => order[i % order.length]!)
  }, [people, room?.code, deal, t.slots.length])
  const lastSession = useRef<string | null>(null)
  useEffect(() => {
    if (reviewing && session && lastSession.current !== session.id) {
      lastSession.current = session.id
      setDeal((d) => d + 1)
    }
  }, [reviewing, session])

  useEffect(() => {
    actions.setLocalStream(shared && packed ? packed : camera.stream)
  }, [camera.stream, shared, packed, actions.setLocalStream])
  useEffect(() => {
    if (!session?.peerIds.includes(me)) return
    const timers = session.fireAts.map((at, round) => {
      const delay = at - serverNow()
      if (delay < -400 || session.shots[round]?.[me]) return undefined
      return setTimeout(
        async () => {
          setFlashAt(Date.now())
          if (!current.current.muted) sound.shutter()
          try {
            if (!source.current)
              throw new Error('Your camera or cutout was not ready. Shoot another round when the preview appears.')
            const frame = engineRef.current
              ? await engineRef.current.captureStill(current.current.mirror, current.current.filter)
              : source.current
            const blob = await captureFrame(
              frame,
              engineRef.current ? { mirror: false, filter: 'none' } : current.current,
            )
            actions.submitShot(session.id, round, blob)
            if (session.settings.output !== 'photo' && videoSupported()) {
              const live = engineRef.current?.canvas ?? rawVideo.current
              if (live) {
                const frames = await recordBurst(live, current.current)
                actions.submitClip(session.id, round, frames, await toSprite(frames, Boolean(engineRef.current)))
              }
            }
          } catch (err) {
            setCaptureError((err as Error).message)
          }
        },
        Math.max(0, delay),
      )
    })
    const done = setTimeout(
      () => force((n) => n + 1),
      Math.max(0, (session.fireAts.at(-1) ?? 0) + GRACE_MS - serverNow()),
    )
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(done)
    }
  }, [session?.id, session?.attempt, me])
  useEffect(() => {
    if (!drawer) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [drawer])
  useEffect(() => {
    if (!cameraReady && room?.peers.find((p) => p.id === me)?.ready && !isHost && !shooting) actions.setReady(false)
  }, [cameraReady, room?.peers, me, isHost, shooting, actions.setReady])

  if (!room || !settings)
    return (
      <EntryScreen>
        <p role="status" className="display text-5xl">
          {status === 'reconnecting' ? 'Reconnecting…' : (error ?? 'Opening the booth…')}
        </p>
      </EntryScreen>
    )
  if (mode === 'room' && status === 'closed' && error)
    return (
      <EntryScreen>
        <SignalAnimation state="error" />
        <h1>Connection lost</h1>
        <p className="muted">{error}</p>
        <p className="muted text-sm">Your photos from this sitting are still on this device.</p>
        <div className="grid gap-3">
          <button type="button" className="btn-primary" onClick={() => actions.rejoin()}>
            Rejoin room
          </button>
          <Link to="/" className="btn-secondary">
            Back to the lobby
          </Link>
        </div>
      </EntryScreen>
    )
  const self = room.peers.find((p) => p.id === me)
  const others = room.peers.filter((p) => p.id !== me)
  const everyoneReady = others.every((p) => p.ready)
  const stagePeers = session
    ? session.peerIds.map(
        (id) => room.peers.find((p) => p.id === id) ?? { id, name: names[id] ?? 'Friend', ready: false, joinedAt: 0 },
      )
    : room.peers
  const locked = !isHost || shooting || Boolean(session)
  const toggleDrawer = (id: typeof drawer) => setDrawer(drawer === id ? null : id)
  const scene = SCENES.find((s) => s.id === settings.scene)
  const filterName = FILTERS.find((f) => f.id === settings.filter)?.label ?? 'None'
  const scheduledRound = shooting && session ? scheduledRoundAt(session.fireAts, serverNow()) : taken
  const pose = poses[plan[Math.min(scheduledRound, plan.length - 1)] ?? 0]!
  const sheetTitle = { frames: 'Choose your print', effects: 'Set the mood', room: 'Pick a room', timer: 'Timer' }
  const shutterLabel = shooting
    ? 'hold that pose!'
    : !cameraReady
      ? 'camera first'
      : isHost
        ? others.length && !everyoneReady
          ? 'start anyway'
          : 'tap to shoot'
        : self?.ready
          ? 'you’re ready'
          : 'I’m ready'

  return (
    <div className="booth">
      {mode === 'room' && <Cursors peers={room.peers} me={me} />}
      <header className="booth-bar">
        <Logo />
        <div className="booth-bar-right">
          <KioskButton />
          {mode === 'room' ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setInviteOpen(true)}>
              <InviteIcon className="size-[18px]" /> <span className="stamp">{room.code}</span>
            </button>
          ) : (
            <Link to="/" className="btn-secondary btn-sm">
              Invite friends
            </Link>
          )}
        </div>
      </header>

      <main className="booth-main">
        <AnimatePresence>
          {retaking && shooting && session && (
            <motion.div
              key="retake"
              className="retake-banner lg:col-span-2"
              role="status"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <span className="stamp">Filling missing frames</span>
              <span>
                Reshooting frame{session.retakeRounds!.length === 1 ? '' : 's'}{' '}
                {session.retakeRounds!.map((r) => r + 1).join(', ')}. Frames that already came out are kept.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {(error || captureError || status === 'reconnecting') && (
          <div role="alert" className="notice lg:col-span-2">
            {status === 'reconnecting' && <SignalAnimation state="connecting" />}
            <span>{status === 'reconnecting' ? 'Connection dropped. Reconnecting…' : error || captureError}</span>
            {status !== 'reconnecting' && (
              <button
                type="button"
                onClick={() => {
                  clearError()
                  setCaptureError('')
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
        {mode === 'room' && room.activity && !activityDismissed ? (
          <div className="lg:col-span-2">
            {room.activity.id === 'know-me' ? (
              <KnowMeQuiz
                activity={room.activity}
                peers={room.peers}
                me={me}
                isHost={isHost}
                onAnswer={actions.answerActivity}
                onNext={actions.nextActivity}
                onEnd={actions.endActivity}
                onReturn={() => setActivityDismissed(true)}
              />
            ) : room.activity.id === 'conversation-cards' ? (
              <ConversationCards
                activity={room.activity}
                isHost={isHost}
                onNext={actions.nextActivity}
                onEnd={actions.endActivity}
              />
            ) : room.activity.id === 'draw-together' ? (
              <DrawTogether
                activity={room.activity}
                peers={room.peers}
                isHost={isHost}
                onEnd={actions.endActivity}
                onReturn={() => setActivityDismissed(true)}
              />
            ) : (
              <GamePanel
                activity={room.activity}
                peers={room.peers}
                me={me}
                isHost={isHost}
                onAnswer={actions.answerActivity}
                onSubmitText={actions.submitActivityText}
                onNext={actions.nextActivity}
                onEnd={actions.endActivity}
                onReturn={() => setActivityDismissed(true)}
              />
            )}
          </div>
        ) : reviewing && session ? (
          <div className="lg:col-span-2">
            <Review
              session={session}
              me={me}
              names={names}
              roomCode={mode === 'room' ? room.code : undefined}
              localShots={localShots}
              localClips={localClips}
              uploads={uploads}
              uploadError={uploadError}
              canRestart={isHost}
              presentIds={room.peers.map((p) => p.id)}
              onAgain={() => {
                setCaptureError('')
                actions.reset()
              }}
              onRetake={(rounds) => {
                setCaptureError('')
                actions.retake(rounds)
              }}
              onRetryUploads={actions.retryUploads}
            />
          </div>
        ) : (
          <>
            <div className="booth-stage-col">
              <div className="vanity">
                <Bulbs chase={shooting} />
                <div className="screen">
                  <Stage
                    slot={t.slots[0] ?? { x: 0, y: 0, w: 4, h: 3 }}
                    peers={stagePeers}
                    me={me}
                    localStream={sample.stream ?? camera.stream}
                    remoteStreams={remoteStreams}
                    filter={filter}
                    mirror={mirror}
                    scene={settings.scene}
                    localPortrait={portrait.engine?.canvas ?? null}
                    localState={portrait.state}
                    onRetryLocal={portrait.retry}
                    onLocalVideo={onSource}
                  >
                    <AnimatePresence>
                      {!camera.stream && !sample.stream && (
                        <motion.div
                          className="camera-permission"
                          data-problem={isProblem(camera.status) || undefined}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, scale: 1.04 }}
                          transition={{ duration: 0.3 }}
                        >
                          <h2>{cameraTitle(camera.status)}</h2>
                          <p role={isProblem(camera.status) ? 'alert' : undefined}>
                            {camera.status !== 'live' ? cameraMessages[camera.status] : ''}
                          </p>
                          {isProblem(camera.status) && cameraHints[camera.status] && (
                            <p className="camera-hint">{cameraHints[camera.status]}</p>
                          )}
                          <div>
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={camera.status === 'asking'}
                              onClick={() => {
                                sample.stop()
                                void camera.start()
                              }}
                            >
                              {camera.status === 'asking'
                                ? 'Waiting for permission…'
                                : isProblem(camera.status)
                                  ? 'Try again'
                                  : 'Turn camera on'}
                            </button>
                            {mode === 'solo' && (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={sample.loading}
                                onClick={sample.start}
                              >
                                {sample.loading ? 'Loading samples…' : 'Use sample photos'}
                              </button>
                            )}
                          </div>
                          {sample.error && <p role="alert">{sample.error}</p>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {(camera.stream || sample.stream) && (
                      <motion.figure
                        key={`${pose.title}-${taken}`}
                        className="pose-pip"
                        initial={{ y: -20, opacity: 0, rotate: 8 }}
                        animate={{ y: 0, opacity: 1, rotate: 3 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                      >
                        <div className="print">
                          <PoseReference index={plan[Math.min(scheduledRound, plan.length - 1)] ?? 0} prefer="model" />
                        </div>
                        <figcaption>{pose.title}</figcaption>
                      </motion.figure>
                    )}
                    <AnimatePresence>
                      {camera.paused && camera.stream && (
                        <motion.div
                          key="paused"
                          className="camera-paused"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Camera paused while this tab is in the background
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {session && shooting && (
                      <Countdown
                        fireAts={session.fireAts}
                        taken={taken}
                        muted={muted}
                        onTick={onTick}
                        label={
                          retaking ? `Retake · frame ${scheduledRound + 1} of ${session.fireAts.length}` : undefined
                        }
                      />
                    )}
                    {shooting && (
                      <span className="rec stamp">
                        <i aria-hidden="true" /> Rec
                      </span>
                    )}
                    <Flash at={flashAt} />
                  </Stage>
                </div>
              </div>

              <div className="dock">
                <div className="dock-tools">
                  <Tool
                    icon={<FrameIcon />}
                    label="Frame"
                    value={t.name}
                    open={drawer === 'frames'}
                    onClick={() => toggleDrawer('frames')}
                  />
                  <Tool
                    icon={<RoomIcon />}
                    label="Room"
                    value={scene?.name ?? ''}
                    open={drawer === 'room'}
                    onClick={() => toggleDrawer('room')}
                  />
                  <Tool
                    icon={<EffectIcon />}
                    label="Effect"
                    value={filterName}
                    open={drawer === 'effects'}
                    onClick={() => toggleDrawer('effects')}
                  />
                  <Tool
                    icon={<TimerIcon />}
                    label="Timer"
                    value={`${settings.timer}s, then ${settings.gap}s`}
                    open={drawer === 'timer'}
                    onClick={() => toggleDrawer('timer')}
                  />
                </div>
                <div className="shutter-control">
                  {videoSupported() && (
                    <fieldset className="output-switch" aria-label="What to make" disabled={locked}>
                      {OUTPUTS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={(settings.output ?? 'photo') === o.id}
                          onClick={() => actions.updateSettings({ output: o.id })}
                        >
                          <span aria-hidden="true">{o.icon}</span>
                          {o.label}
                        </button>
                      ))}
                    </fieldset>
                  )}
                  <motion.button
                    type="button"
                    className={`shutter ${shooting ? 'recording' : ''}`}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    aria-label={
                      isHost ? `Take ${t.slots.length} photos` : self?.ready ? 'Cancel ready' : 'Ready for photos'
                    }
                    aria-pressed={!isHost ? self?.ready : undefined}
                    disabled={shooting || !cameraReady || status !== 'live'}
                    onClick={() => {
                      sound.unlock()
                      setCaptureError('')
                      setDrawer(null)
                      isHost ? actions.start() : actions.setReady(!self?.ready)
                    }}
                  >
                    <motion.span
                      animate={
                        shooting || (!isHost && self?.ready)
                          ? { scale: 0.5, borderRadius: 14 }
                          : { scale: 1, borderRadius: 60 }
                      }
                      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                    />
                  </motion.button>
                  <span className="shutter-label">{shutterLabel}</span>
                </div>
                <div className="dock-toggles">
                  <button
                    type="button"
                    className="icon-toggle"
                    aria-label="Turn camera off"
                    title="Camera off"
                    disabled={shooting || Boolean(session) || (!camera.stream && !sample.stream)}
                    onClick={() => {
                      camera.stop()
                      sample.stop()
                    }}
                  >
                    <CameraOffIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-toggle"
                    aria-label="Mirror"
                    title="Mirror"
                    disabled={shooting || Boolean(session)}
                    aria-pressed={mirror}
                    onClick={() => {
                      setMirror(!mirror)
                      prefs.setMirror(!mirror)
                    }}
                  >
                    <MirrorIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-toggle"
                    aria-label="Sound"
                    title="Sound"
                    aria-pressed={!muted}
                    onClick={() => {
                      setMuted(!muted)
                      prefs.setMuted(!muted)
                    }}
                  >
                    <SoundIcon />
                  </button>
                </div>
              </div>

              <fieldset
                className="rail film"
                aria-label="Photos in this sitting"
                style={{ '--cells': t.slots.length } as React.CSSProperties}
              >
                {t.slots.map((slot, i) => (
                  <Shot
                    key={`${session?.id}:${slot.x}:${slot.y}`}
                    blob={session ? localShots[`${session.id}:${i}`] : undefined}
                    index={i}
                    pose={poses[plan[i] ?? 0]!.title}
                    active={shooting && scheduledRound === i}
                    retake={retaking && Boolean(session?.retakeRounds?.includes(i))}
                  />
                ))}
              </fieldset>
            </div>

            <aside className="booth-side">
              {mode === 'room' ? (
                <section className="guest-card" aria-labelledby="guests-heading">
                  <div className="guest-card-head">
                    <h2 id="guests-heading">
                      In the booth <span className="stamp muted">{room.peers.length}/6</span>
                    </h2>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setInviteOpen(true)}>
                      <InviteIcon className="size-[18px]" /> Invite
                    </button>
                  </div>
                  <ul className="guests">
                    <AnimatePresence initial={false}>
                      {room.peers.map((p) => (
                        <GuestRow
                          key={p.id}
                          peer={p}
                          room={room}
                          me={me}
                          canPromote={isHost && p.id !== me && !shooting}
                          onPromote={() => actions.transferHost(p.id)}
                        />
                      ))}
                      {(room.away ?? []).map((a) => (
                        <motion.li
                          key={`away-${a.id}`}
                          layout
                          className="guest away"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <span className="guest-dot" aria-hidden="true">
                            {a.name.slice(0, 1).toUpperCase()}
                          </span>
                          <b>{a.name}</b>
                          <span className="guest-state">
                            <i className="signal-dot" aria-hidden="true" /> reconnecting
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <ReadinessSummary room={room} />
                </section>
              ) : (
                <span className="stamp muted">{sample.stream ? 'Generated sample photos' : 'Solo sitting'}</span>
              )}
              <PoseCoach
                plan={plan}
                taken={mode === 'room' && shooting ? scheduledRound : taken}
                shooting={shooting}
                synchronized={mode === 'room'}
                onShuffle={() => setDeal((d) => d + 1)}
              />
            </aside>
          </>
        )}
      </main>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              key="scrim"
              className="sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
            />
            <motion.section
              key="sheet"
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={sheetTitle[drawer]}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => info.offset.y > 120 && setDrawer(null)}
            >
              <div className="sheet-inner">
                <div className="sheet-grip" aria-hidden="true" />
                <div className="sheet-head">
                  <h2>{sheetTitle[drawer]}</h2>
                  <button type="button" className="btn-primary btn-sm" onClick={() => setDrawer(null)}>
                    Done
                  </button>
                </div>
                {!isHost && <p className="muted">The host picks these for everyone.</p>}
                {drawer === 'frames' && (
                  <TemplatePicker
                    value={settings.templateId}
                    onChange={(templateId) => actions.updateSettings({ templateId })}
                    disabled={locked}
                    people={room.peers.length}
                  />
                )}
                {drawer === 'effects' && (
                  <div className="option-grid effects">
                    {FILTERS.map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        className="option"
                        aria-pressed={settings.filter === f.id}
                        disabled={locked}
                        onClick={() => actions.updateSettings({ filter: f.id })}
                      >
                        <span className="effect-sample" style={{ filter: filterCss(f.id) }} />
                        <span>{f.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {drawer === 'room' && (
                  <>
                    <div className="option-grid scenes">
                      {SCENES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="option"
                          disabled={locked}
                          aria-pressed={settings.scene === s.id}
                          onClick={() => actions.updateSettings({ scene: s.id })}
                        >
                          <span className="scene-swatch" style={{ background: s.color }} />
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                    {hdSupported() && (
                      <div className="switch-row">
                        <div>
                          <b className="block text-[15px]">HD hair detail</b>
                          <span className="caption">Sharper edges around hair. Uses more battery.</span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={hd}
                          aria-label="HD hair detail"
                          className="switch"
                          onClick={() => {
                            setHd(!hd)
                            prefs.setHd(!hd)
                          }}
                        />
                      </div>
                    )}
                    <div className="switch-row">
                      <div>
                        <b className="block text-[15px]">Local camera diagnostics</b>
                        <span className="caption">Shows frame timing on this device. Nothing is sent.</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={diagnosticsEnabled}
                        aria-label="Local camera diagnostics"
                        className="switch"
                        onClick={() => {
                          const enabled = !diagnosticsEnabled
                          setDiagnosticsEnabled(enabled)
                          prefs.setDiagnostics(enabled)
                        }}
                      />
                    </div>
                    {diagnosticsEnabled && shared && portrait.engine && (
                      <p className="diagnostics-output" role="status">
                        {diagnostics.fps.toFixed(0)} fps · {diagnostics.frameMs.toFixed(1)} ms/frame · segmentation{' '}
                        {diagnostics.segmentationMs.toFixed(1)} ms
                      </p>
                    )}
                    <p className="muted max-w-[70ch] text-sm">
                      Rooms cut everyone out of their own background and stand you side by side in the same place, under
                      the same light. Face the camera with your shoulders in view. The cutout runs on this device;
                      shared booths send camera video to the other guests.
                    </p>
                  </>
                )}
                {drawer === 'timer' && (
                  <div className="flex flex-wrap gap-6">
                    <fieldset className="chips">
                      <legend className="stamp muted">Before the first photo</legend>
                      {TIMER_OPTIONS.map((s) => (
                        <button
                          type="button"
                          className="tag"
                          key={s}
                          aria-pressed={settings.timer === s}
                          disabled={locked}
                          onClick={() => actions.updateSettings({ timer: s })}
                        >
                          {s} seconds
                        </button>
                      ))}
                    </fieldset>
                    <fieldset className="chips">
                      <legend className="stamp muted">Between photos</legend>
                      {[2, 3, 5].map((gap) => (
                        <button
                          type="button"
                          className="tag"
                          key={gap}
                          aria-pressed={settings.gap === gap}
                          disabled={locked}
                          onClick={() => actions.updateSettings({ gap })}
                        >
                          {gap} seconds
                        </button>
                      ))}
                    </fieldset>
                  </div>
                )}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
      {inviteOpen && <InviteSheet code={room.code} onClose={() => setInviteOpen(false)} />}
    </div>
  )
}

function Tool({
  icon,
  label,
  value,
  open,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  open: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="tool" aria-expanded={open} aria-haspopup="dialog" onClick={onClick}>
      {icon}
      <b>{label}</b>
      <small>{value}</small>
    </button>
  )
}

function Bulbs({ chase }: { chase: boolean }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!chase) return
    const id = setInterval(() => setTick((n) => n + 1), 90)
    return () => clearInterval(id)
  }, [chase])
  const perSide = { top: 9, side: 6 }
  const spots: [number, number][] = []
  const inset = 2.2
  for (let i = 0; i < perSide.top; i++) spots.push([inset + ((100 - inset * 2) * (i + 0.5)) / perSide.top, inset])
  for (let i = 0; i < perSide.side; i++)
    spots.push([100 - inset, inset + ((100 - inset * 2) * (i + 0.5)) / perSide.side])
  for (let i = perSide.top - 1; i >= 0; i--)
    spots.push([inset + ((100 - inset * 2) * (i + 0.5)) / perSide.top, 100 - inset])
  for (let i = perSide.side - 1; i >= 0; i--)
    spots.push([inset, inset + ((100 - inset * 2) * (i + 0.5)) / perSide.side])
  return (
    <div className="bulbs" aria-hidden="true">
      {spots.map(([x, y], i) => (
        <span
          key={`${x}-${y}`}
          className={`bulb ${!chase || (i + tick) % 5 < 2 ? 'on' : ''}`}
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
    </div>
  )
}

function KioskButton() {
  const [on, setOn] = useState(false)
  const lock = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    if (!on) {
      void lock.current?.release().catch(() => {})
      lock.current = null
      return
    }
    void navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        lock.current = l
      })
      .catch(() => {})
  }, [on])
  if (!document.documentElement.requestFullscreen) return null
  return (
    <button
      type="button"
      className="tag"
      aria-pressed={on}
      onClick={() =>
        on
          ? void document.exitFullscreen().catch(() => {})
          : void document.documentElement.requestFullscreen().catch(() => {})
      }
    >
      <KioskIcon /> Kiosk
    </button>
  )
}

function EntryScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="entry">
      <header className="site-header">
        <Logo />
      </header>
      <div className="entry-card">{children}</div>
    </div>
  )
}

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

function Shot({
  blob,
  index,
  active,
  retake,
  pose,
}: {
  blob?: Blob
  index: number
  active: boolean
  retake?: boolean
  pose: string
}) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return (
    <div className={`rail-cell ${active ? 'active' : ''} ${retake ? 'retake' : ''}`}>
      <div className="rail-frame">
        {url ? (
          <motion.img
            src={url}
            alt={`Shot ${index + 1}`}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          />
        ) : (
          <span className="stamp">{String(index + 1).padStart(2, '0')}</span>
        )}
      </div>
      <span className="pose-name">{pose}</span>
    </div>
  )
}

function toCameraState(status: CameraStatus, sample: boolean, ready: boolean): CameraState {
  if (sample || status === 'live') return ready ? 'ready' : 'preparing'
  if (status === 'asking') return 'preparing'
  if (status === 'idle') return 'off'
  return 'missing'
}

const isProblem = (s: CameraStatus): s is Exclude<CameraStatus, 'idle' | 'asking' | 'live'> =>
  s !== 'idle' && s !== 'asking' && s !== 'live'

function cameraTitle(s: CameraStatus) {
  if (s === 'ended') return 'The camera stopped'
  if (s === 'busy') return 'Camera in use'
  if (s === 'denied') return 'Camera blocked'
  if (s === 'missing') return 'No camera found'
  if (s === 'insecure' || s === 'unsupported') return 'Camera unavailable'
  return 'Step into the light'
}

const CAMERA_LABEL: Record<CameraState, string> = {
  off: 'camera off',
  preparing: 'camera warming up',
  ready: 'camera ready',
  missing: 'camera problem',
}

function GuestRow({
  peer,
  room,
  me,
  canPromote,
  onPromote,
}: {
  peer: Peer
  room: RoomState
  me: string
  canPromote: boolean
  onPromote: () => void
}) {
  const session = room.session
  const inSession = session?.peerIds.includes(peer.id)
  const sent = inSession ? session!.shots.filter((r) => r[peer.id]).length : 0
  const total = session?.shots.length ?? 0
  const camera = peer.camera ?? 'off'
  const isHost = peer.id === room.hostId
  const state = inSession ? `${sent}/${total} frames in` : isHost ? 'host' : peer.ready ? 'ready' : CAMERA_LABEL[camera]
  return (
    <motion.li
      layout
      className={`guest ${peer.ready || isHost ? 'ready' : ''}`}
      data-camera={camera}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <span className="guest-dot" aria-hidden="true">
        {peer.name.slice(0, 1).toUpperCase()}
        <i className="cam-pip" />
      </span>
      <b>
        {peer.name}
        {peer.id === me ? ' (you)' : ''}
      </b>
      <span className="guest-state">
        {inSession && total > 0 && (
          <span className="frame-meter" aria-hidden="true">
            {session!.shots.map((round, i) => (
              <i key={uploadKey('photo', session!.id, i)} className={round[peer.id] ? 'in' : ''} />
            ))}
          </span>
        )}
        {state !== CAMERA_LABEL[camera] && <span className="sr-only">{CAMERA_LABEL[camera]}, </span>}
        {state}
      </span>
      {canPromote && (
        <button type="button" className="guest-action" onClick={onPromote} title={`Make ${peer.name} the host`}>
          Make host
        </button>
      )}
    </motion.li>
  )
}

function ReadinessSummary({ room }: { room: RoomState }) {
  const guests = room.peers.filter((p) => p.id !== room.hostId)
  if (room.session || !guests.length) return null
  const noCamera = guests.filter((p) => (p.camera ?? 'off') !== 'ready')
  const notReady = guests.filter((p) => !p.ready)
  const text = noCamera.length
    ? `Waiting on ${noCamera.map((p) => p.name).join(', ')} to turn on a camera.`
    : notReady.length
      ? `Waiting on ${notReady.map((p) => p.name).join(', ')} to tap ready.`
      : 'Everyone’s ready.'
  return (
    <p className={`readiness ${!noCamera.length && !notReady.length ? 'all' : ''}`} role="status">
      {text}
    </p>
  )
}

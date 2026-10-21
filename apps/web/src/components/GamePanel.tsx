import { GAMES, type Peer, type RoomState, roundCount } from '@groupshot/protocol'
import { useEffect, useState } from 'react'
import { findStop } from '@/lib/activities'
import {
  type ChoiceQuestion,
  choiceDecks,
  colorScore,
  colorTargets,
  honestCards,
  hsl,
  parseColor,
  riddleCorrect,
  riddles,
  truthOrDare,
} from '@/lib/game-content'

type Activity = NonNullable<RoomState['activity']>

interface Props {
  activity: Activity
  peers: Peer[]
  me: string
  isHost: boolean
  onAnswer: (round: number, choice: number) => void
  onSubmitText: (round: number, text: string) => void
  onNext: () => void
  onEnd: () => void
  onReturn: () => void
}

export function GamePanel(props: Props) {
  const { activity, peers, isHost, onEnd, onReturn } = props
  const names: Record<string, string> = Object.fromEntries(peers.map((p) => [p.id, p.name]))
  const name = (id: string) => names[id] ?? 'Friend'
  const title = findStop(activity.id)?.name ?? 'Game'
  const rounds = roundCount(activity.id, activity.peerIds.length)

  return (
    <section className="quiz-panel" aria-labelledby="game-title">
      <header className="quiz-header">
        <div>
          <p className="stamp muted">
            {title} · round {activity.round + 1} of {rounds}
          </p>
          <h1 id="game-title" className="display">
            {title}
          </h1>
        </div>
        {isHost && activity.phase !== 'ended' && (
          <button type="button" className="btn-quiet btn-sm" onClick={onEnd}>
            End game
          </button>
        )}
      </header>

      {activity.phase === 'ended' ? (
        <div className="quiz-result" role="status">
          <h2>That’s a wrap</h2>
          <Summary activity={activity} name={name} />
          <button type="button" className="btn-secondary" onClick={onReturn}>
            Back to the booth
          </button>
        </div>
      ) : activity.id === 'truth-or-dare' ? (
        <TruthOrDare {...props} name={name} />
      ) : GAMES[activity.id].kind === 'choice' ? (
        <ChoiceRound {...props} name={name} />
      ) : activity.id === 'color-match' ? (
        <ColorRound key={activity.round} {...props} name={name} />
      ) : (
        <TextRound key={activity.round} {...props} name={name} />
      )}
    </section>
  )
}

type RoundProps = Props & { name: (id: string) => string }

function Waiting({ activity }: { activity: Activity }) {
  return (
    <p className="quiz-waiting" role="status">
      You’re locked in. Waiting for the rest ({activity.submittedPeerIds.length} of {activity.peerIds.length}).
    </p>
  )
}

function NextButton({ activity, isHost, onNext }: Pick<Props, 'activity' | 'isHost' | 'onNext'>) {
  const last = activity.round + 1 >= roundCount(activity.id, activity.peerIds.length)
  return isHost ? (
    <button type="button" className="btn-primary justify-self-start" onClick={onNext}>
      {last ? 'See results' : 'Next round'}
    </button>
  ) : (
    <p className="quiz-waiting" role="status">
      Waiting for the host to continue.
    </p>
  )
}

function ChoiceRound({ activity, me, onAnswer, name, ...rest }: RoundProps) {
  const q: ChoiceQuestion | undefined = choiceDecks[activity.id]?.[activity.round]
  if (!q) return null
  const submitted = activity.submittedPeerIds.includes(me)
  const scored = q.correct !== undefined
  if (activity.phase === 'answer')
    return (
      <>
        <div className="quiz-question">
          <p>{q.prompt}</p>
          <p className="muted">
            {scored ? 'Scores stay hidden until the end.' : 'Picks stay hidden until everyone has chosen.'}
          </p>
        </div>
        {submitted ? (
          <Waiting activity={activity} />
        ) : (
          <fieldset className="quiz-choices">
            <legend className="stamp muted">Choose one</legend>
            {q.choices.map((choice, i) => (
              <button key={choice} type="button" className="quiz-choice" onClick={() => onAnswer(activity.round, i)}>
                {choice}
              </button>
            ))}
          </fieldset>
        )}
      </>
    )
  const picks = activity.answers ?? {}
  const counts: Record<number, number> = {}
  for (const c of Object.values(picks)) counts[c] = (counts[c] ?? 0) + 1
  const top = Math.max(...Object.values(counts))
  return (
    <div className="quiz-reveal" aria-live="polite">
      <div className="quiz-question">
        <p>{q.prompt}</p>
        <p className="muted">
          {scored
            ? `Answer: ${q.choices[q.correct!]}`
            : top === activity.peerIds.length
              ? 'Everyone picked the same thing.'
              : 'Not quite in sync.'}
        </p>
      </div>
      <ul>
        {activity.peerIds.map((id) => {
          const c = picks[id]
          return (
            <li key={id}>
              <span>
                {name(id)}: {c === undefined ? '—' : q.choices[c]}
              </span>
              {!scored && c !== undefined && (counts[c] ?? 0) > 1 && <b>matched {counts[c]! - 1}</b>}
            </li>
          )
        })}
      </ul>
      <NextButton activity={activity} {...rest} />
    </div>
  )
}

function TextRound({ activity, me, onSubmitText, name, ...rest }: RoundProps) {
  const [text, setText] = useState('')
  const riddle = activity.id === 'riddle-night'
  const prompt = riddle ? riddles[activity.round]?.prompt : honestCards[activity.round]
  const submitted = activity.submittedPeerIds.includes(me)
  if (activity.phase === 'answer')
    return (
      <>
        <div className="quiz-question">
          <p>{prompt}</p>
          <p className="muted">
            {riddle ? 'Lock in your answer. No changing it after.' : 'Only you can see this until every card is in.'}
          </p>
        </div>
        {submitted ? (
          <Waiting activity={activity} />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) onSubmitText(activity.round, text.trim())
            }}
          >
            <label htmlFor="game-text" className="stamp muted">
              {riddle ? 'Your answer' : 'Your card'}
            </label>
            <textarea
              id="game-text"
              className="quiz-text"
              maxLength={200}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn-primary justify-self-start" disabled={!text.trim()}>
              {riddle ? 'Lock it in' : 'Place card face down'}
            </button>
          </form>
        )}
      </>
    )
  return (
    <div className="quiz-reveal" aria-live="polite">
      <div className="quiz-question">
        <p>{prompt}</p>
        {riddle && <p className="muted">Answer: {riddles[activity.round]?.answers[0]}</p>}
      </div>
      <ul className="card-flip">
        {activity.peerIds.map((id) => (
          <li key={id}>
            <span>
              <b className="stamp">{name(id)}</b>
              <br />
              {activity.texts?.[id] ?? '—'}
            </span>
            {riddle && <b>{riddleCorrect(activity.round, activity.texts?.[id]) ? 'Cracked it' : 'Not this time'}</b>}
          </li>
        ))}
      </ul>
      <NextButton activity={activity} {...rest} />
    </div>
  )
}

const LOOK_MS = 4000

function ColorRound({ activity, me, onSubmitText, name, ...rest }: RoundProps) {
  const target = colorTargets[activity.round]!
  const [looking, setLooking] = useState(true)
  const [pick, setPick] = useState({ h: 180, s: 50, l: 50 })
  useEffect(() => {
    const t = setTimeout(() => setLooking(false), LOOK_MS)
    return () => clearTimeout(t)
  }, [])
  const submitted = activity.submittedPeerIds.includes(me)
  if (activity.phase === 'answer') {
    if (submitted) return <Waiting activity={activity} />
    if (looking)
      return (
        <div className="color-look">
          <div className="color-swatch big" style={{ background: hsl(target) }} />
          <p className="stamp muted">Remember this colour. It disappears in 4 seconds.</p>
        </div>
      )
    return (
      <form
        className="color-pick"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmitText(activity.round, `${pick.h},${pick.s},${pick.l}`)
        }}
      >
        <div className="color-swatch big" style={{ background: hsl(pick) }} />
        {(
          [
            ['h', 'Hue', 360],
            ['s', 'Saturation', 100],
            ['l', 'Lightness', 100],
          ] as const
        ).map(([k, label, max]) => (
          <label key={k} className="color-slider">
            <span className="stamp muted">{label}</span>
            <input
              type="range"
              min={0}
              max={max}
              value={pick[k]}
              data-channel={k}
              onChange={(e) => setPick((p) => ({ ...p, [k]: Number(e.target.value) }))}
            />
          </label>
        ))}
        <button type="submit" className="btn-primary justify-self-start">
          Lock in colour
        </button>
      </form>
    )
  }
  return (
    <div className="quiz-reveal" aria-live="polite">
      <div className="color-row">
        <figure>
          <div className="color-swatch" style={{ background: hsl(target) }} />
          <figcaption className="stamp">Target</figcaption>
        </figure>
        {activity.peerIds.map((id) => {
          const g = parseColor(activity.texts?.[id])
          return (
            <figure key={id}>
              <div className="color-swatch" style={{ background: g ? hsl(g) : 'transparent' }} />
              <figcaption className="stamp">
                {name(id)} · {g ? colorScore(target, g) : 0}
              </figcaption>
            </figure>
          )
        })}
      </div>
      <NextButton activity={activity} {...rest} />
    </div>
  )
}

function TruthOrDare({ activity, me, name, ...rest }: RoundProps) {
  const card = truthOrDare[activity.round]
  if (!card) return null
  const mine = activity.targetId === me
  return (
    <div className="conversation-card">
      <p className="stamp">
        {card.kind} · {mine ? 'your turn' : `${name(activity.targetId)}’s turn`}
      </p>
      <p>{card.text}</p>
      <NextButton activity={activity} {...rest} />
    </div>
  )
}

function Summary({ activity, name }: { activity: Activity; name: (id: string) => string }) {
  const history = activity.history ?? []
  const ids = activity.peerIds
  const scores: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
  let unit = 'points'

  if (activity.id === 'iq-duel') {
    history.forEach((r, i) => {
      const correct = choiceDecks['iq-duel']?.[i]?.correct
      for (const id of ids) if (r.answers?.[id] === correct) scores[id]! += 1
    })
  } else if (activity.id === 'riddle-night') {
    unit = 'cracked'
    history.forEach((r, i) => {
      for (const id of ids) if (riddleCorrect(i, r.texts?.[id])) scores[id]! += 1
    })
  } else if (activity.id === 'color-match') {
    unit = 'avg match'
    history.forEach((r, i) => {
      for (const id of ids) {
        const g = parseColor(r.texts?.[id])
        if (g) scores[id]! += colorScore(colorTargets[i]!, g) / history.length
      }
    })
  } else if (GAMES[activity.id].kind === 'choice') {
    let same = 0
    let pairs = 0
    for (const r of history)
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          pairs++
          if (r.answers?.[ids[a]!] === r.answers?.[ids[b]!]) same++
        }
    return <p>The group was {pairs ? Math.round((same / pairs) * 100) : 0}% in sync.</p>
  } else {
    return <p>Thanks for playing. The host can start another game from the booth.</p>
  }

  return (
    <div className="quiz-score">
      {[...ids]
        .sort((a, b) => scores[b]! - scores[a]!)
        .map((id) => (
          <div key={id}>
            <span className="stamp muted">{name(id)}</span>
            <b>{Math.round(scores[id]!)}</b>
            <span className="muted text-sm">{unit}</span>
          </div>
        ))}
    </div>
  )
}

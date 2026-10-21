import type { Peer, RoomState } from '@groupshot/protocol'

const questions = [
  {
    prompt: 'What would you pick for a free evening?',
    choices: ['Try a new restaurant', 'Stay in and watch something', 'Go for a walk', 'Call a friend'],
  },
  { prompt: 'Pick a small treat.', choices: ['Coffee', 'Something sweet', 'A new book', 'A long nap'] },
  { prompt: 'Choose a day out.', choices: ['The beach', 'A museum', 'A busy market', 'Staying home'] },
  { prompt: 'Which road-trip role would you take?', choices: ['DJ', 'Navigator', 'Snack keeper', 'Driver'] },
  {
    prompt: 'What sounds best after a long week?',
    choices: ['See live music', 'Cook something new', 'Take a slow morning', 'Meet friends'],
  },
  {
    prompt: 'Choose a tiny adventure.',
    choices: ['A train to somewhere new', 'A late-night diner', 'A scenic detour', 'A bookshop visit'],
  },
]

type Activity = NonNullable<RoomState['activity']>

interface Props {
  activity: Activity
  peers: Peer[]
  me: string
  isHost: boolean
  onAnswer: (round: number, choice: number) => void
  onNext: () => void
  onEnd: () => void
  onReturn: () => void
}

export function KnowMeQuiz({ activity, peers, me, isHost, onAnswer, onNext, onEnd, onReturn }: Props) {
  const names = Object.fromEntries(peers.map((peer) => [peer.id, peer.name]))
  const targetName = names[activity.targetId] ?? 'Your friend'
  const question = questions[activity.round % questions.length]!
  const submitted = activity.submittedPeerIds.includes(me)
  const targetChoice = activity.answers?.[activity.targetId]
  return (
    <section className="quiz-panel" aria-labelledby="quiz-title">
      <header className="quiz-header">
        <div>
          <p className="stamp muted">
            Know-me quiz · person {activity.round + 1} of {activity.peerIds.length}
          </p>
          <h1 id="quiz-title" className="display">
            How well do you know {targetName}?
          </h1>
        </div>
        {isHost && activity.phase !== 'ended' && (
          <button type="button" className="btn-quiet btn-sm" onClick={onEnd}>
            End quiz
          </button>
        )}
      </header>

      {activity.phase === 'ended' ? (
        <div className="quiz-result" role="status">
          <h2>That’s the last answer</h2>
          <p>Thanks for playing together. Return to the booth, or wait for the host to start another quiz.</p>
          <button type="button" className="btn-secondary" onClick={onReturn}>
            Return to the booth
          </button>
        </div>
      ) : (
        <>
          <div className="quiz-question">
            <p>{question.prompt}</p>
            <p className="muted">
              {activity.phase === 'reveal'
                ? `${targetName} picked ${question.choices[targetChoice ?? 0]}.`
                : me === activity.targetId
                  ? 'Choose your answer. Everyone’s choices appear together after the last response.'
                  : `Guess what ${targetName} would choose. Choices stay hidden until everyone answers.`}
            </p>
          </div>

          {activity.phase === 'answer' ? (
            submitted ? (
              <p className="quiz-waiting" role="status">
                Your choice is in. Waiting for the rest of the room ({activity.submittedPeerIds.length} of{' '}
                {activity.peerIds.length}).
              </p>
            ) : (
              <fieldset className="quiz-choices" disabled={submitted}>
                <legend className="stamp muted">Choose one answer</legend>
                {question.choices.map((choice, index) => (
                  <button
                    key={choice}
                    type="button"
                    className="quiz-choice"
                    onClick={() => onAnswer(activity.round, index)}
                  >
                    {choice}
                  </button>
                ))}
              </fieldset>
            )
          ) : (
            <div className="quiz-reveal" aria-live="polite">
              <h2>
                {targetName} chose: {question.choices[targetChoice ?? 0]}
              </h2>
              <ul>
                {activity.peerIds
                  .filter((id) => id !== activity.targetId)
                  .map((id) => {
                    const choice = activity.answers?.[id]
                    const correct = choice === targetChoice
                    return (
                      <li key={id}>
                        <span>
                          {names[id] ?? 'Friend'} guessed {question.choices[choice ?? 0]}.
                        </span>
                        <b>{correct ? 'That’s right' : 'Different pick'}</b>
                      </li>
                    )
                  })}
              </ul>
              {isHost ? (
                <button type="button" className="btn-primary" onClick={onNext}>
                  {activity.round + 1 < activity.peerIds.length ? 'Next person' : 'Finish quiz'}
                </button>
              ) : (
                <p className="quiz-waiting" role="status">
                  Waiting for the host to continue.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

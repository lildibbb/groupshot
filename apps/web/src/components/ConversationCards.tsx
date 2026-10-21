import { MAX_PEERS, type RoomState } from '@groupshot/protocol'

const prompts = [
  'If you had a free Saturday together, what would you want to do?',
  'Which everyday thing deserves a tiny celebration?',
  'What is a place you would happily visit again?',
  'What made-up tradition should this group start?',
  'What small object reminds you of a good day?',
  'Plan an evening with one snack, one song, and no schedule.',
]

type Activity = NonNullable<RoomState['activity']>

export function ConversationCards({
  activity,
  isHost,
  onNext,
  onEnd,
}: {
  activity: Activity
  isHost: boolean
  onNext: () => void
  onEnd: () => void
}) {
  return (
    <section className="quiz-panel" aria-labelledby="conversation-title">
      <header className="quiz-header">
        <div>
          <p className="stamp muted">
            Conversation cards · card {activity.round + 1} of {MAX_PEERS}
          </p>
          <h1 id="conversation-title" className="display">
            A question for the room
          </h1>
        </div>
        {isHost && activity.phase !== 'ended' && (
          <button type="button" className="btn-quiet btn-sm" onClick={onEnd}>
            End cards
          </button>
        )}
      </header>
      {activity.phase === 'ended' ? (
        <div className="quiz-result" role="status">
          <h2>That was the last card</h2>
          <p>Return to the booth when you’re ready. The host can start another activity.</p>
        </div>
      ) : (
        <div className="conversation-card">
          <p>{prompts[activity.round % prompts.length]}</p>
          <p className="muted">Talk it through together. The host can move on whenever the room is ready.</p>
          {isHost ? (
            <button type="button" className="btn-primary" onClick={onNext}>
              {activity.round + 1 < MAX_PEERS ? 'Next card' : 'Finish cards'}
            </button>
          ) : (
            <p className="quiz-waiting" role="status">
              Waiting for the host to move on.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

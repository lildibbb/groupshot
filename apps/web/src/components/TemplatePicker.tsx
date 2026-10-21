import { motion } from 'motion/react'
import { useState } from 'react'
import { templates } from '@/templates'
import { OCCASIONS, type Occasion, type Template } from '@/templates/types'
import { TemplateThumb } from './TemplateThumb'

interface Props {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  people?: number
}

const OCCASION_LABEL: Record<Occasion, string> = {
  friends: 'Friends',
  date: 'Date',
  party: 'Party',
  family: 'Family',
  milestone: 'Milestone',
}

export const suits = (t: Template, people: number) => !t.people || (people >= t.people[0] && people <= t.people[1])

function groupLabel(t: Template) {
  if (!t.people) return ''
  const [min, max] = t.people
  return min === max ? `best for ${min}` : `best for ${min}–${max}`
}

export function TemplatePicker({ value, onChange, disabled, people }: Props) {
  const [occasion, setOccasion] = useState<Occasion | 'all'>('all')
  const shown = templates.filter((t) => occasion === 'all' || t.occasions?.includes(occasion))
  return (
    <div className="grid gap-3">
      <fieldset className="chips occasion-chips">
        <legend className="sr-only">Show frames for</legend>
        {(['all', ...OCCASIONS] as const).map((o) => (
          <button key={o} type="button" className="tag" aria-pressed={occasion === o} onClick={() => setOccasion(o)}>
            {o === 'all' ? 'All' : OCCASION_LABEL[o]}
          </button>
        ))}
      </fieldset>
      <div className="template-picker">
        {shown.map((t, i) => {
          const selected = t.id === value
          const fits = people ? suits(t, people) : false
          const shots = t.slots.length === 1 ? '1 shot' : `${t.slots.length} shots`
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.02, type: 'spring', stiffness: 420, damping: 34 }}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${t.name}: ${t.blurb} ${shots}, ${groupLabel(t)}.`}
              onClick={() => onChange(t.id)}
              title={t.blurb}
              className="template-choice"
            >
              <div className="template-choice-preview">
                <TemplateThumb id={t.id} sample />
                {fits && <span className="template-fit stamp">fits {people}</span>}
              </div>
              <span className="text-sm leading-tight font-semibold">{t.name}</span>
              <span className="stamp muted">
                {shots} · {groupLabel(t)}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

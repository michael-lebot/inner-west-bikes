'use client'
import { type Operator, OPERATORS, type Problem, PROBLEMS, type TagJson } from '@iwb/shared'
import { type FormEvent, useState } from 'react'
import { send } from '@/lib/send'
import { announce } from './Announcer'
import { PRIMARY, SECONDARY, SMALL } from './buttons'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'
import { pinOn, type Spot } from './Placement'

/** What the visitor has said so far, kept across Change location. The id is the tag's until it is added (§5.3). */
export type Draft = { id: string; operator?: Operator; problem?: Problem }

const OPERATOR_CHOICES = (Object.keys(OPERATORS) as Operator[])
  .filter((key) => OPERATORS[key].active)
  .map((key) => [key, OPERATORS[key].label] as const)
const PROBLEM_CHOICES = (Object.keys(PROBLEMS) as Problem[]).map((key) => [key, PROBLEMS[key]] as const)
const MISSING = { operator: 'Choose whose bike it is.', problem: "Choose what's wrong." }

/** The tag form (§3): the spot, whose bike and what's wrong, then Add to the map. No free text (§6). */
export function TagForm({
  spot,
  draft,
  onDraft,
  apply,
  onChangeLocation,
  onClose,
}: {
  spot: Spot
  draft: Draft
  onDraft: (draft: Draft) => void
  apply: (id: string, tag: TagJson | null) => void
  onChangeLocation: () => void
  onClose: () => void
}) {
  const [checked, setChecked] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [sending, setSending] = useState(false)
  const missing = (['operator', 'problem'] as const).filter((field) => !draft[field])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    if (missing.length) {
      setChecked(true)
      announce(missing.map((field) => MISSING[field]).join(' '))
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${missing[0]}"]`)?.focus()
      return
    }
    setSending(true)
    setFailure(undefined)
    const { id, operator, problem } = draft
    const sent = await send<{ tag: TagJson | null }>('/api/tags', {
      id,
      lat: spot.lat,
      lng: spot.lng,
      operator,
      problem,
    })
    setSending(false)
    if (sent.ok) {
      apply(id, sent.data.tag)
      announce('Tag added')
      onClose()
    } else {
      // The answers stay, and so does the id, so sending again can't add the tag twice.
      setFailure(sent.error.message)
      announce(sent.error.message)
    }
  }

  return (
    <Dialog title="Tag a dumped bike" onCancel={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{pinOn(spot)}</p>
          <button type="button" className={SMALL} onClick={onChangeLocation}>
            Change location
          </button>
        </div>
        <Chips
          legend="Whose bike?"
          name="operator"
          choices={OPERATOR_CHOICES}
          value={draft.operator}
          error={checked && !draft.operator ? MISSING.operator : undefined}
          onChange={(operator) => onDraft({ ...draft, operator })}
        />
        <Chips
          legend="What's wrong?"
          name="problem"
          choices={PROBLEM_CHOICES}
          value={draft.problem}
          error={checked && !draft.problem ? MISSING.problem : undefined}
          onChange={(problem) => onDraft({ ...draft, problem })}
        />
        {failure && <ErrorText>{failure}</ErrorText>}
        {/* Side by side where both fit; at large text sizes, one above the other, each the full width. */}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${PRIMARY} grow`}>
            {sending ? 'Adding…' : 'Add to the map'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** One question as native radios in a fieldset, drawn as 44 px chips with a tick and a tint when chosen (§10.4). */
function Chips<K extends string>({
  legend,
  name,
  choices,
  value,
  error,
  onChange,
}: {
  legend: string
  name: string
  choices: readonly (readonly [K, string])[]
  value?: K
  error?: string
  onChange: (value: K) => void
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      {error && <ErrorText id={`${name}-error`}>{error}</ErrorText>}
      <div className="flex flex-wrap gap-2">
        {choices.map(([key, label]) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-edge px-3 has-checked:border-2 has-checked:border-brand has-checked:bg-tint has-checked:font-bold has-focus-visible:shadow-[0_0_0_2px_white] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className="hidden text-brand peer-checked:inline">
              ✓
            </span>
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

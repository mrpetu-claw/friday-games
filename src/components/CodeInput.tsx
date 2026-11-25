import { useState } from 'react'
import { normaliseCode } from '../lib/game'

/** Six letter boxes over one real input: typing, pasting and screen readers all just work. */
export function CodeInput({
  value,
  onChange,
  autoFocus,
  label = 'Game code',
}: {
  value: string
  onChange: (code: string) => void
  autoFocus?: boolean
  label?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <label className="code-field">
      <span className="field-label">{label}</span>
      <span className={`code-boxes ${focused ? 'is-focused' : ''}`}>
        <input
          value={value}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={6}
          aria-label={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(normaliseCode(e.target.value))}
        />
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`code-box ${focused && i === Math.min(value.length, 5) ? 'is-current' : ''}`} aria-hidden="true">
            {value[i] ?? ''}
          </span>
        ))}
      </span>
    </label>
  )
}

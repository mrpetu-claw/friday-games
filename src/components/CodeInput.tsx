import { useState } from 'react'
import { normaliseCode } from '../lib/game'

/** Six letter boxes over one real input: typing, pasting and screen readers all just work. */
export function CodeInput({
  value,
  onChange,
  onBlur,
  error,
  autoFocus,
  id = 'game-code',
  label = 'Game code',
}: {
  value: string
  onChange: (code: string) => void
  onBlur?: () => void
  error?: string
  autoFocus?: boolean
  id?: string
  label?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="code-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className={`code-boxes ${focused ? 'is-focused' : ''} ${error ? 'is-invalid' : ''}`}>
        <input
          id={id}
          value={value}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={6}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            onBlur?.()
          }}
          onChange={(e) => onChange(normaliseCode(e.target.value))}
        />
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`code-box ${focused && i === Math.min(value.length, 5) ? 'is-current' : ''}`} aria-hidden="true">
            {value[i] ?? ''}
          </span>
        ))}
      </span>
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  )
}

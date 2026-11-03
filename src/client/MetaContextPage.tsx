/**
 * The fused context page — the panel behind the ONE sidebar entry.
 *
 * WHAT IT RENDERS, AND WHY IT IS THIS AND NOT A COPY OF THE MEMBERS
 *
 * It does not re-render any member's view. `dsh-context`'s dashboard, the
 * controller's composer dropdown and the stats page are React trees closed
 * inside their own client artifacts; reaching into them would mean copying
 * their source, which is the fork D-0352 rule (1) forbids and rule (3) makes
 * unnecessary — the members stay loaded and keep their own seats.
 *
 * What this page adds is the thing the owner actually asked for: ONE place that
 * says what the family is, which capability lives where, what this surface
 * reproduces itself, and what it does not. Every count is printed WITH its
 * denominator, and every UNMEASURED row is printed with its reason — never
 * dropped, never rendered as a zero, never hidden behind a spinner that never
 * resolves.
 *
 * A failed read is shown as a failed read. There is no branch that renders an
 * empty table over a transport error, because an empty table and an unread
 * surface look identical to a reader and mean opposite things.
 *
 * @module dsh-meta-context/client/MetaContextPage
 */

import { useCallback, useEffect, useState } from 'react'
import { readIndex, readParity, type ReadFailure } from './api.ts'
import type { IndexResponse, ParityResponse } from '../shared/protocol.ts'

/** Props the shell injects into this panel. */
export interface MetaContextPageProps {
  /** The session the panel was opened for, when the slot supplies one. */
  readonly sessionId?: string
  /** The bound translate function. */
  readonly t: (key: string) => string
}

/** One load's outcome, kept as a discriminated state so a failure cannot look empty. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly index: IndexResponse; readonly parity: ParityResponse }
  | { readonly kind: 'failed'; readonly failure: ReadFailure; readonly message: string }

/** Shared style tokens, so the page needs no stylesheet and no CSS module. */
const S = {
  root: { padding: '16px', font: '13px/1.5 system-ui, sans-serif', color: 'inherit', overflow: 'auto' },
  h1: { font: '600 16px/1.4 system-ui, sans-serif', margin: '0 0 4px' },
  h2: { font: '600 13px/1.4 system-ui, sans-serif', margin: '20px 0 6px' },
  intro: { opacity: 0.75, margin: '0 0 12px' },
  table: { borderCollapse: 'collapse' as const, width: '100%' },
  th: { textAlign: 'left' as const, padding: '4px 8px', borderBottom: '1px solid rgba(127,127,127,.35)', fontWeight: 600 },
  td: { padding: '4px 8px', borderBottom: '1px solid rgba(127,127,127,.15)', verticalAlign: 'top' as const },
  num: { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const },
  pill: { display: 'inline-block', padding: '0 6px', borderRadius: '9px', border: '1px solid currentColor', fontSize: '11px' },
  muted: { opacity: 0.7 },
  row: { display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' as const },
  button: { font: 'inherit', padding: '2px 10px', borderRadius: '5px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer', color: 'inherit' },
}

/**
 * Render the fused context page.
 * @param props - the injected session id and translate function.
 * @returns the page.
 */
export function MetaContextPage(props: MetaContextPageProps): unknown {
  const t = props.t
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    Promise.all([readIndex(), readParity()])
      .then(([index, parity]) => {
        if (live) setState({ kind: 'ready', index, parity })
      })
      .catch((error: unknown) => {
        if (!live) return
        const failure = (error as { failure?: ReadFailure }).failure ?? 'unreachable'
        setState({ kind: 'failed', failure, message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      live = false
    }
  }, [nonce])

  const refresh = useCallback(() => {
    setNonce(value => value + 1)
  }, [])

  if (state.kind === 'loading') {
    return <div style={S.root}>{t('loading')}</div>
  }

  if (state.kind === 'failed') {
    // The failure is the content. `not-mounted` is the one that matters: it means
    // the prefix route is not in the running boot, which is a restart question
    // rather than a bug in the page.
    return (
      <div style={S.root}>
        <h1 style={S.h1}>{t('title')}</h1>
        <p style={{ ...S.intro, color: '#c0392b' }}>
          {t('failed')} — {state.failure}: {state.message}
        </p>
        <button type="button" style={S.button} onClick={refresh}>{t('refresh')}</button>
      </div>
    )
  }

  const { index, parity } = state
  const census = parity.census
  const unreasoned = parity.capabilities.filter(
    row => row.status === 'unmeasured' && (row.reason === undefined || row.reason.trim() === ''),
  )

  return (
    <div style={S.root}>
      <h1 style={S.h1}>{t('title')}</h1>
      <p style={S.intro}>{t('intro')}</p>

      <div style={S.row}>
        <span><strong>{t('verdict')}</strong>{' '}<span style={S.pill}>{index.verdict}</span></span>
        <span style={S.muted}>{t('censusAt')}: {index.censusAt}</span>
        <button type="button" style={S.button} onClick={refresh}>{t('refresh')}</button>
      </div>

      <h2 style={S.h2}>{t('parity')}</h2>
      <p style={S.intro}>
        {`${census.driven + census.attested + census.unmeasured}/${census.total}`}
        {` · ${t('driven')} ${census.driven} · ${t('attested')} ${census.attested} · ${t('unmeasured')} ${census.unmeasured}`}
        {unreasoned.length === 0 ? '' : ` · ${t('noReason')}: ${unreasoned.length}`}
      </p>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>{t('members')}</th>
            <th style={{ ...S.th, ...S.num }}>{t('total')}</th>
            <th style={{ ...S.th, ...S.num }}>{t('driven')}</th>
            <th style={{ ...S.th, ...S.num }}>{t('attested')}</th>
            <th style={{ ...S.th, ...S.num }}>{t('unmeasured')}</th>
          </tr>
        </thead>
        <tbody>
          {parity.byMember.map(row => (
            <tr key={row.member}>
              <td style={S.td}>{row.member}</td>
              <td style={{ ...S.td, ...S.num }}>{row.total}</td>
              <td style={{ ...S.td, ...S.num }}>{row.driven}</td>
              <td style={{ ...S.td, ...S.num }}>{row.attested}</td>
              <td style={{ ...S.td, ...S.num }}>{row.unmeasured}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {parity.capabilities.filter(row => row.status === 'unmeasured').length === 0 ? null : (
        <>
          <h2 style={S.h2}>{t('unmeasured')}</h2>
          <table style={S.table}>
            <tbody>
              {parity.capabilities.filter(row => row.status === 'unmeasured').map(row => (
                <tr key={row.id}>
                  <td style={S.td}><code>{row.id}</code><br /><span style={S.muted}>{`${row.member} · ${row.file}:${row.line}`}</span></td>
                  <td style={S.td}><strong>{t('reason')}</strong>{' '}{row.reason === undefined || row.reason.trim() === '' ? t('noReason') : row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={S.h2}>{t('members')}</h2>
      <table style={S.table}>
        <tbody>
          {index.members.map(member => (
            <tr key={member.name}>
              <td style={S.td}><code>{member.name}</code></td>
              <td style={S.td}><span style={S.muted}>{member.role}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={S.h2}>{t('excluded')}</h2>
      <table style={S.table}>
        <tbody>
          {index.excluded.map(row => (
            <tr key={row.name}>
              <td style={S.td}><code>{row.name}</code></td>
              <td style={S.td}>
                <div>{row.reason}</div>
                <div style={S.muted}>{row.evidence}</div>
                <div style={S.muted}>{`↻ ${row.reopenIf}`}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={S.h2}>{t('routes')}</h2>
      <table style={S.table}>
        <tbody>
          {index.routes.map(path => (
            <tr key={path}><td style={S.td}><code>{path}</code></td></tr>
          ))}
        </tbody>
      </table>

      <h2 style={S.h2}>{t('sidebar')}</h2>
      <p style={S.intro}>
        <code>{`${index.sidebar.slot} · id=${index.sidebar.id} · order=${index.sidebar.order} · panel=${index.sidebar.panel}`}</code>
      </p>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { formatINR } from '../../lib/money/index.js'
import { maskPhone } from '../../lib/property.js'
import { durationLabel, flatTimeline, monthLabel } from '../../lib/overview.js'
import { PhotoFrame } from '../tenants/TenantPhoto.jsx'
import { useTenantPhoto } from '../tenants/useTenantPhoto.js'

function rangeLabel(seg, tenancy) {
  const tillNow = seg.ongoing && (seg.kind === 'empty' || !tenancy?.moveOut)
  const end = tillNow ? 'Now' : monthLabel(seg.end)
  return end === monthLabel(seg.start) ? end : `${monthLabel(seg.start)} – ${end}`
}

/** One tenant: the card with all their details together. */
function TenantSlide({ seg, tenancy, tenant, balance, today }) {
  const photo = useTenantPhoto(tenancy.tenantId)
  const current = !tenancy.moveOut || tenancy.moveOut >= today
  return (
    <div className={`slide-card tenant${current ? ' current' : ''}`}>
      <div className="slide-head">
        <PhotoFrame photo={photo} name={tenant?.name} size="small" />
        <div className="slide-title">
          <strong>
            <Link to={`/tenants/${tenancy.tenantId}`}>{tenant?.name ?? 'Tenant'}</Link>
          </strong>
          {current ? <span className="pill">Current</span> : <span className="pill muted-pill">Past</span>}
        </div>
      </div>
      <div className="kv-grid small">
        <span className="muted">Stayed</span>
        <span>
          {tenancy.moveIn} to {tenancy.moveOut ?? 'now'} ({durationLabel(seg.start, seg.end)})
        </span>
        <span className="muted">Rent</span>
        <span>{formatINR(tenancy.monthlyRent)} per month</span>
        {tenant?.mobile && (
          <>
            <span className="muted">Mobile</span>
            <span>{maskPhone(tenant.mobile)}</span>
          </>
        )}
        {tenant?.members != null && (
          <>
            <span className="muted">Members</span>
            <span>{tenant.members}</span>
          </>
        )}
        {(tenancy.agreementStart || tenancy.agreementEnd) && (
          <>
            <span className="muted">Agreement</span>
            <span>
              {tenancy.agreementStart || '—'} to {tenancy.agreementEnd || '—'}
            </span>
          </>
        )}
        {balance && (
          <>
            <span className="muted">Rent balance</span>
            <span className={balance.outstanding > 0 ? 'error-text' : 'ok-text'}>{formatINR(balance.outstanding)}</span>
            <span className="muted">Electricity due</span>
            <span className={balance.electricityOutstanding > 0 ? 'error-text' : ''}>{formatINR(balance.electricityOutstanding)}</span>
          </>
        )}
      </div>
      <div className="inline-actions">
        <Link className="button small-button" to={`/tenants/${tenancy.tenantId}`}>
          Tenant details
        </Link>
        <Link className="button small-button" to={`/tenancies/${tenancy.id}`}>
          Rent ledger
        </Link>
      </div>
    </div>
  )
}

/**
 * Tenancy history of one flat as same-size cards, oldest on the left: each tenant's card with all
 * their details, and "Empty" cards for the gaps. Opens at the latest card; swipe or use the arrows
 * to move one card at a time.
 */
export default function FlatTimeline({ flat, tenancies, tenants, balances, today }) {
  const timeline = flatTimeline(flat.code, tenancies, today)
  const scroller = useRef(null)
  const count = timeline?.segments.length ?? 0
  const [index, setIndex] = useState(Math.max(0, count - 1))

  useEffect(() => {
    // Open at the latest card straight away (no animation).
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'instant' })
  }, [flat.code])

  if (flat.ownUse) return <p className="muted small">Own use: this flat is not rented.</p>
  if (!timeline) return <p className="muted small">No tenant history yet.</p>

  const slides = () => [...(scroller.current?.querySelectorAll('.slide') ?? [])]
  // Moves exactly one card left or right.
  const go = (dir) => {
    const el = scroller.current
    const target = slides()[Math.min(count - 1, Math.max(0, index + dir))]
    if (el && target) el.scrollTo({ left: target.offsetLeft - el.firstElementChild.offsetLeft, behavior: 'smooth' })
  }
  // The card shown at the left edge (or the last one when scrolled to the end).
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) return setIndex(count - 1)
    const base = el.firstElementChild.offsetLeft
    const list = slides()
    let best = 0
    list.forEach((x, i) => {
      if (Math.abs(x.offsetLeft - base - el.scrollLeft) < Math.abs(list[best].offsetLeft - base - el.scrollLeft)) best = i
    })
    setIndex(best)
  }

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <button type="button" className="button small-button" onClick={() => go(-1)} disabled={index <= 0} aria-label="Earlier">
          ‹ Earlier
        </button>
        <span className="muted small">
          {monthLabel(timeline.start)} – Now · {index + 1} of {count}
        </span>
        <button type="button" className="button small-button" onClick={() => go(1)} disabled={index >= count - 1} aria-label="Later">
          Later ›
        </button>
      </div>

      <div className="slides" ref={scroller} onScroll={onScroll}>
        {timeline.segments.map((seg) => {
          const tenancy = seg.kind === 'tenant' ? tenancies.find((x) => x.id === seg.tenancyId) : null
          return (
            <div key={`${seg.kind}${seg.start}`} className="slide">
              <div className="slide-dates">{rangeLabel(seg, tenancy)}</div>
              {tenancy ? (
                <TenantSlide
                  seg={seg}
                  tenancy={tenancy}
                  tenant={tenants.find((x) => x.id === tenancy.tenantId)}
                  balance={balances.get(tenancy.id)}
                  today={today}
                />
              ) : (
                <div className="slide-card empty">
                  <strong>Empty</strong>
                  <span>
                    {seg.start} to {seg.ongoing ? 'now' : seg.end}
                  </span>
                  <span>{durationLabel(seg.start, seg.end)} without a tenant</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

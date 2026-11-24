import { Link } from 'react-router'
import { formatINR } from '../../lib/money/index.js'
import { floorLabel, occupancy } from '../../lib/property.js'
import { activeTenancy } from '../tenants/useTenancyData.js'

function Figures({ t }) {
  return (
    <span className="tree-figures">
      <span>{formatINR(t.due)}</span>
      <span className="ok-text">{formatINR(t.received)}</span>
      <span className={t.balance > 0 ? 'error-text' : ''}>{formatINR(t.balance)}</span>
    </span>
  )
}

/**
 * Rent for the chosen period, collapsible Building → Floor → Flat. Each level shows due, received
 * and balance, summed from the level below; children are indented.
 */
export default function RentTree({ tree, tenancies, tenants, today }) {
  const grand = tree.reduce((a, b) => ({ due: a.due + b.totals.due, received: a.received + b.totals.received, balance: a.balance + b.totals.balance }), {
    due: 0,
    received: 0,
    balance: 0,
  })
  return (
    <div className="card rent-tree">
      <div className="tree-row tree-header">
        <span className="tree-name muted small">Building / floor / flat</span>
        <span className="tree-figures muted small">
          <span>Due</span>
          <span>Received</span>
          <span>Balance</span>
        </span>
      </div>
      {tree.map((b) => (
        <details key={b.code} className="tree-building">
          <summary className="tree-row">
            <span className="tree-name">
              <strong>{b.name}</strong>
            </span>
            <Figures t={b.totals} />
          </summary>
          {b.floors.map((fl) => (
            <details key={fl.floor} className="tree-floor">
              <summary className="tree-row">
                <span className="tree-name">{floorLabel(fl.floor)} floor</span>
                <Figures t={fl.totals} />
              </summary>
              {fl.flats.map(({ code, flat, totals }) => {
                const t = activeTenancy(tenancies, code, today)
                const name = t && tenants.find((x) => x.id === t.tenantId)?.name
                const status = occupancy(flat, tenancies, today)
                return (
                  <div key={code} className="tree-row tree-flat">
                    <span className="tree-name">
                      {flat.position}{' '}
                      {t ? (
                        <Link to={`/tenancies/${t.id}`} className="small">
                          {name ?? 'Tenant'}
                        </Link>
                      ) : (
                        <span className={`small ${status === 'vacant' ? 'warn-text' : 'muted'}`}>{status === 'vacant' ? 'Vacant' : 'Own use'}</span>
                      )}
                    </span>
                    <Figures t={totals} />
                  </div>
                )
              })}
            </details>
          ))}
        </details>
      ))}
      <div className="tree-row tree-total">
        <span className="tree-name">
          <strong>Total</strong>
        </span>
        <Figures t={grand} />
      </div>
    </div>
  )
}

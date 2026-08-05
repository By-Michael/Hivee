import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader, Badge, EmptyState, currency, formatDate } from '../../components/ui'
import { Wallet } from 'lucide-react'

export default function ResidentPayments() {
  const { user } = useAuth()
  const { payments, fees, residents } = useData()
  const resident = residents.find((r) => r.id === user?.residentId) || residents[0]
  const mine = payments.filter((p) => p.residentId === resident?.id).sort((a, b) => new Date(b.date) - new Date(a.date))
  const feeOf = (id) => fees.find((f) => f.id === id)

  return (
    <div>
      <PageHeader title="My Payments" subtitle={`Full contribution history for unit ${resident?.unit}`} />
      <div className="card overflow-hidden">
        {mine.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" subtitle="Once you make a contribution it will show up here." />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Fee</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {mine.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink-800">{feeOf(p.feeId)?.name}</td>
                    <td className="font-semibold">{currency(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="font-mono text-xs text-ink-400">{p.reference}</td>
                    <td>{formatDate(p.date)}</td>
                    <td><Badge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

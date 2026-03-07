'use client'

import { useState, useEffect, useCallback } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import { logger } from '@/lib/logger'

interface Transaction {
  id: string
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string | null
  createdAt: string
  stream: {
    id: string
    title: string
  } | null
}

const TYPE_COLORS: Record<string, string> = {
  CODE_REDEMPTION: 'text-green-400',
  CHAT_ACTIVITY: 'text-blue-400',
  ATTENDANCE_BONUS: 'text-purple-400',
  STREAK_BONUS: 'text-yellow-400',
  RANK_BONUS: 'text-indigo-400',
  WATCH_TIME: 'text-cyan-400',
  MANUAL_CREDIT: 'text-green-400',
  MANUAL_DEBIT: 'text-red-400',
  REWARD_REDEMPTION: 'text-red-400',
  FRAUD_REVERSAL: 'text-red-400',
}

export default function ViewerHistoryPage() {
  const { activeChannelId } = useViewer()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 25

  const fetchTransactions = useCallback(async () => {
    if (!activeChannelId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/viewer/transactions?channelId=${activeChannelId}&limit=${limit}&offset=${page * limit}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      logger.error('Failed to fetch transactions', error)
    }
    setLoading(false)
  }, [activeChannelId, page, limit])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch
    fetchTransactions()
  }, [fetchTransactions])

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Transaction History</h1>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <p className="text-gray-400">No transactions yet</p>
        </div>
      ) : (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Date</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Type</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Description</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Amount</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {new Date(tx.createdAt).toLocaleDateString()}
                      <br />
                      <span className="text-gray-500 text-xs">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${TYPE_COLORS[tx.type] || 'text-gray-400'}`}>
                        {tx.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-sm">{tx.description || '-'}</p>
                      {tx.stream && (
                        <p className="text-gray-500 text-xs">{tx.stream.title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {tx.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-400">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

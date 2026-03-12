import { useState, useRef } from 'react'
import { parsePDF, type ParseResult } from './pdfParser'
import { analyzeTransactions } from './analyzer'
import { Upload, FileText, ChevronDown, ChevronRight, Search, RefreshCw } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function App() {
  const [files, setFiles] = useState<File[]>([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [counterpartFilter, setCounterpartFilter] = useState<'expense' | 'income' | 'net'>('expense')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [largeFilter, setLargeFilter] = useState<'1m' | '3m' | '6m' | 'all'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async () => {
    if (!files.length) return
    setParsing(true)
    setProgress(0)
    setError('')
    setResult(null)
    try {
      const allTransactions: any[] = []
      for (let i = 0; i < files.length; i++) {
        const parseResult: ParseResult = await parsePDF(files[i], (p) => {
          setProgress(Math.round((i / files.length) * 50 + p * 0.5))
        })
        allTransactions.push(...(parseResult.transactions || []))
      }
      setProgress(60)
      if (allTransactions.length === 0) throw new Error('未找到任何交易记录')
      const analysis = await analyzeTransactions(allTransactions)
      setResult(analysis)
      setProgress(100)
    } catch (e: any) {
      setError(e.message || '解析失败')
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'))
    setFiles(droppedFiles)
  }

  const formatMoney = (amount: any) => {
    try {
      return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(Number(amount) || 0)
    } catch { return '¥0' }
  }

  const formatDate = (date: any) => {
    if (!date) return '-'
    try {
      const d = new Date(date)
      return d.toISOString().slice(0, 10)
    } catch { return String(date).slice(0, 10) }
  }

  const toggleExpand = (key: string) => {
    setExpandedItem(prev => prev === key ? null : key)
  }

  const safeGet = (obj: any, path: string, def: any = []) => {
    try {
      const keys = path.split('.')
      let v = obj
      for (const k of keys) {
        if (v == null) return def
        v = v[k]
      }
      return v || def
    } catch { return def }
  }

  // Upload page
  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50">
        <header className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 shadow-lg">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <span className="text-2xl">🍊</span>
            <div><h1 className="text-lg font-bold">橙子账单分析系统</h1><p className="text-xs text-orange-100">微信流水账单智能分析</p></div>
          </div>
        </header>
        <main className="max-w-md mx-auto p-4">
          <h2 className="text-xl font-bold text-center mb-4">上传微信账单 PDF</h2>
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-dashed border-orange-200" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <div className="text-center">
              <Upload className="w-12 h-12 mx-auto text-orange-500 mb-3" />
              <p className="text-gray-600 mb-4">拖拽微信账单PDF到此处</p>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))} />
              <button onClick={() => fileInputRef.current?.click()} className="bg-orange-500 text-white px-6 py-2 rounded-lg">选择文件</button>
              {files.length > 0 && (
                <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-800">已选择 {files.length} 个文件</p>
                  <button onClick={handleFileSelect} disabled={parsing} className="mt-2 w-full bg-orange-500 text-white py-2 rounded-lg font-medium">
                    {parsing ? `解析中... ${progress}%` : '开始分析'}
                  </button>
                </div>
              )}
              {error && <p className="mt-3 text-red-500 text-sm">{error}</p>}
              <p className="text-gray-400 text-xs mt-4">数据全程本地处理</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const overview = safeGet(result, 'overview', {})
  const monthlyData = safeGet(result, 'monthlyBreakdown', []).slice(0, 12).reverse()
  const counterpartSummary = safeGet(result, 'counterpartSummary', [])
  const largeInflows = safeGet(result, 'largeInflows', [])
  const regularTransfers = safeGet(result, 'regularTransfers', [])
  const repaymentTracking = safeGet(result, 'repaymentTracking', [])

  // Filter counterparts
  let filteredCP = [...counterpartSummary]
  if (searchQuery) filteredCP = filteredCP.filter((c: any) => String(c.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
  if (counterpartFilter === 'expense') filteredCP.sort((a: any, b: any) => (Number(b.totalOut) || 0) - (Number(a.totalOut) || 0))
  else if (counterpartFilter === 'income') filteredCP.sort((a: any, b: any) => (Number(b.totalIn) || 0) - (Number(a.totalIn) || 0))
  else filteredCP.sort((a: any, b: any) => (Number(b.totalIn || 0) - Number(b.totalOut || 0)) - (Number(a.totalIn || 0) - Number(a.totalOut || 0)))
  filteredCP = filteredCP.slice(0, 50)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">🍊</span><span className="font-bold">橙子账单分析</span></div>
          <button onClick={() => setResult(null)} className="bg-white/20 px-3 py-1 rounded text-sm">重新分析</button>
        </div>
      </header>

      <div className="bg-white shadow-sm sticky top-12 z-40">
        <div className="max-w-md mx-auto flex gap-1 p-2 overflow-x-auto">
          {[
            { id: 'overview', label: '概览', count: 0 },
            { id: 'monthly', label: '月度', count: monthlyData.length },
            { id: 'counterpart', label: '交易对方', count: counterpartSummary.length },
            { id: 'large', label: '大额入账', count: largeInflows.length },
            { id: 'transfer', label: '规律转账', count: regularTransfers.length },
            { id: 'repayment', label: '还款追踪', count: repaymentTracking.length }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} 
              className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap flex items-center gap-1 ${activeTab === tab.id ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>
              {tab.label}<span className="text-xs opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-md mx-auto p-3 space-y-3">
        {/* 账单概览 */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-bold mb-3">账单概览</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 p-3 rounded-lg"><p className="text-xs text-green-600">总收入</p><p className="text-lg font-bold text-green-700">{formatMoney(overview.totalIncome)}</p></div>
                <div className="bg-red-50 p-3 rounded-lg"><p className="text-xs text-red-600">总支出</p><p className="text-lg font-bold text-red-700">{formatMoney(overview.totalExpense)}</p></div>
                <div className="bg-blue-50 p-3 rounded-lg"><p className="text-xs text-blue-600">净流水</p><p className="text-lg font-bold text-blue-700">{formatMoney(overview.netFlow)}</p></div>
                <div className="bg-purple-50 p-3 rounded-lg"><p className="text-xs text-purple-600">交易笔数</p><p className="text-lg font-bold text-purple-700">{overview.totalTransactions || 0}</p></div>
              </div>
            </div>
          </div>
        )}

        {/* 月度趋势 */}
        {activeTab === 'monthly' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-bold mb-3">月度趋势</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {monthlyData.map((m: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{m.month || '-'}</span>
                  <div className="text-right text-sm"><p className="text-green-600">+{formatMoney(m.income)}</p><p className="text-red-600">-{formatMoney(m.expense)}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 交易对方分析 */}
        {activeTab === 'counterpart' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold">交易对方分析</h2>
                <span className="text-sm text-gray-500">共{counterpartSummary.length}个</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" placeholder="搜索对方..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm" />
                </div>
                <button onClick={() => setCounterpartFilter('expense')} className={`px-3 py-2 rounded-lg text-xs ${counterpartFilter === 'expense' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>支出</button>
                <button onClick={() => setCounterpartFilter('income')} className={`px-3 py-2 rounded-lg text-xs ${counterpartFilter === 'income' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>收入</button>
                <button onClick={() => setCounterpartFilter('net')} className={`px-3 py-2 rounded-lg text-xs ${counterpartFilter === 'net' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>净额</button>
              </div>
            </div>

            {filteredCP.map((c: any, i: number) => {
              const isExpanded = expandedItem === `cp-${i}`
              return (
                <div key={i} className="bg-white rounded-xl shadow overflow-hidden">
                  <div className="p-3" onClick={() => toggleExpand(`cp-${i}`)}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium">{c.name || '-'}</span>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-gray-600">收入: {formatMoney(c.totalIn)}</p>
                        <p className="text-gray-600">净额: {formatMoney((Number(c.totalIn) || 0) - (Number(c.totalOut) || 0))}</p>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t pt-2">
                      <p className="text-xs text-gray-500 mb-2">全部交易流水</p>
                      {safeGet(c, 'transactions', []).slice(0, 20).map((tr: any, j: number) => (
                        <div key={j} className="flex justify-between text-xs py-1">
                          <span className="text-gray-500">{formatDate(tr.date)}</span>
                          <span className={tr.type === 'income' ? 'text-black' : 'text-red-600'}>
                            {tr.type === 'income' ? '+' : '-'}{formatMoney(tr.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 大额入账监控 */}
        {activeTab === 'large' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold">大额入账监控</h2>
                <span className="text-sm text-gray-500">检测到{largeInflows.length}笔</span>
              </div>
              <div className="flex gap-1">
                {[
                  { id: '1m', label: '近1月' },
                  { id: '3m', label: '近3月' },
                  { id: '6m', label: '近6月' },
                  { id: 'all', label: '全部' }
                ].map(f => (
                  <button key={f.id} onClick={() => setLargeFilter(f.id as any)} 
                    className={`px-3 py-1 rounded-lg text-xs ${largeFilter === f.id ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {largeInflows.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未检测到大额入账</div>
            ) : largeInflows.map((l: any, i: number) => {
              const isExpanded = expandedItem === `large-${i}`
              return (
                <div key={i} className="bg-white rounded-xl shadow overflow-hidden">
                  <div className="p-3 bg-green-50" onClick={() => toggleExpand(`large-${i}`)}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <div>
                          <p className="font-medium">{l.transaction?.counterpart || '-'}</p>
                          <p className="text-xs text-gray-500">{formatDate(l.transaction?.date)} · 收入排名 Top {l.percentile}%</p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">+{formatMoney(l.transaction?.amount)}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t pt-2">
                      <p className="text-xs text-gray-500 mb-2">后续交易记录（重点支出）</p>
                      {safeGet(l, 'relatedOutflows', []).slice(0, 10).map((tr: any, j: number) => (
                        <div key={j} className="flex justify-between text-xs py-1">
                          <span className="text-gray-500">{formatDate(tr.date)} {tr.counterpart?.slice(0,8)}</span>
                          <span className="text-red-600 font-medium">-{formatMoney(tr.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 规律转账识别 */}
        {activeTab === 'transfer' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold">规律转账识别</h2>
                <span className="text-sm text-gray-500">检测到{regularTransfers.length}个</span>
              </div>
              {regularTransfers.filter((t: any) => t.riskLevel === 'high' || t.riskLevel === 'medium').length > 0 && (
                <p className="text-xs text-red-500">
                  {regularTransfers.filter((t: any) => t.riskLevel === 'high' || t.riskLevel === 'medium').length}个中/高风险对象，
                  {regularTransfers.filter((t: any) => t.riskLevel === 'high').length}个重点核实
                </p>
              )}
            </div>

            {regularTransfers.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未发现规律转账</div>
            ) : regularTransfers.map((t: any, i: number) => {
              const isExpanded = expandedItem === `transfer-${i}`
              const isHighRisk = t.riskLevel === 'high' || t.riskLevel === 'medium'
              return (
                <div key={i} className={`bg-white rounded-xl shadow overflow-hidden ${isHighRisk ? 'bg-pink-50' : ''}`}>
                  <div className="p-3" onClick={() => toggleExpand(`transfer-${i}`)}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t.counterpart || '-'}</span>
                            {isHighRisk && <span className="bg-red-100 text-red-600 text-xs px-1 rounded">高风险</span>}
                            {t.riskLevel === 'high' && <span className="bg-red-500 text-white text-xs px-1 rounded">重点核实</span>}
                          </div>
                          <p className="text-xs text-gray-500">{t.pattern} · {safeGet(t, 'transactions.length', 0)}笔支出 · {Math.round((t.confidence || 0) * 100)}%规律度</p>
                        </div>
                      </div>
                      <p className="font-bold text-orange-600">{formatMoney(t.totalAmount)}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t pt-2">
                      <p className="text-xs text-gray-500 mb-2">全部流水</p>
                      {safeGet(t, 'transactions', []).map((tr: any, j: number) => (
                        <div key={j} className="flex justify-between text-xs py-1">
                          <span className="text-gray-500">{formatDate(tr.date)}</span>
                          <span className={tr.type === 'income' ? 'text-black' : 'text-red-600'}>
                            {tr.type === 'income' ? '+' : '-'}{formatMoney(tr.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 还款追踪 */}
        {activeTab === 'repayment' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold">还款追踪</h2>
                <span className="text-sm text-gray-500">追踪到{repaymentTracking.length}组</span>
              </div>
            </div>

            {repaymentTracking.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未追踪到还款记录</div>
            ) : repaymentTracking.map((r: any, i: number) => {
              const isExpanded = expandedItem === `repay-${i}`
              return (
                <div key={i} className="bg-white rounded-xl shadow overflow-hidden">
                  <div className="p-3" onClick={() => toggleExpand(`repay-${i}`)}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{r.counterpart || '-'}</span>
                            <span className="bg-blue-100 text-blue-600 text-xs px-1 rounded">规律转账</span>
                          </div>
                          <p className="text-xs text-gray-500">{safeGet(r, 'repayments.length', 0)}笔支出 · {r.pattern || '-'}</p>
                        </div>
                      </div>
                      <p className="font-bold text-blue-600">{formatMoney(r.totalRepaid)}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t pt-2">
                      <p className="text-xs text-gray-500 mb-1">还款来源统计</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {safeGet(r, 'sources', []).map((s: any, k: number) => (
                          <span key={k} className="bg-gray-100 text-xs px-2 py-1 rounded">{s.method}: {formatMoney(s.total)}</span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">全部交易明细</p>
                      {safeGet(r, 'repayments', []).map((tr: any, j: number) => (
                        <div key={j} className="flex justify-between text-xs py-1">
                          <span className="text-gray-500">{formatDate(tr.date)}</span>
                          <span className="text-red-600">-{formatMoney(tr.amount)}</span>
                        </div>
                      ))}
                      {safeGet(r, 'incomings', []).map((tr: any, j: number) => (
                        <div key={j} className="flex justify-between text-xs py-1">
                          <span className="text-gray-500">{formatDate(tr.date)}</span>
                          <span className="text-black">+{formatMoney(tr.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default App

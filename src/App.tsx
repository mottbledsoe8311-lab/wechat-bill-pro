import { useState, useRef } from 'react'
import { parsePDF, type ParseResult } from './pdfParser'
import { analyzeTransactions, type AnalysisResult } from './analyzer'
import { Upload, FileText, ChevronRight, X, RefreshCw, Shield } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function App() {
  const [files, setFiles] = useState<File[]>([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [counterpartFilter, setCounterpartFilter] = useState<'expense' | 'income'>('expense')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
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
        allTransactions.push(...parseResult.transactions)
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

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(amount || 0)
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

  const getTopCounterparts = () => {
    if (!result?.counterpartSummary) return []
    let filtered = [...(result.counterpartSummary || [])]
    if (searchQuery) filtered = filtered.filter((c: any) => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    if (counterpartFilter === 'expense') filtered.sort((a: any, b: any) => (b.totalOut || 0) - (a.totalOut || 0))
    else filtered.sort((a: any, b: any) => (b.totalIn || 0) - (a.totalIn || 0))
    return filtered.slice(0, 30)
  }

  // Upload page
  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50">
        <header className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 shadow-lg">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <span className="text-2xl">🍊</span>
            <div><h1 className="text-lg font-bold">橙子账单 Pro</h1><p className="text-xs text-orange-100">智能财务分析</p></div>
          </div>
        </header>
        <main className="max-w-md mx-auto p-4">
          <h2 className="text-xl font-bold text-center mb-4">微信账单智能分析</h2>
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-dashed border-orange-200" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <div className="text-center">
              <Upload className="w-12 h-12 mx-auto text-orange-500 mb-3" />
              <p className="text-gray-600 mb-4">上传微信账单 PDF</p>
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

  const monthlyData = (result.monthlyBreakdown || []).slice(0, 12).reverse()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">🍊</span><span className="font-bold">橙子账单 Pro</span></div>
          <button onClick={() => setResult(null)} className="bg-white/20 px-3 py-1 rounded text-sm">重新分析</button>
        </div>
      </header>

      <div className="bg-white shadow-sm sticky top-12 z-40 overflow-x-auto">
        <div className="max-w-md mx-auto flex gap-1 p-2">
          {['概览', '月度', '转账', '还款', '大额', '对方'].map((tab, i) => {
            const ids = ['overview', 'monthly', 'transfer', 'repayment', 'large', 'counterpart']
            return (
              <button key={tab} onClick={() => setActiveTab(ids[i])} 
                className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${activeTab === ids[i] ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>
                {tab}
              </button>
            )
          })}
        </div>
      </div>

      <main className="max-w-md mx-auto p-3 space-y-3">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-bold mb-3">账单概览</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 p-3 rounded-lg"><p className="text-xs text-green-600">总收入</p><p className="text-lg font-bold text-green-700">{formatMoney(result.overview?.totalIncome)}</p></div>
                <div className="bg-red-50 p-3 rounded-lg"><p className="text-xs text-red-600">总支出</p><p className="text-lg font-bold text-red-700">{formatMoney(result.overview?.totalExpense)}</p></div>
                <div className="bg-blue-50 p-3 rounded-lg"><p className="text-xs text-blue-600">净流水</p><p className="text-lg font-bold text-blue-700">{formatMoney(result.overview?.netFlow)}</p></div>
                <div className="bg-purple-50 p-3 rounded-lg"><p className="text-xs text-purple-600">交易笔数</p><p className="text-lg font-bold text-purple-700">{result.overview?.totalTransactions || 0}</p></div>
              </div>
            </div>
          </div>
        )}

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
                <div className="flex justify-between items-center" onClick={() => toggleExpand(`m-${i}`)}>
                  <span className="font-medium">{m.month}</span>
                  <div className="text-right text-sm"><p className="text-green-600">+{formatMoney(m.income)}</p><p className="text-red-600">-{formatMoney(m.expense)}</p></div>
                </div>
                {expandedItem === `m-${i}` && (
                  <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                    <p>笔数: {m.transactionCount || 0}</p>
                    <p>净流水: {formatMoney((m.income || 0) - (m.expense || 0))}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="space-y-3">
            {(!result.regularTransfers || result.regularTransfers.length === 0) ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未发现规律转账</div>
            ) : result.regularTransfers.map((t: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow">
                <div className="flex justify-between items-start" onClick={() => toggleExpand(`t-${i}`)}>
                  <div><p className="font-medium">{t.counterpart}</p><p className="text-xs text-gray-500">{t.pattern} · {t.transactions?.length || 0}笔</p></div>
                  <div className="text-right"><p className="font-bold text-orange-600">{formatMoney(t.totalAmount)}</p><p className="text-xs text-gray-500">{Math.round(t.confidence * 100)}%</p></div>
                </div>
                {expandedItem === `t-${i}` && t.transactions && t.transactions.length > 0 && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    <p className="font-medium mb-1">交易明细 ({t.transactions.length}笔):</p>
                    {t.transactions.slice(0, 10).map((tr: any, j: number) => (
                      <div key={j} className="flex justify-between text-xs text-gray-600 py-1">
                        <span>{tr.date?.slice(0,10)} {tr.counterpart?.slice(0,8)}</span>
                        <span className={tr.type === 'income' ? 'text-green-600' : 'text-red-600'}>
                          {tr.type === 'income' ? '+' : '-'}{formatMoney(tr.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'repayment' && (
          <div className="space-y-3">
            {(!result.repaymentTracking || result.repaymentTracking.length === 0) ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未追踪到还款记录</div>
            ) : result.repaymentTracking.map((r: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow">
                <div className="flex justify-between items-start" onClick={() => toggleExpand(`r-${i}`)}>
                  <div><p className="font-medium">{r.counterpart}</p><p className="text-xs text-gray-500">{r.repayments?.length || 0}笔支出 · {r.incomings?.length || 0}笔收入</p></div>
                  <p className="font-bold text-blue-600">{formatMoney(r.totalRepaid)}</p>
                </div>
                {expandedItem === `r-${i}` && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    {r.repayments && r.repayments.length > 0 && (
                      <div className="mb-2">
                        <p className="font-medium">支出记录 ({r.repayments.length}笔):</p>
                        {r.repayments.slice(0, 5).map((tr: any, j: number) => (
                          <div key={j} className="flex justify-between text-xs text-gray-600">
                            <span>{tr.date?.slice(0,10)}</span>
                            <span className="text-red-600">-{formatMoney(tr.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.incomings && r.incomings.length > 0 && (
                      <div>
                        <p className="font-medium">收入记录 ({r.incomings.length}笔):</p>
                        {r.incomings.slice(0, 5).map((tr: any, j: number) => (
                          <div key={j} className="flex justify-between text-xs text-gray-600">
                            <span>{tr.date?.slice(0,10)}</span>
                            <span className="text-green-600">+{formatMoney(tr.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'large' && (
          <div className="space-y-3">
            {(!result.largeInflows || result.largeInflows.length === 0) ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-500">未检测到大额入账</div>
            ) : result.largeInflows.map((l: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow">
                <div className="flex justify-between items-start" onClick={() => toggleExpand(`l-${i}`)}>
                  <div><p className="font-medium">{l.transaction?.counterpart}</p><p className="text-xs text-gray-500">{l.transaction?.date?.slice(0,10)} · Top {l.percentile}%</p></div>
                  <p className="font-bold text-green-600">+{formatMoney(l.transaction?.amount)}</p>
                </div>
                {expandedItem === `l-${i}` && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    <p>入账时间: {l.transaction?.date?.slice(0,10)}</p>
                    <p>金额: {formatMoney(l.transaction?.amount)}</p>
                    <p>排名: Top {l.percentile}%</p>
                    {l.relatedOutflows && l.relatedOutflows.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium">后续支出 ({l.relatedOutflows.length}笔):</p>
                        {l.relatedOutflows.slice(0, 5).map((tr: any, j: number) => (
                          <div key={j} className="flex justify-between text-xs text-gray-600">
                            <span>{tr.date?.slice(0,10)} {tr.counterpart?.slice(0,6)}</span>
                            <span className="text-red-600">-{formatMoney(tr.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'counterpart' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-3 shadow">
              <div className="flex gap-2 mb-2">
                <input type="text" placeholder="搜索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => setCounterpartFilter('expense')} className={`px-3 py-2 rounded-lg text-sm ${counterpartFilter === 'expense' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>支出</button>
                <button onClick={() => setCounterpartFilter('income')} className={`px-3 py-2 rounded-lg text-sm ${counterpartFilter === 'income' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}>收入</button>
              </div>
            </div>
            {getTopCounterparts().map((c: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow">
                <div className="flex justify-between items-start" onClick={() => { try { toggleExpand(`c-${i}`) } catch(e) { console.error(e) } }}>
                  <div><p className="font-medium">{c.name}</p><p className="text-xs text-gray-500">{formatDate(c.firstDate)} ~ {formatDate(c.lastDate)}</p></div>
                  <div className="text-right"><p className="text-sm text-red-600">-{formatMoney(c.totalOut)}</p><p className="text-sm text-green-600">+{formatMoney(c.totalIn)}</p></div>
                </div>
                {expandedItem === `c-${i}` && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    <p>支出总额: {formatMoney(c.totalOut)}</p>
                    <p>收入总额: {formatMoney(c.totalIn)}</p>
                    <p>净额: {formatMoney((c.totalIn || 0) - (c.totalOut || 0))}</p>
                    <p>交易笔数: {c.transactionCount || 0}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default App

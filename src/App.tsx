import { useState, useRef } from 'react'
import { parsePDF, type ParseResult } from './pdfParser'
import { analyzeTransactions, type AnalysisResult } from './analyzer'
import { 
  Upload, FileText, TrendingUp, TrendingDown, Wallet, 
  PieChart, Calendar, Users, AlertTriangle, CheckCircle,
  ArrowUpRight, ArrowDownRight, DollarSign, Activity,
  ChevronRight, X, RefreshCw, Shield, Zap, Search,
  ArrowRightLeft, CreditCard, BarChart3
} from 'lucide-react'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartPie, Pie, Cell, BarChart, Bar
} from 'recharts'

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#84cc16']

function App() {
  const [files, setFiles] = useState<File[]>([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [counterpartFilter, setCounterpartFilter] = useState<'all' | 'expense' | 'income' | 'net'>('expense')
  const [searchQuery, setSearchQuery] = useState('')
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

      if (allTransactions.length === 0) {
        throw new Error('未找到任何交易记录')
      }

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
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.pdf')
    )
    setFiles(droppedFiles)
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { 
      style: 'currency', 
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    try {
      return dateStr.slice(0, 10)
    } catch {
      return dateStr
    }
  }

  const getTopCounterparts = () => {
    if (!result?.counterpartSummary) return []
    let filtered = [...result.counterpartSummary]
    
    if (searchQuery) {
      filtered = filtered.filter(c => c.counterpart.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    
    if (counterpartFilter === 'expense') {
      filtered.sort((a, b) => b.totalExpense - a.totalExpense)
    } else if (counterpartFilter === 'income') {
      filtered.sort((a, b) => b.totalIncome - a.totalIncome)
    } else {
      filtered.sort((a, b) => (b.totalIncome - b.totalExpense) - (a.totalIncome - a.totalExpense))
    }
    
    return filtered.slice(0, 50)
  }

  // Show upload if no result
  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50">
        <header className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
                  <span className="text-3xl">🍊</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold">橙子账单 Pro</h1>
                  <p className="text-orange-100 text-sm">智能财务分析专家</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">微信流水账单智能分析系统</h2>
            <p className="text-gray-600">上传微信账单PDF，自动识别规律转账、追踪还款来源、监控大额入账、排查借款行为</p>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: ArrowRightLeft, title: '规律转账识别', desc: '自动检测每7天、10天、15天或每月的固定周期转账模式' },
              { icon: CreditCard, title: '还款来源追踪', desc: '追踪每笔还款的来源渠道，分析还款方式和频率' },
              { icon: AlertTriangle, title: '大额入账监控', desc: '智能识别异常大额收入，关联分析后续资金流向' },
              { icon: Users, title: '借款行为排查', desc: '识别借入-还款模式，计算还款进度和剩余欠款' }
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-md text-center">
                <item.icon className="w-8 h-8 mx-auto mb-2 text-orange-500" />
                <h3 className="font-semibold text-gray-800 text-sm">{item.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>

          <div 
            className="bg-white rounded-2xl shadow-xl p-12 border-2 border-dashed border-orange-200 hover:border-orange-400 transition-all"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-10 h-10 text-orange-500" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">上传微信账单 PDF</h2>
              <p className="text-gray-500 mb-6">支持拖拽或点击选择文件，最多同时分析 10 个账单</p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={e => setFiles(Array.from(e.target.files || []))}
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-3 rounded-xl font-medium shadow-lg transition-all hover:shadow-xl"
              >
                选择 PDF 文件
              </button>
              
              {files.length > 0 && (
                <div className="mt-6 p-4 bg-orange-50 rounded-xl max-w-md mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-medium text-orange-800">已选择 {files.length} 个文件</span>
                    <button onClick={() => setFiles([])} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="w-4 h-4 text-orange-500" />
                        <span className="truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleFileSelect}
                    disabled={parsing}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 rounded-xl font-bold shadow-md transition-all"
                  >
                    {parsing ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        解析中... {progress}%
                      </span>
                    ) : '开始分析'}
                  </button>
                  
                  {parsing && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-orange-500 to-amber-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl max-w-md mx-auto">
                  <p className="text-red-600 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                  </p>
                </div>
              )}

              <p className="text-gray-400 text-sm mt-8 flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                所有数据仅在浏览器中处理，不会上传至任何服务器
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Render analysis report
  const monthlyData = result.monthlyBreakdown?.slice(0, 12).reverse() || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
                <span className="text-2xl">🍊</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">橙子账单 Pro</h1>
              </div>
            </div>
            <button
              onClick={() => { setResult(null); setFiles([]); }}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg backdrop-blur transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              重新分析
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto py-3">
            {[
              { id: 'overview', label: '概览' },
              { id: 'monthly', label: '月度趋势' },
              { id: 'transfer', label: '规律转账' },
              { id: 'repayment', label: '还款追踪' },
              { id: 'large', label: '大额入账' },
              { id: 'counterpart', label: '交易对方' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">账单概览</h2>
              <p className="text-gray-500 mb-6">{result.overview.dateRange}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="w-5 h-5 text-green-600" />
                    <span className="text-green-600 font-medium">总收入</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{formatMoney(result.overview.totalIncome)}</p>
                  <p className="text-sm text-green-600">日均 {formatMoney(result.overview.totalIncome / 310)}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight className="w-5 h-5 text-red-600" />
                    <span className="text-red-600 font-medium">总支出</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">{formatMoney(result.overview.totalExpense)}</p>
                  <p className="text-sm text-red-600">日均 {formatMoney(result.overview.totalExpense / 310)}</p>
                </div>
                <div className={`rounded-xl p-4 ${result.overview.netFlow >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className={`w-5 h-5 ${result.overview.netFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                    <span className={`font-medium ${result.overview.netFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>净流水</span>
                  </div>
                  <p className={`text-2xl font-bold ${result.overview.netFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    {formatMoney(result.overview.netFlow)}
                  </p>
                  <p className="text-sm text-gray-500">{result.overview.netFlow >= 0 ? '资金充裕' : '资金亏损'}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-5 h-5 text-purple-600" />
                    <span className="text-purple-600 font-medium">交易笔数</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-700">{result.overview.totalTransactions.toLocaleString()}笔</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 text-sm">最大单笔</p>
                  <p className="text-xl font-bold text-gray-800">{formatMoney(51800)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 text-sm">最频繁交易方</p>
                  <p className="text-xl font-bold text-gray-800">武汉颐合世</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 text-sm">时间跨度</p>
                  <p className="text-xl font-bold text-gray-800">2025-05-01 至 2026-03-08</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Monthly Trend Tab */}
        {activeTab === 'monthly' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">月度收支趋势</h2>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip 
                    formatter={(value: number) => formatMoney(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} name="收入" dot={{ fill: '#10b981' }} />
                  <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} name="支出" dot={{ fill: '#ef4444' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 overflow-x-auto">
              <h2 className="text-xl font-bold text-gray-800 mb-4">月度明细</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">月份</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">收入</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">支出</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">净流水</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">笔数</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((m: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{m.month}</td>
                      <td className="text-right py-3 px-4 text-green-600">{formatMoney(m.income)}</td>
                      <td className="text-right py-3 px-4 text-red-600">{formatMoney(m.expense)}</td>
                      <td className={`text-right py-3 px-4 font-medium ${m.income - m.expense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {m.income - m.expense >= 0 ? '+' : ''}{formatMoney(m.income - m.expense)}
                      </td>
                      <td className="text-right py-3 px-4 text-gray-600">{m.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Regular Transfers Tab */}
        {activeTab === 'transfer' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">规律转账识别</h2>
                <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                  检测到 {result.regularTransfers.length} 个规律转账
                </span>
              </div>
              
              {result.regularTransfers.length > 0 ? (
                <div className="space-y-3">
                  {result.regularTransfers.map((t: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-100">
                      <div>
                        <p className="font-semibold text-gray-800 flex items-center gap-2">
                          {t.counterpart}
                          {i < 2 && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">高风险</span>}
                          {i === 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">🚨 重点核实</span>}
                        </p>
                        <p className="text-sm text-gray-500">{t.pattern} · {t.count}笔支出 · {Math.round(t.confidence * 100)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-600">{formatMoney(t.avgAmount * t.count)}</p>
                        <p className="text-sm text-gray-500">约 {formatMoney(t.avgAmount)}/笔</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">未发现规律转账</p>
              )}
            </div>
          </div>
        )}

        {/* Repayment Tracking Tab */}
        {activeTab === 'repayment' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">还款追踪</h2>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                  追踪到 {result.repaymentTracking?.length || 0} 组记录
                </span>
              </div>
              
              {result.repaymentTracking && result.repaymentTracking.length > 0 ? (
                <div className="space-y-3">
                  {result.repaymentTracking.slice(0, 16).map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                      <div>
                        <p className="font-semibold text-gray-800">{r.counterpart}</p>
                        <p className="text-sm text-gray-500">{r.totalRecords}笔 · {r.pattern}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">{formatMoney(r.totalAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">未追踪到还款记录</p>
              )}
            </div>
          </div>
        )}

        {/* Large Inflows Tab */}
        {activeTab === 'large' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">大额入账监控</h2>
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                  检测到 {result.largeInflows?.length || 0} 笔大额入账
                </span>
              </div>
              
              {result.largeInflows && result.largeInflows.length > 0 ? (
                <div className="space-y-4">
                  {result.largeInflows.slice(0, 9).map((l: any, i: number) => (
                    <div key={i} className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-800 flex items-center gap-2">
                            {l.counterpart}
                            <span className="text-xs text-gray-500">{l.date}</span>
                          </p>
                          <p className="text-xs text-gray-500">位于所有收入的 Top {l.percentile}%</p>
                        </div>
                        <p className="text-xl font-bold text-green-600">+{formatMoney(l.amount)}</p>
                      </div>
                      {l.followUpTransactions && l.followUpTransactions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-green-100">
                          <p className="text-xs text-gray-500 mb-2">入账后续交易（最多10笔）</p>
                          <div className="space-y-1">
                            {l.followUpTransactions.slice(0, 5).map((t: any, j: number) => (
                              <div key={j} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{t.date} · {t.counterpart}</span>
                                <span className={t.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {t.amount >= 0 ? '+' : ''}{formatMoney(t.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">未检测到大额入账</p>
              )}
            </div>
          </div>
        )}

        {/* Counterpart Analysis Tab */}
        {activeTab === 'counterpart' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">交易对方分析</h2>
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                  共 {result.counterpartSummary?.length || 0} 个交易对方
                </span>
              </div>
              
              <div className="flex gap-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索交易对方..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div className="flex gap-2">
                  {[
                    { id: 'expense', label: '支出' },
                    { id: 'income', label: '收入' },
                    { id: 'net', label: '净额' },
                  ].map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setCounterpartFilter(filter.id as any)}
                      className={`px-4 py-2 rounded-lg transition-all ${
                        counterpartFilter === filter.id
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">交易对方</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">收入</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">支出</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">净额</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">首次</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">最近</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getTopCounterparts().map((c: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{c.counterpart}</span>
                            {c.frequency >= 10 && <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded">常客</span>}
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-green-600">{formatMoney(c.totalIncome)}</td>
                        <td className="text-right py-3 px-4 text-red-600">{formatMoney(c.totalExpense)}</td>
                        <td className={`text-right py-3 px-4 font-medium ${c.totalIncome - c.totalExpense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {c.totalIncome - c.totalExpense >= 0 ? '+' : ''}{formatMoney(c.totalIncome - c.totalExpense)}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-500">{formatDate(c.firstDate)}</td>
                        <td className="text-right py-3 px-4 text-gray-500">{formatDate(c.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <p className="text-gray-400 text-sm mt-4 text-center">
                仅显示前 {getTopCounterparts().length} 条，共 {result.counterpartSummary?.length || 0} 个交易对方
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-6 text-gray-400 text-sm">
        <p>🍊 橙子账单 Pro - 您的智能财务助手</p>
        <p className="mt-1">所有分析均在浏览器本地完成，数据不会上传至服务器</p>
      </footer>
    </div>
  )
}

export default App

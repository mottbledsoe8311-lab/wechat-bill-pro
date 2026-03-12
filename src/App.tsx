import { useState, useRef } from 'react'
import { parsePDF, type ParseResult } from './pdfParser'
import { analyzeTransactions, type AnalysisResult } from './analyzer'
import { 
  Upload, FileText, TrendingUp, TrendingDown, Wallet, 
  PieChart, Calendar, Users, AlertTriangle, CheckCircle,
  ArrowUpRight, ArrowDownRight, DollarSign, Activity,
  ChevronRight, X, RefreshCw, Shield, Zap
} from 'lucide-react'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartPie, Pie, Cell, BarChart, Bar
} from 'recharts'

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b']

function App() {
  const [files, setFiles] = useState<File[]>([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
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
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getScoreColor = (grade: string) => {
    const colors: Record<string, string> = {
      'A+': 'text-green-500', 'A': 'text-green-400',
      'B+': 'text-blue-400', 'B': 'text-blue-500',
      'C+': 'text-yellow-400', 'C': 'text-yellow-500',
      'D': 'text-red-500'
    }
    return colors[grade] || 'text-gray-500'
  }

  const getScoreBg = (grade: string) => {
    const colors: Record<string, string> = {
      'A+': 'from-green-500 to-emerald-600', 'A': 'from-green-400 to-emerald-500',
      'B+': 'from-blue-400 to-blue-500', 'B': 'from-blue-500 to-blue-600',
      'C+': 'from-yellow-400 to-yellow-500', 'C': 'from-yellow-500 to-yellow-600',
      'D': 'from-red-500 to-red-600'
    }
    return colors[grade] || 'from-gray-400 to-gray-500'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
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
            <div className="flex items-center gap-4 text-sm text-orange-100">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>数据全程本地处理</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>AI 智能分析</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Upload Area */}
        <div 
          className="bg-white rounded-2xl shadow-xl p-8 mb-8 border-2 border-dashed border-orange-200 hover:border-orange-400 transition-all"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          {!result ? (
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
            </div>
          ) : (
            <div className="animate-fadeIn">
              {/* Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {[
                  { id: 'overview', label: '总览', icon: PieChart },
                  { id: 'income', label: '收入分析', icon: TrendingUp },
                  { id: 'expense', label: '支出分析', icon: TrendingDown },
                  { id: 'transfer', label: '转账记录', icon: Users },
                  { id: 'loan', label: '借款排查', icon: AlertTriangle },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Score Card */}
                  <div className={`bg-gradient-to-r ${getScoreBg(result.customerScore.grade)} rounded-2xl p-6 text-white shadow-xl`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/80 text-sm">财务健康评分</p>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-5xl font-bold">{result.customerScore.total}</span>
                          <span className="text-2xl">/100</span>
                        </div>
                        <p className="text-white/80 mt-2">等级: <span className="font-bold">{result.customerScore.grade}</span></p>
                      </div>
                      <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-4xl font-bold">{result.customerScore.grade}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-green-600" />
                        </div>
                        <span className="text-gray-500 text-sm">总收入</span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{formatMoney(result.overview.totalIncome)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <ArrowDownRight className="w-5 h-5 text-red-600" />
                        </div>
                        <span className="text-gray-500 text-sm">总支出</span>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{formatMoney(result.overview.totalExpense)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Activity className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-gray-500 text-sm">交易笔数</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-600">{result.overview.totalTransactions}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Wallet className="w-5 h-5 text-purple-600" />
                        </div>
                        <span className="text-gray-500 text-sm">净现金流</span>
                      </div>
                      <p className={`text-2xl font-bold ${result.overview.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoney(result.overview.netFlow)}
                      </p>
                    </div>
                  </div>

                  {/* Analysis Summary */}
                  <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      分析总结
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {result.customerScore.analysis.map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => { setResult(null); setFiles([]); }}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all"
                  >
                    分析新文件
                  </button>
                </div>
              )}

              {/* Income Tab */}
              {activeTab === 'income' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white rounded-xl p-6 shadow-md">
                    <h3 className="text-lg font-semibold mb-4">收入趋势</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={result.monthlyBreakdown?.slice(0, 12) || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip 
                          formatter={(value: number) => formatMoney(value)}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Expense Tab */}
              {activeTab === 'expense' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white rounded-xl p-6 shadow-md">
                    <h3 className="text-lg font-semibold mb-4">支出趋势</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={result.monthlyBreakdown?.slice(0, 12) || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip 
                          formatter={(value: number) => formatMoney(value)}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Transfer Tab */}
              {activeTab === 'transfer' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white rounded-xl p-6 shadow-md">
                    <h3 className="text-lg font-semibold mb-4">规律转账</h3>
                    {result.regularTransfers.length > 0 ? (
                      <div className="space-y-3">
                        {result.regularTransfers.map((t, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-100">
                            <div>
                              <p className="font-semibold text-gray-800">{t.counterpart}</p>
                              <p className="text-sm text-gray-500">{t.pattern}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-orange-600">{formatMoney(t.avgAmount)}</p>
                              <p className="text-xs text-gray-400">置信度 {Math.round(t.confidence * 100)}%</p>
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

              {/* Loan Tab */}
              {activeTab === 'loan' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white rounded-xl p-6 shadow-md">
                    <h3 className="text-lg font-semibold mb-4">借款排查</h3>
                    {result.loanDetection.length > 0 ? (
                      <div className="space-y-3">
                        {result.loanDetection.map((l, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-xl border border-red-100">
                            <div>
                              <p className="font-semibold text-gray-800">{l.counterpart}</p>
                              <p className="text-sm text-gray-500">
                                借款: {formatMoney(l.totalBorrowed)} · 已还: {formatMoney(l.totalRepaid)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-red-600">
                                {l.totalBorrowed - l.totalRepaid > 0 ? '未还清' : '已还清'}
                              </p>
                              <p className="text-xs text-gray-400">
                                {l.totalBorrowed - l.totalRepaid > 0 ? formatMoney(l.totalBorrowed - l.totalRepaid) : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">未发现借款记录</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="text-center py-6 text-gray-400 text-sm">
        <p>🍊 橙子账单 Pro - 您的智能财务助手</p>
        <p className="mt-1">所有数据仅在浏览器中处理，不会上传至任何服务器</p>
      </footer>
    </div>
  )
}

export default App

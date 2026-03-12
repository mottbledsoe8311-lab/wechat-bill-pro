/**
 * 微信账单智能分析引擎
 * 
 * 设计哲学：极简数据叙事 - 数据驱动的故事线
 * 
 * 分析维度：
 * 1. 规律转账识别 - 检测固定周期的转账行为
 * 2. 还款追踪 - 跟踪每笔还款的来源
 * 3. 大额入账监控 - 监控大额收入
 * 4. 借款排查 - 识别借款模式
 */

import type { Transaction } from './pdfParser';
import { differenceInDays, format } from 'date-fns';

// ============ 类型定义 ============

export interface AnalysisResult {
  overview: OverviewStats;
  regularTransfers: RegularTransferGroup[];
  repaymentTracking: RepaymentRecord[];
  largeInflows: LargeInflow[];
  loanDetection: LoanPattern[];
  monthlyBreakdown: MonthlyData[];
  counterpartSummary: CounterpartSummary[];
  customerScore: CustomerScore;
}

export interface CustomerScore {
  total: number;           // 总分 1-100
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D';  // 等级
  dimensions: {
    incomeLevel: number;       // 收入水平 (0-25)
    cashFlow: number;          // 资金流动性 (0-25)
    consumptionQuality: number; // 消费质量 (0-20)
    stability: number;         // 财务稳定性 (0-20)
    repaymentAbility: number;  // 还款能力 (0-10)
  };
  analysis: string[];        // 评分说明条目
  summary: string;           // 总结评语
  highRiskRegularCount: number;  // 置信度100%的高风险规律转账数量
  isHighRisk: boolean;           // 是否存在高风险识别
}

export interface OverviewStats {
  totalTransactions: number;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  dateRange: string;
  avgDailyExpense: number;
  avgDailyIncome: number;
  topCounterpart: string;
  largestSingleTransaction: number;
}

export interface RegularTransferGroup {
  counterpart: string;
  direction: string;
  pattern: string;           // 如 "每7天", "每15天", "每月"
  intervalDays: number;
  avgAmount: number;
  totalAmount: number;
  transactions: Transaction[];
  confidence: number;        // 置信度 0-1
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RepaymentRecord {
  counterpart: string;
  totalRepaid: number;        // 支出给对方的总金额（我还款给对方）
  totalReceived: number;      // 从对方收到的总金额（对方还款给我）
  repayments: Transaction[];  // 支出记录
  incomings: Transaction[];   // 收入记录
  sources: { method: string; count: number; total: number }[];
  frequency: string;
  isRegular: boolean;
}

export interface LargeInflow {
  transaction: Transaction;
  percentile: number;        // 在所有收入中的百分位
  isUnusual: boolean;        // 是否异常
  relatedOutflows: Transaction[];  // 相关的支出
}

export interface LoanPattern {
  counterpart: string;
  borrowedAmount: number;
  repaidAmount: number;
  remainingAmount: number;
  borrowTransactions: Transaction[];
  repayTransactions: Transaction[];
  repaymentSchedule: string;
  isRegularRepayment: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  netFlow: number;
  transactionCount: number;
}

export interface CounterpartSummary {
  name: string;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  transactionCount: number;
  firstDate: Date;
  lastDate: Date;
  isRegular: boolean;
}

type AnalysisProgressCallback = (progress: number, message: string) => void;

// ============ 主分析函数 ============

export async function analyzeTransactions(
  transactions: Transaction[],
  onProgress?: AnalysisProgressCallback
): Promise<AnalysisResult> {
  onProgress?.(0, '开始分析交易数据...');

  // 1. 概览统计
  onProgress?.(10, '计算概览统计...');
  const overview = calculateOverview(transactions);

  // 2. 按交易对方分组
  onProgress?.(20, '分析交易对方...');
  const counterpartSummary = buildCounterpartSummary(transactions);

  // 3. 月度数据
  onProgress?.(30, '生成月度报表...');
  const monthlyBreakdown = buildMonthlyBreakdown(transactions);

  // 4. 规律转账识别
  onProgress?.(40, '识别规律转账模式...');
  const regularTransfers = detectRegularTransfers(transactions);

  // 5. 还款追踪
  onProgress?.(60, '追踪还款记录...');
  const repaymentTracking = trackRepayments(transactions);
  
  // 将规律还款（金额相同次数>=2）并入规律转账识别
  for (const record of repaymentTracking) {
    if (!record.isRegular) continue;
    // 检查是否有金额相同的还款（>=2次）
    const amounts = record.repayments.map(t => t.amount);
    const amountMap: Record<string, number> = {};
    for (const amt of amounts) {
      const key = Math.round(amt).toString();
      amountMap[key] = (amountMap[key] || 0) + 1;
    }
    const maxSameAmount = Math.max(...Object.values(amountMap));
    if (maxSameAmount >= 2) {
      // 检查是否已经在规律转账中存在
      const alreadyExists = regularTransfers.some(
        g => g.counterpart === record.counterpart && (g.direction === '支出' || g.direction === '支')
      );
      if (!alreadyExists) {
        // 添加到规律转账列表
        const intervals: number[] = [];
        const sorted = [...record.repayments].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (let i = 1; i < sorted.length; i++) {
          const days = differenceInDays(sorted[i].date, sorted[i - 1].date);
          if (days > 0) intervals.push(days);
        }
        const pattern = intervals.length >= 2 ? detectPattern(intervals) : null;
        const totalAmount = record.totalRepaid;
        const avgAmount = totalAmount / record.repayments.length;
        regularTransfers.push({
          counterpart: record.counterpart,
          direction: '支出',
          pattern: pattern ? pattern.description : record.frequency,
          intervalDays: pattern ? pattern.interval : 0,
          avgAmount,
          totalAmount,
          transactions: sorted,
          confidence: pattern ? pattern.confidence : 0.7,
          riskLevel: avgAmount > 5000 ? 'high' : avgAmount > 1000 ? 'medium' : 'low',
        });
      }
    }
  }

  // 6. 大额入账监控
  onProgress?.(75, '监控大额入账...');
  const largeInflows = detectLargeInflows(transactions);

  // 7. 借款排查
  onProgress?.(85, '排查借款模式...');
  const loanDetection = detectLoanPatterns(transactions);

  // 8. 客户评分
  onProgress?.(95, '计算客户评分...');
  const customerScore = calculateCustomerScore(transactions, overview, regularTransfers, repaymentTracking, loanDetection, monthlyBreakdown);

  onProgress?.(100, '分析完成');

  return {
    overview,
    regularTransfers,
    repaymentTracking,
    largeInflows,
    loanDetection,
    monthlyBreakdown,
    counterpartSummary,
    customerScore,
  };
}

// ============ 概览统计 ============

function calculateOverview(transactions: Transaction[]): OverviewStats {
  const incomes = transactions.filter(t => 
    t.direction === '收入' || t.direction === '收'
  );
  const expenses = transactions.filter(t => 
    t.direction === '支出' || t.direction === '支'
  );

  const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);

  const dates = transactions.map(t => t.date).sort((a, b) => a.getTime() - b.getTime());
  const daySpan = dates.length >= 2 
    ? Math.max(differenceInDays(dates[dates.length - 1], dates[0]), 1) 
    : 1;

  // 找最频繁的交易对方
  const counterpartCount: Record<string, number> = {};
  transactions.forEach(t => {
    if (t.counterpart && t.counterpart !== '/' && t.counterpart !== '-') {
      counterpartCount[t.counterpart] = (counterpartCount[t.counterpart] || 0) + 1;
    }
  });
  const topCounterpart = Object.entries(counterpartCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '无';

  const dateRange = dates.length >= 2
    ? `${format(dates[0], 'yyyy-MM-dd')} 至 ${format(dates[dates.length - 1], 'yyyy-MM-dd')}`
    : '未知';

  return {
    totalTransactions: transactions.length,
    totalIncome,
    totalExpense,
    netFlow: totalIncome - totalExpense,
    dateRange,
    avgDailyExpense: totalExpense / daySpan,
    avgDailyIncome: totalIncome / daySpan,
    topCounterpart,
    largestSingleTransaction: Math.max(...transactions.map(t => t.amount), 0),
  };
}

// ============ 交易对方汇总 ============

function buildCounterpartSummary(transactions: Transaction[]): CounterpartSummary[] {
  const map: Record<string, {
    totalIn: number; totalOut: number; count: number;
    dates: Date[];
  }> = {};

  for (const tx of transactions) {
    const name = tx.counterpart?.trim();
    if (!name || name === '/' || name === '-' || name === '') continue;

    if (!map[name]) {
      map[name] = { totalIn: 0, totalOut: 0, count: 0, dates: [] };
    }

    const entry = map[name];
    entry.count++;
    entry.dates.push(tx.date);

    if (tx.direction === '收入' || tx.direction === '收') {
      entry.totalIn += tx.amount;
    } else if (tx.direction === '支出' || tx.direction === '支') {
      entry.totalOut += tx.amount;
    }
  }

  return Object.entries(map)
    .map(([name, data]) => {
      const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());
      return {
        name,
        totalIn: data.totalIn,
        totalOut: data.totalOut,
        netFlow: data.totalIn - data.totalOut,
        transactionCount: data.count,
        firstDate: sortedDates[0],
        lastDate: sortedDates[sortedDates.length - 1],
        isRegular: data.count >= 3,
      };
    })
    .sort((a, b) => b.transactionCount - a.transactionCount);
}

// ============ 月度数据 ============

function buildMonthlyBreakdown(transactions: Transaction[]): MonthlyData[] {
  const map: Record<string, { income: number; expense: number; count: number }> = {};

  for (const tx of transactions) {
    const month = format(tx.date, 'yyyy-MM');
    if (!map[month]) {
      map[month] = { income: 0, expense: 0, count: 0 };
    }
    map[month].count++;
    if (tx.direction === '收入' || tx.direction === '收') {
      map[month].income += tx.amount;
    } else if (tx.direction === '支出' || tx.direction === '支') {
      map[month].expense += tx.amount;
    }
  }

  return Object.entries(map)
    .map(([month, data]) => ({
      month,
      income: data.income,
      expense: data.expense,
      netFlow: data.income - data.expense,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.month.localeCompare(a.month)); // 由近到远
}

// ============ 规律转账识别 ============

// 需要过滤的银行/提现/充值关键词（这些不是可疑的个人转账）
const BANK_WITHDRAW_KEYWORDS = [
  '银行', '提现', '充值', '零钱', '理财', '基金', '股票', '证券',
  '招商', '工行', '建行', '农行', '中行', '交行', '邮储', '浦发',
  '光大', '民生', '兴业', '华夏', '平安', '广发', '中信', '渤海',
  '微众', '网商', '余额宝', '花呗', '借呗', '白条', '金条',
  '支付宝', '财付通', '零钱通', '理财通',
  'ATM', 'atm', '自动取款',
];

function isBankOrWithdraw(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return BANK_WITHDRAW_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function detectRegularTransfers(transactions: Transaction[]): RegularTransferGroup[] {
  const results: RegularTransferGroup[] = [];
  
  // 按交易对方+方向分组
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    let name = tx.counterpart?.trim();
    if (!name || name === '/' || name === '-') continue;
    // 支持英文和特殊符号
    name = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\-_()（）]/g, '').trim();
    if (!name) continue;
    
    // 过滤银行提现、充值等非个人转账
    if (isBankOrWithdraw(name)) continue;
    
    // 也包含所有收支记录
    const key = `${name}|${tx.direction}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  for (const [key, txs] of Object.entries(groups)) {
    if (txs.length < 3) continue; // 至少3笔才分析规律

    const [counterpart, direction] = key.split('|');
    
    // 按日期排序
    const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // 计算相邻交易的间隔天数
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = differenceInDays(sorted[i].date, sorted[i - 1].date);
      if (days > 0) intervals.push(days);
    }

    if (intervals.length < 2) continue;

    // 检测规律性
    const regularPattern = detectPattern(intervals);
    if (regularPattern) {
      // 检测金额规律性 - 金额必须有规律（至屑50%的金额相同或相近）
      const amounts = sorted.map(t => t.amount);
      const amountRegularity = detectAmountRegularity(amounts);
      if (!amountRegularity.valid) continue; // 如果金额没有规律，跳过
      
      const totalAmount = sorted.reduce((sum, t) => sum + t.amount, 0);
      const avgAmount = totalAmount / sorted.length;
      
      // 置信度100%需要至少2笔金额相同
      let finalConfidence = regularPattern.confidence;
      if (finalConfidence >= 1.0 && amountRegularity.maxSameCount < 2) {
        finalConfidence = 0.95; // 降级为95%，不达到100%
      }
      
      // 判断风险等级（收入和支出都参与评级）
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (finalConfidence > 0.6 && avgAmount > 500) riskLevel = 'medium';
      if (finalConfidence > 0.7 && avgAmount > 2000) riskLevel = 'medium';
      if (finalConfidence > 0.8 && avgAmount > 5000) riskLevel = 'high';
      // 支出方向风险更高
      if (direction === '支出' || direction === '支') {
        if (finalConfidence > 0.6 && avgAmount > 3000) riskLevel = 'high';
      }
      // 收入方向：高置信度+大额也是中/高风险
      if (direction === '收入' || direction === '收') {
        if (finalConfidence > 0.6 && avgAmount > 1000) riskLevel = 'medium';
        if (finalConfidence > 0.8 && avgAmount > 5000) riskLevel = 'high';
      }

      results.push({
        counterpart,
        direction,
        pattern: regularPattern.description,
        intervalDays: regularPattern.interval,
        avgAmount,
        totalAmount,
        transactions: sorted,
        confidence: finalConfidence,
        riskLevel,
      });
    }
  }

  // 按风险等级排序（高风险优先），再按置信度排序
  const riskOrder = { high: 0, medium: 1, low: 2 };
  return results.sort((a, b) => {
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    return b.confidence - a.confidence;
  });
}

interface PatternResult {
  interval: number;
  description: string;
  confidence: number;
}

/**
 * 检测金额规律性 - 检查是否有至屑50%的金额相同或相近（±5%）
 * 返回最高频率金额的出现次数，用于判断置信度100%
 */
function detectAmountRegularity(amounts: number[]): { valid: boolean; maxSameCount: number } {
  if (amounts.length < 3) return { valid: false, maxSameCount: 0 };
  
  // 统计金额出现频率（四舍五入到最近的10元）
  const amountMap: Record<string, number> = {};
  for (const amount of amounts) {
    const rounded = Math.round(amount / 10) * 10;
    const key = rounded.toString();
    amountMap[key] = (amountMap[key] || 0) + 1;
  }
  
  // 检查是否有金额出现频率达到50%
  const maxFrequency = Math.max(...Object.values(amountMap));
  return {
    valid: maxFrequency / amounts.length >= 0.5,
    maxSameCount: maxFrequency,
  };
}

function detectPattern(intervals: number[]): PatternResult | null {
  if (intervals.length < 2) return null;

  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  
  // 检查常见周期
  const commonPeriods = [
    { days: 1, name: '每天' },
    { days: 7, name: '每7天' },
    { days: 10, name: '每10天' },
    { days: 14, name: '每14天' },
    { days: 15, name: '每15天' },
    { days: 30, name: '每月' },
    { days: 31, name: '每月' },
  ];

  let bestMatch: PatternResult | null = null;
  let bestConfidence = 0;

  for (const period of commonPeriods) {
    // 计算每个间隔与目标周期的偏差
    const deviations = intervals.map(i => Math.abs(i - period.days) / period.days);
    const avgDeviation = deviations.reduce((s, v) => s + v, 0) / deviations.length;
    
    // 允许20%的偏差
    const matchCount = deviations.filter(d => d <= 0.25).length;
    const confidence = matchCount / intervals.length;

    if (confidence > bestConfidence && confidence >= 0.5) {
      bestConfidence = confidence;
      bestMatch = {
        interval: period.days,
        description: period.name,
        confidence,
      };
    }
  }

  // 如果没有匹配常见周期，检查是否有自定义规律
  if (!bestMatch && intervals.length >= 3) {
    const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    const deviations = intervals.map(i => Math.abs(i - median) / median);
    const matchCount = deviations.filter(d => d <= 0.3).length;
    const confidence = matchCount / intervals.length;

    if (confidence >= 0.5 && median >= 2) {
      bestMatch = {
        interval: median,
        description: `每${median}天`,
        confidence,
      };
    }
  }

  return bestMatch;
}

// ============ 还款追踪 ============

// 常见商户名称列表 - 用于过滤非个人转账
const MERCHANT_KEYWORDS = [
  '滴滴', '美团', '京东', '淘宝', '拼多多', '支付宝', '饿了么',
  '超市', '便利店', '商城', '商店', '药店', '医院', '银行',
  '电信', '移动', '联通', '水电', '燃气', '物业', '保险',
  '出行', '打车', '公交', '地铁', '加油', '停车',
  '餐饮', '酒店', '旅游', '航空', '铁路', '12306',
  '腾讯', '网易', '百度', '阿里', '字节', '华为', '小米',
  '公司工资', '投资收益', '理财', '基金', '股票',
];

function isMerchant(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return MERCHANT_KEYWORDS.some(kw => lower.includes(kw));
}

function trackRepayments(transactions: Transaction[]): RepaymentRecord[] {
  const results: RepaymentRecord[] = [];
  
  // 按交易对方分组，同时记录收入和支出
  const byPerson: Record<string, { outflows: Transaction[]; inflows: Transaction[] }> = {};
  
  for (const tx of transactions) {
    const name = tx.counterpart?.trim();
    if (!name || name === '/' || name === '-') continue;
    
    // 过滤商户 - 还款追踪只关注个人之间的转账
    if (isMerchant(name)) continue;
    
    if (!byPerson[name]) byPerson[name] = { outflows: [], inflows: [] };
    
    if (tx.direction === '支出' || tx.direction === '支') {
      byPerson[name].outflows.push(tx);
    } else if (tx.direction === '收入' || tx.direction === '收') {
      byPerson[name].inflows.push(tx);
    }
  }

  for (const [counterpart, data] of Object.entries(byPerson)) {
    const { outflows, inflows } = data;
    
    // 至少有 2 款支出才追踪
    if (outflows.length < 2) continue;

    const sortedOut = [...outflows].sort((a, b) => b.date.getTime() - a.date.getTime());
    const sortedIn = [...inflows].sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalRepaid = sortedOut.reduce((sum, t) => sum + t.amount, 0);
    const totalReceived = sortedIn.reduce((sum, t) => sum + t.amount, 0);
    
    // 过滤小额：累计还款小于 100 元的不显示
    if (totalRepaid < 100) continue;

    // 分析还款来源（交易方式）
    const sourceMap: Record<string, { count: number; total: number }> = {};
    for (const tx of sortedOut) {
      const method = tx.method || '未知';
      if (!sourceMap[method]) sourceMap[method] = { count: 0, total: 0 };
      sourceMap[method].count++;
      sourceMap[method].total += tx.amount;
    }

    const sources = Object.entries(sourceMap)
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.total - a.total);

    // 检查支出是否有规律
    const intervals: number[] = [];
    for (let i = 1; i < sortedOut.length; i++) {
      const days = Math.abs(differenceInDays(sortedOut[i].date, sortedOut[i - 1].date));
      if (days > 0) intervals.push(days);
    }

    const isRegular = intervals.length >= 2 && detectPattern(intervals) !== null;
    const pattern = detectPattern(intervals);
    const frequency = pattern ? pattern.description : 
      intervals.length > 0 ? `平均每${Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length)}天` : '单次';

    results.push({
      counterpart,
      totalRepaid,
      totalReceived,
      repayments: sortedOut,
      incomings: sortedIn,
      sources,
      frequency,
      isRegular,
    });
  }

  return results.sort((a, b) => b.totalRepaid - a.totalRepaid);
}

// ============ 大额入账监控 ============

function detectLargeInflows(transactions: Transaction[]): LargeInflow[] {
  const incomes = transactions.filter(t => 
    t.direction === '收入' || t.direction === '收'
  );

  if (incomes.length === 0) return [];

  // 计算收入的统计值
  const amounts = incomes.map(t => t.amount).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)];
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const stdDev = Math.sqrt(
    amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length
  );

  // 大额阈值：取中位数的3倍或均值+2倍标准差中的较小值，但至少5000元
  const threshold = Math.max(
    Math.min(median * 3, mean + 2 * stdDev),
    5000
  );

  const results: LargeInflow[] = [];

  for (const tx of incomes) {
    if (tx.amount >= threshold) {
      // 计算百分位
      const rank = amounts.filter(a => a <= tx.amount).length;
      const percentile = (rank / amounts.length) * 100;

      // 查找相关的支出（入账后7天内的大额支出）
      const relatedOutflows = transactions.filter(t => {
        if (t.direction !== '支出' && t.direction !== '支') return false;
        const daysDiff = differenceInDays(t.date, tx.date);
        return daysDiff >= 0 && daysDiff <= 7 && t.amount >= tx.amount * 0.3;
      });

      // 判断是否异常
      const isUnusual = tx.amount > mean + 3 * stdDev;

      results.push({
        transaction: tx,
        percentile,
        isUnusual,
        relatedOutflows,
      });
    }
  }

  return results.sort((a, b) => b.transaction.amount - a.transaction.amount);
}

// ============ 借款排查 ============

function detectLoanPatterns(transactions: Transaction[]): LoanPattern[] {
  const results: LoanPattern[] = [];
  
  // 按交易对方分组
  const byPerson: Record<string, { inflows: Transaction[]; outflows: Transaction[] }> = {};
  
  for (const tx of transactions) {
    const name = tx.counterpart?.trim();
    if (!name || name === '/' || name === '-' || name === '') continue;
    
    if (!byPerson[name]) byPerson[name] = { inflows: [], outflows: [] };
    
    if (tx.direction === '收入' || tx.direction === '收') {
      byPerson[name].inflows.push(tx);
    } else if (tx.direction === '支出' || tx.direction === '支') {
      byPerson[name].outflows.push(tx);
    }
  }

  for (const [counterpart, data] of Object.entries(byPerson)) {
    // 借款模式：从某人收到大额款项，然后定期向其支出（还款）
    // 或者：向某人支出大额款项（借出），然后定期从其收到款项（收回）
    
    // 模式1：借入 - 收到大额，然后多次小额还出
    if (data.inflows.length >= 1 && data.outflows.length >= 2) {
      const totalBorrowed = data.inflows.reduce((s, t) => s + t.amount, 0);
      const totalRepaid = data.outflows.reduce((s, t) => s + t.amount, 0);
      
      // 检查是否是借款模式：收入较少笔但金额大，支出较多笔但金额小
      const avgInflowAmount = totalBorrowed / data.inflows.length;
      const avgOutflowAmount = totalRepaid / data.outflows.length;
      
      if (avgInflowAmount > avgOutflowAmount * 1.5 && data.outflows.length >= 2) {
        // 检查还款规律性
        const sortedOutflows = [...data.outflows].sort((a, b) => a.date.getTime() - b.date.getTime());
        const intervals: number[] = [];
        for (let i = 1; i < sortedOutflows.length; i++) {
          const days = differenceInDays(sortedOutflows[i].date, sortedOutflows[i - 1].date);
          if (days > 0) intervals.push(days);
        }

        const pattern = intervals.length >= 2 ? detectPattern(intervals) : null;
        const isRegular = pattern !== null;

        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (totalBorrowed > 10000) riskLevel = 'medium';
        if (totalBorrowed > 50000 || (isRegular && totalBorrowed > 20000)) riskLevel = 'high';

        results.push({
          counterpart,
          borrowedAmount: totalBorrowed,
          repaidAmount: totalRepaid,
          remainingAmount: totalBorrowed - totalRepaid,
          borrowTransactions: data.inflows.sort((a, b) => b.date.getTime() - a.date.getTime()),
          repayTransactions: sortedOutflows.reverse(),
          repaymentSchedule: pattern ? pattern.description : '不规律',
          isRegularRepayment: isRegular,
          riskLevel,
        });
      }
    }

    // 模式2：借出 - 支出大额，然后多次小额收回
    if (data.outflows.length >= 1 && data.inflows.length >= 2) {
      const totalLent = data.outflows.reduce((s, t) => s + t.amount, 0);
      const totalRecovered = data.inflows.reduce((s, t) => s + t.amount, 0);
      
      const avgOutflowAmount = totalLent / data.outflows.length;
      const avgInflowAmount = totalRecovered / data.inflows.length;
      
      if (avgOutflowAmount > avgInflowAmount * 1.5 && data.inflows.length >= 2) {
        const sortedInflows = [...data.inflows].sort((a, b) => a.date.getTime() - b.date.getTime());
        const intervals: number[] = [];
        for (let i = 1; i < sortedInflows.length; i++) {
          const days = differenceInDays(sortedInflows[i].date, sortedInflows[i - 1].date);
          if (days > 0) intervals.push(days);
        }

        const pattern = intervals.length >= 2 ? detectPattern(intervals) : null;
        const isRegular = pattern !== null;

        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (totalLent > 10000) riskLevel = 'medium';
        if (totalLent > 50000 || (isRegular && totalLent > 20000)) riskLevel = 'high';

        // 避免重复添加
        const exists = results.some(r => r.counterpart === counterpart);
        if (!exists) {
          results.push({
            counterpart,
            borrowedAmount: totalLent,
            repaidAmount: totalRecovered,
            remainingAmount: totalLent - totalRecovered,
            borrowTransactions: data.outflows.sort((a, b) => b.date.getTime() - a.date.getTime()),
            repayTransactions: sortedInflows.reverse(),
            repaymentSchedule: pattern ? pattern.description : '不规律',
            isRegularRepayment: isRegular,
            riskLevel,
          });
        }
      }
    }
  }

  return results.sort((a, b) => {
    // 先按风险等级排序
    const riskOrder = { high: 0, medium: 1, low: 2 };
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    return b.borrowedAmount - a.borrowedAmount;
  });
}

// ============ 工具函数 ============

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date): string {
  // 直接格式化本地时间，保持与PDF原始数据一致
  return format(date, 'yyyy-MM-dd HH:mm');
}

export function formatDateShort(date: Date): string {
  return format(date, 'MM-dd');
}

// ============ 客户评分系统 ============

function calculateCustomerScore(
  transactions: Transaction[],
  overview: OverviewStats,
  regularTransfers: RegularTransferGroup[],
  repaymentTracking: RepaymentRecord[],
  loanDetection: LoanPattern[],
  monthlyBreakdown: MonthlyData[]
): CustomerScore {
  const analysis: string[] = [];

  // ---- 维度1：收入水平 (0-25分) ----
  let incomeLevel = 0;
  const monthlyIncome = overview.avgDailyIncome * 30;
  if (monthlyIncome >= 50000) {
    incomeLevel = 25;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，属于高收入群体`);
  } else if (monthlyIncome >= 20000) {
    incomeLevel = 20;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，收入水平较高`);
  } else if (monthlyIncome >= 10000) {
    incomeLevel = 15;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，收入水平中等偏上`);
  } else if (monthlyIncome >= 5000) {
    incomeLevel = 10;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，收入水平中等`);
  } else if (monthlyIncome >= 2000) {
    incomeLevel = 5;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，收入水平偏低`);
  } else {
    incomeLevel = 2;
    analysis.push(`月均收入 ${formatCurrency(monthlyIncome)}，收入水平较低`);
  }

  // ---- 维度2：资金流动性 (0-25分) ----
  let cashFlow = 0;
  const totalFlow = overview.totalIncome + overview.totalExpense;
  const monthCount = monthlyBreakdown.length || 1;
  const avgMonthlyFlow = totalFlow / monthCount;

  if (avgMonthlyFlow >= 100000) {
    cashFlow = 25;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性极强`);
  } else if (avgMonthlyFlow >= 50000) {
    cashFlow = 20;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性强`);
  } else if (avgMonthlyFlow >= 20000) {
    cashFlow = 15;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性良好`);
  } else if (avgMonthlyFlow >= 10000) {
    cashFlow = 10;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性一般`);
  } else if (avgMonthlyFlow >= 5000) {
    cashFlow = 6;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性偏低`);
  } else {
    cashFlow = 3;
    analysis.push(`月均资金流水 ${formatCurrency(avgMonthlyFlow)}，资金流动性较弱`);
  }

  // ---- 维度3：消费质量 (0-20分) ----
  let consumptionQuality = 0;
  // 分析高消费交易（单笔>1000元的支出）
  const highValueExpenses = transactions.filter(t =>
    (t.direction === '支出' || t.direction === '支') && t.amount >= 1000
  );
  const highValueRatio = overview.totalExpense > 0 
    ? highValueExpenses.reduce((s, t) => s + t.amount, 0) / overview.totalExpense 
    : 0;
  const avgExpense = overview.totalExpense / Math.max(transactions.filter(t => t.direction === '支出' || t.direction === '支').length, 1);

  if (avgExpense >= 500 || highValueRatio >= 0.4) {
    consumptionQuality = 20;
    analysis.push(`单笔消费均值 ${formatCurrency(avgExpense)}，高消费占比 ${Math.round(highValueRatio * 100)}%，消费能力强`);
  } else if (avgExpense >= 200 || highValueRatio >= 0.2) {
    consumptionQuality = 15;
    analysis.push(`单笔消费均值 ${formatCurrency(avgExpense)}，消费能力较强`);
  } else if (avgExpense >= 100) {
    consumptionQuality = 10;
    analysis.push(`单笔消费均值 ${formatCurrency(avgExpense)}，消费能力中等`);
  } else if (avgExpense >= 50) {
    consumptionQuality = 6;
    analysis.push(`单笔消费均值 ${formatCurrency(avgExpense)}，消费能力一般`);
  } else {
    consumptionQuality = 3;
    analysis.push(`单笔消费均值 ${formatCurrency(avgExpense)}，消费能力偏弱`);
  }

  // ---- 维度4：财务稳定性 (0-20分) ----
  let stability = 0;
  // 检查月度收入的稳定性（变异系数）
  const monthlyIncomes = monthlyBreakdown.map(m => m.income).filter(v => v > 0);
  let incomeCV = 1; // 变异系数（标准差/均值）
  if (monthlyIncomes.length >= 2) {
    const mean = monthlyIncomes.reduce((s, v) => s + v, 0) / monthlyIncomes.length;
    const variance = monthlyIncomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / monthlyIncomes.length;
    incomeCV = mean > 0 ? Math.sqrt(variance) / mean : 1;
  }

  // 检查是否有规律转账（稳定性指标）
  const regularCount = regularTransfers.length;
  
  if (incomeCV < 0.3 && regularCount >= 2) {
    stability = 20;
    analysis.push(`收入波动系数 ${incomeCV.toFixed(2)}，有 ${regularCount} 组规律转账，财务极稳定`);
  } else if (incomeCV < 0.5 || regularCount >= 2) {
    stability = 15;
    analysis.push(`收入较为稳定，有 ${regularCount} 组规律转账`);
  } else if (incomeCV < 0.8) {
    stability = 10;
    analysis.push(`收入波动适中，财务状况一般`);
  } else if (incomeCV < 1.2) {
    stability = 6;
    analysis.push(`收入波动较大，财务稳定性偏低`);
  } else {
    stability = 3;
    analysis.push(`收入波动很大，财务稳定性较差`);
  }

  // ---- 维度5：还款能力 (0-10分) ----
  let repaymentAbility = 5; // 默认中等
  const highRiskLoans = loanDetection.filter(l => l.riskLevel === 'high').length;
  const mediumRiskLoans = loanDetection.filter(l => l.riskLevel === 'medium').length;
  const regularRepayments = repaymentTracking.filter(r => r.isRegular).length;

  // 识别置信度100%的高风险规律转账（支出方向）
  const highConfidenceRiskTransfers = regularTransfers.filter(
    g => g.confidence >= 1.0 && (g.direction === '支出' || g.direction === '支')
  );
  const highRiskRegularCount = highConfidenceRiskTransfers.length;
  const isHighRisk = highRiskRegularCount > 0 || highRiskLoans > 0;

  if (highRiskLoans === 0 && mediumRiskLoans === 0 && regularRepayments >= 1 && highRiskRegularCount === 0) {
    repaymentAbility = 10;
    analysis.push(`无高风险借款，有 ${regularRepayments} 组规律还款，还款能力优秀`);
  } else if (highRiskLoans === 0 && mediumRiskLoans <= 1 && highRiskRegularCount === 0) {
    repaymentAbility = 8;
    analysis.push(`借款风险较低，还款能力良好`);
  } else if (highRiskLoans <= 1 && highRiskRegularCount <= 1) {
    repaymentAbility = 5;
    const parts: string[] = [];
    if (highRiskLoans > 0) parts.push(`${highRiskLoans} 笔高风险借款`);
    if (highRiskRegularCount > 0) parts.push(`${highRiskRegularCount} 组高风险规律转账`);
    analysis.push(`存在 ${parts.join('、')}，还款能力一般`);
  } else {
    repaymentAbility = 2;
    const parts: string[] = [];
    if (highRiskLoans > 0) parts.push(`${highRiskLoans} 笔高风险借款`);
    if (highRiskRegularCount > 0) parts.push(`${highRiskRegularCount} 组高风险规律转账`);
    analysis.push(`存在 ${parts.join('、')}，还款能力存疑`);
  }

  // 高风险规律转账额外扣分（每组-3分，最多扣10分）
  if (highRiskRegularCount > 0) {
    const deduction = Math.min(10, highRiskRegularCount * 3);
    analysis.push(`❗ 发现 ${highRiskRegularCount} 组置信度100%的高风险规律转账，风险评分额外扣除 ${deduction} 分`);
  }

  // ---- 汇总评分 ----
  // 高风险规律转账额外扣分（每组-3分，最多扣10分）
  const highRiskDeduction = Math.min(10, highRiskRegularCount * 3);
  const total = Math.min(100, Math.max(1, incomeLevel + cashFlow + consumptionQuality + stability + repaymentAbility - highRiskDeduction));

  let grade: CustomerScore['grade'];
  let summary: string;
  if (total >= 90) {
    grade = 'A+';
    summary = '优质客户，收入高、流水大、消费能力强，财务状况极为健康，综合资质卓越。';
  } else if (total >= 80) {
    grade = 'A';
    summary = '高质量客户，收入稳定、资金流动性好，具备较强的消费和还款能力。';
  } else if (total >= 70) {
    grade = 'B+';
    summary = '良好客户，收入水平中上，财务状况较为健康，具备一定的消费能力。';
  } else if (total >= 60) {
    grade = 'B';
    summary = '普通客户，收入和消费水平中等，财务状况基本稳定。';
  } else if (total >= 50) {
    grade = 'C+';
    summary = '一般客户，收入偏低或波动较大，财务稳定性有待提升。';
  } else if (total >= 40) {
    grade = 'C';
    summary = '资质一般，收入水平较低，资金流动性弱，需关注财务风险。';
  } else {
    grade = 'D';
    summary = '资质较差，收入低、流水少，财务状况不稳定，存在一定风险。';
  }

  return {
    total,
    grade,
    dimensions: {
      incomeLevel,
      cashFlow,
      consumptionQuality,
      stability,
      repaymentAbility,
    },
    analysis,
    summary,
    highRiskRegularCount,
    isHighRisk,
  };
}

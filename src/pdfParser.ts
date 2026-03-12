/**
 * PDF解析引擎 - 微信账单PDF解析
 * 
 * 设计哲学：极简数据叙事 - 精准提取，高效解析
 * 
 * 微信账单PDF表格字段：
 * 交易订单号 | 交易时间 | 交易类型 | 收/支/其他 | 交易方式 | 金额(元) | 交易对方 | 商家单号
 */

import * as pdfjsLib from 'pdfjs-dist';

// 初始化 PDF.js worker
// 使用 Blob Worker 方案解决 iOS Safari 跨域限制
let workerInitialized = false;
let workerBlobUrl: string | null = null;

// Worker CDN URL——cdnjs.cloudflare.com 支持 CORS，可用于 Blob Worker 方案
const WORKER_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function initPDFWorkerAsync(): Promise<void> {
  if (workerInitialized) return;
  workerInitialized = true;

  try {
    // 方案 1：尝试通过 fetch 获取 worker 内容，创建 Blob URL（同源）
    // 这是解决 iOS Safari "Setting up fake worker failed" 的最可靠方案
    const response = await fetch(WORKER_CDN_URL, { mode: 'cors' });
    if (!response.ok) throw new Error(`Worker fetch failed: ${response.status}`);
    const blob = await response.blob();
    const jsBlob = new Blob([blob], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(jsBlob);
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerBlobUrl;
    console.log('[PDF.js] Worker initialized via Blob URL (iOS Safari compatible)');
  } catch (e) {
    console.warn('[PDF.js] Blob worker failed, falling back to CDN URL:', e);
    // 方案 2：直接使用 CDN URL（如果 fetch 失败）
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = WORKER_CDN_URL;
    console.log('[PDF.js] Worker initialized with CDN URL:', WORKER_CDN_URL);
  }
}

// 同步包装（向后兼容）
function initPDFWorker() {
  // no-op: use initPDFWorkerAsync instead
}

export interface Transaction {
  orderId: string;       // 交易订单号
  date: Date;            // 交易时间
  dateStr: string;       // 原始日期字符串
  type: string;          // 交易类型 (转账/红包/商户消费等)
  direction: string;     // 收/支/其他
  method: string;        // 交易方式 (零钱/银行卡等)
  amount: number;        // 金额
  counterpart: string;   // 交易对方
  merchantId: string;    // 商家单号
}

export interface AccountInfo {
  name: string;
  idNumber: string;
  account: string;
  startDate: string;
  endDate: string;
}

export interface ParseResult {
  accountInfo: AccountInfo;
  transactions: Transaction[];
  totalPages: number;
  parseErrors: string[];
}

// 解析进度回调
type ProgressCallback = (progress: number, message: string) => void;

/**
 * 从PDF文本内容中提取账户信息
 */
function extractAccountInfo(textContent: string): AccountInfo {
  const info: AccountInfo = {
    name: '',
    idNumber: '',
    account: '',
    startDate: '',
    endDate: '',
  };

  // 尝试匹配姓名
  // 方式1：微信账单格式 "兹证明：姓名（" 或 "兹证明 姓名（"
  const zizhenming = textContent.match(/兹证明[：:]?\s*([\u4e00-\u9fa5a-zA-Z]{2,10})\s*[（(]/);
  if (zizhenming) {
    info.name = zizhenming[1].trim();
  } else {
    // 方式2："兹证明 XXX 名下/的/持有/账户"
    const zizhenming2 = textContent.match(/兹证明\s+([\u4e00-\u9fa5a-zA-Z]{2,10})\s+(?:名下|的|持有|账户)/);
    if (zizhenming2) {
      info.name = zizhenming2[1].trim();
    } else {
      // 方式3：传统格式 "姓名：XXX"
      const nameMatch = textContent.match(/姓\s*名[：:]\s*(.+?)(?:\s|$)/);
      if (nameMatch) info.name = nameMatch[1].trim();
    }
  }

  // 尝试匹配证件号
  const idMatch = textContent.match(/证件号[码]?[：:]\s*(.+?)(?:\s|$)/);
  if (idMatch) info.idNumber = idMatch[1].trim();

  // 尝试匹配微信号
  const accountMatch = textContent.match(/(?:微信号|账[户号])[：:]\s*(.+?)(?:\s|$)/);
  if (accountMatch) info.account = accountMatch[1].trim();

  // 尝试匹配日期范围
  const dateRangeMatch = textContent.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*(?:[-~至到])\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
  if (dateRangeMatch) {
    info.startDate = dateRangeMatch[1];
    info.endDate = dateRangeMatch[2];
  }

  return info;
}

/**
 * 判断是否为表头行
 */
function isHeaderRow(text: string): boolean {
  const headerKeywords = ['交易订单号', '交易时间', '交易类型', '收/支', '金额', '交易对方', '商家单号'];
  let matchCount = 0;
  for (const keyword of headerKeywords) {
    if (text.includes(keyword)) matchCount++;
  }
  return matchCount >= 3;
}

/**
 * 解析日期字符串 - 支持完整的时分秒信息
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // 清理空格和特殊字符
  const cleaned = dateStr.replace(/\s+/g, ' ').trim();
  
  // 调试：记录输入的日期字符串
  if (cleaned && cleaned.includes(':')) {
    console.debug('[PDF Parser] 解析日期时间:', cleaned);
  }
  
  // 尝试多种日期格式（优先级从高到低）
  const patterns = [
    // 格式1: YYYY-MM-DD HH:MM:SS (最完整)
    { regex: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/, groups: { year: 1, month: 2, day: 3, hour: 4, minute: 5, second: 6 } },
    // 格式2: YYYY-MM-DD HH:MM
    { regex: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/, groups: { year: 1, month: 2, day: 3, hour: 4, minute: 5, second: null } },
    // 格式3: YYYY-MM-DD
    { regex: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, groups: { year: 1, month: 2, day: 3, hour: null, minute: null, second: null } },
  ];

  for (const { regex, groups } of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      const year = parseInt(match[groups.year]);
      const month = parseInt(match[groups.month]) - 1; // JavaScript月份从0开始
      const day = parseInt(match[groups.day]);
      const hour = groups.hour ? parseInt(match[groups.hour]) : 0;
      const minute = groups.minute ? parseInt(match[groups.minute]) : 0;
      const second = groups.second ? parseInt(match[groups.second]) : 0;
      
      // 使用本地时间创建日期对象，保持与PDF原始数据一致
      return new Date(year, month, day, hour, minute, second);
    }
  }
  return null;
}

/**
 * 解析金额字符串
 */
function parseAmount(amountStr: string): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.replace(/[¥￥,，\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * 从文本行中提取交易记录
 * 微信账单的每行数据格式较为固定
 */
function parseTransactionFromText(line: string): Transaction | null {
  // 清理多余空格
  const cleaned = line.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // 跳过表头和空行
  if (!cleaned || isHeaderRow(cleaned) || cleaned.length < 20) return null;
  
  // 尝试匹配交易记录模式
  // 格式: 订单号 日期时间 交易类型 收/支 交易方式 金额 交易对方 商家单号
  
  // 模式1: 完整格式，以长数字订单号开头
  // 改进：使用更宽松的字符集，使用 .+? 匹配仪一些非数字字符以外的任何字符
  const fullPattern = /^(\d{15,32})\s+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s+(收入|支出|其他|收|支|不计收支)\s+(.+?)\s+([\d¥￥,.]+)\s+(.+?)(?:\s+(.*))?$/
  
  let match = cleaned.match(fullPattern);
  if (match) {
    const date = parseDate(match[2]);
    if (!date) return null;
    
    return {
      orderId: match[1].trim(),
      date,
      dateStr: match[2].trim(),
      type: match[3].trim(),
      direction: match[4].trim(),
      method: match[5].trim(),
      amount: parseAmount(match[6]),
      counterpart: match[7].trim(),
      merchantId: (match[8] || '').trim(),
    };
  }

  // 模式2: 没有订单号开头，但有日期
  // 改进：使用更宽松的字符集
  const dateFirstPattern = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s+(收入|支出|其他|收|支|不计收支)\s+(.+?)\s+([\d¥￥,.]+)\s+(.+?)(?:\s+(.*))?$/
  
  match = cleaned.match(dateFirstPattern);
  if (match) {
    const date = parseDate(match[1]);
    if (!date) return null;
    
    return {
      orderId: '',
      date,
      dateStr: match[1].trim(),
      type: match[2].trim(),
      direction: match[3].trim(),
      method: match[4].trim(),
      amount: parseAmount(match[5]),
      counterpart: match[6].trim(),
      merchantId: (match[7] || '').trim(),
    };
  }

  return null;
}

/**
 * 从PDF表格数据中提取交易记录
 */
function parseTransactionFromRow(row: string[]): Transaction | null {
  if (!row || row.length < 6) return null;
  
  // 清理每个单元格
  const cells = row.map(cell => (cell || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
  
  // 检查是否为表头
  if (cells.some(c => isHeaderRow(c))) return null;
  
  // 尝试根据列数确定格式
  // 8列格式: 订单号 | 日期 | 类型 | 收支 | 方式 | 金额 | 对方 | 商家单号
  if (cells.length >= 8) {
    const date = parseDate(cells[1]);
    if (date) {
      return {
        orderId: cells[0],
        date,
        dateStr: cells[1],
        type: cells[2],
        direction: cells[3],
        method: cells[4],
        amount: parseAmount(cells[5]),
        counterpart: cells[6],
        merchantId: cells[7] || '',
      };
    }
  }
  
  // 7列格式: 日期 | 类型 | 收支 | 方式 | 金额 | 对方 | 商家单号
  if (cells.length >= 7) {
    const date = parseDate(cells[0]);
    if (date) {
      return {
        orderId: '',
        date,
        dateStr: cells[0],
        type: cells[1],
        direction: cells[2],
        method: cells[3],
        amount: parseAmount(cells[4]),
        counterpart: cells[5],
        merchantId: cells[6] || '',
      };
    }
  }
  
  // 6列格式
  if (cells.length >= 6) {
    // 尝试第一列是日期
    let date = parseDate(cells[0]);
    if (date) {
      return {
        orderId: '',
        date,
        dateStr: cells[0],
        type: cells[1],
        direction: cells[2],
        method: cells[3],
        amount: parseAmount(cells[4]),
        counterpart: cells[5],
        merchantId: '',
      };
    }
    // 尝试第二列是日期
    date = parseDate(cells[1]);
    if (date) {
      return {
        orderId: cells[0],
        date,
        dateStr: cells[1],
        type: cells[2],
        direction: cells[3],
        method: cells[4],
        amount: parseAmount(cells[5]),
        counterpart: '',
        merchantId: '',
      };
    }
  }

  return null;
}

/**
 * 主解析函数 - 解析微信账单PDF
 */
export async function parsePDF(
  file: File,
  onProgress?: ProgressCallback
): Promise<ParseResult> {
  await initPDFWorkerAsync();
  const errors: string[] = [];
  const transactions: Transaction[] = [];
  let accountInfo: AccountInfo = {
    name: '',
    idNumber: '',
    account: '',
    startDate: '',
    endDate: '',
  };

  try {
    onProgress?.(5, '正在读取PDF文件...');
    
    let arrayBuffer: ArrayBuffer;
    
    // iOS 兼容性修复：尝试多种方式读取文件
    try {
      // 添加超时保护
      const arrayBufferPromise = file.arrayBuffer();
      const timeoutPromise = new Promise<ArrayBuffer>((_, reject) => 
        setTimeout(() => reject(new Error('文件读取超时')), 15000)
      );
      arrayBuffer = await Promise.race([arrayBufferPromise, timeoutPromise]);
    } catch (e: any) {
      console.warn('arrayBuffer() 失败，尝试 FileReader:', e.message);
      // 备选方案 1: 使用 FileReader
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        const timeout = setTimeout(() => {
          reader.abort();
          reject(new Error('FileReader 读取超时'));
        }, 15000);
        
        reader.onload = () => {
          clearTimeout(timeout);
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader 返回非 ArrayBuffer'));
          }
        };
        reader.onerror = () => {
          clearTimeout(timeout);
          reject(reader.error);
        };
        reader.onabort = () => {
          clearTimeout(timeout);
          reject(new Error('FileReader 被中止'));
        };
        reader.readAsArrayBuffer(file);
      });
    }
    
    onProgress?.(8, '正在初始化PDF解析器...');
    
    // iOS 兼容性修复：禁用某些可能导致卡住的选项
    const pdfOptions = {
      data: arrayBuffer,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
      rangeChunkSize: 65536,
      useWorkerFetch: true,
      useSystemFonts: false,
    };
    
    const pdfPromise = pdfjsLib.getDocument(pdfOptions).promise;
    const pdfTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('PDF加载超时')), 20000)
    );
    
    const pdf = await Promise.race([pdfPromise, pdfTimeoutPromise]) as any;
    const totalPages = pdf.numPages;
    
    onProgress?.(10, `PDF加载完成，共 ${totalPages} 页`);

    // 第一遍：提取所有文本内容
    let allText = '';
    const pageTexts: string[] = [];
    
    for (let i = 1; i <= totalPages; i++) {
      try {
        // 添加超时保护（iOS 上可能卡住）
        const pagePromise = pdf.getPage(i);
        const pageTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`第 ${i} 页加载超时`)), 15000)
        );
        
        let page;
        try {
          page = await Promise.race([pagePromise, pageTimeoutPromise]) as any;
        } catch (pageLoadError: any) {
          console.error(`第 ${i} 页加载失败: ${pageLoadError.message}`);
          errors.push(`第 ${i} 页加载失败: ${pageLoadError.message}`);
          pageTexts.push('');
          allText += '\n';
          const progress = 10 + (i / totalPages) * 30;
          onProgress?.(progress, `第 ${i} 页加载失败，继续处理...`);
          continue;
        }
        
        // 获取文本内容，添加错误处理
        let textContent;
        try {
          const textPromise = page.getTextContent({ normalizeSpaces: true });
          const textTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`第 ${i} 页文本提取超时`)), 10000)
          );
          textContent = await Promise.race([textPromise, textTimeoutPromise]);
        } catch (textError: any) {
          console.warn(`第 ${i} 页文本提取失败: ${textError.message}`);
          errors.push(`第 ${i} 页文本提取失败: ${textError.message}`);
          pageTexts.push('');
          allText += '\n';
          const progress = 10 + (i / totalPages) * 30;
          onProgress?.(progress, `第 ${i} 页文本提取失败，继续处理...`);
          continue;
        }
        
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .filter((str: string) => str.length > 0)
          .join(' ');
        pageTexts.push(pageText);
        allText += pageText + '\n';
        
        const progress = 10 + (i / totalPages) * 30;
        onProgress?.(progress, `正在提取第 ${i}/${totalPages} 页文本...`);
      } catch (pageError: any) {
        console.error(`第 ${i} 页处理失败: ${pageError.message}`);
        errors.push(`第 ${i} 页处理失败: ${pageError.message}`);
        pageTexts.push('');
        allText += '\n';
        const progress = 10 + (i / totalPages) * 30;
        onProgress?.(progress, `第 ${i} 页处理失败，继续处理...`);
      }
    }

    // 提取账户信息（通常在第一页）
    accountInfo = extractAccountInfo(allText);
    onProgress?.(45, '正在解析交易记录...');

    // 第二遍：逐页提取交易数据
    for (let i = 1; i <= totalPages; i++) {
      try {
        // 添加超时保护
        const pagePromise = pdf.getPage(i);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('页面加载超时')), 30000)
        );
        
        const page = await Promise.race([pagePromise, timeoutPromise]) as any;
        
        // 获取文本内容
        let textContent;
        try {
          const textPromise = page.getTextContent();
          const textTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('文本提取超时')), 30000)
          );
          textContent = await Promise.race([textPromise, textTimeoutPromise]);
        } catch (textError: any) {
          console.warn(`第 ${i} 页文本提取失败: ${textError.message}`);
          errors.push(`第 ${i} 页文本提取失败: ${textError.message}`);
          const progress = Math.min(45 + (i / totalPages) * 45, 99);
          onProgress?.(progress, `第 ${i} 页文本提取失败，继续处理...`);
          continue;
        }
        
        // 按Y坐标分组文本项（同一行的文本）
        const items = textContent.items as any[];
        const rows: Map<number, { x: number; str: string }[]> = new Map();
        
        for (const item of items) {
          if (!item.str || item.str.trim() === '') continue;
          // 将Y坐标四舍五入到最近的整数来分组
          const y = Math.round(item.transform[5]);
          if (!rows.has(y)) rows.set(y, []);
          rows.get(y)!.push({ x: item.transform[4], str: item.str });
        }

        // 按Y坐标排序（从上到下，Y值从大到小）
        const sortedRows = Array.from(rows.entries())
          .sort((a, b) => b[0] - a[0]);

        // 修复：合并分离的日期和时间
        // 微信账单 PDF 结构：
        //   行1: 订单号前缀 + 日期 + 交易类型 + 收/支 + 支付方式 + 金额 + 交易对方
        //   行2: 订单号后缀 + 时间(HH:MM:SS)（时间可能与数字相连，如 37508918:40:22）
        const mergedRows: Array<{ y: number; cells: { x: number; str: string }[] }> = [];
        let rowIdx = 0;
        while (rowIdx < sortedRows.length) {
          const [y, cells] = sortedRows[rowIdx];
          const lineText = cells.map(c => c.str).join(' ');
          
          // 检查当前行是否有日期
          const hasDate = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(lineText);
          
          // 检查当前行是否已经包含时间
          const alreadyHasTime = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}/.test(lineText);
          
          // 检查上一行是否有日期但没有时间
          const prevLineHasDateNoTime = mergedRows.length > 0 && (() => {
            const prevText = mergedRows[mergedRows.length - 1].cells.map(c => c.str).join(' ');
            return /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(prevText) && 
                   !/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}/.test(prevText);
          })();
          
          if (hasDate && !alreadyHasTime) {
            // 当前行有日期但无时间，在后续 2 行内查找时间
            // 时间格式：HH:MM:SS（可能与其他数字相连，如 37508918:40:22）
            let timeStr = '';
            
            for (let offset = 1; offset <= 2; offset++) {
              if (rowIdx + offset < sortedRows.length) {
                const candidateText = sortedRows[rowIdx + offset][1].map((c: {x: number; str: string}) => c.str).join(' ');
                // 从候选行中提取时间（允许时间前后有数字）
                const timeMatch = candidateText.match(/(\d{1,2}:\d{2}:\d{2})/);
                if (timeMatch) {
                  timeStr = timeMatch[1];
                  break;
                }
              }
            }
            
            if (timeStr) {
              // 将时间插入到日期后面
              const mergedText = lineText.replace(
                /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
                `$1 ${timeStr}`
              );
              
              const mergedCells = cells.map((c: {x: number; str: string}, idx: number) => {
                if (idx === 0) {
                  return { ...c, str: mergedText };
                }
                return { ...c };
              });
              
              mergedRows.push({ y, cells: mergedCells });
            } else {
              mergedRows.push({ y, cells });
            }
            rowIdx += 1;
          } else if (!hasDate && prevLineHasDateNoTime) {
            // 当前行没有日期，但上一行有日期无时间
            // 尝试从当前行提取时间并合并到上一行
            const timeMatch = lineText.match(/(\d{1,2}:\d{2}:\d{2})/);
            if (timeMatch) {
              const prevRow = mergedRows[mergedRows.length - 1];
              const prevLineText = prevRow.cells.map((c: {x: number; str: string}) => c.str).join(' ');
              const mergedText = prevLineText.replace(
                /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
                `$1 ${timeMatch[1]}`
              );
              prevRow.cells[0] = { ...prevRow.cells[0], str: mergedText };
            }
            mergedRows.push({ y, cells });
            rowIdx += 1;
          } else {
            mergedRows.push({ y, cells });
            rowIdx += 1;
          }
        }

        for (const { cells } of mergedRows) {
          // 按X坐标排序
          cells.sort((a, b) => a.x - b.x);
          
          // 方法1：将整行作为文本解析
          const lineText = cells.map(c => c.str).join(' ');
          let tx = parseTransactionFromText(lineText);
          
          if (tx) {
            transactions.push(tx);
            continue;
          }

          // 方法2：作为表格行解析
          const cellTexts = cells.map(c => c.str.trim()).filter(s => s.length > 0);
          tx = parseTransactionFromRow(cellTexts);
          if (tx) {
            transactions.push(tx);
          }
        }

        const pageProgress = Math.min(45 + (i / totalPages) * 45, 99);
        onProgress?.(pageProgress, `正在分析第 ${i}/${totalPages} 页交易...`);
      } catch (pageError: any) {
        console.error(`第 ${i} 页处理失败: ${pageError.message}`);
        errors.push(`第 ${i} 页处理失败: ${pageError.message}`);
        const progress = Math.min(45 + (i / totalPages) * 45, 99);
        onProgress?.(progress, `第 ${i} 页处理失败，继续处理下一页...`);
      }
    }

    // 去重（根据订单号和日期）
    const seen = new Set<string>();
    const uniqueTransactions = transactions.filter(tx => {
      const key = tx.orderId 
        ? tx.orderId 
        : `${tx.dateStr}-${tx.amount}-${tx.counterpart}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 按日期排序（由近到远）
    uniqueTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());

    onProgress?.(95, '解析完成，正在整理数据...');

    // 如果没有从文本中获取到日期范围，从交易记录推断
    if (!accountInfo.startDate && uniqueTransactions.length > 0) {
      const dates = uniqueTransactions.map(t => t.date).sort((a, b) => a.getTime() - b.getTime());
      accountInfo.startDate = formatDateSimple(dates[0]);
      accountInfo.endDate = formatDateSimple(dates[dates.length - 1]);
    }

    onProgress?.(100, `解析完成，共提取 ${uniqueTransactions.length} 条交易记录`);

    return {
      accountInfo,
      transactions: uniqueTransactions,
      totalPages,
      parseErrors: errors,
    };
  } catch (error: any) {
    errors.push(`PDF解析失败: ${error.message}`);
    onProgress?.(100, `解析出错: ${error.message}`);
    return {
      accountInfo,
      transactions,
      totalPages: 0,
      parseErrors: errors,
    };
  }
}

function formatDateSimple(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

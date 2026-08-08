/**
 * SCADA Web Serial API 串口扫码支持
 * 
 * 为桌面浏览器（Chrome/Edge 89+）提供串口扫码枪接入能力。
 * 通过 Web Serial API 直接读取串口数据，无需 Agent 或 Bridge。
 * 
 * 浏览器兼容性：
 * - ✅ Chrome 89+
 * - ✅ Edge 89+
 * - ✅ Opera 75+
 * - ❌ Firefox（未支持）
 * - ❌ Safari（未支持）
 * 
 * 使用场景：
 * 1. 桌面 PC 连接 USB 串口扫码枪
 * 2. 工业平板 Chrome 浏览器 + RS232 扫码枪
 * 3. 开发调试（模拟 Agent 扫码环境）
 * 
 * 事件流：
 * 串口扫码枪 → USB/RS232 → Web Serial API → serialScanner → 
 * window.scadaEventBus → useWorkflowRuntime → Workflow Engine
 */

export interface SerialScannerConfig {
  /** 波特率，常见：9600, 19200, 38400, 115200 */
  baudRate?: number
  /** 数据位，通常 8 */
  dataBits?: 7 | 8
  /** 停止位，通常 1 */
  stopBits?: 1 | 2
  /** 校验位，通常 none */
  parity?: 'none' | 'even' | 'odd'
  /** 结束符，默认 \r\n（回车换行），扫码枪通常发送此符号表示扫码结束 */
  delimiter?: string
  /** 扫码类型标识（用于 event_type），默认 'barcode' */
  scanType?: 'barcode' | 'qrcode' | 'nfc'
  /** 最小有效扫码长度，过滤噪音数据 */
  minLength?: number
}

const DEFAULT_CONFIG: Required<SerialScannerConfig> = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  delimiter: '\r\n',
  scanType: 'barcode',
  minLength: 3,
}

export class SerialScanner {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private buffer = ''
  private config: Required<SerialScannerConfig>
  private onScan: (data: string, scanType: string) => void
  private running = false

  constructor(config: SerialScannerConfig, onScan: (data: string, scanType: string) => void) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onScan = onScan
  }

  /**
   * 检测浏览器是否支持 Web Serial API
   */
  static isSupported(): boolean {
    return 'serial' in navigator
  }

  /**
   * 请求用户选择串口设备并连接
   * 用户操作触发，浏览器会弹出设备选择器
   */
  async connect(): Promise<void> {
    if (!SerialScanner.isSupported()) {
      throw new Error('Web Serial API 不支持，请使用 Chrome 89+ 或 Edge 89+')
    }

    try {
      // 请求用户选择串口设备
      this.port = await navigator.serial.requestPort()

      // 打开串口
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
      })

      // 开始读取数据
      this.startReading()
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        throw new Error('未选择串口设备')
      }
      throw error
    }
  }

  /**
   * 断开串口连接
   */
  async disconnect(): Promise<void> {
    this.running = false

    if (this.reader) {
      try {
        await this.reader.cancel()
      } catch (e) {
        console.warn('SerialScanner: reader.cancel() failed', e)
      }
      this.reader = null
    }

    if (this.port) {
      try {
        await this.port.close()
      } catch (e) {
        console.warn('SerialScanner: port.close() failed', e)
      }
      this.port = null
    }

    this.buffer = ''
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.port !== null && this.running
  }

  /**
   * 开始读取串口数据流
   */
  private async startReading(): Promise<void> {
    if (!this.port?.readable) return

    this.running = true
    this.reader = this.port.readable.getReader()
    const decoder = new TextDecoder()

    try {
      while (this.running) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (!value) continue

        // 解码字节流为字符串
        const text = decoder.decode(value, { stream: true })
        this.buffer += text

        // 检查是否包含结束符
        let delimiterIndex = this.buffer.indexOf(this.config.delimiter)
        while (delimiterIndex !== -1) {
          const data = this.buffer.substring(0, delimiterIndex).trim()
          this.buffer = this.buffer.substring(delimiterIndex + this.config.delimiter.length)

          // 过滤无效数据
          if (data.length >= this.config.minLength) {
            this.onScan(data, this.config.scanType)
          }

          delimiterIndex = this.buffer.indexOf(this.config.delimiter)
        }

        // 防止缓冲区溢出（超过 1KB 清空）
        if (this.buffer.length > 1024) {
          console.warn('SerialScanner: buffer overflow, clearing')
          this.buffer = ''
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'NetworkError') {
        console.error('SerialScanner: read error', error)
      }
    } finally {
      this.reader.releaseLock()
      this.reader = null
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<SerialScannerConfig> {
    return { ...this.config }
  }

  /**
   * 更新配置（需要重新连接才能生效）
   */
  updateConfig(config: Partial<SerialScannerConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// 全局单例，供 SCADA 页面使用
let globalScanner: SerialScanner | null = null

/**
 * 获取全局串口扫描器实例
 */
export function getGlobalScanner(): SerialScanner | null {
  return globalScanner
}

/**
 * 初始化全局串口扫描器
 * 需要在用户交互（如点击按钮）中调用，因为 requestPort 需要用户手势
 */
export async function initGlobalScanner(
  config?: SerialScannerConfig,
  onScan?: (data: string, scanType: string) => void
): Promise<SerialScanner> {
  // 如果已存在，先断开
  if (globalScanner) {
    await globalScanner.disconnect()
  }

  // 创建新实例
  const scanner = new SerialScanner(config || {}, (data, scanType) => {
    // 默认注入到事件总线
    if (typeof window !== 'undefined' && (window as any).scadaEventBus) {
      ;(window as any).scadaEventBus.emit('agent_scan', {
        value: data,
        event_type: scanType,
        device_id: 'web-serial', // 浏览器串口标识
      })
    }

    // 如果有自定义回调，也调用
    onScan?.(data, scanType)
  })

  await scanner.connect()
  globalScanner = scanner

  return scanner
}

/**
 * 断开全局串口扫描器
 */
export async function disconnectGlobalScanner(): Promise<void> {
  if (globalScanner) {
    await globalScanner.disconnect()
    globalScanner = null
  }
}

/**
 * 检查浏览器是否支持 Web Serial API
 */
export function isSerialSupported(): boolean {
  return SerialScanner.isSupported()
}

/**
 * 获取串口连接状态
 */
export function isSerialConnected(): boolean {
  return globalScanner?.isConnected() || false
}

/**
 * 便捷方法：一键连接串口扫码枪（使用默认配置）
 * 必须在用户交互中调用
 */
export async function connectSerialScanner(): Promise<void> {
  if (!isSerialSupported()) {
    throw new Error('当前浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+')
  }

  if (isSerialConnected()) {
    throw new Error('串口扫码枪已连接')
  }

  await initGlobalScanner()
}

// 类型声明（TypeScript）
declare global {
  interface Navigator {
    serial: Serial
  }

  interface Serial extends EventTarget {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[]
  }

  interface SerialPortFilter {
    usbVendorId?: number
    usbProductId?: number
  }

  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    getInfo(): SerialPortInfo
  }

  interface SerialOptions {
    baudRate: number
    dataBits?: 7 | 8
    stopBits?: 1 | 2
    parity?: 'none' | 'even' | 'odd'
    bufferSize?: number
    flowControl?: 'none' | 'hardware'
  }

  interface SerialPortInfo {
    usbVendorId?: number
    usbProductId?: number
  }
}

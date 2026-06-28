/**
 * STOMP 客户端封装
 * 基于 SockJS 和 STOMP.js 实现 WebSocket 实时通信
 */

import { Client, Frame, IMessage, StompConfig } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export interface StompSubscription {
  id: string;
  destination: string;
  callback: (message: any) => void;
  unsubscribe: () => void;
}

export interface StompClientOptions {
  url: string;
  debug?: boolean;
  reconnectDelay?: number;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

export class StompClient {
  private client: Client | null = null;
  private subscriptions: Map<string, StompSubscription> = new Map();
  private options: StompClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private isManualDisconnect = false;

  constructor(options: StompClientOptions) {
    this.options = {
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: false,
      ...options,
    };
  }

  /**
   * 连接到 STOMP 服务器
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isManualDisconnect = false;

      // 创建 STOMP 客户端配置
      const stompConfig: StompConfig = {
        // 使用 SockJS 作为 WebSocket 传输层
        webSocketFactory: () => new SockJS(this.options.url) as any,

        // 心跳配置
        heartbeatIncoming: this.options.heartbeatIncoming,
        heartbeatOutgoing: this.options.heartbeatOutgoing,

        // 重连配置
        reconnectDelay: this.options.reconnectDelay,

        // 调试日志
        debug: this.options.debug ? (msg: string) => console.log('[STOMP]', msg) : undefined,

        // 连接成功回调
        onConnect: (frame: Frame) => {
          this.reconnectAttempts = 0;
          console.log('[STOMP] Connected');
          this.options.onConnect?.();
          resolve();
        },

        // 断开连接回调
        onDisconnect: (frame: Frame) => {
          console.log('[STOMP] Disconnected');
          this.options.onDisconnect?.();
        },

        // 连接错误回调
        onStompError: (frame: Frame) => {
          console.error('[STOMP] Error:', frame.headers['message'], frame.body);
          this.options.onError?.(new Error(frame.headers['message'] || 'STOMP error'));
          reject(new Error(frame.headers['message'] || 'STOMP error'));
        },

        // WebSocket 错误回调
        onWebSocketError: (event: any) => {
          console.error('[STOMP] WebSocket error:', event);
          this.options.onError?.(event);
          reject(event);
        },
      };

      // 创建客户端
      this.client = new Client(stompConfig);

      // 激活连接
      this.client.activate();
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualDisconnect = true;

    if (this.client) {
      // 取消所有订阅
      this.subscriptions.forEach((sub) => sub.unsubscribe());
      this.subscriptions.clear();

      // 断开连接
      this.client.deactivate();
      this.client = null;
    }
  }

  /**
   * 订阅主题
   */
  subscribe(destination: string, callback: (message: any) => void): StompSubscription {
    if (!this.client || !this.client.connected) {
      throw new Error('STOMP client is not connected');
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stompSubscription = this.client.subscribe(destination, (message: IMessage) => {
      try {
        const data = JSON.parse(message.body);
        callback(data);
      } catch (error) {
        console.error('[STOMP] Failed to parse message:', error);
        callback(message.body);
      }
    });

    const subscription: StompSubscription = {
      id: subscriptionId,
      destination,
      callback,
      unsubscribe: () => {
        stompSubscription.unsubscribe();
        this.subscriptions.delete(subscriptionId);
      },
    };

    this.subscriptions.set(subscriptionId, subscription);

    return subscription;
  }

  /**
   * 发送消息
   */
  send(destination: string, body: any, headers: Record<string, string> = {}): void {
    if (!this.client || !this.client.connected) {
      throw new Error('STOMP client is not connected');
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    this.client.publish({
      destination,
      body: bodyStr,
      headers,
    });
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }

  /**
   * 获取活动订阅数量
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * 获取所有订阅
   */
  getSubscriptions(): StompSubscription[] {
    return Array.from(this.subscriptions.values());
  }
}

// 全局单例实例
let globalStompClient: StompClient | null = null;

/**
 * 获取全局 STOMP 客户端实例
 */
export function getStompClient(options?: StompClientOptions): StompClient {
  if (!globalStompClient && options) {
    globalStompClient = new StompClient(options);
  }

  if (!globalStompClient) {
    throw new Error('STOMP client not initialized. Call getStompClient with options first.');
  }

  return globalStompClient;
}

/**
 * 重置全局 STOMP 客户端
 */
export function resetStompClient(): void {
  if (globalStompClient) {
    globalStompClient.disconnect();
    globalStompClient = null;
  }
}

/**
 * STOMP React Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { StompClient, StompSubscription, getStompClient } from './StompClient';

/**
 * STOMP 连接状态
 */
export type StompConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * 使用 STOMP 连接
 */
export function useStompConnection(url: string, options?: {
  autoConnect?: boolean;
  reconnectDelay?: number;
  debug?: boolean;
}) {
  const [status, setStatus] = useState<StompConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const clientRef = useRef<StompClient | null>(null);

  const connect = useCallback(async () => {
    if (clientRef.current?.isConnected()) {
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const client = getStompClient({
        url,
        reconnectDelay: options?.reconnectDelay || 5000,
        debug: options?.debug || false,
        onConnect: () => setStatus('connected'),
        onDisconnect: () => setStatus('disconnected'),
        onError: (err) => {
          setStatus('error');
          setError(err);
        },
      });

      clientRef.current = client;
      await client.connect();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err : new Error('Connection failed'));
    }
  }, [url, options?.reconnectDelay, options?.debug]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    if (options?.autoConnect !== false) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, options?.autoConnect]);

  return {
    status,
    error,
    isConnected: status === 'connected',
    connect,
    disconnect,
    client: clientRef.current,
  };
}

/**
 * 订阅 STOMP 主题
 */
export function useStompSubscription<T = any>(
  destination: string | null,
  callback: (message: T) => void,
  dependencies: any[] = []
) {
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const subscriptionRef = useRef<StompSubscription | null>(null);

  useEffect(() => {
    if (!destination) {
      return;
    }

    const client = getStompClient();
    if (!client.isConnected()) {
      console.warn('[STOMP] Cannot subscribe: client not connected');
      return;
    }

    try {
      const subscription = client.subscribe(destination, (message: T) => {
        setLastMessage(message);
        setMessageCount((prev) => prev + 1);
        callback(message);
      });

      subscriptionRef.current = subscription;

      return () => {
        subscription.unsubscribe();
        subscriptionRef.current = null;
      };
    } catch (error) {
      console.error('[STOMP] Subscription error:', error);
    }
  }, [destination, ...dependencies]);

  return {
    lastMessage,
    messageCount,
    subscription: subscriptionRef.current,
  };
}

/**
 * 发送 STOMP 消息
 */
export function useStompSend() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(async (destination: string, body: any, headers?: Record<string, string>) => {
    setSending(true);
    setError(null);

    try {
      const client = getStompClient();
      if (!client.isConnected()) {
        throw new Error('STOMP client is not connected');
      }

      client.send(destination, body, headers);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Send failed');
      setError(error);
      throw error;
    } finally {
      setSending(false);
    }
  }, []);

  return { send, sending, error };
}

/**
 * 订阅多个主题
 */
export function useStompSubscriptions<T = any>(
  destinations: string[],
  callback: (destination: string, message: T) => void
) {
  const [messages, setMessages] = useState<Record<string, T>>({});
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const subscriptionsRef = useRef<StompSubscription[]>([]);

  useEffect(() => {
    const client = getStompClient();
    if (!client.isConnected()) {
      console.warn('[STOMP] Cannot subscribe: client not connected');
      return;
    }

    try {
      const subscriptions = destinations.map((destination) =>
        client.subscribe(destination, (message: T) => {
          setMessages((prev) => ({ ...prev, [destination]: message }));
          setMessageCounts((prev) => ({
            ...prev,
            [destination]: (prev[destination] || 0) + 1,
          }));
          callback(destination, message);
        })
      );

      subscriptionsRef.current = subscriptions;

      return () => {
        subscriptions.forEach((sub) => sub.unsubscribe());
        subscriptionsRef.current = [];
      };
    } catch (error) {
      console.error('[STOMP] Subscriptions error:', error);
    }
  }, [destinations.join(',')]);

  return {
    messages,
    messageCounts,
    subscriptions: subscriptionsRef.current,
  };
}

/**
 * 使用 STOMP 通知
 */
export function useStompNotifications(destination: string, options?: {
  maxNotifications?: number;
  autoRemove?: boolean;
  autoRemoveDelay?: number;
}) {
  const [notifications, setNotifications] = useState<Array<{ id: string; data: any; timestamp: number }>>([]);

  useStompSubscription(destination, (message) => {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data: message,
      timestamp: Date.now(),
    };

    setNotifications((prev) => {
      const maxCount = options?.maxNotifications || 50;
      const newNotifications = [notification, ...prev].slice(0, maxCount);
      return newNotifications;
    });

    // 自动移除
    if (options?.autoRemove) {
      const delay = options.autoRemoveDelay || 5000;
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      }, delay);
    }
  });

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    removeNotification,
    clearNotifications,
  };
}

/**
 * 使用 STOMP 连接状态
 */
export function useStompStatus() {
  const [status, setStatus] = useState<StompConnectionStatus>('disconnected');
  const [subscriptionCount, setSubscriptionCount] = useState(0);

  useEffect(() => {
    const checkStatus = () => {
      try {
        const client = getStompClient();
        setStatus(client.isConnected() ? 'connected' : 'disconnected');
        setSubscriptionCount(client.getSubscriptionCount());
      } catch {
        setStatus('disconnected');
        setSubscriptionCount(0);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    subscriptionCount,
  };
}

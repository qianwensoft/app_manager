const WebSocket = require('ws');

const ws = new WebSocket('ws://192.168.1.136:8080/ws/stomp');

ws.on('open', () => {
  console.log('WebSocket connected');

  // STOMP CONNECT frame
  const connectFrame = 'CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n\n\0';
  ws.send(connectFrame);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());

  // After CONNECTED, subscribe to work orders topic
  if (data.toString().startsWith('CONNECTED')) {
    const subscribeFrame = 'SUBSCRIBE\nid:sub-0\ndestination:/topic/work-orders\n\n\0';
    console.log('Subscribing to /topic/work-orders');
    ws.send(subscribeFrame);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

// Keep alive for 60 seconds
setTimeout(() => {
  ws.close();
  process.exit(0);
}, 60000);

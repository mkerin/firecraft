// Online play transport: sign-in over HTTP, then one WebSocket that reconnects by itself.
// The server lives in server/worker.js and is served from the same origin as the page.

import { PROTOCOL } from './cards.js';

export async function login(body) {
  try {
    const res = await fetch('api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { error: 'Online play is not available here. Is the server running?' };
  }
}

// onMessage(msg) gets every server message; onStatus('open' | 'offline') reports the connection.
// The server ends the connection for good with 'auth-failed' or 'outdated'; then it stops retrying.
export function connect(token, { onMessage, onStatus }) {
  let ws;
  let delay = 500;
  let stopped = false;
  const open = () => {
    const url = new URL('ws', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(url);
    ws.onopen = () => {
      delay = 500;
      ws.send(JSON.stringify({ type: 'hello', token, v: PROTOCOL }));
      onStatus('open');
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'auth-failed' || msg.type === 'outdated') stopped = true;
      onMessage(msg);
    };
    ws.onclose = () => {
      if (stopped) return;
      onStatus('offline');
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 10000);
    };
  };
  open();
  return {
    send(msg) {
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() { stopped = true; ws.close(); },
  };
}

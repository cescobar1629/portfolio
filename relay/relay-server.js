/**
 * relay-server.js
 *
 * A small WebSocket relay that sits between:
 *   - Your TouchDesigner project (connects here whenever you're running it,
 *     using a WebSocket DAT in client mode)
 *   - Your website's visitors (connect here whenever they load the "Live
 *     Signal" page)
 *
 * It does three things:
 *   1. Forwards messages FROM TouchDesigner TO all connected website visitors
 *      (e.g. visual/state data you want to push out)
 *   2. Forwards messages FROM website visitors TO TouchDesigner
 *      (e.g. mouse position, clicks - things visitors do that should affect
 *      the live TD patch)
 *   3. Tells every visitor whether TD is currently connected ("live") or not
 *      ("offline"), both the moment they connect and whenever that changes -
 *      this is what lets your website trigger the fallback-to-particle-canvas
 *      behavor when nothing's actually live.
 *
 * TD connects to:      wss://your-relay-url/td
 * Website connects to: wss://your-relay-url/viewer
 *
 * These are two different URL paths on the SAME server, which is how the
 * relay tells the two roles apart - it never has to guess who's who.
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// A plain HTTP server underneath - most hosting platforms (including Koyeb)
// expect your app to listen on a normal HTTP port, then upgrade individual
// connections to WebSockets as needed. This also gives us a plain GET route
// to sanity-check the relay is running at all.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Relay running. TD connected: ${tdSocket !== null}. Viewers: ${viewerSockets.size}.\n`);
});

// Two separate WebSocketServer instances, one per path, both attached to
// the same underlying HTTP server.
const tdWss = new WebSocketServer({ noServer: true });
const viewerWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/td') {
    tdWss.handleUpgrade(request, socket, head, (ws) => {
      tdWss.emit('connection', ws, request);
    });
  } else if (pathname === '/viewer') {
    viewerWss.handleUpgrade(request, socket, head, (ws) => {
      viewerWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ===== State =====
let tdSocket = null;          // only one TD connection expected at a time
const viewerSockets = new Set(); // any number of website visitors

function broadcastToViewers(messageObj) {
  const json = JSON.stringify(messageObj);
  for (const viewer of viewerSockets) {
    if (viewer.readyState === viewer.OPEN) {
      viewer.send(json);
    }
  }
}

// ===== TouchDesigner side =====
tdWss.on('connection', (ws) => {
  console.log('TouchDesigner connected');

  // Only one TD connection at a time - if a second one shows up (e.g. you
  // restarted TD without the old connection closing cleanly yet), replace
  // the old one rather than trying to juggle both.
  if (tdSocket && tdSocket !== ws) {
    tdSocket.terminate();
  }
  tdSocket = ws;

  broadcastToViewers({ type: 'status', live: true });

  ws.on('message', (data) => {
    // Whatever TD sends gets forwarded straight to every connected viewer.
    // Expected shape from TD: a JSON string, e.g. '{"type":"data","payload":{...}}'
    let parsed;
    try {
      parsed = JSON.parse(data.toString());
    } catch (e) {
      console.log('Ignored non-JSON message from TD');
      return;
    }
    broadcastToViewers(parsed);
  });

  ws.on('close', () => {
    console.log('TouchDesigner disconnected');
    if (tdSocket === ws) {
      tdSocket = null;
      broadcastToViewers({ type: 'status', live: false });
    }
  });

  ws.on('error', (err) => {
    console.log('TD socket error:', err.message);
  });
});

// ===== Website visitor side =====
viewerWss.on('connection', (ws) => {
  viewerSockets.add(ws);
  console.log('Viewer connected. Total viewers:', viewerSockets.size);

  // Tell this viewer the current status immediately - they shouldn't have
  // to wait for a future status change to know whether anything's live.
  ws.send(JSON.stringify({ type: 'status', live: tdSocket !== null }));

  ws.on('message', (data) => {
    // Whatever a visitor sends (mouse position, clicks, etc.) gets
    // forwarded to TD, if it's currently connected. If TD isn't connected,
    // this is silently dropped - there's nothing listening on the other end.
    if (tdSocket && tdSocket.readyState === tdSocket.OPEN) {
      tdSocket.send(data.toString());
    }
  });

  ws.on('close', () => {
    viewerSockets.delete(ws);
    console.log('Viewer disconnected. Total viewers:', viewerSockets.size);
  });

  ws.on('error', (err) => {
    console.log('Viewer socket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Relay listening on port ${PORT}`);
});

import { promises as fs } from 'node:fs';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000';
const debugUrl = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!login.ok) throw new Error(`Login falhou: ${login.status}`);
const [cookieName, cookieValue] = login.headers.get('set-cookie').split(';')[0].split('=');
const targets = await (await fetch(`${debugUrl}/json`)).json();
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('Nenhuma página disponível no Chrome headless.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await call('Page.enable');
await call('Runtime.enable');
await call('Network.enable');
await call('Network.setCookie', { name: cookieName, value: cookieValue, url: base });
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await call('Page.navigate', { url: `${base}/` });
await new Promise((resolve) => setTimeout(resolve, 10000));
await fs.mkdir('outputs', { recursive: true });
let screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('outputs/mapa-clientes-desktop.png', Buffer.from(screenshot.data, 'base64'));

await call('Runtime.evaluate', { expression: "document.querySelector('[data-view=routes]').click()" });
await new Promise((resolve) => setTimeout(resolve, 5000));
await call('Runtime.evaluate', { expression: "document.querySelector('[data-action=add-route-stop]').click()" });
await new Promise((resolve) => setTimeout(resolve, 2500));
screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('outputs/seletor-cliente-rota.png', Buffer.from(screenshot.data, 'base64'));
const check = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    legend: [...document.querySelectorAll('.entity-legend span')].map((item) => item.textContent.trim()),
    customerRows: document.querySelectorAll('.customer-result').length,
    modalOpen: document.querySelector('#modalBackdrop').classList.contains('open')
  })`,
  returnByValue: true,
});
console.log(JSON.stringify({ ui: JSON.parse(check.result.value), exceptions }));
socket.close();

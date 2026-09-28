# Reproducing the no-network checks in Chrome

Run the production preview, not the Vite development server:

```text
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open `http://127.0.0.1:4173/` in Chrome.

1. Open DevTools → **Network**, enable **Disable cache**, choose the **Offline** throttling profile, then select an image and run a Worker pipeline. The result should still render. Filter the request list by the page origin; no request should be created between file selection and the result.
2. In **Sources**, press `Ctrl+Shift+F` and search the workspace for `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `FormData`, and `EventSource`. No processing source should contain those APIs.
3. In **Network**, inspect the document and worker-script responses. Each should include the production CSP: `default-src 'self'; connect-src 'none'; worker-src 'self' blob:; img-src 'self' blob: data:`.
4. In **Performance**, start recording, run a large image in Worker mode, stop after the result, and inspect the main-thread track. Image processing should be represented by worker activity rather than a long main-thread task.

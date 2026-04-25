# Network Shark

A desktop network inspector for Windows — like Chrome DevTools Network tab, but for your entire system.

Network Shark runs a local intercepting proxy that captures all HTTP and HTTPS traffic from any WinINET-based application (Chrome, Edge, Discord, Slack, etc.), decrypts it via MITM TLS, and displays it in a familiar request table with waterfall timing, full headers, payload, and response body.

<img width="1611" height="889" alt="image" src="https://github.com/user-attachments/assets/c224e5e7-73d1-4e05-9fa4-66c9128db14a" />


---

## Features

- **System-wide capture** — sets the Windows system proxy (WinINET) so traffic from any compatible app is intercepted, not just a single browser tab
- **HTTPS decryption** — generates a local CA certificate and signs per-hostname leaf certs on the fly; once the CA is trusted, all TLS traffic is readable
- **Chrome integration** — launches Chrome (or force-restarts it) with `--proxy-server` flags so it routes through Network Shark even if Chrome normally ignores the system proxy
- **DevTools-style UI** — request table with URL, method, status, type, size, and waterfall; click any row for a tabbed details panel (Headers / Payload / Preview / Response / Timing / Cookies)
- **Filtering** — filter by resource type (XHR, Doc, CSS, JS, Font, Img, Media, Manifest, WebSocket, Wasm) and free-text search across URLs
- **HAR export / import** — save a capture session as a `.har` file or load one to review offline
- **In-memory ring buffer** — keeps the last 5 000 requests; older ones are evicted automatically

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Wails v2](https://wails.io) (Go + WebView2, frameless window) |
| Backend | Go 1.25 — HTTP/HTTPS intercepting proxy, MITM TLS engine |
| Frontend | React 18 + Vite, pure inline styles (no Tailwind runtime) |
| Icons | [lucide-react](https://lucide.dev) |

---

## Requirements

- **Windows 10/11** (only platform supported — uses WinINET and `certutil.exe`)
- [Go 1.22+](https://go.dev/dl/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) — `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [Node.js 18+](https://nodejs.org) (Vite dev server and build)

---

## Getting started

```bash
# Clone
git clone https://github.com/shtanko-michael/network-shark.git
cd network-shark/network-shark

# Live development (hot-reload)
wails dev

# Production build → network-shark/build/bin/network-shark.exe
wails build
```

On first launch Network Shark generates a CA certificate at `%APPDATA%\NetworkShark\ca.crt`.  
Click **Install CA** in the app to add it to your Windows Trusted Root store (a system dialog will appear to confirm). HTTPS decryption only works after the CA is trusted.

---

## Project layout

```
network-shark/
├── app.go              # Wails app struct — binds Go methods to JS
├── main.go             # Entry point, window options
├── chrome_windows.go   # Launch / force-restart Chrome with proxy flags
├── proxy/
│   ├── proxy.go        # HTTP + HTTPS CONNECT handler, MITM splice
│   ├── mitm.go         # CA generation, leaf cert cache, trust check
│   ├── logger.go       # Coloured console log helpers
│   └── types.go        # CapturedRequest, Timing, Cookie structs
├── sysproxy/
│   ├── sysproxy_windows.go  # Set / clear WinINET system proxy via registry
│   └── sysproxy_other.go    # No-op stub for non-Windows builds
└── frontend/
    └── src/
        ├── components/
        │   ├── NetworkPanel.jsx    # Root component — state, event bus, layout
        │   ├── Toolbar.jsx         # Record / Clear / Filter / Export / Import
        │   ├── FilterBar.jsx       # Resource type pills + invert toggle
        │   ├── RequestTable.jsx    # Virtualized-style table, 8 columns
        │   ├── Waterfall.jsx       # Timing phase bars (Queue/DNS/Connect/SSL/TTFB/Download)
        │   ├── RequestDetails.jsx  # Tabbed detail panel
        │   └── StatsFooter.jsx     # Request count, size, duration summary
        └── lib/
            ├── mockData.js         # Realistic mock stream for UI development
            └── format.js           # formatSize, formatTime, statusClass helpers
```

---

## How it works

1. On **Start Capture** the Go backend starts an HTTP server on `127.0.0.1:9876` and sets `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` to route all WinINET traffic through it.
2. Plain HTTP requests are forwarded transparently; response headers and body are captured.
3. HTTPS connections arrive as `CONNECT` tunnels. If the CA is trusted, Network Shark performs a TLS handshake on both sides (MITM), reads the decrypted HTTP/1.1 stream, and forwards it. Otherwise the tunnel is piped opaquely.
4. Each captured request is pushed to the React frontend via the Wails event bus (`network:request` event), which appends it to the table in real time.
5. On **Stop Capture** the proxy is shut down and the system proxy is cleared.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Clear all captured requests |
| `Esc` | Close the request details panel |

---

## Security notice

Installing the Network Shark CA certificate allows the app to decrypt your HTTPS traffic. **Only install it on machines you own and control.** Remove it from your Trusted Root store when you no longer need it (`certmgr.msc` → Trusted Root Certification Authorities → find "Network Shark CA" → delete).

---

## License

MIT

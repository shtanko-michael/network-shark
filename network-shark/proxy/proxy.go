package proxy

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// CaptureCallback is called for every captured request/response pair.
type CaptureCallback func(CapturedRequest)

// Proxy is a local HTTP/HTTPS intercepting proxy.
type Proxy struct {
	port     int
	server   *http.Server
	running  atomic.Bool
	mu       sync.Mutex
	callback CaptureCallback
	counter  atomic.Int64
	mitm     *MITM
}

func New(port int, dataDir string, callback CaptureCallback) *Proxy {
	p := &Proxy{port: port, callback: callback}
	if m, err := NewMITM(dataDir); err == nil {
		p.mitm = m
	}
	return p
}

func (p *Proxy) Port() int       { return p.port }
func (p *Proxy) IsRunning() bool { return p.running.Load() }
func (p *Proxy) MITM() *MITM     { return p.mitm }

// prefixConn wraps a net.Conn so that already-buffered bytes (from a bufio.Reader)
// are drained before subsequent reads go to the underlying connection.
type prefixConn struct {
	net.Conn
	r io.Reader
}

func (c *prefixConn) Read(b []byte) (int, error) { return c.r.Read(b) }

// PACScript returns a Proxy Auto-Config script.
// Declaring a PROXY for HTTPS causes Chrome to disable QUIC (HTTP/3 over UDP),
// forcing it to use TCP connections that our proxy can intercept.
func (p *Proxy) PACScript() string {
	return fmt.Sprintf(`function FindProxyForURL(url, host) {
  if (host === "127.0.0.1" || host === "localhost" ||
      isInNet(host, "127.0.0.0", "255.0.0.0"))
    return "DIRECT";
  return "PROXY 127.0.0.1:%d";
}`, p.port)
}

func (p *Proxy) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.running.Load() {
		return nil
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p.port))
	if err != nil {
		return fmt.Errorf("listen on port %d: %w", p.port, err)
	}

	// Use a plain HandlerFunc, NOT http.ServeMux.
	// ServeMux routes by r.URL.Path, which is EMPTY for CONNECT requests —
	// causing the mux to return 404 and silently breaking all HTTPS tunnels.
	p.server = &http.Server{
		Handler:           http.HandlerFunc(p.dispatch),
		ReadHeaderTimeout: 30 * time.Second,
	}
	p.running.Store(true)
	go func() {
		_ = p.server.Serve(ln)
		p.running.Store(false)
	}()

	LogStart(p.port)
	return nil
}

func (p *Proxy) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.server != nil {
		_ = p.server.Close()
		p.server = nil
	}
	p.running.Store(false)
	LogStop()
}

func (p *Proxy) nextID() string {
	n := p.counter.Add(1)
	return fmt.Sprintf("req_%d_%d", n, time.Now().UnixMilli())
}

// dispatch routes requests: PAC file, HTTPS CONNECT tunnels, plain HTTP.
func (p *Proxy) dispatch(w http.ResponseWriter, r *http.Request) {
	// Serve the PAC file for system proxy auto-configuration.
	// Must be checked before CONNECT routing because the URL check is on the path.
	if r.Method != http.MethodConnect && r.URL != nil && r.URL.Path == "/proxy.pac" {
		LogPAC(r.RemoteAddr)
		w.Header().Set("Content-Type", "application/x-ns-proxy-autoconfig")
		w.Header().Set("Cache-Control", "no-cache")
		fmt.Fprint(w, p.PACScript())
		return
	}

	if r.Method == http.MethodConnect {
		p.handleConnect(w, r)
	} else {
		p.handleHTTP(w, r)
	}
}

// ---- HTTP (plain) --------------------------------------------------------

func (p *Proxy) handleHTTP(w http.ResponseWriter, r *http.Request) {
	startAt := time.Now()
	id := p.nextID()

	// Strip proxy hop-by-hop headers.
	for _, h := range []string{
		"Proxy-Connection", "Proxy-Authenticate", "Proxy-Authorization",
		"Te", "Trailers", "Transfer-Encoding", "Upgrade",
	} {
		r.Header.Del(h)
	}
	r.RequestURI = ""

	reqHeaders := headersToMap(r.Header)
	reqHeaders[":method"] = r.Method
	reqHeaders[":authority"] = r.Host
	reqHeaders[":scheme"] = "http"
	if r.URL != nil {
		reqHeaders[":path"] = r.URL.RequestURI()
	}

	host := r.Host
	rawPath := ""
	if r.URL != nil {
		rawPath = r.URL.Path
		if r.URL.RawQuery != "" {
			rawPath += "?" + r.URL.RawQuery
		}
	}
	name := lastName(rawPath, host)

	// Custom transport to capture dial timing.
	var dialDur time.Duration

	tr := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			t0 := time.Now()
			conn, err := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, addr)
			if err == nil {
				dialDur = time.Since(t0)
			}
			return conn, err
		},
		DisableCompression: false,
		MaxIdleConns:       100,
		IdleConnTimeout:    90 * time.Second,
	}
	client := &http.Client{
		Transport: tr,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Timeout: 30 * time.Second,
	}

	reqStart := time.Now()
	resp, err := client.Do(r)
	ttfbDur := time.Since(reqStart)

	if err != nil {
		dur := time.Since(startAt)
		LogError(r.Method, r.URL.String(), err.Error(), dur)
		http.Error(w, "Bad Gateway: "+err.Error(), http.StatusBadGateway)
		p.callback(buildFailed(
			id, name, r.URL.String(), host, rawPath, r.Method,
			startAt, msf(dur), Timing{Queue: 1, Connect: msf(dialDur)},
			reqHeaders,
		))
		return
	}
	defer resp.Body.Close()

	// Forward response headers.
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	// Copy body, counting bytes.
	dlStart := time.Now()
	var buf bytes.Buffer
	tee := io.TeeReader(resp.Body, &buf)
	transferred, _ := io.Copy(w, tee)
	dlDur := time.Since(dlStart)
	totalDur := time.Since(startAt)

	respHeaders := headersToMap(resp.Header)
	ct := resp.Header.Get("Content-Type")
	mediaType, _, _ := mime.ParseMediaType(ct)
	resType := guessType(mediaType, rawPath)

	contentLen := resp.ContentLength
	if contentLen < 0 {
		contentLen = transferred
	}

	responseBody := ""
	if isTextual(ct) && buf.Len() <= 65536 {
		responseBody = buf.String()
	}

	LogHTTP(r.Method, r.URL.String(), resp.StatusCode, transferred, totalDur)

	p.callback(CapturedRequest{
		ID:          id,
		Name:        name,
		URL:         r.URL.String(),
		Host:        host,
		Path:        rawPath,
		Method:      r.Method,
		Type:        resType,
		Status:      resp.StatusCode,
		Initiator:   "proxy",
		Size:        contentLen,
		Transferred: transferred,
		Duration:    msf(totalDur),
		Timing: Timing{
			Queue:    1,
			Connect:  msf(dialDur),
			TTFB:     msf(ttfbDur - dialDur),
			Download: msf(dlDur),
		},
		RequestHeaders:  reqHeaders,
		ResponseHeaders: respHeaders,
		MimeType:        ct,
		StartedAt:       float64(startAt.UnixMilli()),
		FinishedAt:      float64(startAt.UnixMilli()) + msf(totalDur),
		Response:        responseBody,
		Cookies:         parseCookies(resp.Header, host),
	})
}

// ---- HTTPS CONNECT tunnel -------------------------------------------------

func (p *Proxy) handleConnect(w http.ResponseWriter, r *http.Request) {
	startAt := time.Now()
	id := p.nextID()
	host := r.Host // host:port

	dialStart := time.Now()
	remote, err := net.DialTimeout("tcp", host, 10*time.Second)
	dialDur := time.Since(dialStart)

	if err != nil {
		dur := time.Since(startAt)
		LogError("CONNECT", host, err.Error(), dur)
		http.Error(w, "Cannot connect: "+err.Error(), http.StatusBadGateway)
		p.callback(buildFailed(
			id, splitHost(host), "https://"+host+"/", splitHost(host), "/",
			"CONNECT", startAt, msf(dur), Timing{Queue: 1, Connect: msf(dialDur)},
			map[string]string{":method": "CONNECT", ":authority": host},
		))
		return
	}
	defer remote.Close()

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack not supported", http.StatusInternalServerError)
		return
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		LogError("CONNECT", host, "hijack: "+err.Error(), time.Since(startAt))
		return
	}
	defer conn.Close()

	// Tell the client the tunnel is established.
	_, _ = fmt.Fprint(conn, "HTTP/1.1 200 Connection Established\r\n\r\n")

	hostname := splitHost(host)

	// Attempt MITM TLS interception when our CA is in the system trust store.
	if p.mitm != nil && p.mitm.IsTrusted() {
		if leafCert, err := p.mitm.leafCert(hostname); err == nil {
			// Wrap conn so the TLS layer drains any bytes already buffered by bufio.
			pConn := &prefixConn{Conn: conn, r: io.MultiReader(brw.Reader, conn)}
			clientTLS := tls.Server(pConn, &tls.Config{
				Certificates: []tls.Certificate{leafCert},
				NextProtos:   []string{"http/1.1"},
			})
			remoteTLS := tls.Client(remote, &tls.Config{
				ServerName: hostname,
				NextProtos: []string{"http/1.1"},
			})
			if cErr := clientTLS.Handshake(); cErr != nil {
				LogMITMFail(hostname, "browser handshake: "+cErr.Error())
				_ = remoteTLS.Close()
				_ = clientTLS.Close()
				return
			}
			if rErr := remoteTLS.Handshake(); rErr != nil {
				LogMITMFail(hostname, "origin handshake: "+rErr.Error())
				_ = remoteTLS.Close()
				_ = clientTLS.Close()
				return
			}
			LogMITM(hostname)
			p.proxyMITM(clientTLS, remoteTLS, "https", hostname)
			_ = remoteTLS.Close()
			_ = clientTLS.Close()
			return
		}
	}

	// Tunnel mode: flush any buffered client data then bidirectionally pipe.
	if n := brw.Reader.Buffered(); n > 0 {
		b := make([]byte, n)
		_, _ = io.ReadFull(brw.Reader, b)
		_, _ = remote.Write(b)
	}

	ttfbEnd := time.Now()

	// Bidirectional pipe with byte counters.
	var (
		toRemote   atomic.Int64
		fromRemote atomic.Int64
		wg         sync.WaitGroup
	)
	wg.Add(2)
	go func() {
		defer wg.Done()
		n, _ := io.Copy(remote, conn)
		toRemote.Store(n)
		halfClose(remote)
	}()
	go func() {
		defer wg.Done()
		n, _ := io.Copy(conn, remote)
		fromRemote.Store(n)
		halfClose(conn)
	}()
	wg.Wait()

	totalDur := time.Since(startAt)
	transferred := toRemote.Load() + fromRemote.Load()

	LogCONNECT(host, transferred, totalDur)

	p.callback(CapturedRequest{
		ID:          id,
		Name:        hostname,
		URL:         "https://" + host + "/",
		Host:        hostname,
		Path:        "/",
		Method:      "GET",
		Type:        "fetch",
		Status:      200,
		Initiator:   "proxy",
		Size:        fromRemote.Load(),
		Transferred: transferred,
		Duration:    msf(totalDur),
		Timing: Timing{
			Queue:    1,
			Connect:  msf(dialDur),
			SSL:      msf(ttfbEnd.Sub(startAt) - dialDur),
			TTFB:     msf(ttfbEnd.Sub(startAt)),
			Download: msf(totalDur - ttfbEnd.Sub(startAt)),
		},
		RequestHeaders:  map[string]string{":method": "CONNECT", ":authority": host},
		ResponseHeaders: map[string]string{},
		MimeType:        "application/octet-stream",
		StartedAt:       float64(startAt.UnixMilli()),
		FinishedAt:      float64(startAt.UnixMilli()) + msf(totalDur),
		Cookies:         []Cookie{},
	})
}

// ---- helpers --------------------------------------------------------------

// halfClose signals EOF to the other side without killing the read half.
func halfClose(c net.Conn) {
	type halfCloser interface{ CloseWrite() error }
	if hc, ok := c.(halfCloser); ok {
		_ = hc.CloseWrite()
	} else {
		_ = c.Close()
	}
}

func msf(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}

func splitHost(hostport string) string {
	h, _, err := net.SplitHostPort(hostport)
	if err != nil {
		return hostport
	}
	return h
}

func lastName(path, fallback string) string {
	base := filepath.Base(path)
	if base == "" || base == "." || base == "/" {
		return fallback
	}
	return base
}

func headersToMap(h http.Header) map[string]string {
	m := make(map[string]string, len(h))
	for k, vs := range h {
		m[strings.ToLower(k)] = strings.Join(vs, ", ")
	}
	return m
}

func isTextual(ct string) bool {
	if strings.HasPrefix(ct, "text/") {
		return true
	}
	for _, sub := range []string{"json", "javascript", "xml", "html", "css", "yaml"} {
		if strings.Contains(ct, sub) {
			return true
		}
	}
	return false
}

func guessType(mediaType, path string) string {
	switch {
	case strings.Contains(mediaType, "javascript"):
		return "js"
	case strings.Contains(mediaType, "css"):
		return "css"
	case strings.Contains(mediaType, "html"):
		return "doc"
	case strings.Contains(mediaType, "json"), strings.Contains(mediaType, "xml"):
		return "fetch"
	case strings.HasPrefix(mediaType, "image/"):
		return "img"
	case strings.HasPrefix(mediaType, "video/"), strings.HasPrefix(mediaType, "audio/"):
		return "media"
	case strings.Contains(mediaType, "wasm"):
		return "wasm"
	case strings.Contains(mediaType, "font"):
		return "font"
	case strings.Contains(mediaType, "manifest"):
		return "manifest"
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".js", ".mjs":
		return "js"
	case ".css":
		return "css"
	case ".html", ".htm":
		return "doc"
	case ".json":
		return "fetch"
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".ico":
		return "img"
	case ".mp4", ".webm", ".mp3", ".ogg":
		return "media"
	case ".wasm":
		return "wasm"
	case ".woff", ".woff2", ".ttf", ".otf":
		return "font"
	}
	return "other"
}

func parseCookies(h http.Header, domain string) []Cookie {
	var out []Cookie
	for _, line := range h["Set-Cookie"] {
		parts := strings.Split(line, ";")
		if len(parts) == 0 {
			continue
		}
		kv := strings.SplitN(strings.TrimSpace(parts[0]), "=", 2)
		if len(kv) != 2 {
			continue
		}
		c := Cookie{Name: kv[0], Value: kv[1], Domain: domain, Path: "/"}
		for _, attr := range parts[1:] {
			a := strings.ToLower(strings.TrimSpace(attr))
			switch {
			case a == "httponly":
				c.HTTPOnly = true
			case a == "secure":
				c.Secure = true
			case strings.HasPrefix(a, "path="):
				c.Path = strings.TrimPrefix(a, "path=")
			case strings.HasPrefix(a, "domain="):
				c.Domain = strings.TrimPrefix(a, "domain=")
			}
		}
		out = append(out, c)
	}
	if out == nil {
		out = []Cookie{}
	}
	return out
}

func buildFailed(id, name, rawURL, host, path, method string,
	startAt time.Time, dur float64, timing Timing,
	reqHeaders map[string]string,
) CapturedRequest {
	return CapturedRequest{
		ID:              id,
		Name:            name,
		URL:             rawURL,
		Host:            host,
		Path:            path,
		Method:          method,
		Type:            "fetch",
		Status:          0,
		StatusText:      "(failed) net::ERR_CONNECTION_REFUSED",
		Initiator:       "proxy",
		Failed:          true,
		Duration:        dur,
		Timing:          timing,
		RequestHeaders:  reqHeaders,
		ResponseHeaders: map[string]string{},
		StartedAt:       float64(startAt.UnixMilli()),
		FinishedAt:      float64(startAt.UnixMilli()) + dur,
		Cookies:         []Cookie{},
	}
}

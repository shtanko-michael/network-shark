package proxy

import (
	"bufio"
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// MITM manages the CA certificate and per-hostname leaf cert cache.
// It intercepts TLS connections by terminating them locally and re-establishing
// them to the real server, making encrypted HTTPS content fully visible.
type MITM struct {
	caCert    *x509.Certificate
	caKey     *ecdsa.PrivateKey
	caDER     []byte
	certCache sync.Map // hostname → tls.Certificate
	serial    atomic.Int64
	trusted   atomic.Bool // cached trust status — set to true by Install or on first positive check
}

// NewMITM loads an existing CA from disk or generates a new one.
func NewMITM(dataDir string) (*MITM, error) {
	keyPath := filepath.Join(dataDir, "ca.key")
	crtPath := filepath.Join(dataDir, "ca.crt")

	if _, err := os.Stat(crtPath); err == nil {
		// Load existing CA.
		m, err := loadMITM(keyPath, crtPath)
		if err == nil {
			return m, nil
		}
		// Corrupt — regenerate.
	}

	return generateMITM(keyPath, crtPath)
}

func loadMITM(keyPath, crtPath string) (*MITM, error) {
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}
	crtPEM, err := os.ReadFile(crtPath)
	if err != nil {
		return nil, err
	}
	tlsCert, err := tls.X509KeyPair(crtPEM, keyPEM)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(tlsCert.Certificate[0])
	if err != nil {
		return nil, err
	}
	key, ok := tlsCert.PrivateKey.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("unexpected key type")
	}
	return &MITM{caCert: cert, caKey: key, caDER: tlsCert.Certificate[0]}, nil
}

func generateMITM(keyPath, crtPath string) (*MITM, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName:   "Network Shark CA",
			Organization: []string{"Network Shark"},
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}

	// Persist to disk.
	keyDER, err := marshalECKey(key)
	if err != nil {
		return nil, err
	}
	_ = os.MkdirAll(filepath.Dir(keyPath), 0700)
	if err := os.WriteFile(keyPath, keyDER, 0600); err != nil {
		return nil, err
	}
	crtPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	if err := os.WriteFile(crtPath, crtPEM, 0644); err != nil {
		return nil, err
	}

	return &MITM{caCert: cert, caKey: key, caDER: der}, nil
}

func marshalECKey(key *ecdsa.PrivateKey) ([]byte, error) {
	der, err := marshalECPrivateKey(key)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der}), nil
}

// leafCert returns a cached or freshly-generated leaf cert for hostname.
func (m *MITM) leafCert(hostname string) (tls.Certificate, error) {
	if v, ok := m.certCache.Load(hostname); ok {
		return v.(tls.Certificate), nil
	}

	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}

	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(m.serial.Add(1) + 1000),
		Subject:      pkix.Name{CommonName: hostname},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	if ip := net.ParseIP(hostname); ip != nil {
		tmpl.IPAddresses = []net.IP{ip}
	} else {
		tmpl.DNSNames = []string{hostname}
	}

	der, err := x509.CreateCertificate(rand.Reader, tmpl, m.caCert, &leafKey.PublicKey, m.caKey)
	if err != nil {
		return tls.Certificate{}, err
	}

	cert := tls.Certificate{
		Certificate: [][]byte{der, m.caDER},
		PrivateKey:  leafKey,
	}
	m.certCache.Store(hostname, cert)
	return cert, nil
}

// CACertPEM returns the CA certificate as PEM bytes.
func (m *MITM) CACertPEM() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: m.caDER})
}

// CACertPath returns the path where the CA cert is saved on disk.
func CACertPath(dataDir string) string {
	return filepath.Join(dataDir, "ca.crt")
}

// IsTrusted reports whether the CA is in the system's trusted root store.
// The positive result is cached so only the first call (or calls after
// Install) performs the expensive crypto check.
func (m *MITM) IsTrusted() bool {
	if m.trusted.Load() {
		return true
	}
	ok := m.checkTrusted()
	if ok {
		m.trusted.Store(true)
	}
	return ok
}

func (m *MITM) checkTrusted() bool {
	pool, err := x509.SystemCertPool()
	if err != nil {
		return false
	}
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return false
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(99999),
		Subject:      pkix.Name{CommonName: "test.local"},
		DNSNames:     []string{"test.local"},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, m.caCert, &leafKey.PublicKey, m.caKey)
	if err != nil {
		return false
	}
	leaf, err := x509.ParseCertificate(der)
	if err != nil {
		return false
	}
	_, err = leaf.Verify(x509.VerifyOptions{DNSName: "test.local", Roots: pool})
	return err == nil
}

// Install adds the CA to the current user's Trusted Root store via certutil.
// Windows will show a security confirmation dialog.
func (m *MITM) Install(certPath string) error {
	out, err := exec.Command(
		"certutil.exe", "-user", "-addstore", "Root", certPath,
	).CombinedOutput()
	if err != nil {
		return fmt.Errorf("certutil: %s: %w", bytes.TrimSpace(out), err)
	}
	m.trusted.Store(true) // skip crypto check on next IsTrusted call
	return nil
}

// ---- HTTP/1.1 over intercepted TLS ----------------------------------------

// proxyMITM runs the HTTP/1.1 request/response loop after TLS termination.
// clientConn is the TLS connection to the browser (our server side).
// remoteConn is the TLS connection to the real origin server.
func (p *Proxy) proxyMITM(
	clientConn *tls.Conn,
	remoteConn *tls.Conn,
	scheme, host string,
) {
	clientBR := bufio.NewReader(clientConn)
	remoteBR := bufio.NewReader(remoteConn)

	for {
		req, err := http.ReadRequest(clientBR)
		if err != nil {
			return // client closed or EOF
		}

		startAt := time.Now()
		id := p.nextID()

		// Capture path before mutating URL for logging.
		rawPath := req.URL.Path
		if req.URL.RawQuery != "" {
			rawPath += "?" + req.URL.RawQuery
		}
		name := lastName(rawPath, host)

		reqHeaders := headersToMap(req.Header)
		reqHeaders[":method"] = req.Method
		reqHeaders[":authority"] = host
		reqHeaders[":scheme"] = scheme
		reqHeaders[":path"] = req.URL.RequestURI()

		// Set scheme/host on URL only for the callback — NOT before writing to origin.
		// req.Write sends a relative URI; req.WriteProxy would send an absolute URI
		// which origin servers reject with 400.

		// Capture request body (small payloads only).
		var payloadBuf bytes.Buffer
		if req.Body != nil && req.ContentLength > 0 && req.ContentLength <= 65536 {
			tee := io.TeeReader(req.Body, &payloadBuf)
			req.Body = io.NopCloser(tee)
		}

		// Forward request to origin using server-style (relative URI) format.
		if err := req.Write(remoteConn); err != nil {
			p.callback(buildFailed(id, name, scheme+"://"+host+rawPath, host, rawPath,
				req.Method, startAt, msf(time.Since(startAt)),
				Timing{Queue: 1}, reqHeaders))
			return
		}

		// Annotate URL for logging/callback after the write so req.Write sees relative URI.
		req.URL.Scheme = scheme
		req.URL.Host = host

		// Read response.
		resp, err := http.ReadResponse(remoteBR, req)
		if err != nil {
			return
		}

		// Capture response body.
		var bodyBuf bytes.Buffer
		ct := resp.Header.Get("Content-Type")
		dlStart := time.Now()

		if isTextual(ct) && (resp.ContentLength < 0 || resp.ContentLength <= 65536) {
			tee := io.TeeReader(resp.Body, &bodyBuf)
			resp.Body = io.NopCloser(tee)
		}

		// Forward response to browser.
		if err := resp.Write(clientConn); err != nil {
			resp.Body.Close()
			return
		}
		resp.Body.Close()

		totalDur := time.Since(startAt)
		dlDur := time.Since(dlStart)

		mediaType, _, _ := parseMimeType(ct)
		resType := guessType(mediaType, rawPath)
		transferred := resp.ContentLength
		if transferred < 0 {
			transferred = int64(bodyBuf.Len())
		}

		LogHTTP(req.Method, req.URL.String(), resp.StatusCode, transferred, totalDur)

		p.callback(CapturedRequest{
			ID:          id,
			Name:        name,
			URL:         req.URL.String(),
			Host:        host,
			Path:        rawPath,
			Method:      req.Method,
			Type:        resType,
			Status:      resp.StatusCode,
			Initiator:   "proxy",
			Size:        resp.ContentLength,
			Transferred: transferred,
			Duration:    msf(totalDur),
			Timing: Timing{
				Queue:    1,
				SSL:      0, // TLS already established before this loop
				TTFB:     msf(totalDur - dlDur),
				Download: msf(dlDur),
			},
			RequestHeaders:  reqHeaders,
			ResponseHeaders: headersToMap(resp.Header),
			MimeType:        ct,
			StartedAt:       float64(startAt.UnixMilli()),
			FinishedAt:      float64(startAt.UnixMilli()) + msf(totalDur),
			Payload:         payloadBuf.String(),
			Response:        bodyBuf.String(),
			Cookies:         parseCookies(resp.Header, host),
		})

		// Respect connection close semantics.
		if req.Close || resp.Close {
			return
		}
	}
}

// ---- helpers ---------------------------------------------------------------

// parseMimeType is a thin wrapper so mitm.go doesn't need to import "mime".
func parseMimeType(ct string) (mediaType, params string, err error) {
	if ct == "" {
		return "", "", nil
	}
	// Simple split on ";" — good enough for type detection.
	for i, c := range ct {
		if c == ';' {
			return ct[:i], ct[i+1:], nil
		}
	}
	return ct, "", nil
}

// marshalECPrivateKey encodes an ECDSA key to SEC1/DER.
// Thin wrapper to avoid importing encoding/asn1 directly.
func marshalECPrivateKey(key *ecdsa.PrivateKey) ([]byte, error) {
	return x509.MarshalECPrivateKey(key)
}

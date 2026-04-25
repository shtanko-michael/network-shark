package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"network-shark/proxy"
	"network-shark/sysproxy"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const proxyPort = 9876

// App is the main Wails application struct.
// Public methods are automatically bound to the JS frontend.
type App struct {
	ctx      context.Context
	proxy    *proxy.Proxy
	dataDir  string
	reqMu    sync.Mutex
	requests []proxy.CapturedRequest
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, _ := os.UserConfigDir()
	a.dataDir = filepath.Join(dir, "NetworkShark")
	a.proxy = proxy.New(proxyPort, a.dataDir, func(req proxy.CapturedRequest) {
		a.reqMu.Lock()
		a.requests = append(a.requests, req)
		if len(a.requests) > 5000 {
			a.requests = a.requests[len(a.requests)-5000:]
		}
		a.reqMu.Unlock()
		runtime.EventsEmit(ctx, "network:request", req)
	})
	fmt.Println(proxy.Banner())
}

func (a *App) shutdown(_ context.Context) {
	if a.proxy != nil && a.proxy.IsRunning() {
		a.proxy.Stop()
		sysproxy.Clear()
		proxy.LogSysproxy("CLEAR", "system proxy restored")
	}
}

// StartCapture starts the proxy and sets the system proxy (ProxyServer, not PAC —
// PAC via 127.0.0.1 is blocked by Chrome's Private Network Access policy).
func (a *App) StartCapture() error {
	if err := a.proxy.Start(); err != nil {
		return err
	}
	proxyAddr := fmt.Sprintf("127.0.0.1:%d", proxyPort)
	if err := sysproxy.Set("127.0.0.1", proxyPort); err != nil {
		runtime.LogWarningf(a.ctx, "sysproxy.Set: %v", err)
		proxy.LogSysproxy("WARN", "could not set system proxy: "+err.Error())
	} else {
		proxy.LogSysproxy("SET", "ProxyServer → "+proxyAddr+" (Chrome/Edge/Discord/WinINET)")
	}
	runtime.EventsEmit(a.ctx, "capture:status", map[string]any{
		"running": true,
		"port":    proxyPort,
	})
	return nil
}

// StopCapture stops the proxy and restores the system proxy.
func (a *App) StopCapture() {
	a.proxy.Stop()
	sysproxy.Clear()
	proxy.LogSysproxy("CLEAR", "system proxy restored to direct")
	runtime.EventsEmit(a.ctx, "capture:status", map[string]any{
		"running": false,
		"port":    proxyPort,
	})
}

// GetStatus returns the current capture state.
func (a *App) GetStatus() map[string]any {
	return map[string]any{
		"running": a.proxy != nil && a.proxy.IsRunning(),
		"port":    proxyPort,
	}
}

// GetCapturedRequests returns the in-memory capture buffer.
func (a *App) GetCapturedRequests() []proxy.CapturedRequest {
	a.reqMu.Lock()
	defer a.reqMu.Unlock()
	out := make([]proxy.CapturedRequest, len(a.requests))
	copy(out, a.requests)
	return out
}

// ClearCapturedRequests clears the in-memory capture buffer.
func (a *App) ClearCapturedRequests() {
	a.reqMu.Lock()
	a.requests = nil
	a.reqMu.Unlock()
}

// IsCATrusted reports whether our MITM CA cert is in the system trust store.
func (a *App) IsCATrusted() bool {
	if a.proxy == nil || a.proxy.MITM() == nil {
		return false
	}
	return a.proxy.MITM().IsTrusted()
}

// InstallCA installs the MITM CA certificate into the user's trusted root store.
// Windows will show a security confirmation dialog.
func (a *App) InstallCA() error {
	if a.proxy == nil || a.proxy.MITM() == nil {
		return fmt.Errorf("MITM not initialized")
	}
	return a.proxy.MITM().Install(proxy.CACertPath(a.dataDir))
}

// LaunchChrome starts Google Chrome with Network Shark proxy flags.
func (a *App) LaunchChrome() error {
	if a.proxy == nil {
		return fmt.Errorf("proxy not initialized")
	}
	if !a.proxy.IsRunning() {
		if err := a.StartCapture(); err != nil {
			return err
		}
	}
	return launchChromeWithProxy(proxyPort)
}

// ForceRestartChrome kills running Chrome processes and relaunches Chrome with proxy flags.
func (a *App) ForceRestartChrome() error {
	if a.proxy == nil {
		return fmt.Errorf("proxy not initialized")
	}
	if !a.proxy.IsRunning() {
		if err := a.StartCapture(); err != nil {
			return err
		}
	}
	return forceRestartChromeWithProxy(proxyPort)
}

//go:build windows

package sysproxy

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

const (
	internetSettingsKey   = `Software\Microsoft\Windows\CurrentVersion\Internet Settings`
	optionSettingsChanged = 39
	optionRefresh         = 37

	hwndBroadcast   = uintptr(0xFFFF) // HWND_BROADCAST
	wmSettingChange  = uintptr(0x001A) // WM_SETTINGCHANGE
	smtoAbortIfHung = uintptr(0x0002)
)

var (
	wininet           = syscall.NewLazyDLL("wininet.dll")
	internetSetOption = wininet.NewProc("InternetSetOptionW")

	user32             = syscall.NewLazyDLL("user32.dll")
	sendMessageTimeout = user32.NewProc("SendMessageTimeoutW")
)

// notifyAll broadcasts a proxy-change event to every running process.
// Chrome's network service listens for WM_SETTINGCHANGE "Internet Settings".
func notifyAll() {
	internetSetOption.Call(0, optionSettingsChanged, 0, 0)
	internetSetOption.Call(0, optionRefresh, 0, 0)

	setting, _ := syscall.UTF16PtrFromString("Internet Settings")
	sendMessageTimeout.Call(
		hwndBroadcast,
		wmSettingChange,
		0,
		uintptr(unsafe.Pointer(setting)),
		smtoAbortIfHung,
		1000,
		0,
	)
}

// Set configures the Windows system proxy using the manual ProxyServer key.
//
// Why ProxyServer and not AutoConfigURL (PAC)?
// Chrome enforces "Private Network Access" and refuses to use a PAC file that
// declares a proxy at 127.0.0.1 for public internet requests — this is a
// Chrome-specific security restriction that Edge has removed.
// Setting ProxyServer directly bypasses this restriction and works in every
// browser. Chrome also disables QUIC/HTTP3 automatically when ProxyServer is
// set, so we still get full TCP visibility.
func Set(host string, port int) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, internetSettingsKey,
		registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return fmt.Errorf("open registry key: %w", err)
	}
	defer k.Close()

	// Clear any leftover PAC config so Chrome doesn't prefer it over ProxyServer.
	_ = k.DeleteValue("AutoConfigURL")

	if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
		return fmt.Errorf("set ProxyEnable: %w", err)
	}
	if err := k.SetStringValue("ProxyServer", fmt.Sprintf("%s:%d", host, port)); err != nil {
		return fmt.Errorf("set ProxyServer: %w", err)
	}
	// Bypass loopback so the app doesn't route its own traffic through itself.
	if err := k.SetStringValue("ProxyOverride", "localhost;127.0.0.1;<local>"); err != nil {
		return fmt.Errorf("set ProxyOverride: %w", err)
	}

	notifyAll()
	return nil
}

// Clear restores direct connection for all applications.
func Clear() {
	k, err := registry.OpenKey(registry.CURRENT_USER, internetSettingsKey, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()
	_ = k.SetDWordValue("ProxyEnable", 0)
	_ = k.DeleteValue("ProxyServer")
	_ = k.DeleteValue("AutoConfigURL")
	notifyAll()
}

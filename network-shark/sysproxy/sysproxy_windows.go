//go:build windows

package sysproxy

import (
	"errors"
	"fmt"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

const (
	internetSettingsKey   = `Software\Microsoft\Windows\CurrentVersion\Internet Settings`
	proxyPolicyKey        = `Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings`
	optionSettingsChanged = 39
	optionRefresh         = 37

	hwndBroadcast   = uintptr(0xFFFF) // HWND_BROADCAST
	wmSettingChange = uintptr(0x001A) // WM_SETTINGCHANGE
	smtoAbortIfHung = uintptr(0x0002)
)

var (
	wininet           = syscall.NewLazyDLL("wininet.dll")
	internetSetOption = wininet.NewProc("InternetSetOptionW")

	user32             = syscall.NewLazyDLL("user32.dll")
	sendMessageTimeout = user32.NewProc("SendMessageTimeoutW")

	settingsMu       sync.Mutex
	originalSettings *proxySettings
)

type dwordSetting struct {
	value   uint32
	present bool
}

type stringSetting struct {
	value   string
	present bool
}

type proxySettings struct {
	proxyEnable   dwordSetting
	proxyServer   stringSetting
	proxyOverride stringSetting
	autoConfigURL stringSetting
}

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
	settingsMu.Lock()
	defer settingsMu.Unlock()

	perMachine, err := usesPerMachineProxySettings()
	if err != nil {
		return fmt.Errorf("read Windows proxy policy: %w", err)
	}
	if perMachine {
		return fmt.Errorf("Windows policy enforces machine-wide proxy settings; use Open Chrome through Network Shark instead")
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, internetSettingsKey,
		registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return fmt.Errorf("open registry key: %w", err)
	}
	defer k.Close()

	previous, err := readSettings(k)
	if err != nil {
		return fmt.Errorf("read existing proxy settings: %w", err)
	}
	if originalSettings != nil {
		previous = *originalSettings
	}

	rollback := func(setErr error) error {
		if restoreErr := writeSettings(k, previous); restoreErr != nil {
			return fmt.Errorf("%w (rollback failed: %v)", setErr, restoreErr)
		}
		notifyAll()
		return setErr
	}

	// Clear any leftover PAC config so Chrome doesn't prefer it over ProxyServer.
	if err := deleteIfPresent(k, "AutoConfigURL"); err != nil {
		return rollback(fmt.Errorf("clear AutoConfigURL: %w", err))
	}

	if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
		return rollback(fmt.Errorf("set ProxyEnable: %w", err))
	}
	if err := k.SetStringValue("ProxyServer", fmt.Sprintf("%s:%d", host, port)); err != nil {
		return rollback(fmt.Errorf("set ProxyServer: %w", err))
	}
	// Bypass loopback so the app doesn't route its own traffic through itself.
	if err := k.SetStringValue("ProxyOverride", "localhost;127.0.0.1;<local>"); err != nil {
		return rollback(fmt.Errorf("set ProxyOverride: %w", err))
	}

	if originalSettings == nil {
		originalSettings = &previous
	}
	notifyAll()
	return nil
}

func usesPerMachineProxySettings() (bool, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, proxyPolicyKey, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer k.Close()

	value, _, err := k.GetIntegerValue("ProxySettingsPerUser")
	if errors.Is(err, registry.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return value == 0, nil
}

// Clear restores the exact proxy configuration that was active before Set.
func Clear() error {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	if originalSettings == nil {
		return nil
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, internetSettingsKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("open registry key: %w", err)
	}
	defer k.Close()
	if err := writeSettings(k, *originalSettings); err != nil {
		return fmt.Errorf("restore proxy settings: %w", err)
	}
	originalSettings = nil
	notifyAll()
	return nil
}

func readSettings(k registry.Key) (proxySettings, error) {
	proxyEnable, err := readDWord(k, "ProxyEnable")
	if err != nil {
		return proxySettings{}, err
	}
	proxyServer, err := readString(k, "ProxyServer")
	if err != nil {
		return proxySettings{}, err
	}
	proxyOverride, err := readString(k, "ProxyOverride")
	if err != nil {
		return proxySettings{}, err
	}
	autoConfigURL, err := readString(k, "AutoConfigURL")
	if err != nil {
		return proxySettings{}, err
	}
	return proxySettings{
		proxyEnable:   proxyEnable,
		proxyServer:   proxyServer,
		proxyOverride: proxyOverride,
		autoConfigURL: autoConfigURL,
	}, nil
}

func readDWord(k registry.Key, name string) (dwordSetting, error) {
	value, _, err := k.GetIntegerValue(name)
	if errors.Is(err, registry.ErrNotExist) {
		return dwordSetting{}, nil
	}
	if err != nil {
		return dwordSetting{}, fmt.Errorf("read %s: %w", name, err)
	}
	return dwordSetting{value: uint32(value), present: true}, nil
}

func readString(k registry.Key, name string) (stringSetting, error) {
	value, _, err := k.GetStringValue(name)
	if errors.Is(err, registry.ErrNotExist) {
		return stringSetting{}, nil
	}
	if err != nil {
		return stringSetting{}, fmt.Errorf("read %s: %w", name, err)
	}
	return stringSetting{value: value, present: true}, nil
}

func writeSettings(k registry.Key, settings proxySettings) error {
	if err := writeDWord(k, "ProxyEnable", settings.proxyEnable); err != nil {
		return err
	}
	if err := writeString(k, "ProxyServer", settings.proxyServer); err != nil {
		return err
	}
	if err := writeString(k, "ProxyOverride", settings.proxyOverride); err != nil {
		return err
	}
	return writeString(k, "AutoConfigURL", settings.autoConfigURL)
}

func writeDWord(k registry.Key, name string, setting dwordSetting) error {
	if !setting.present {
		return deleteIfPresent(k, name)
	}
	return k.SetDWordValue(name, setting.value)
}

func writeString(k registry.Key, name string, setting stringSetting) error {
	if !setting.present {
		return deleteIfPresent(k, name)
	}
	return k.SetStringValue(name, setting.value)
}

func deleteIfPresent(k registry.Key, name string) error {
	err := k.DeleteValue(name)
	if errors.Is(err, registry.ErrNotExist) {
		return nil
	}
	return err
}

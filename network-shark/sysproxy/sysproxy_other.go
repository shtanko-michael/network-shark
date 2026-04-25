//go:build !windows

package sysproxy

import (
	"fmt"
	"os/exec"
)

// Set configures the system proxy on macOS/Linux.
func Set(host string, port int) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	// macOS
	if err := runCmd("networksetup", "-setwebproxy", "Wi-Fi", host, fmt.Sprintf("%d", port)); err == nil {
		_ = runCmd("networksetup", "-setsecurewebproxy", "Wi-Fi", host, fmt.Sprintf("%d", port))
		return nil
	}
	// Linux gsettings
	_ = runCmd("gsettings", "set", "org.gnome.system.proxy", "mode", "manual")
	_ = runCmd("gsettings", "set", "org.gnome.system.proxy.http", "host", host)
	_ = runCmd("gsettings", "set", "org.gnome.system.proxy.http", "port", fmt.Sprintf("%d", port))
	_ = addr
	return nil
}

// Clear removes the system proxy setting.
func Clear() {
	// macOS
	_ = runCmd("networksetup", "-setwebproxystate", "Wi-Fi", "off")
	_ = runCmd("networksetup", "-setsecurewebproxystate", "Wi-Fi", "off")
	// Linux
	_ = runCmd("gsettings", "set", "org.gnome.system.proxy", "mode", "none")
}

func runCmd(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}

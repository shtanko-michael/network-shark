//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"network-shark/proxy"
)

type chromeLocalState struct {
	Profile struct {
		LastUsed string `json:"last_used"`
	} `json:"profile"`
}

func launchChromeWithProxy(port int) error {
	if err := ensureChromeCanLaunch(); err != nil {
		return err
	}

	chromePath, err := findChromePath()
	if err != nil {
		return err
	}
	profile, err := chromeLastUsedProfile()
	if err != nil {
		return err
	}
	proxySetting := fmt.Sprintf("127.0.0.1:%d", port)

	args := []string{
		"--profile-directory=" + profile,
		"--proxy-server=" + proxySetting,
		// Route loopback through proxy too (lets us inspect local dev servers).
		"--proxy-bypass-list=<-loopback>",
		// Extensions with webRequest/proxy permissions intercept traffic before it
		// reaches the OS proxy and will silently bypass our MITM. Disable them.
		"--disable-extensions",
		"--disable-quic",
		"--no-first-run",
		"--new-window",
	}

	proxy.LogChromeLaunch(profile, proxySetting)
	return exec.Command(chromePath, args...).Start()
}

func forceRestartChromeWithProxy(port int) error {
	if err := killChromeProcesses(); err != nil {
		return err
	}
	if err := waitForChromeExit(5 * time.Second); err != nil {
		return err
	}
	return launchChromeWithProxy(port)
}

func ensureChromeCanLaunch() error {
	running, err := isChromeRunning()
	if err != nil {
		return err
	}
	if running {
		return fmt.Errorf("Chrome is already running. Close all Chrome windows and try again so proxy flags apply")
	}
	return nil
}

func isChromeRunning() (bool, error) {
	out, err := exec.Command("tasklist.exe", "/FI", "IMAGENAME eq chrome.exe", "/NH").CombinedOutput()
	if err != nil {
		return false, fmt.Errorf("check Chrome process: %w", err)
	}
	return strings.Contains(strings.ToLower(string(out)), "chrome.exe"), nil
}

func killChromeProcesses() error {
	running, err := isChromeRunning()
	if err != nil {
		return err
	}
	if !running {
		return nil
	}
	out, err := exec.Command("taskkill.exe", "/F", "/T", "/IM", "chrome.exe").CombinedOutput()
	if err != nil {
		return fmt.Errorf("kill Chrome processes: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func waitForChromeExit(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		running, err := isChromeRunning()
		if err != nil {
			return err
		}
		if !running {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("Chrome did not exit within %s", timeout)
}

func findChromePath() (string, error) {
	candidates := []string{
		filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "Application", "chrome.exe"),
	}
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("Chrome executable not found")
}

func chromeLastUsedProfile() (string, error) {
	localStatePath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "User Data", "Local State")
	data, err := os.ReadFile(localStatePath)
	if err != nil {
		return "", fmt.Errorf("read Chrome Local State: %w", err)
	}

	var state chromeLocalState
	if err := json.Unmarshal(data, &state); err != nil {
		return "", fmt.Errorf("parse Chrome Local State: %w", err)
	}

	profile := strings.TrimSpace(state.Profile.LastUsed)
	if profile == "" {
		profile = "Default"
	}
	return profile, nil
}

//go:build !windows

package main

import "fmt"

func launchChromeWithProxy(_ int) error {
	return fmt.Errorf("Chrome launch is only supported on Windows")
}

func ensureChromeCanLaunch() error {
	return fmt.Errorf("Chrome launch is only supported on Windows")
}

func forceRestartChromeWithProxy(_ int) error {
	return fmt.Errorf("Chrome launch is only supported on Windows")
}

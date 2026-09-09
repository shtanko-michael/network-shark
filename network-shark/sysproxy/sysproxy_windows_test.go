//go:build windows

package sysproxy

import (
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"golang.org/x/sys/windows/registry"
)

func TestProxySettingsRoundTripPreservesPACAndMissingValues(t *testing.T) {
	keyPath := fmt.Sprintf(`Software\NetworkSharkTest_%d_%d`, os.Getpid(), time.Now().UnixNano())
	k, _, err := registry.CreateKey(registry.CURRENT_USER, keyPath, registry.ALL_ACCESS)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		k.Close()
		_ = registry.DeleteKey(registry.CURRENT_USER, keyPath)
	})

	original := proxySettings{
		proxyEnable:   dwordSetting{value: 0, present: true},
		proxyServer:   stringSetting{value: "corporate-proxy.example:8080", present: true},
		proxyOverride: stringSetting{},
		autoConfigURL: stringSetting{value: "https://proxy.example/proxy.pac", present: true},
	}
	if err := writeSettings(k, original); err != nil {
		t.Fatal(err)
	}

	if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
		t.Fatal(err)
	}
	if err := k.SetStringValue("ProxyServer", "127.0.0.1:9876"); err != nil {
		t.Fatal(err)
	}
	if err := k.SetStringValue("ProxyOverride", "localhost;127.0.0.1;<local>"); err != nil {
		t.Fatal(err)
	}
	if err := deleteIfPresent(k, "AutoConfigURL"); err != nil {
		t.Fatal(err)
	}

	if err := writeSettings(k, original); err != nil {
		t.Fatal(err)
	}
	restored, err := readSettings(k)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(restored, original) {
		t.Fatalf("restored settings = %#v, want %#v", restored, original)
	}
}

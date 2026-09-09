package proxy

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestConnectIsCapturedBeforeTunnelClosesWithoutTrustedCA(t *testing.T) {
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()

	targetAccepted := make(chan net.Conn, 1)
	go func() {
		conn, acceptErr := targetLn.Accept()
		if acceptErr == nil {
			targetAccepted <- conn
		}
	}()

	captured := make(chan CapturedRequest, 2)
	p := &Proxy{callback: func(req CapturedRequest) { captured <- req }}
	proxyLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer proxyLn.Close()

	server := &http.Server{Handler: http.HandlerFunc(p.dispatch)}
	defer server.Close()
	go server.Serve(proxyLn)

	client, err := net.Dial("tcp", proxyLn.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	targetAddr := targetLn.Addr().String()
	if _, err := fmt.Fprintf(client, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", targetAddr, targetAddr); err != nil {
		t.Fatal(err)
	}

	reader := bufio.NewReader(client)
	status, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(status, "200 Connection Established") {
		t.Fatalf("unexpected CONNECT response: %q", status)
	}
	for {
		line, readErr := reader.ReadString('\n')
		if readErr != nil {
			t.Fatal(readErr)
		}
		if line == "\r\n" {
			break
		}
	}

	var targetConn net.Conn
	select {
	case targetConn = <-targetAccepted:
		defer targetConn.Close()
	case <-time.After(time.Second):
		t.Fatal("origin did not receive the CONNECT tunnel")
	}

	select {
	case req := <-captured:
		if req.Host != strings.Split(targetAddr, ":")[0] {
			t.Fatalf("captured host = %q, want %q", req.Host, targetAddr)
		}
	case <-time.After(300 * time.Millisecond):
		t.Fatal("CONNECT was not captured while the tunnel remained open")
	}
}

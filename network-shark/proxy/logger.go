package proxy

import (
	"fmt"
	"strings"
	"time"
)

// ANSI colour codes — work in Windows Terminal, PowerShell 7, and wails dev console.
const (
	ansiReset  = "\033[0m"
	ansiBold   = "\033[1m"
	ansiDim    = "\033[2m"
	ansiRed    = "\033[31m"
	ansiGreen  = "\033[32m"
	ansiYellow = "\033[33m"
	ansiBlue   = "\033[34m"
	ansiCyan   = "\033[36m"
	ansiGray   = "\033[90m"
	ansiWhite  = "\033[97m"
)

func ts() string {
	return ansiGray + time.Now().Format("15:04:05.000") + ansiReset
}

func tag(label, color string) string {
	return color + ansiBold + label + ansiReset
}

// LogStart prints a startup banner.
func LogStart(port int) {
	fmt.Printf("\n%s %s %s\n",
		ts(),
		tag("  PROXY START  ", "\033[42;30m"), // green bg
		fmt.Sprintf(ansiGreen+ansiBold+"listening on 127.0.0.1:%d"+ansiReset+"  "+ansiGray+"PAC → http://127.0.0.1:%d/proxy.pac"+ansiReset, port, port),
	)
	fmt.Printf("%s %s\n\n",
		strings.Repeat(" ", 13),
		ansiGray+"Configure system proxy using the ● button. Chrome will pick up the PAC automatically."+ansiReset,
	)
}

// LogStop prints a shutdown line.
func LogStop() {
	fmt.Printf("\n%s %s\n\n", ts(), tag("  PROXY STOP  ", "\033[41;97m")) // red bg
}

// LogPAC logs when the PAC file is fetched (e.g. by Chrome on startup).
func LogPAC(remoteAddr string) {
	fmt.Printf("%s %s  %s\n",
		ts(),
		tag(" PAC ", ansiGray),
		ansiGray+"fetched by "+remoteAddr+ansiReset,
	)
}

// LogHTTP logs a completed HTTP request.
func LogHTTP(method, url string, status int, transferred int64, dur time.Duration) {
	statusStr, statusColor := fmtStatus(status)
	fmt.Printf("%s %s  %s %s %s %s %s\n",
		ts(),
		tag(" HTTP  ", ansiBlue),
		fmtMethod(method),
		ansiWhite+truncate(url, 72)+ansiReset,
		statusColor+statusStr+ansiReset,
		ansiGray+fmtSize(transferred)+ansiReset,
		ansiCyan+fmtDur(dur)+ansiReset,
	)
}

// LogCONNECT logs a completed HTTPS CONNECT tunnel.
func LogCONNECT(host string, transferred int64, dur time.Duration) {
	fmt.Printf("%s %s  %s %s %s\n",
		ts(),
		tag(" HTTPS ", ansiCyan),
		ansiWhite+ansiBold+host+ansiReset,
		ansiGray+fmtSize(transferred)+ansiReset,
		ansiCyan+fmtDur(dur)+ansiReset,
	)
}

// LogError logs a failed request.
func LogError(method, target, errMsg string, dur time.Duration) {
	fmt.Printf("%s %s  %s %s %s %s\n",
		ts(),
		tag(" FAIL  ", ansiRed),
		fmtMethod(method),
		ansiWhite+truncate(target, 60)+ansiReset,
		ansiRed+truncate(errMsg, 50)+ansiReset,
		ansiGray+fmtDur(dur)+ansiReset,
	)
}

// Banner returns a startup ASCII banner for the console.
func Banner() string {
	return ansiCyan + ansiBold + `
  _   _     ____      _____  _                _
 | \ | |   / ____|   / ____|| |              | |
 |  \| |  | (___    | (___  | |__   __ _ _ __| | __
 | . ` + "`" + `| |   \___ \    \___ \ | '_ \ / _` + "`" + `| '__| |/ /
 | |\  |   ____) |  ____) || | | | (_| | |  |   <
 |_| \_|  |_____/  |_____/ |_| |_|\__,_|_|  |_|\_\
` + ansiReset + ansiGray + "  Desktop network inspector  ·  Wails + Go + React\n" + ansiReset
}

// LogMITM logs a successful MITM TLS interception for a host.
func LogMITM(host string) {
	fmt.Printf("%s %s  %s\n",
		ts(),
		tag(" MITM  ", "\033[35m"), // magenta
		ansiWhite+ansiBold+host+ansiReset,
	)
}

// LogMITMFail logs when MITM interception fails (handshake error, etc.).
func LogMITMFail(host, reason string) {
	fmt.Printf("%s %s  %s %s\n",
		ts(),
		tag(" MITM  ", "\033[35m"),
		ansiWhite+host+ansiReset,
		ansiRed+truncate(reason, 60)+ansiReset,
	)
}

// LogSysproxy logs system proxy changes.
func LogSysproxy(action, detail string) {
	icon := "▲"
	color := ansiGreen
	if action == "CLEAR" {
		icon = "▼"
		color = ansiYellow
	}
	fmt.Printf("%s %s  %s %s\n",
		ts(),
		tag(" SYS   ", ansiYellow),
		color+icon+" "+action+ansiReset,
		ansiGray+detail+ansiReset,
	)
}

// LogChromeLaunch prints the exact Chrome profile/proxy launch intent.
func LogChromeLaunch(profile, proxyURL string) {
	fmt.Printf("%s %s  %s %s\n",
		ts(),
		tag(" CHROME ", ansiBlue),
		ansiWhite+profile+ansiReset,
		ansiGray+"proxy "+proxyURL+" · QUIC disabled"+ansiReset,
	)
}

// ---- formatting helpers ---------------------------------------------------

func fmtStatus(s int) (string, string) {
	str := fmt.Sprintf("%d", s)
	switch {
	case s == 0:
		return "ERR", ansiRed
	case s < 300:
		return str, ansiGreen
	case s < 400:
		return str, ansiYellow
	default:
		return str, ansiRed
	}
}

func fmtMethod(m string) string {
	colors := map[string]string{
		"GET":     ansiGreen,
		"POST":    ansiYellow,
		"PUT":     ansiBlue,
		"PATCH":   ansiCyan,
		"DELETE":  ansiRed,
		"HEAD":    ansiGray,
		"OPTIONS": ansiGray,
		"CONNECT": ansiCyan,
	}
	c, ok := colors[m]
	if !ok {
		c = ansiWhite
	}
	return fmt.Sprintf("%s%-7s%s", c+ansiBold, m, ansiReset)
}

func fmtSize(b int64) string {
	switch {
	case b == 0:
		return "0 B"
	case b < 1024:
		return fmt.Sprintf("%d B", b)
	case b < 1024*1024:
		return fmt.Sprintf("%.1f kB", float64(b)/1024)
	default:
		return fmt.Sprintf("%.2f MB", float64(b)/(1024*1024))
	}
}

func fmtDur(d time.Duration) string {
	ms := float64(d.Microseconds()) / 1000.0
	if ms < 1000 {
		return fmt.Sprintf("%.0fms", ms)
	}
	return fmt.Sprintf("%.2fs", ms/1000)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

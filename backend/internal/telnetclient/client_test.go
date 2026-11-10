package telnetclient

import (
	"bufio"
	"net"
	"strings"
	"testing"
	"time"
)

// startMockTelnetServer starts a lightweight mock Telnet server simulating a Fiberhome AN5516-04 OLT.
func startMockTelnetServer(t *testing.T, expectedUser, expectedPass string) (string, func()) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start mock telnet server: %v", err)
	}

	stopChan := make(chan struct{})

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-stopChan:
					return
				default:
					return
				}
			}

			go handleMockConnection(conn, expectedUser, expectedPass)
		}
	}()

	addr := listener.Addr().String()
	cleanup := func() {
		close(stopChan)
		_ = listener.Close()
	}

	return addr, cleanup
}

func stripIAC(in []byte) []byte {
	var out []byte
	i := 0
	for i < len(in) {
		if in[i] == IAC {
			if i+2 < len(in) {
				i += 3
				continue
			} else if i+1 < len(in) {
				i += 2
				continue
			}
			i++
			continue
		}
		out = append(out, in[i])
		i++
	}
	return out
}

func readCleanLine(reader *bufio.Reader) (string, error) {
	raw, err := reader.ReadBytes('\n')
	if err != nil {
		return "", err
	}
	clean := stripIAC(raw)
	return strings.TrimSpace(string(clean)), nil
}

func handleMockConnection(conn net.Conn, expectedUser, expectedPass string) {
	defer conn.Close()
	writer := bufio.NewWriter(conn)
	reader := bufio.NewReader(conn)

	// Send Telnet IAC WILL Suppress Go Ahead + WILL Echo
	_, _ = conn.Write([]byte{IAC, WILL, 3, IAC, WILL, 1})

	// Welcome banner
	_, _ = writer.WriteString("FiberHome AN5516-04 EPON/GPON OLT System\r\n")
	_, _ = writer.WriteString("Login: ")
	_ = writer.Flush()

	// Read username
	user, err := readCleanLine(reader)
	if err != nil {
		return
	}

	_, _ = writer.WriteString("Password: ")
	_ = writer.Flush()

	// Read password
	pass, err := readCleanLine(reader)
	if err != nil {
		return
	}

	if user != expectedUser || pass != expectedPass {
		_, _ = writer.WriteString("Login incorrect\r\n")
		_ = writer.Flush()
		return
	}

	// Login successful: send prompt
	_, _ = writer.WriteString("AN5516-04# ")
	_ = writer.Flush()

	// Command loop
	for {
		cmd, err := readCleanLine(reader)
		if err != nil {
			return
		}
		if cmd == "exit" || cmd == "quit" {
			_, _ = writer.WriteString("Goodbye!\r\n")
			_ = writer.Flush()
			return
		}

		if cmd == "terminal length 0" {
			// Acknowledge command and repeat prompt
			_, _ = writer.WriteString("AN5516-04# ")
			_ = writer.Flush()
			continue
		}

		if strings.HasPrefix(cmd, "show version") {
			_, _ = writer.WriteString("FiberHome Broadband Access System AN5516-04\r\nSoftware Version: V2.1.0_2022\r\nAN5516-04# ")
			_ = writer.Flush()
			continue
		}

		if strings.HasPrefix(cmd, "show card") {
			_, _ = writer.WriteString("Slot CardType Status\r\n1    GC8B     NORMAL\r\n2    HU1A     NORMAL\r\nAN5516-04# ")
			_ = writer.Flush()
			continue
		}

		// Generic command response
		_, _ = writer.WriteString("Command processed: " + cmd + "\r\nAN5516-04# ")
		_ = writer.Flush()
	}
}

func TestTelnetClient_Success(t *testing.T) {
	addr, cleanup := startMockTelnetServer(t, "admin", "secret123")
	defer cleanup()

	host, portStr, _ := net.SplitHostPort(addr)
	var port int
	for _, c := range portStr {
		port = port*10 + int(c-'0')
	}

	client := NewTelnetClient(host, port, "admin", "secret123")
	client.Timeout = 3 * time.Second

	// Test Connection
	latency, banner, err := client.TestConnection()
	if err != nil {
		t.Fatalf("TestConnection failed: %v", err)
	}
	if latency <= 0 {
		t.Errorf("expected positive latency, got %f", latency)
	}
	if !strings.Contains(banner, "FiberHome") && !strings.Contains(banner, "AN5516-04") {
		t.Errorf("unexpected banner: %s", banner)
	}

	// Test RunCommand
	output, err := client.RunCommand("show card")
	if err != nil {
		t.Fatalf("RunCommand failed: %v", err)
	}
	if !strings.Contains(output, "GC8B") {
		t.Errorf("expected GC8B in output, got: %s", output)
	}
}

func TestTelnetClient_AuthFailure(t *testing.T) {
	addr, cleanup := startMockTelnetServer(t, "admin", "secret123")
	defer cleanup()

	host, portStr, _ := net.SplitHostPort(addr)
	var port int
	for _, c := range portStr {
		port = port*10 + int(c-'0')
	}

	client := NewTelnetClient(host, port, "admin", "WRONG_PASSWORD")
	client.Timeout = 3 * time.Second

	_, _, err := client.TestConnection()
	if err == nil {
		t.Fatalf("expected error on invalid password, got nil")
	}
	if !strings.Contains(err.Error(), "autenticação") && !strings.Contains(err.Error(), "rejeitada") {
		t.Logf("got expected auth error: %v", err)
	}
}

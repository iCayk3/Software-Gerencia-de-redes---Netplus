package sshclient

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"network-software/internal/crypto"

	"golang.org/x/crypto/ssh"
)

// CloseAllPools is maintained for backwards compatibility.
// Because we use clean, dedicated sessions that release router VTY lines immediately,
// this function acts as a safe no-op.
func CloseAllPools() {
	// No-op: connections are cleanly terminated per operation, preventing router VTY exhaustion.
}

// SSHClient manages direct, robust SSH connections to network routers (Huawei, MikroTik, Datacom).
// It avoids persistent connection pooling deadlocks and releases router VTY lines immediately after execution.
type SSHClient struct {
	Host     string
	Port     int
	Username string
	Password string
	Timeout  time.Duration
}

// NewSSHClient creates a new client configuration.
func NewSSHClient(host string, port int, username, password string) *SSHClient {
	if port <= 0 {
		port = 22
	}
	// Defensive check: if password is still ciphertext (e.g. from an edge load), decrypt it
	if strings.HasPrefix(password, crypto.PrefixV1) {
		if plain, err := crypto.Decrypt(password, crypto.GetEncryptionKey()); err == nil {
			password = plain
		}
	}
	return &SSHClient{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		Timeout:  7 * time.Second,
	}
}

// getSSHConfig constructs a resilient ClientConfig supporting both password and keyboard-interactive
// authentication methods, as well as a wide array of legacy and modern ciphers/KEX/MACs used by network gear.
func (c *SSHClient) getSSHConfig() *ssh.ClientConfig {
	// Support keyboard-interactive (standard on Huawei AAA / RADIUS / TACACS+ / MikroTik interactive mode)
	keyboardInteractiveAuth := ssh.KeyboardInteractive(func(user, instruction string, questions []string, echos []bool) ([]string, error) {
		answers := make([]string, len(questions))
		for i := range questions {
			answers[i] = c.Password
		}
		return answers, nil
	})

	config := &ssh.ClientConfig{
		User: c.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(c.Password),
			keyboardInteractiveAuth,
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         c.Timeout,
	}

	config.KeyExchanges = []string{
		"curve25519-sha256",
		"curve25519-sha256@libssh.org",
		"ecdh-sha2-nistp256",
		"ecdh-sha2-nistp384",
		"ecdh-sha2-nistp521",
		"diffie-hellman-group14-sha256",
		"diffie-hellman-group14-sha1",
		"diffie-hellman-group-exchange-sha256",
		"diffie-hellman-group-exchange-sha1",
		"diffie-hellman-group1-sha1",
	}

	config.Ciphers = []string{
		"aes128-gcm@openssh.com",
		"aes256-gcm@openssh.com",
		"chacha20-poly1305@openssh.com",
		"aes128-ctr",
		"aes192-ctr",
		"aes256-ctr",
		"aes128-cbc",
		"aes256-cbc",
		"3des-cbc",
	}

	config.MACs = []string{
		"hmac-sha2-256-etm@openssh.com",
		"hmac-sha2-512-etm@openssh.com",
		"hmac-sha2-256",
		"hmac-sha2-512",
		"hmac-sha1",
		"hmac-sha1-96",
	}

	return config
}

// dial establishes a direct, deadline-protected SSH connection.
func (c *SSHClient) dial() (*ssh.Client, string, error) {
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	dialer := net.Dialer{Timeout: c.Timeout}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return nil, "", fmt.Errorf("TCP connection to %s failed: %w", addr, err)
	}

	// Enforce strict deadline on SSH handshake to prevent indefinite blocking
	_ = conn.SetDeadline(time.Now().Add(c.Timeout + 3*time.Second))

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, c.getSSHConfig())
	if err != nil {
		_ = conn.Close()
		return nil, "", fmt.Errorf("SSH authentication failed to %s: %w", addr, err)
	}

	// Handshake completed successfully: clear connection deadline for stream handling
	_ = conn.SetDeadline(time.Time{})

	go ssh.DiscardRequests(reqs)
	client := ssh.NewClient(sshConn, chans, reqs)
	banner := string(sshConn.ServerVersion())
	return client, banner, nil
}

// TestConnection verifies credentials and reachability via SSH.
// It establishes a direct connection, measures latency, reads banner, and cleanly closes immediately.
func (c *SSHClient) TestConnection() (float64, string, error) {
	start := time.Now()
	client, banner, err := c.dial()
	if err != nil {
		return 0, "", err
	}
	_ = client.Close()

	latency := float64(time.Since(start).Microseconds()) / 1000.0
	return latency, banner, nil
}

// RunCommand connects directly, executes a single CLI command via SSH exec session, and cleanly disconnects.
func (c *SSHClient) RunCommand(cmd string) (string, error) {
	client, _, err := c.dial()
	if err != nil {
		return "", err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}
	_ = session.RequestPty("vt100", 200, 500, modes)

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	type execResult struct {
		err error
	}
	resultChan := make(chan execResult, 1)

	go func() {
		resultChan <- execResult{err: session.Run(cmd)}
	}()

	select {
	case res := <-resultChan:
		if res.err != nil {
			if stdout.Len() > 0 {
				return cleanOutput(stdout.String()), nil
			}
			return "", fmt.Errorf("command execution failed (%v): %s", res.err, stderr.String())
		}
		return cleanOutput(stdout.String()), nil
	case <-time.After(15 * time.Second):
		return cleanOutput(stdout.String()), fmt.Errorf("command execution timed out after 15s")
	}
}

// RunInteractiveSession executes a sequence of commands inside an interactive shell session,
// handling auto-confirmations [Y/N] and auto-advancing pagers (More) before cleanly disconnecting.
func (c *SSHClient) RunInteractiveSession(commands []string, waitAfterCommand time.Duration) (string, error) {
	if waitAfterCommand <= 0 {
		waitAfterCommand = 600 * time.Millisecond
	}

	client, _, err := c.dial()
	if err != nil {
		return "", err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create interactive session: %w", err)
	}
	defer session.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}
	if err := session.RequestPty("vt100", 200, 500, modes); err != nil {
		return "", fmt.Errorf("failed to request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return "", err
	}

	if err := session.Shell(); err != nil {
		return "", fmt.Errorf("failed to start shell: %w", err)
	}

	var outputBuf bytes.Buffer
	var bufMu sync.Mutex
	done := make(chan struct{})

	go func() {
		buf := make([]byte, 2048)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				chunk := buf[:n]
				bufMu.Lock()
				outputBuf.Write(chunk)
				bufMu.Unlock()

				// Auto-answer password warning or confirmation prompts (e.g. Huawei initial password [Y/N])
				if bytes.Contains(chunk, []byte("[Y/N]")) || bytes.Contains(chunk, []byte("[y/n]")) {
					_, _ = io.WriteString(stdin, "N\n")
				}

				// Auto-advance pagers (Huawei "---- More ----", Cisco/Datacom "--More--")
				if bytes.Contains(chunk, []byte("More")) || bytes.Contains(chunk, []byte("more")) {
					_, _ = io.WriteString(stdin, " ")
				}
			}
			if err != nil {
				break
			}
		}
		close(done)
	}()

	// Brief initial pause for router login banner
	time.Sleep(200 * time.Millisecond)

	for i, cmd := range commands {
		_, _ = io.WriteString(stdin, cmd+"\n")

		// Setup commands (e.g. screen-length 0 temporary, terminal length 0) do not produce large output;
		// use a fast 100ms pause instead of full waitAfterCommand.
		if isSetupCommand(cmd) && i < len(commands)-1 {
			time.Sleep(100 * time.Millisecond)
		} else {
			time.Sleep(waitAfterCommand)
		}
	}

	// Exit user shell cleanly
	_, _ = io.WriteString(stdin, "quit\n")
	_ = stdin.Close()

	select {
	case <-done:
	case <-time.After(2000 * time.Millisecond):
	}

	bufMu.Lock()
	result := cleanOutput(outputBuf.String())
	bufMu.Unlock()

	return result, nil
}

// isSetupCommand checks if the command is a terminal configuration command rather than data query.
func isSetupCommand(cmd string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(cmd))
	return strings.HasPrefix(trimmed, "screen-length") ||
		strings.HasPrefix(trimmed, "terminal length") ||
		strings.HasPrefix(trimmed, "terminal width") ||
		strings.HasPrefix(trimmed, "screen-width")
}

// cleanOutput strips ANSI color escape sequences and carriage returns.
func cleanOutput(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "")

	var b strings.Builder
	inEsc := false
	for i := 0; i < len(s); i++ {
		if s[i] == 0x1b { // ESC
			inEsc = true
			continue
		}
		if inEsc {
			if (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= 'a' && s[i] <= 'z') || s[i] == '~' {
				inEsc = false
			}
			continue
		}
		b.WriteByte(s[i])
	}

	return strings.TrimSpace(b.String())
}

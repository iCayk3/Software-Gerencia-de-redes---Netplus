package sshclient

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// SSHClient wraps connection to a network router or switch.
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
	return &SSHClient{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		Timeout:  10 * time.Second,
	}
}

func (c *SSHClient) getSSHConfig() *ssh.ClientConfig {
	config := &ssh.ClientConfig{
		User: c.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(c.Password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         c.Timeout,
	}

	// Comprehensive cipher & kex compatibility list for Huawei, Datacom, MikroTik, Cisco, etc.
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

	return config
}

// TestConnection verifies if credentials and host are reachable via SSH.
func (c *SSHClient) TestConnection() (float64, string, error) {
	start := time.Now()
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)

	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return 0, "", fmt.Errorf("TCP connection to %s failed: %w", addr, err)
	}
	defer conn.Close()

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, c.getSSHConfig())
	if err != nil {
		return 0, "", fmt.Errorf("SSH authentication failed: %w", err)
	}
	defer sshConn.Close()

	latency := float64(time.Since(start).Microseconds()) / 1000.0
	banner := string(sshConn.ServerVersion())

	// Consume background channels
	go ssh.DiscardRequests(reqs)
	go func() {
		for newCh := range chans {
			_ = newCh.Reject(ssh.Prohibited, "test only")
		}
	}()

	return latency, banner, nil
}

// RunCommand connects, executes a single CLI command via SSH exec session, and returns the output.
func (c *SSHClient) RunCommand(cmd string) (string, error) {
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	client, err := ssh.Dial("tcp", addr, c.getSSHConfig())
	if err != nil {
		return "", fmt.Errorf("SSH dial error to %s: %w", addr, err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	// Request pseudo-terminal (pty) to ensure output is not truncated by terminal modes
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}
	_ = session.RequestPty("vt100", 80, 200, modes)

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	if err := session.Run(cmd); err != nil {
		// Even if error is returned (some network CLIs exit with non-zero on EOF), return buffer if present
		if stdout.Len() > 0 {
			return cleanOutput(stdout.String()), nil
		}
		return "", fmt.Errorf("command execution failed (%v): %s", err, stderr.String())
	}

	return cleanOutput(stdout.String()), nil
}

// RunInteractiveSession executes a sequence of commands inside an interactive shell session.
// This is critical for routers that require disabling terminal paging first (e.g. 'screen-length 0 temporary' or 'terminal length 0').
func (c *SSHClient) RunInteractiveSession(commands []string, waitAfterCommand time.Duration) (string, error) {
	if waitAfterCommand <= 0 {
		waitAfterCommand = 1500 * time.Millisecond
	}

	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	client, err := ssh.Dial("tcp", addr, c.getSSHConfig())
	if err != nil {
		return "", fmt.Errorf("SSH dial error: %w", err)
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
	done := make(chan struct{})

	go func() {
		buf := make([]byte, 2048)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				chunk := buf[:n]
				outputBuf.Write(chunk)

				// Auto-answer security warning or confirmation prompts (e.g. Huawei initial password [Y/N])
				if bytes.Contains(chunk, []byte("[Y/N]")) || bytes.Contains(chunk, []byte("[y/n]")) {
					_, _ = io.WriteString(stdin, "N\n")
				}
			}
			if err != nil {
				break
			}
		}
		close(done)
	}()

	time.Sleep(600 * time.Millisecond)

	for _, cmd := range commands {
		_, _ = io.WriteString(stdin, cmd+"\n")
		time.Sleep(waitAfterCommand)
	}

	_, _ = io.WriteString(stdin, "quit\n")
	_ = stdin.Close()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
	}

	return cleanOutput(outputBuf.String()), nil
}

// cleanOutput strips ANSI color escape sequences and carriage returns.
func cleanOutput(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "")

	// Remove ANSI escape sequences (e.g. \x1b[...m)
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

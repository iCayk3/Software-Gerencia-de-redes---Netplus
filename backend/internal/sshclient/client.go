package sshclient

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// pooledConnection wraps an active SSH client connection with idle tracking and single-channel mutex.
type pooledConnection struct {
	client   *ssh.Client
	banner   string
	lastUsed time.Time
	mu       sync.Mutex // Ensures serial channel allocation on the same network device connection
}

var (
	poolMu   sync.Mutex
	connPool = make(map[string]*pooledConnection)
)

func init() {
	// Background reaper to cleanly close connections that have been idle for > 40 seconds.
	// This ensures router VTY lines are not kept open when NetPulse is idle.
	go func() {
		for {
			time.Sleep(10 * time.Second)
			poolMu.Lock()
			now := time.Now()
			for key, pc := range connPool {
				if now.Sub(pc.lastUsed) > 40*time.Second {
					_ = pc.client.Close()
					delete(connPool, key)
				}
			}
			poolMu.Unlock()
		}
	}()
}

// CloseAllPools closes all currently pooled SSH connections across all devices.
func CloseAllPools() {
	poolMu.Lock()
	defer poolMu.Unlock()
	for key, pc := range connPool {
		_ = pc.client.Close()
		delete(connPool, key)
	}
}

// SSHClient wraps connection to a network router or switch with connection reuse.
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

func (c *SSHClient) poolKey() string {
	pwdHash := sha256.Sum256([]byte(c.Password))
	return fmt.Sprintf("%s:%d:%s:%x", c.Host, c.Port, c.Username, pwdHash[:8])
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

// getPooledClient retrieves an existing warm client or establishes a new one.
func (c *SSHClient) getPooledClient() (*pooledConnection, error) {
	key := c.poolKey()

	poolMu.Lock()
	if pc, ok := connPool[key]; ok {
		// Test if connection is still alive by attempting a lightweight session creation
		testSess, err := pc.client.NewSession()
		if err == nil {
			_ = testSess.Close()
			pc.lastUsed = time.Now()
			poolMu.Unlock()
			return pc, nil
		}
		// Connection failed/closed by remote device
		_ = pc.client.Close()
		delete(connPool, key)
	}
	poolMu.Unlock()

	// Dial fresh SSH connection
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return nil, fmt.Errorf("TCP connection to %s failed: %w", addr, err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, c.getSSHConfig())
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("SSH authentication failed to %s: %w", addr, err)
	}

	// Consume background channels and requests
	go ssh.DiscardRequests(reqs)

	client := ssh.NewClient(sshConn, chans, reqs)
	banner := string(sshConn.ServerVersion())

	pc := &pooledConnection{
		client:   client,
		banner:   banner,
		lastUsed: time.Now(),
	}

	poolMu.Lock()
	connPool[key] = pc
	poolMu.Unlock()

	return pc, nil
}

// evictClient drops the cached connection if it died unexpectedly.
func (c *SSHClient) evictClient() {
	key := c.poolKey()
	poolMu.Lock()
	defer poolMu.Unlock()
	if pc, ok := connPool[key]; ok {
		_ = pc.client.Close()
		delete(connPool, key)
	}
}

// TestConnection verifies if credentials and host are reachable via SSH.
func (c *SSHClient) TestConnection() (float64, string, error) {
	start := time.Now()
	pc, err := c.getPooledClient()
	if err != nil {
		return 0, "", err
	}
	latency := float64(time.Since(start).Microseconds()) / 1000.0
	return latency, pc.banner, nil
}

// RunCommand connects or reuses a pooled connection, executes a single CLI command via SSH exec session, and returns output.
func (c *SSHClient) RunCommand(cmd string) (string, error) {
	pc, err := c.getPooledClient()
	if err != nil {
		return "", err
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	session, err := pc.client.NewSession()
	if err != nil {
		// Cached connection likely dropped by remote host, evict and retry once
		c.evictClient()
		pc, err = c.getPooledClient()
		if err != nil {
			return "", err
		}
		session, err = pc.client.NewSession()
		if err != nil {
			return "", fmt.Errorf("failed to create session: %w", err)
		}
	}
	defer session.Close()

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
		if stdout.Len() > 0 {
			return cleanOutput(stdout.String()), nil
		}
		return "", fmt.Errorf("command execution failed (%v): %s", err, stderr.String())
	}

	pc.lastUsed = time.Now()
	return cleanOutput(stdout.String()), nil
}

// RunInteractiveSession executes a sequence of commands inside an interactive shell session,
// reusing the pooled SSH client connection to eliminate connection churn.
func (c *SSHClient) RunInteractiveSession(commands []string, waitAfterCommand time.Duration) (string, error) {
	if waitAfterCommand <= 0 {
		waitAfterCommand = 1200 * time.Millisecond
	}

	pc, err := c.getPooledClient()
	if err != nil {
		return "", err
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	session, err := pc.client.NewSession()
	if err != nil {
		// Retry once on dropped connection
		c.evictClient()
		pc, err = c.getPooledClient()
		if err != nil {
			return "", err
		}
		session, err = pc.client.NewSession()
		if err != nil {
			return "", fmt.Errorf("failed to create interactive session: %w", err)
		}
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

	// Brief initial pause for shell banner
	time.Sleep(300 * time.Millisecond)

	for i, cmd := range commands {
		_, _ = io.WriteString(stdin, cmd+"\n")

		// Setup commands (e.g. screen-length 0 temporary, terminal length 0) do not produce large tables;
		// use a fast 150ms delay instead of full waitAfterCommand, cutting query latency significantly.
		if isSetupCommand(cmd) && i < len(commands)-1 {
			time.Sleep(150 * time.Millisecond)
		} else {
			time.Sleep(waitAfterCommand)
		}
	}

	_, _ = io.WriteString(stdin, "quit\n")
	_ = stdin.Close()

	select {
	case <-done:
	case <-time.After(2500 * time.Millisecond):
	}

	pc.lastUsed = time.Now()
	return cleanOutput(outputBuf.String()), nil
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

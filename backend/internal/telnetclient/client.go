package telnetclient

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"network-software/internal/crypto"
)

const (
	IAC  = 255 // 0xFF
	DONT = 254 // 0xFE
	DO   = 253 // 0xFD
	WONT = 252 // 0xFC
	WILL = 251 // 0xFB
	SB   = 250 // Subnegotiation begin
	SE   = 240 // Subnegotiation end
)

// TelnetClient manages Telnet connections to network equipment (FiberHome AN5516, AN6000, etc.).
type TelnetClient struct {
	Host     string
	Port     int
	Username string
	Password string
	Timeout  time.Duration
}

// NewTelnetClient creates a new Telnet client configuration.
func NewTelnetClient(host string, port int, username, password string) *TelnetClient {
	if port <= 0 {
		port = 23
	}
	// Decrypt if password is in enc:v1: ciphertext
	if strings.HasPrefix(password, crypto.PrefixV1) {
		if plain, err := crypto.Decrypt(password, crypto.GetEncryptionKey()); err == nil {
			password = plain
		}
	}
	return &TelnetClient{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		Timeout:  8 * time.Second,
	}
}

// dialAndLogin connects, performs Telnet IAC handshake, and logs in with credentials.
// Returns the active net.Conn and the initial prompt banner upon success.
func (c *TelnetClient) dialAndLogin() (net.Conn, string, error) {
	addr := net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return nil, "", fmt.Errorf("falha ao conectar na OLT via Telnet (%s): %w", addr, err)
	}

	_ = conn.SetDeadline(time.Now().Add(c.Timeout))

	var sessionLog bytes.Buffer

	// 1. Read until Username prompt
	userPromptFound, _, err := c.readUntil(conn, &sessionLog, []string{"login:", "username:", "user:", "#", ">"})
	if err != nil {
		_ = conn.Close()
		return nil, "", fmt.Errorf("timeout aguardando prompt de login da OLT (%s): %w", addr, err)
	}

	// If prompt already indicates authenticated session (no password requested)
	if userPromptFound == "#" || userPromptFound == ">" {
		banner := extractBanner(sessionLog.String())
		return conn, banner, nil
	}

	// Send username
	if _, err := conn.Write([]byte(c.Username + "\r\n")); err != nil {
		_ = conn.Close()
		return nil, "", fmt.Errorf("falha ao enviar usuário para OLT: %w", err)
	}

	// 2. Read until Password prompt
	passPromptFound, _, err := c.readUntil(conn, &sessionLog, []string{"password:", "pass:", "#", ">"})
	if err != nil {
		_ = conn.Close()
		return nil, "", fmt.Errorf("timeout aguardando prompt de senha da OLT (%s): %w", addr, err)
	}

	if passPromptFound != "#" && passPromptFound != ">" {
		// Send password
		if _, err := conn.Write([]byte(c.Password + "\r\n")); err != nil {
			_ = conn.Close()
			return nil, "", fmt.Errorf("falha ao enviar senha para OLT: %w", err)
		}
	}

	// 3. Read until command prompt (# or >)
	matched, fullBuf, err := c.readUntil(conn, &sessionLog, []string{"#", ">", "login incorrect", "authentication failed", "bad password", "denied"})
	if err != nil {
		_ = conn.Close()
		return nil, "", fmt.Errorf("falha na autenticação Telnet com a OLT (%s): %w", addr, err)
	}

	lowerBuf := strings.ToLower(fullBuf)
	if strings.Contains(lowerBuf, "login incorrect") ||
		strings.Contains(lowerBuf, "authentication failed") ||
		strings.Contains(lowerBuf, "bad password") ||
		strings.Contains(lowerBuf, "denied") {
		_ = conn.Close()
		return nil, "", fmt.Errorf("autenticação Telnet rejeitada pela OLT (usuário ou senha inválidos)")
	}

	if matched != "#" && matched != ">" {
		_ = conn.Close()
		return nil, "", fmt.Errorf("prompt final não reconhecido após login: %s", fullBuf)
	}

	banner := extractBanner(sessionLog.String())
	return conn, banner, nil
}

// readUntil reads from conn, processing Telnet IAC options on the fly,
// until one of the matchers matches the end of the clean stream or an error occurs.
func (c *TelnetClient) readUntil(conn net.Conn, fullLog *bytes.Buffer, matchers []string) (string, string, error) {
	buf := make([]byte, 1024)
	var accumulated bytes.Buffer

	for {
		n, err := conn.Read(buf)
		if n > 0 {
			clean := processTelnetIAC(conn, buf[:n])
			accumulated.Write(clean)
			if fullLog != nil {
				fullLog.Write(clean)
			}

			currentStr := accumulated.String()
			trimmed := strings.TrimSpace(currentStr)

			for _, m := range matchers {
				lowerTrimmed := strings.ToLower(trimmed)
				lowerM := strings.ToLower(m)

				if strings.HasSuffix(lowerTrimmed, lowerM) || strings.Contains(lowerTrimmed, lowerM) {
					return m, currentStr, nil
				}
			}
		}

		if err != nil {
			if errors.Is(err, io.EOF) {
				return "", accumulated.String(), io.EOF
			}
			return "", accumulated.String(), err
		}
	}
}

// processTelnetIAC parses incoming raw Telnet bytes, replies to IAC negotiations,
// and returns pure ASCII/UTF-8 application text.
func processTelnetIAC(conn net.Conn, in []byte) []byte {
	var out []byte
	i := 0
	for i < len(in) {
		if in[i] == IAC && i+1 < len(in) {
			cmd := in[i+1]
			if cmd == DO || cmd == DONT || cmd == WILL || cmd == WONT {
				if i+2 < len(in) {
					opt := in[i+2]
					// Respond cleanly to options to keep session in raw mode
					if cmd == DO {
						_, _ = conn.Write([]byte{IAC, WONT, opt})
					} else if cmd == WILL {
						if opt == 3 { // Suppress Go Ahead
							_, _ = conn.Write([]byte{IAC, DO, opt})
						} else {
							_, _ = conn.Write([]byte{IAC, DONT, opt})
						}
					}
					i += 3
					continue
				}
			} else if cmd == SB {
				// Skip subnegotiation sequence until IAC SE
				j := i + 2
				for j+1 < len(in) && !(in[j] == IAC && in[j+1] == SE) {
					j++
				}
				i = j + 2
				continue
			} else if cmd == IAC {
				// Escaped literal IAC
				out = append(out, IAC)
				i += 2
				continue
			}
			i += 2
			continue
		}
		out = append(out, in[i])
		i++
	}
	return out
}

func extractBanner(fullOutput string) string {
	lines := strings.Split(fullOutput, "\n")
	var useful []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" &&
			!strings.HasPrefix(strings.ToLower(trimmed), "login:") &&
			!strings.HasPrefix(strings.ToLower(trimmed), "username:") &&
			!strings.HasPrefix(strings.ToLower(trimmed), "password:") {
			useful = append(useful, trimmed)
		}
	}
	if len(useful) > 0 {
		return strings.Join(useful, " | ")
	}
	return "FiberHome OLT Telnet Terminal"
}

// TestConnection verifies credentials and reachability via Telnet.
// It connects, measures latency, captures prompt/banner, and cleanly disconnects.
func (c *TelnetClient) TestConnection() (float64, string, error) {
	start := time.Now()
	conn, banner, err := c.dialAndLogin()
	if err != nil {
		return 0, "", err
	}
	defer conn.Close()

	latency := float64(time.Since(start).Microseconds()) / 1000.0
	// Send clean exit
	_, _ = conn.Write([]byte("exit\r\n"))

	return latency, banner, nil
}

// RunCommand connects to the OLT, disables paging, sends the command,
// captures output until the prompt returns, and cleanly disconnects.
func (c *TelnetClient) RunCommand(cmd string) (string, error) {
	conn, _, err := c.dialAndLogin()
	if err != nil {
		return "", err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))

	// Optionally disable pagination (terminal length 0) and consume its prompt
	_, _ = conn.Write([]byte("terminal length 0\r\n"))
	var pagingLog bytes.Buffer
	_, _, _ = c.readUntil(conn, &pagingLog, []string{"#", ">"})

	// Send requested command
	_, err = conn.Write([]byte(strings.TrimSpace(cmd) + "\r\n"))
	if err != nil {
		return "", fmt.Errorf("falha ao enviar comando para OLT: %w", err)
	}

	// Read until next prompt (# or >)
	var outputLog bytes.Buffer
	_, fullOutput, err := c.readUntil(conn, &outputLog, []string{"#", ">"})
	if err != nil && !errors.Is(err, io.EOF) {
		return cleanOutput(fullOutput, cmd), fmt.Errorf("timeout ou erro lendo retorno do comando: %w", err)
	}

	// Send exit
	_, _ = conn.Write([]byte("exit\r\n"))

	return cleanOutput(fullOutput, cmd), nil
}

// cleanOutput removes command echo and trailing prompt, returning clean readable output.
func cleanOutput(raw, cmd string) string {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")

	lines := strings.Split(raw, "\n")
	var result []string
	cleanCmd := strings.TrimSpace(strings.ToLower(cmd))

	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		// Skip echoes of terminal length 0 or the command itself
		if strings.ToLower(trimmed) == "terminal length 0" ||
			strings.ToLower(trimmed) == cleanCmd ||
			strings.HasPrefix(strings.ToLower(trimmed), cleanCmd) {
			continue
		}
		result = append(result, l)
	}

	// Remove trailing prompt from the last lines if present
	for len(result) > 0 {
		last := strings.TrimSpace(result[len(result)-1])
		if last == "#" || last == ">" ||
			strings.HasSuffix(last, "#") ||
			strings.HasSuffix(last, ">") {
			result = result[:len(result)-1]
		} else {
			break
		}
	}

	cleaned := strings.TrimSpace(strings.Join(result, "\n"))
	if cleaned == "" {
		return "(Comando executado com sucesso sem retorno de texto)"
	}
	return cleaned
}

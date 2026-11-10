package zabbix

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"network-software/internal/models"
)

// RPCRequest represents a standard Zabbix JSON-RPC 2.0 request.
type RPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	Auth    interface{} `json:"auth,omitempty"`
	ID      int         `json:"id"`
}

// RPCResponse represents a standard Zabbix JSON-RPC 2.0 response.
type RPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
	ID      int             `json:"id"`
}

// RPCError represents an error returned by Zabbix API.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    string `json:"data"`
}

func (e *RPCError) Error() string {
	if e.Data != "" {
		return fmt.Sprintf("Zabbix API error [%d]: %s (%s)", e.Code, e.Message, e.Data)
	}
	return fmt.Sprintf("Zabbix API error [%d]: %s", e.Code, e.Message)
}

// Client interacts with the Zabbix JSON-RPC 2.0 API.
type Client struct {
	endpoint   string
	apiToken   string
	username   string
	password   string
	httpClient *http.Client
	mu         sync.Mutex
	sessionID  string
}

// NormalizeZabbixURL cleans up and fixes the Zabbix API endpoint URL.
func NormalizeZabbixURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	rawURL = strings.TrimRight(rawURL, "/")

	if rawURL == "" {
		return ""
	}

	// If protocol is missing, default to http:// (or https:// if port is 443)
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		if strings.Contains(rawURL, ":443") || strings.Contains(rawURL, ":8443") {
			rawURL = "https://" + rawURL
		} else {
			rawURL = "http://" + rawURL
		}
	}

	// Cloudflare and standard reverse proxies on port 8080/8880 serve plain HTTP, not TLS.
	// If user typed https://host:8080, auto-switch to http://host:8080 to prevent SSL wrong version number.
	if strings.HasPrefix(rawURL, "https://") && (strings.Contains(rawURL, ":8080") || strings.Contains(rawURL, ":8880")) {
		rawURL = "http://" + strings.TrimPrefix(rawURL, "https://")
	}

	if !strings.HasSuffix(rawURL, "api_jsonrpc.php") {
		rawURL = rawURL + "/api_jsonrpc.php"
	}
	return rawURL
}

// NewClient creates a new Zabbix API client from configuration.
func NewClient(cfg models.ZabbixConfig) (*Client, error) {
	if cfg.URL == "" {
		return nil, errors.New("zabbix URL cannot be empty")
	}

	rawURL := NormalizeZabbixURL(cfg.URL)

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid zabbix URL: %w", err)
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // Allows corporate self-signed NOC certs
	}

	return &Client{
		endpoint: parsed.String(),
		apiToken: strings.TrimSpace(cfg.APIToken),
		username: strings.TrimSpace(cfg.Username),
		password: cfg.Password,
		httpClient: &http.Client{
			Timeout:   12 * time.Second,
			Transport: transport,
		},
	}, nil
}

// doRPC executes an RPC call against the Zabbix API.
func (c *Client) doRPC(ctx context.Context, method string, params interface{}, useAuth bool) (json.RawMessage, error) {
	reqBody := RPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      1,
	}

	if useAuth {
		if c.apiToken != "" {
			reqBody.Auth = c.apiToken
		} else if c.sessionID != "" {
			reqBody.Auth = c.sessionID
		}
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.endpoint, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json-rpc")
	httpReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	if c.apiToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiToken)
	}

	resp, err := c.httpClient.Do(httpReq)
	// If HTTPS failed due to SSL wrong version number (common when port 8080 is used), fallback to HTTP
	if err != nil && strings.HasPrefix(c.endpoint, "https://") {
		httpEndpoint := "http://" + strings.TrimPrefix(c.endpoint, "https://")
		if retryReq, retryErr := http.NewRequestWithContext(ctx, "POST", httpEndpoint, bytes.NewReader(data)); retryErr == nil {
			retryReq.Header.Set("Content-Type", "application/json-rpc")
			retryReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
			if c.apiToken != "" {
				retryReq.Header.Set("Authorization", "Bearer "+c.apiToken)
			}
			if retryResp, retryDoErr := c.httpClient.Do(retryReq); retryDoErr == nil {
				c.endpoint = httpEndpoint // Update endpoint permanently
				resp = retryResp
				err = nil
			}
		}
	}
	if err != nil {
		return nil, fmt.Errorf("zabbix request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("zabbix server returned HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var rpcResp RPCResponse
	if err := json.Unmarshal(bodyBytes, &rpcResp); err != nil {
		return nil, fmt.Errorf("failed to parse zabbix json: %w (raw: %s)", err, string(bodyBytes))
	}

	if rpcResp.Error != nil {
		return nil, rpcResp.Error
	}

	return rpcResp.Result, nil
}

// ensureAuth logs in using username/password if no API token is configured.
func (c *Client) ensureAuth(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.apiToken != "" {
		return nil // Bearer API token is ready
	}

	if c.sessionID != "" {
		return nil // Already logged in
	}

	if c.username == "" || c.password == "" {
		return errors.New("no api_token or username/password configured for Zabbix")
	}

	loginParams := map[string]string{
		"username": c.username,
		"password": c.password,
	}

	res, err := c.doRPC(ctx, "user.login", loginParams, false)
	if err != nil {
		// Fallback for Zabbix < 5.4 where parameter name was "user" instead of "username"
		loginParamsLegacy := map[string]string{
			"user":     c.username,
			"password": c.password,
		}
		res, err = c.doRPC(ctx, "user.login", loginParamsLegacy, false)
		if err != nil {
			return fmt.Errorf("login failed: %w", err)
		}
	}

	var token string
	if err := json.Unmarshal(res, &token); err != nil {
		return fmt.Errorf("failed to parse login token: %w", err)
	}

	c.sessionID = token
	return nil
}

// TestConnection verifies connectivity to Zabbix and returns server version.
func (c *Client) TestConnection(ctx context.Context) (*models.ZabbixTestResult, error) {
	// 1. Check API version (requires no auth)
	verRaw, err := c.doRPC(ctx, "apiinfo.version", []interface{}{}, false)
	if err != nil {
		return &models.ZabbixTestResult{
			Success: false,
			Error:   fmt.Sprintf("Falha ao contatar Zabbix API: %v", err),
		}, err
	}

	var version string
	_ = json.Unmarshal(verRaw, &version)

	// 2. Test authentication
	if err := c.ensureAuth(ctx); err != nil {
		return &models.ZabbixTestResult{
			Success: false,
			Version: version,
			Error:   fmt.Sprintf("Zabbix online (v%s), mas falhou na autenticação: %v", version, err),
		}, err
	}

	return &models.ZabbixTestResult{
		Success: true,
		Version: version,
	}, nil
}

// ZabbixHost represents partial host structure returned by host.get.
type ZabbixHost struct {
	HostID string `json:"hostid"`
	Host   string `json:"host"`
	Name   string `json:"name"`
}

// ZabbixItem represents an item returned by item.get.
type ZabbixItem struct {
	ItemID    string `json:"itemid"`
	Name      string `json:"name"`
	Key       string `json:"key_"`
	LastValue string `json:"lastvalue"`
	Units     string `json:"units,omitempty"`
	Status    string `json:"status"` // 0 = enabled
}

// GetHostInterfaces queries Zabbix for network interface items belonging to a host.
func (c *Client) GetHostInterfaces(ctx context.Context, hostIP, hostName string) ([]string, error) {
	if err := c.ensureAuth(ctx); err != nil {
		return nil, err
	}

	// 1. Locate host in Zabbix
	hostID, err := c.findHostID(ctx, hostIP, hostName)
	if err != nil {
		return nil, err
	}

	// 2. Fetch items for this host
	itemParams := map[string]interface{}{
		"hostids": []string{hostID},
		"output":  []string{"itemid", "name", "key_", "status"},
		"filter": map[string]interface{}{
			"status": 0, // Enabled items only
		},
	}

	res, err := c.doRPC(ctx, "item.get", itemParams, true)
	if err != nil {
		return nil, fmt.Errorf("item.get failed: %w", err)
	}

	var items []ZabbixItem
	if err := json.Unmarshal(res, &items); err != nil {
		return nil, fmt.Errorf("failed to parse items: %w", err)
	}

	// 3. Extract and deduplicate interface names
	return ExtractInterfacesFromItems(items), nil
}

func (c *Client) findHostID(ctx context.Context, hostIP, hostName string) (string, error) {
	// Try searching by IP in host interfaces
	if hostIP != "" {
		params := map[string]interface{}{
			"output": []string{"hostid", "host", "name"},
			"filter": map[string]interface{}{
				"ip": []string{hostIP},
			},
		}
		if res, err := c.doRPC(ctx, "host.get", params, true); err == nil {
			var hosts []ZabbixHost
			if err := json.Unmarshal(res, &hosts); err == nil && len(hosts) > 0 {
				return hosts[0].HostID, nil
			}
		}
	}

	// Try searching by host name
	if hostName != "" {
		params := map[string]interface{}{
			"output": []string{"hostid", "host", "name"},
			"filter": map[string]interface{}{
				"host": []string{hostName},
			},
		}
		if res, err := c.doRPC(ctx, "host.get", params, true); err == nil {
			var hosts []ZabbixHost
			if err := json.Unmarshal(res, &hosts); err == nil && len(hosts) > 0 {
				return hosts[0].HostID, nil
			}
		}

		// Fallback to visible name search
		paramsVis := map[string]interface{}{
			"output": []string{"hostid", "host", "name"},
			"filter": map[string]interface{}{
				"name": []string{hostName},
			},
		}
		if res, err := c.doRPC(ctx, "host.get", paramsVis, true); err == nil {
			var hosts []ZabbixHost
			if err := json.Unmarshal(res, &hosts); err == nil && len(hosts) > 0 {
				return hosts[0].HostID, nil
			}
		}
	}

	return "", fmt.Errorf("equipamento com IP '%s' ou nome '%s' não encontrado no Zabbix", hostIP, hostName)
}

// Regex patterns to match network interfaces across Huawei, Datacom, Cisco, MikroTik, Linux
var (
	// Matches names like "Interface 10GE0/1/1: Operational status" or "Interface GigabitEthernet0/0/1(Uplink)"
	reInterfaceItemName = regexp.MustCompile(`(?i)(?:Interface|Porta|Port)\s+([A-Za-z0-9\/\-\.:]+)`)
	// Matches key patterns like net.if.status[10GE0/1/1], net.if.in["GigabitEthernet0/0/2"], ifOperStatus[Eth-Trunk1]
	reInterfaceKey = regexp.MustCompile(`(?i)(?:net\.if\.[a-z_]+|if(?:OperStatus|InOctets|OutOctets|Speed|Alias|HCInOctets|HCOutOctets))\s*\["?'?([^"'\],]+)`)
	// Standard interface identifiers: 10GE0/1/1, XGE0/0/1, GigabitEthernet0/0/1, Eth-Trunk1, ether1, sfp-sfpplus1
	reStandardIface = regexp.MustCompile(`(?i)\b((?:100GE|40GE|25GE|10GE|GE|XGigabitEthernet|GigabitEthernet|FastEthernet|Ethernet|Eth-Trunk|Vlanif|ten-gigabit-ethernet|gigabit-ethernet|XGE|ether|sfp|sfpplus|sfp-sfpplus|vlan|xe-|ge-|et-|lag-)[0-9\/\-\.:]+)\b`)
)

// ExtractInterfacesFromItems extracts clean, normalized interface names from Zabbix items.
func ExtractInterfacesFromItems(items []ZabbixItem) []string {
	seen := make(map[string]bool)
	var list []string

	for _, it := range items {
		var candidate string

		// 1. Try extracting from Item Name
		if m := reInterfaceItemName.FindStringSubmatch(it.Name); len(m) > 1 {
			candidate = cleanInterfaceName(m[1])
		} else if m := reStandardIface.FindStringSubmatch(it.Name); len(m) > 1 {
			candidate = cleanInterfaceName(m[1])
		}

		// 2. Try extracting from Item Key
		if candidate == "" {
			if m := reInterfaceKey.FindStringSubmatch(it.Key); len(m) > 1 {
				candidate = cleanInterfaceName(m[1])
			} else if m := reStandardIface.FindStringSubmatch(it.Key); len(m) > 1 {
				candidate = cleanInterfaceName(m[1])
			}
		}

		if candidate != "" && isValidInterfaceName(candidate) && !seen[candidate] {
			seen[candidate] = true
			list = append(list, candidate)
		}
	}

	sort.Strings(list)
	return list
}

func cleanInterfaceName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.Trim(name, "():;,[]'\"")
	// Remove trailing descriptions like "(Uplink)" if captured
	if idx := strings.Index(name, "("); idx > 0 {
		name = strings.TrimSpace(name[:idx])
	}
	return name
}

func isValidInterfaceName(name string) bool {
	if len(name) < 2 || len(name) > 40 {
		return false
	}
	// Ignore numeric-only SNMP indexes (e.g., "12", "55")
	if regexp.MustCompile(`^\d+$`).MatchString(name) {
		return false
	}
	// Ignore generic loopbacks or null unless physical/trunk
	lower := strings.ToLower(name)
	if strings.HasPrefix(lower, "null") || strings.HasPrefix(lower, "loopback0") {
		return false
	}
	return true
}

// ZabbixTriggerProblem represents an active trigger problem.
type ZabbixTriggerProblem struct {
	TriggerID   string `json:"triggerid"`
	Description string `json:"description"`
	Comments    string `json:"comments"`
	Value       string `json:"value"` // "1" = Problem
}

// CheckHostInterfaceDown queries whether a specific host and interface has an active link down problem.
func (c *Client) CheckHostInterfaceDown(ctx context.Context, hostIP, hostName, ifaceName string) (bool, string, error) {
	if err := c.ensureAuth(ctx); err != nil {
		return false, "", err
	}

	hostID, err := c.findHostID(ctx, hostIP, hostName)
	if err != nil {
		return false, "", err
	}

	// Query active triggers for this host with only_true = 1 (problem state)
	params := map[string]interface{}{
		"hostids":   []string{hostID},
		"only_true": 1,
		"active":    1,
		"output":    []string{"triggerid", "description", "comments", "value"},
	}

	res, err := c.doRPC(ctx, "trigger.get", params, true)
	if err != nil {
		return false, "", fmt.Errorf("trigger.get failed: %w", err)
	}

	var triggers []ZabbixTriggerProblem
	if err := json.Unmarshal(res, &triggers); err != nil {
		return false, "", err
	}

	normTarget := NormalizeInterface(ifaceName)

	for _, t := range triggers {
		descLower := strings.ToLower(t.Description)
		// Check if trigger mentions link down / operational down / link has been stopped
		isLinkIssue := strings.Contains(descLower, "link down") ||
			strings.Contains(descLower, "down") ||
			strings.Contains(descLower, "operational status") ||
			strings.Contains(descLower, "not operational") ||
			strings.Contains(descLower, "loss of carrier")

		if isLinkIssue {
			// Check if interface matches
			if strings.Contains(NormalizeInterface(t.Description), normTarget) ||
				strings.Contains(NormalizeInterface(t.Comments), normTarget) {
				return true, t.Description, nil
			}
		}
	}

	return false, "", nil
}

// NormalizeInterface removes whitespace, punctuation, and standardizes common port prefixes.
func NormalizeInterface(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")

	// Unify common aliases
	s = strings.ReplaceAll(s, "tengigabitethernet", "10ge")
	s = strings.ReplaceAll(s, "gigabitethernet", "ge")
	s = strings.ReplaceAll(s, "fastethernet", "fe")
	s = strings.ReplaceAll(s, "ethtrunk", "ethtrunk")
	return s
}

// MatchInterfaces returns true if two interface identifiers match, tolerating prefix differences.
func MatchInterfaces(a, b string) bool {
	na := NormalizeInterface(a)
	nb := NormalizeInterface(b)
	if na == "" || nb == "" {
		return false
	}
	if na == nb {
		return true
	}
	// e.g. "10ge0/1/1" contains "ge0/1/1"? No, but "10ge0/1/1" vs "10ge0/1/1" is handled.
	// Check if one ends with the other (e.g. "0/1/1")
	return strings.HasSuffix(na, nb) || strings.HasSuffix(nb, na)
}

// InterfaceTraffic holds real-time inbound (RX) and outbound (TX) bandwidth in bps.
type InterfaceTraffic struct {
	RxBps     float64   `json:"rx_bps"`
	TxBps     float64   `json:"tx_bps"`
	Interface string    `json:"interface"`
	HostName  string    `json:"host_name"`
	Timestamp time.Time `json:"timestamp"`
}

// GetInterfaceTraffic queries Zabbix for real-time RX/TX traffic on the specified interface.
func (c *Client) GetInterfaceTraffic(ctx context.Context, hostIP, hostName, ifaceName string) (*InterfaceTraffic, error) {
	if err := c.ensureAuth(ctx); err != nil {
		return nil, err
	}

	hostID, err := c.findHostID(ctx, hostIP, hostName)
	if err != nil {
		return nil, err
	}

	normTarget := NormalizeInterface(ifaceName)

	itemParams := map[string]interface{}{
		"hostids": []string{hostID},
		"output":  []string{"itemid", "name", "key_", "lastvalue", "units", "lastclock"},
		"filter": map[string]interface{}{
			"status": 0,
		},
	}

	res, err := c.doRPC(ctx, "item.get", itemParams, true)
	if err != nil {
		return nil, fmt.Errorf("item.get failed: %w", err)
	}

	var items []ZabbixItem
	if err := json.Unmarshal(res, &items); err != nil {
		return nil, fmt.Errorf("failed to parse items: %w", err)
	}

	var rxBps, txBps float64
	var foundRx, foundTx bool

	for _, it := range items {
		normName := NormalizeInterface(it.Name)
		normKey := NormalizeInterface(it.Key)

		// Check if this item is for the requested interface
		if !strings.Contains(normName, normTarget) && !strings.Contains(normKey, normTarget) {
			continue
		}

		val := parseRateValue(it.LastValue, it.Units, it.Key)

		// Check RX (inbound/bits received)
		if isRxItem(normKey, normName) {
			rxBps = val
			foundRx = true
		} else if isTxItem(normKey, normName) {
			txBps = val
			foundTx = true
		}
	}

	if !foundRx && !foundTx {
		return nil, fmt.Errorf("itens de tráfego (bits received/sent) para interface '%s' não encontrados no Zabbix", ifaceName)
	}

	return &InterfaceTraffic{
		RxBps:     rxBps,
		TxBps:     txBps,
		Interface: ifaceName,
		HostName:  hostName,
		Timestamp: time.Now(),
	}, nil
}

func isRxItem(normKey, normName string) bool {
	return strings.Contains(normKey, "net.if.in") ||
		strings.Contains(normKey, "ifinoctets") ||
		strings.Contains(normKey, "ifhcinoctets") ||
		strings.Contains(normName, "bitsreceived") ||
		strings.Contains(normName, "bytesreceived") ||
		strings.Contains(normName, "trafficin") ||
		strings.Contains(normName, "incoming") ||
		strings.Contains(normName, "download")
}

func isTxItem(normKey, normName string) bool {
	return strings.Contains(normKey, "net.if.out") ||
		strings.Contains(normKey, "ifoutoctets") ||
		strings.Contains(normKey, "ifhcoutoctets") ||
		strings.Contains(normName, "bitssent") ||
		strings.Contains(normName, "bytessent") ||
		strings.Contains(normName, "trafficout") ||
		strings.Contains(normName, "outgoing") ||
		strings.Contains(normName, "upload")
}

func parseRateValue(rawVal, units, key string) float64 {
	val, err := strconv.ParseFloat(strings.TrimSpace(rawVal), 64)
	if err != nil || val < 0 {
		return 0
	}

	unitsLower := strings.ToLower(strings.TrimSpace(units))
	keyLower := strings.ToLower(key)

	// If unit is Bytes per second (Bps, B/s) or key contains Octets without bits, multiply by 8
	if unitsLower == "bps" || unitsLower == "bit/s" || unitsLower == "bits" {
		return val
	}
	if unitsLower == "b" || unitsLower == "bytes" || strings.Contains(keyLower, "octets") {
		return val * 8
	}
	return val
}

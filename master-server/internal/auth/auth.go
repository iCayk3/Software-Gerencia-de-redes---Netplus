package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type AuthManager struct {
	mu           sync.RWMutex
	adminPass    string
	secretKey    []byte
	validTokens  map[string]time.Time // token -> expiration
}

func NewAuthManager() *AuthManager {
	pass := os.Getenv("MASTER_ADMIN_PASSWORD")
	if pass == "" {
		pass = "admin_master_secret_2026"
	}

	secret := os.Getenv("MASTER_JWT_SECRET")
	if secret == "" {
		secret = "master_super_secret_key_netpulse_2026_telecom"
	}

	am := &AuthManager{
		adminPass:   pass,
		secretKey:   []byte(secret),
		validTokens: make(map[string]time.Time),
	}

	// Periodically clean up expired tokens
	go am.cleanupWorker()

	return am
}

func (a *AuthManager) cleanupWorker() {
	ticker := time.NewTicker(30 * time.Minute)
	for range ticker.C {
		a.mu.Lock()
		now := time.Now()
		for t, exp := range a.validTokens {
			if now.After(exp) {
				delete(a.validTokens, t)
			}
		}
		a.mu.Unlock()
	}
}

// Login validates password and returns session token
func (a *AuthManager) Login(password string) (string, error) {
	if password != a.adminPass {
		return "", fmt.Errorf("senha mestre incorreta")
	}

	// Generate signed token
	now := time.Now()
	data := fmt.Sprintf("master-admin:%d", now.UnixNano())
	mac := hmac.New(sha256.New, a.secretKey)
	mac.Write([]byte(data))
	token := hex.EncodeToString(mac.Sum(nil))

	a.mu.Lock()
	a.validTokens[token] = now.Add(24 * time.Hour)
	a.mu.Unlock()

	return token, nil
}

// ValidateToken checks if token is active
func (a *AuthManager) ValidateToken(token string) bool {
	if token == "" {
		return false
	}

	a.mu.RLock()
	exp, ok := a.validTokens[token]
	a.mu.RUnlock()

	if !ok {
		return false
	}
	return time.Now().Before(exp)
}

// RequireAdmin middleware to protect vendor-only endpoints
func (a *AuthManager) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := ""
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		} else if cookie, err := r.Cookie("master_token"); err == nil {
			token = cookie.Value
		}

		if !a.ValidateToken(token) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"Acesso não autorizado ao Servidor Master"}`))
			return
		}

		next(w, r)
	}
}

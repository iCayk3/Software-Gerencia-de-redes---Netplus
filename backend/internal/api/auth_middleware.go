package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"network-software/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userContextKey = contextKey("authUser")

var jwtSecret = []byte(getEnv("JWT_SECRET", "netpulse_super_secret_jwt_key_2026_enterprise"))

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// GenerateJWT creates a signed token for an authenticated user with 24h validity.
func GenerateJWT(u *models.User) (string, time.Time, error) {
	exp := time.Now().Add(24 * time.Hour)
	claims := &models.UserClaims{
		UserID:   u.ID,
		TenantID: u.TenantID,
		Email:    u.Email,
		Name:     u.Name,
		Role:     u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   u.ID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(jwtSecret)
	return tokenStr, exp, err
}

// AuthMiddleware inspects incoming requests and parses JWT if present.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		tokenStr := ""

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else if qToken := r.URL.Query().Get("token"); qToken != "" {
			tokenStr = qToken
		}

		if tokenStr != "" {
			claims := &models.UserClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return jwtSecret, nil
			})

			if err == nil && token.Valid {
				ctx := context.WithValue(r.Context(), userContextKey, claims)
				r = r.WithContext(ctx)
			}
		}

		next.ServeHTTP(w, r)
	})
}

// GetAuthUser retrieves the authenticated user's claims from request context.
func GetAuthUser(r *http.Request) *models.UserClaims {
	if val := r.Context().Value(userContextKey); val != nil {
		if claims, ok := val.(*models.UserClaims); ok {
			return claims
		}
	}
	return nil
}

// RequireAuth blocks unauthenticated requests with 401 Unauthorized.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := GetAuthUser(r)
		if user == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Autenticação obrigatória. Por favor, realize o login.",
			})
			return
		}
		next(w, r)
	}
}

// RequireRole checks if the user possesses at least one of the allowed roles.
func RequireRole(allowedRoles ...models.UserRole) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			user := GetAuthUser(r)
			if user == nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Autenticação obrigatória.",
				})
				return
			}

			// Admin has full access to everything
			if user.Role == models.RoleAdmin {
				next(w, r)
				return
			}

			hasRole := false
			for _, r := range allowedRoles {
				if user.Role == r {
					hasRole = true
					break
				}
			}

			if !hasRole {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error":         "Acesso negado: seu perfil não tem permissão para executar esta ação.",
					"user_role":     user.Role,
					"required_role": allowedRoles,
				})
				return
			}

			next(w, r)
		}
	}
}

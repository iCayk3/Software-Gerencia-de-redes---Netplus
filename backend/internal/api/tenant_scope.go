package api

import (
	"errors"
	"net/http"
	"strings"

	"network-software/internal/models"
	"network-software/internal/storage"
)

var (
	ErrAccessDeniedToDevice = errors.New("acesso negado: este equipamento pertence a outro cliente")
)

// ResolveTenantScope determines the effective tenant ID for the request.
// If the user is a SuperAdmin:
//   - Uses "tenant_id" query param or "X-Tenant-ID" header if specified.
//   - Returns "" (empty string) meaning global/all tenants if not specified.
// If the user is NOT a SuperAdmin:
//   - Always returns claims.TenantID, completely preventing cross-tenant data leaks.
func ResolveTenantScope(r *http.Request) string {
	claims := GetAuthUser(r)
	if claims == nil {
		return ""
	}

	if claims.IsSuperAdmin {
		if q := strings.TrimSpace(r.URL.Query().Get("tenant_id")); q != "" && q != "all" {
			return q
		}
		if h := strings.TrimSpace(r.Header.Get("X-Tenant-ID")); h != "" && h != "all" {
			return h
		}
		return "" // Global view
	}

	return claims.TenantID
}

// CheckDeviceTenantAccess verifies if the authenticated user has permission to access a device.
func CheckDeviceTenantAccess(r *http.Request, store *storage.DeviceStore, deviceID string) (*models.Device, error) {
	dev, err := store.GetByID(deviceID)
	if err != nil {
		return nil, err
	}

	claims := GetAuthUser(r)
	if claims == nil {
		return dev, nil
	}

	if claims.IsSuperAdmin {
		return dev, nil
	}

	if dev.TenantID != "" && dev.TenantID != claims.TenantID {
		return nil, ErrAccessDeniedToDevice
	}

	return dev, nil
}

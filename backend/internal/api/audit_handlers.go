package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"network-software/internal/models"
	"network-software/internal/storage"
)

type AuditController struct {
	auditStore storage.IAuditStore
}

func NewAuditController(auditStore storage.IAuditStore) *AuditController {
	return &AuditController{
		auditStore: auditStore,
	}
}

// ListAuditLogs handles GET /api/audit/logs
func (c *AuditController) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(q.Get("offset"))

	claims := GetAuthUser(r)
	tenantID := "default-tenant"
	if claims != nil && claims.TenantID != "" {
		tenantID = claims.TenantID
	}

	filter := models.AuditFilter{
		TenantID: tenantID,
		DeviceID: q.Get("device_id"),
		UserID:   q.Get("user_id"),
		Action:   q.Get("action"),
		Limit:    limit,
		Offset:   offset,
	}

	logs, total, err := c.auditStore.Query(filter)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Erro ao consultar trilha de auditoria: " + err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(models.AuditListResponse{
		Logs:   logs,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

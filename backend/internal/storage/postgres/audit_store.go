package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"network-software/internal/models"
)

// AuditStore manages append-only immutable audit logs in PostgreSQL.
type AuditStore struct {
	db *sql.DB
}

func NewAuditStore(db *sql.DB) *AuditStore {
	return &AuditStore{db: db}
}

// Record inserts an immutable audit log entry.
func (s *AuditStore) Record(entry *models.AuditLog) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if entry.TenantID == "" {
		entry.TenantID = "default-tenant"
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	var metaJSON []byte
	if entry.Metadata != nil {
		metaJSON, _ = json.Marshal(entry.Metadata)
	}

	query := `
		INSERT INTO audit_logs (
			id, tenant_id, timestamp, user_id, user_name, user_email,
			client_ip, action, target_device_id, target_device_name,
			command_executed, status, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
		)
	`
	_, err := s.db.ExecContext(ctx, query,
		entry.ID, entry.TenantID, entry.Timestamp, entry.UserID,
		entry.UserName, entry.UserEmail, entry.ClientIP, entry.Action,
		entry.TargetDeviceID, entry.TargetDeviceName, entry.CommandExecuted,
		entry.Status, metaJSON,
	)
	if err != nil {
		return fmt.Errorf("falha ao gravar log de auditoria: %w", err)
	}
	return nil
}

// Query searches audit logs with filters and pagination.
func (s *AuditStore) Query(filter models.AuditFilter) ([]models.AuditLog, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if filter.TenantID == "" {
		filter.TenantID = "default-tenant"
	}
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	baseQuery := `WHERE tenant_id = $1`
	args := []any{filter.TenantID}
	argIdx := 2

	if filter.DeviceID != "" {
		baseQuery += fmt.Sprintf(" AND target_device_id = $%d", argIdx)
		args = append(args, filter.DeviceID)
		argIdx++
	}
	if filter.UserID != "" {
		baseQuery += fmt.Sprintf(" AND user_id = $%d", argIdx)
		args = append(args, filter.UserID)
		argIdx++
	}
	if filter.Action != "" {
		baseQuery += fmt.Sprintf(" AND action = $%d", argIdx)
		args = append(args, filter.Action)
		argIdx++
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_logs %s", baseQuery)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Fetch page
	fetchQuery := fmt.Sprintf(`
		SELECT id, tenant_id, timestamp, user_id, user_name, user_email,
		       client_ip, action, COALESCE(target_device_id, ''), COALESCE(target_device_name, ''),
		       command_executed, status, metadata
		FROM audit_logs
		%s
		ORDER BY timestamp DESC
		LIMIT $%d OFFSET $%d
	`, baseQuery, argIdx, argIdx+1)

	args = append(args, filter.Limit, filter.Offset)

	rows, err := s.db.QueryContext(ctx, fetchQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		var metaRaw []byte

		err := rows.Scan(
			&l.ID, &l.TenantID, &l.Timestamp, &l.UserID, &l.UserName, &l.UserEmail,
			&l.ClientIP, &l.Action, &l.TargetDeviceID, &l.TargetDeviceName,
			&l.CommandExecuted, &l.Status, &metaRaw,
		)
		if err != nil {
			return nil, 0, err
		}
		if len(metaRaw) > 0 {
			_ = json.Unmarshal(metaRaw, &l.Metadata)
		}
		logs = append(logs, l)
	}

	return logs, total, nil
}

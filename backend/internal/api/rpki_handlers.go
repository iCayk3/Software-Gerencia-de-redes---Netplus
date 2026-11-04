package api

import (
	"net/http"
	"strconv"

	"network-software/internal/rpki"
	"network-software/internal/storage"
)

// RPKIController handles RPKI ROA validation endpoints.
type RPKIController struct {
	validator   *rpki.Validator
	tenantStore storage.ITenantStore
	deviceStore *storage.DeviceStore
}

// NewRPKIController creates a new RPKI HTTP controller.
func NewRPKIController(validator *rpki.Validator, tenantStore storage.ITenantStore, deviceStore *storage.DeviceStore) *RPKIController {
	if validator == nil {
		validator = rpki.NewValidator()
	}
	return &RPKIController{
		validator:   validator,
		tenantStore: tenantStore,
		deviceStore: deviceStore,
	}
}

// GetSummary handles GET /api/rpki/summary
func (rc *RPKIController) GetSummary(w http.ResponseWriter, r *http.Request) {
	summary := rc.validator.GetSummary()
	tenantScope := ResolveTenantScope(r)

	if tenantScope != "" {
		if rc.tenantStore != nil {
			if t, err := rc.tenantStore.GetByID(tenantScope); err == nil && t != nil {
				summary.OwnASN = t.ASN
				if t.ASN != "" {
					summary.OwnASProtected = true
				}
			}
		}
		if rc.deviceStore != nil {
			devices := rc.deviceStore.GetAllByTenant(tenantScope)
			if len(devices) == 0 {
				summary.TotalEvaluated = 0
				summary.ValidCount = 0
				summary.InvalidCount = 0
				summary.NotFoundCount = 0
				summary.ValidPercentage = 100.0
				summary.RecentInvalids = make([]rpki.RPKIValidationResult, 0)
				summary.OwnPrefixesCount = 0
			}
		}
	} else {
		summary.OwnASN = "Multi-AS"
	}

	WriteJSON(w, http.StatusOK, summary)
}

// Validate handles GET /api/rpki/validate?prefix=...&asn=...
func (rc *RPKIController) Validate(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")
	asnStr := r.URL.Query().Get("asn")

	if prefix == "" || asnStr == "" {
		WriteError(w, http.StatusBadRequest, "Parâmetros 'prefix' e 'asn' são obrigatórios")
		return
	}

	asn, err := strconv.ParseUint(asnStr, 10, 32)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "ASN inválido")
		return
	}

	res := rc.validator.Validate(prefix, uint32(asn))
	WriteJSON(w, http.StatusOK, res)
}

// GetInvalids handles GET /api/rpki/invalids
func (rc *RPKIController) GetInvalids(w http.ResponseWriter, r *http.Request) {
	invalids := rc.validator.GetInvalids()
	if invalids == nil {
		invalids = make([]rpki.RPKIValidationResult, 0)
	}

	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && rc.deviceStore != nil {
		devices := rc.deviceStore.GetAllByTenant(tenantScope)
		if len(devices) == 0 {
			WriteJSON(w, http.StatusOK, []rpki.RPKIValidationResult{})
			return
		}
		allowedIPs := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedIPs[d.Host] = true
		}
		filtered := make([]rpki.RPKIValidationResult, 0)
		for _, inv := range invalids {
			if allowedIPs[inv.PeerIP] {
				filtered = append(filtered, inv)
			}
		}
		WriteJSON(w, http.StatusOK, filtered)
		return
	}

	WriteJSON(w, http.StatusOK, invalids)
}

package api

import (
	"net/http"
	"strconv"

	"network-software/internal/rpki"
)

// RPKIController handles RPKI ROA validation endpoints.
type RPKIController struct {
	validator *rpki.Validator
}

// NewRPKIController creates a new RPKI HTTP controller.
func NewRPKIController(validator *rpki.Validator) *RPKIController {
	if validator == nil {
		validator = rpki.NewValidator()
	}
	return &RPKIController{validator: validator}
}

// GetSummary handles GET /api/rpki/summary
func (rc *RPKIController) GetSummary(w http.ResponseWriter, r *http.Request) {
	summary := rc.validator.GetSummary()
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
	WriteJSON(w, http.StatusOK, invalids)
}

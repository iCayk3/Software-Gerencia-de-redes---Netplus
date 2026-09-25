package models

import "time"

// Tenant represents a client company or partner organization in the multi-tenant system.
type Tenant struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	ASN          string    `json:"asn"`           // Primary ASN of the client (e.g. "267943")
	Document     string    `json:"document"`      // CNPJ or Identification Document
	ContactEmail string    `json:"contact_email"`
	ContactPhone string    `json:"contact_phone"`
	LogoURL      string    `json:"logo_url"`
	Plan         string    `json:"plan"`          // "enterprise", "standard", "trial"
	Status       string    `json:"status"`        // "active", "suspended"
	CreatedAt    time.Time `json:"created_at"`
	DeviceCount  int       `json:"device_count,omitempty"`
	UserCount    int       `json:"user_count,omitempty"`
}

// CreateTenantRequest is the payload to register a new client company.
type CreateTenantRequest struct {
	Name         string `json:"name"`
	Slug         string `json:"slug,omitempty"`
	ASN          string `json:"asn"`
	Document     string `json:"document,omitempty"`
	ContactEmail string `json:"contact_email,omitempty"`
	ContactPhone string `json:"contact_phone,omitempty"`
	LogoURL      string `json:"logo_url,omitempty"`
	Plan         string `json:"plan,omitempty"`
	Status       string `json:"status,omitempty"`
}

// UpdateTenantRequest is the payload to update an existing client company.
type UpdateTenantRequest struct {
	Name         string `json:"name"`
	Slug         string `json:"slug,omitempty"`
	ASN          string `json:"asn"`
	Document     string `json:"document,omitempty"`
	ContactEmail string `json:"contact_email,omitempty"`
	ContactPhone string `json:"contact_phone,omitempty"`
	LogoURL      string `json:"logo_url,omitempty"`
	Plan         string `json:"plan,omitempty"`
	Status       string `json:"status,omitempty"`
}

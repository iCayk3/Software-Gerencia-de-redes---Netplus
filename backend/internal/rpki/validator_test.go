package rpki

import (
	"testing"
)

func TestRPKIValidatorOwnROA(t *testing.T) {
	v := NewValidator()

	// 1. Valid own prefix (exact match /22 with correct ASN 267943)
	res := v.Validate("45.166.28.0/22", 267943)
	if res.Status != StatusValid {
		t.Errorf("Expected StatusValid for own prefix, got %s (reason: %s)", res.Status, res.Reason)
	}

	// 2. Valid own sub-prefix /24 (within maxLength 24)
	res2 := v.Validate("45.166.28.0/24", 267943)
	if res2.Status != StatusValid {
		t.Errorf("Expected StatusValid for sub-prefix /24, got %s", res2.Status)
	}

	// 3. Hijack / Invalid ASN (someone else announcing our /22 with wrong ASN)
	res3 := v.Validate("45.166.28.0/22", 65001)
	if res3.Status != StatusInvalid {
		t.Errorf("Expected StatusInvalid for wrong ASN hijack, got %s", res3.Status)
	}

	// 4. Invalid maxLength (prefix smaller than maxLength 24, e.g. /25)
	res4 := v.Validate("45.166.28.0/25", 267943)
	if res4.Status != StatusInvalid {
		t.Errorf("Expected StatusInvalid for prefix exceeding maxLength, got %s", res4.Status)
	}

	// 5. EvaluateRoute integration
	evalRes := v.EvaluateRoute("45.166.28.0/22", "266445 267943", "170.82.183.217", "BGP")
	if evalRes.Status != StatusValid {
		t.Errorf("Expected StatusValid for evaluated route, got %s", evalRes.Status)
	}

	evalInvalid := v.EvaluateRoute("45.166.28.0/22", "266445 65001", "170.82.183.217", "BGP")
	if evalInvalid.Status != StatusInvalid {
		t.Errorf("Expected StatusInvalid for evaluated hijack route, got %s", evalInvalid.Status)
	}

	summary := v.GetSummary()
	if summary.ValidCount < 1 {
		t.Errorf("Expected at least 1 valid count in summary, got %d", summary.ValidCount)
	}
	if summary.InvalidCount < 1 {
		t.Errorf("Expected at least 1 invalid count in summary, got %d", summary.InvalidCount)
	}
	if !summary.OwnASProtected {
		t.Errorf("Expected OwnASProtected to be true")
	}
}

func TestExtractOriginASN(t *testing.T) {
	cases := []struct {
		asPath   string
		expected uint32
	}{
		{"266445 267943", 267943},
		{"26162", 26162},
		{"15169", 15169},
		{"266445 13335 [13335]", 13335},
		{"", 0},
	}

	for _, c := range cases {
		got := extractOriginASN(c.asPath)
		if got != c.expected {
			t.Errorf("extractOriginASN(%q) = %d, expected %d", c.asPath, got, c.expected)
		}
	}
}

package traffic

import (
	"os"
	"testing"

	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestProfileStoreAndDiff(t *testing.T) {
	testDir := "test_profile_data"
	_ = os.RemoveAll(testDir)
	defer os.RemoveAll(testDir)

	profileStore, err := storage.NewProfileStore(testDir)
	if err != nil {
		t.Fatalf("failed to init ProfileStore: %v", err)
	}

	profiles := profileStore.GetAll()
	if len(profiles) < 4 {
		t.Fatalf("expected at least 4 default profiles, got %d", len(profiles))
	}

	// Verify standard profile
	padrao, err := profileStore.GetByID("prof-padrao")
	if err != nil {
		t.Fatalf("expected prof-padrao to exist: %v", err)
	}
	if !padrao.IsActive {
		t.Errorf("expected prof-padrao to be active by default")
	}

	// Verify contingency profile
	contingencia, err := profileStore.GetByID("prof-contingencia-sea")
	if err != nil {
		t.Fatalf("expected prof-contingencia-sea to exist: %v", err)
	}
	if contingencia.Tag != models.ProfileTagContingency {
		t.Errorf("expected tag contingency, got %s", contingencia.Tag)
	}

	// Test SetActive
	if err := profileStore.SetActive("prof-contingencia-sea"); err != nil {
		t.Fatalf("failed to set active profile: %v", err)
	}
	updatedCont, _ := profileStore.GetByID("prof-contingencia-sea")
	if !updatedCont.IsActive {
		t.Errorf("expected prof-contingencia-sea to be active")
	}
	updatedPadrao, _ := profileStore.GetByID("prof-padrao")
	if updatedPadrao.IsActive {
		t.Errorf("expected prof-padrao to no longer be active")
	}
}

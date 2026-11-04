package crypto

import (
	"testing"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := GetEncryptionKey()
	original := "SecretRouterPassword#123@2026"

	encrypted, err := Encrypt(original, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if encrypted == original {
		t.Errorf("Encrypted output should not match original plaintext")
	}

	if len(encrypted) < len(PrefixV1) || encrypted[:len(PrefixV1)] != PrefixV1 {
		t.Errorf("Encrypted output should start with PrefixV1 %s, got: %s", PrefixV1, encrypted)
	}

	// Decrypt
	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != original {
		t.Errorf("Expected decrypted %q, got %q", original, decrypted)
	}
}

func TestBackwardCompatibilityPlaintext(t *testing.T) {
	key := GetEncryptionKey()
	legacyPlaintext := "LegacyPlaintextPassWithoutPrefix"

	// Calling Decrypt on unencrypted text should return it as-is without error
	result, err := Decrypt(legacyPlaintext, key)
	if err != nil {
		t.Fatalf("Decrypt on legacy plaintext failed: %v", err)
	}

	if result != legacyPlaintext {
		t.Errorf("Expected %q, got %q", legacyPlaintext, result)
	}
}

func TestEmptyPassword(t *testing.T) {
	key := GetEncryptionKey()

	enc, err := Encrypt("", key)
	if err != nil || enc != "" {
		t.Errorf("Encrypt on empty string should return empty, got %q, err: %v", enc, err)
	}

	dec, err := Decrypt("", key)
	if err != nil || dec != "" {
		t.Errorf("Decrypt on empty string should return empty, got %q, err: %v", dec, err)
	}
}

func TestIdempotentEncrypt(t *testing.T) {
	key := GetEncryptionKey()
	original := "MyP@ssw0rd!"

	enc1, err := Encrypt(original, key)
	if err != nil {
		t.Fatalf("First encrypt failed: %v", err)
	}

	// Encrypting an already-encrypted string should not double-encrypt
	enc2, err := Encrypt(enc1, key)
	if err != nil {
		t.Fatalf("Second encrypt failed: %v", err)
	}

	if enc1 != enc2 {
		t.Errorf("Re-encrypting should be idempotent, expected %s, got %s", enc1, enc2)
	}

	dec, err := Decrypt(enc2, key)
	if err != nil || dec != original {
		t.Errorf("Expected decrypted %q, got %q, err: %v", original, dec, err)
	}
}

package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
)

const (
	// PrefixV1 marks values encrypted with AES-256-GCM v1.
	PrefixV1 = "enc:v1:"
	// FallbackSecret is used only in development if DEVICE_ENCRYPTION_KEY is not defined.
	defaultFallbackSecret = "netpulse-dev-secret-key-32bytes!!"
)

var (
	onceKey   sync.Once
	cachedKey []byte
)

// GetEncryptionKey derives a 32-byte key from environment or fallback.
func GetEncryptionKey() []byte {
	onceKey.Do(func() {
		secret := os.Getenv("DEVICE_ENCRYPTION_KEY")
		if secret == "" {
			log.Printf("[Security Warning] ⚠️  DEVICE_ENCRYPTION_KEY não configurada no ambiente. Usando chave padrão de desenvolvimento.")
			secret = defaultFallbackSecret
		}
		hash := sha256.Sum256([]byte(secret))
		cachedKey = hash[:]
	})
	return cachedKey
}

// Encrypt encrypts a string using AES-256-GCM with a randomized 12-byte nonce.
// If the text is empty or already starts with PrefixV1, it returns as-is.
func Encrypt(plainText string, key []byte) (string, error) {
	if plainText == "" {
		return "", nil
	}
	if strings.HasPrefix(plainText, PrefixV1) {
		return plainText, nil // Already encrypted
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	sealed := gcm.Seal(nonce, nonce, []byte(plainText), nil)
	encoded := base64.StdEncoding.EncodeToString(sealed)
	return PrefixV1 + encoded, nil
}

// Decrypt decrypts an AES-256-GCM string with PrefixV1.
// If the input does not have PrefixV1, it is treated as legacy plaintext for seamless backward compatibility.
func Decrypt(cipherText string, key []byte) (string, error) {
	if cipherText == "" {
		return "", nil
	}
	if !strings.HasPrefix(cipherText, PrefixV1) {
		// Transparent fallback: not encrypted yet, return as plaintext
		return cipherText, nil
	}

	rawB64 := strings.TrimPrefix(cipherText, PrefixV1)
	data, err := base64.StdEncoding.DecodeString(rawB64)
	if err != nil {
		return "", fmt.Errorf("invalid base64 payload: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (wrong key or corrupted data): %w", err)
	}

	return string(plain), nil
}

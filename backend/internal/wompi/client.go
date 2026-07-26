package wompi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

func NewClient(cfg *Config) *Client {
	return &Client{cfg: cfg, http: &http.Client{}}
}

type Client struct {
	cfg  *Config
	http *http.Client
}

func (c *Client) GetAcceptanceTokens() (*AcceptanceTokens, error) {
	url := c.cfg.BaseURL() + "/merchants/" + c.cfg.PublicKey
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+c.cfg.PublicKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("merchant request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("merchant %d: %s", resp.StatusCode, string(body))
	}

	var m merchantResponse
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("merchant parse: %w", err)
	}

	return &AcceptanceTokens{
		AcceptanceToken:   m.Data.PresignedAcceptance.AcceptanceToken,
		PersonalAuthToken: m.Data.PresignedPersonalAuth.AcceptanceToken,
	}, nil
}

func (c *Client) CreateNequiTransaction(tokens *AcceptanceTokens, reference string, amountInCents int64, email, phone string) (*TransactionResponse, error) {
	sig := c.sign(reference, amountInCents, "COP")

	req := createTransactionRequest{
		AcceptanceToken:    tokens.AcceptanceToken,
		AcceptPersonalAuth: tokens.PersonalAuthToken,
		AmountInCents:      amountInCents,
		Currency:           "COP",
		CustomerEmail:      email,
		Reference:          reference,
		Signature:          sig,
		PaymentMethod: map[string]string{
			"type":         "NEQUI",
			"phone_number": phone,
		},
	}

	return c.createTransaction(req)
}

func (c *Client) CreateDaviplataTransaction(tokens *AcceptanceTokens, reference string, amountInCents int64, email, phone, legalIdType, legalId string) (*TransactionResponse, error) {
	sig := c.sign(reference, amountInCents, "COP")

	req := createTransactionRequest{
		AcceptanceToken:    tokens.AcceptanceToken,
		AcceptPersonalAuth: tokens.PersonalAuthToken,
		AmountInCents:      amountInCents,
		Currency:           "COP",
		CustomerEmail:      email,
		Reference:          reference,
		Signature:          sig,
		PaymentMethod: map[string]string{
			"type":               "DAVIPLATA",
			"phone_number":       phone,
			"user_legal_id_type": legalIdType,
			"user_legal_id":      legalId,
		},
	}

	return c.createTransaction(req)
}

func (c *Client) CreateBancolombiaTransferTransaction(tokens *AcceptanceTokens, reference string, amountInCents int64, email, redirectUrl string) (*TransactionResponse, error) {
	sig := c.sign(reference, amountInCents, "COP")

	req := createTransactionRequest{
		AcceptanceToken:    tokens.AcceptanceToken,
		AcceptPersonalAuth: tokens.PersonalAuthToken,
		AmountInCents:      amountInCents,
		Currency:           "COP",
		CustomerEmail:      email,
		Reference:          reference,
		Signature:          sig,
		RedirectUrl:        redirectUrl,
		PaymentMethod: map[string]string{
			"type":                "BANCOLOMBIA_TRANSFER",
			"user_type":           "PERSON",
			"payment_description": "Pago a Latrode",
		},
	}

	return c.createTransaction(req)
}

func (c *Client) PollForAsyncPaymentURL(txID string, maxAttempts int, interval time.Duration) (string, error) {
	for i := 0; i < maxAttempts; i++ {
		time.Sleep(interval)
		tx, err := c.GetTransaction(txID)
		if err != nil {
			return "", fmt.Errorf("poll attempt %d: %w", i+1, err)
		}
		if tx.PaymentMethod != nil && tx.PaymentMethod.Extra != nil {
			if url, ok := tx.PaymentMethod.Extra["async_payment_url"]; ok && url != nil && url != "" {
				return fmt.Sprintf("%v", url), nil
			}
		}
	}
	return "", fmt.Errorf("async_payment_url not found after %d attempts", maxAttempts)
}

func (c *Client) GetTransaction(id string) (*TransactionResponse, error) {
	url := c.cfg.BaseURL() + "/transactions/" + id
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+c.cfg.PublicKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get transaction: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("get transaction %d: %s", resp.StatusCode, string(body))
	}

	var t getTransactionResponse
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, fmt.Errorf("get transaction parse: %w", err)
	}
	return &t.Data, nil
}

func (c *Client) VerifyWebhook(payload []byte, checksumHeader string) bool {
	var evt struct {
		Signature webhookSignature `json:"signature"`
		Timestamp int64            `json:"timestamp"`
	}
	if err := json.Unmarshal(payload, &evt); err != nil {
		return false
	}

	props := evt.Signature.Properties
	sort.Strings(props)

	var dataMap map[string]interface{}
	if err := json.Unmarshal(payload, &dataMap); err != nil {
		return false
	}

	var parts []string
	for _, prop := range props {
		parts = append(parts, digPath(dataMap, prop))
	}
	parts = append(parts, fmt.Sprintf("%d", evt.Timestamp))
	parts = append(parts, c.cfg.EventsKey)

	mac := hmac.New(sha256.New, []byte(c.cfg.EventsKey))
	mac.Write([]byte(strings.Join(parts, "")))
	// The standard says use SHA256 of concatenation, not HMAC
	// Let me use plain SHA256 as per docs
	h := sha256.Sum256([]byte(strings.Join(parts, "")))
	sig := hex.EncodeToString(h[:])

	return sig == checksumHeader || sig == evt.Signature.Checksum
}

func (c *Client) sign(reference string, amountInCents int64, currency string) string {
	input := fmt.Sprintf("%s%d%s%s", reference, amountInCents, currency, c.cfg.IntegrityKey)
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}

func (c *Client) createTransaction(req createTransactionRequest) (*TransactionResponse, error) {
	body, _ := json.Marshal(req)

	url := c.cfg.BaseURL() + "/transactions"
	httpReq, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.SecretKey)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("create transaction: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("create transaction %d: %s", resp.StatusCode, string(respBody))
	}

	var t createTransactionResponse
	if err := json.Unmarshal(respBody, &t); err != nil {
		return nil, fmt.Errorf("create transaction parse: %w", err)
	}
	return &t.Data, nil
}

func digPath(m map[string]interface{}, path string) string {
	parts := strings.Split(path, ".")
	var val interface{} = m
	for _, p := range parts {
		if m, ok := val.(map[string]interface{}); ok {
			val = m[p]
		} else {
			return ""
		}
	}
	if val == nil {
		return ""
	}
	return fmt.Sprintf("%v", val)
}

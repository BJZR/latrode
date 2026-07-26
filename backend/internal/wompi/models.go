package wompi

type Config struct {
	PublicKey    string
	SecretKey    string
	IntegrityKey string
	EventsKey    string
	Sandbox      bool
}

func (c *Config) BaseURL() string {
	if c.Sandbox {
		return "https://sandbox.wompi.co/v1"
	}
	return "https://production.wompi.co/v1"
}

type merchantResponse struct {
	Data struct {
		PresignedAcceptance struct {
			AcceptanceToken string `json:"acceptance_token"`
		} `json:"presigned_acceptance"`
		PresignedPersonalAuth struct {
			AcceptanceToken string `json:"acceptance_token"`
		} `json:"presigned_personal_data_auth"`
	} `json:"data"`
}

type AcceptanceTokens struct {
	AcceptanceToken   string
	PersonalAuthToken string
}

type NequiPayment struct {
	PhoneNumber string `json:"phone_number"`
}

type createTransactionRequest struct {
	AcceptanceToken    string      `json:"acceptance_token"`
	AcceptPersonalAuth string      `json:"accept_personal_auth"`
	AmountInCents      int64       `json:"amount_in_cents"`
	Currency           string      `json:"currency"`
	CustomerEmail      string      `json:"customer_email"`
	Reference          string      `json:"reference"`
	Signature          string      `json:"signature"`
	RedirectUrl        string      `json:"redirect_url,omitempty"`
	CustomerData       interface{} `json:"customer_data,omitempty"`
	PaymentMethod      interface{} `json:"payment_method"`
}

type TransactionResponse struct {
	ID                string             `json:"id"`
	Reference         string             `json:"reference"`
	Status            string             `json:"status"`
	AmountInCents     int64              `json:"amount_in_cents"`
	CustomerEmail     string             `json:"customer_email"`
	PaymentMethodType string             `json:"payment_method_type"`
	PaymentMethod     *PaymentMethodInfo `json:"payment_method,omitempty"`
	RedirectUrl       string             `json:"redirect_url"`
	CreatedAt         string             `json:"created_at"`
}

type PaymentMethodInfo struct {
	Type  string                 `json:"type"`
	Extra map[string]interface{} `json:"extra,omitempty"`
}

type createTransactionResponse struct {
	Data TransactionResponse `json:"data"`
}

type getTransactionResponse struct {
	Data TransactionResponse `json:"data"`
}

type WebhookPayload struct {
	Event     string           `json:"event"`
	Data      webhookData      `json:"data"`
	Signature webhookSignature `json:"signature"`
	Timestamp int64            `json:"timestamp"`
	SentAt    string           `json:"sent_at"`
}

type webhookData struct {
	Transaction webhookTransaction `json:"transaction"`
}

type webhookTransaction struct {
	ID                string `json:"id"`
	AmountInCents     int64  `json:"amount_in_cents"`
	Reference         string `json:"reference"`
	CustomerEmail     string `json:"customer_email"`
	Currency          string `json:"currency"`
	PaymentMethodType string `json:"payment_method_type"`
	Status            string `json:"status"`
}

type webhookSignature struct {
	Properties []string `json:"properties"`
	Checksum   string   `json:"checksum"`
}

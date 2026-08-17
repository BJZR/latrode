package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
	"latrode-fusion/internal/wompi"
)

type PaymentHandler struct {
	orderRepo *repository.OrderRepo
	cartRepo  *repository.CartRepo
	wompi     *wompi.Client
	wompiCfg  *wompi.Config
}

func NewPaymentHandler(orderRepo *repository.OrderRepo, cartRepo *repository.CartRepo, wc *wompi.Client, wcfg *wompi.Config) *PaymentHandler {
	return &PaymentHandler{orderRepo: orderRepo, cartRepo: cartRepo, wompi: wc, wompiCfg: wcfg}
}

func (h *PaymentHandler) ListMethods(w http.ResponseWriter, r *http.Request) {
	methods, err := h.orderRepo.GetEnabledPaymentMethods()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener métodos de pago"})
		return
	}

	if methods == nil {
		methods = []models.PaymentMethod{}
	}

	middleware.WriteJSON(w, http.StatusOK, methods)
}

type createPaymentRequest struct {
	OrderID        int    `json:"orderId"`
	PhoneNumber    string `json:"phoneNumber"`
	DocumentType   string `json:"documentType"`
	DocumentNumber string `json:"documentNumber"`
}

func (h *PaymentHandler) CreateNequiPayment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	var req createPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if req.PhoneNumber == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "número de teléfono requerido"})
		return
	}

	order, err := h.orderRepo.FindByID(req.OrderID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "orden no encontrada"})
		return
	}
	if order.UserID != user.ID {
		middleware.WriteJSON(w, http.StatusForbidden, middleware.APIError{Error: "no autorizado"})
		return
	}

	tokens, err := h.wompi.GetAcceptanceTokens()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener tokens de aceptación"})
		return
	}

	reference := "LATRODE-" + strconv.Itoa(order.ID)
	amountInCents := int64(order.Total * 100)

	tx, err := h.wompi.CreateNequiTransaction(tokens, reference, amountInCents, user.Email, req.PhoneNumber)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear transacción: " + err.Error()})
		return
	}

	h.orderRepo.SaveWompiTransaction(order.ID, tx.ID, tx.Status, tx.Reference)

	middleware.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"transactionId": tx.ID,
		"reference":     tx.Reference,
		"status":        tx.Status,
		"message":       "Revisa tu app Nequi para confirmar el pago",
	})
}

func (h *PaymentHandler) CreateDaviplataPayment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	var req createPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if req.PhoneNumber == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "número de teléfono requerido"})
		return
	}

	order, err := h.orderRepo.FindByID(req.OrderID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "orden no encontrada"})
		return
	}
	if order.UserID != user.ID {
		middleware.WriteJSON(w, http.StatusForbidden, middleware.APIError{Error: "no autorizado"})
		return
	}

	tokens, err := h.wompi.GetAcceptanceTokens()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener tokens de aceptación"})
		return
	}

	reference := "LATRODE-" + strconv.Itoa(order.ID)
	amountInCents := int64(order.Total * 100)

	legalIdType := req.DocumentType
	if legalIdType == "" {
		legalIdType = "CC"
	}
	legalId := req.DocumentNumber

	tx, err := h.wompi.CreateDaviplataTransaction(tokens, reference, amountInCents, user.Email, req.PhoneNumber, legalIdType, legalId)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear transacción: " + err.Error()})
		return
	}

	h.orderRepo.SaveWompiTransaction(order.ID, tx.ID, tx.Status, tx.Reference)

	middleware.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"transactionId": tx.ID,
		"reference":     tx.Reference,
		"status":        tx.Status,
		"message":       "Revisa tu app DaviPlata para confirmar el pago",
	})
}

func (h *PaymentHandler) CreateBancolombiaTransferPayment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	var req createPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	order, err := h.orderRepo.FindByID(req.OrderID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "orden no encontrada"})
		return
	}
	if order.UserID != user.ID {
		middleware.WriteJSON(w, http.StatusForbidden, middleware.APIError{Error: "no autorizado"})
		return
	}

	tokens, err := h.wompi.GetAcceptanceTokens()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener tokens de aceptación"})
		return
	}

	reference := "LATRODE-" + strconv.Itoa(order.ID)
	amountInCents := int64(order.Total * 100)
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	redirectUrl := fmt.Sprintf("%s://%s/?payment=%d", scheme, r.Host, order.ID)

	tx, err := h.wompi.CreateBancolombiaTransferTransaction(tokens, reference, amountInCents, user.Email, redirectUrl)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear transacción: " + err.Error()})
		return
	}

	h.orderRepo.SaveWompiTransaction(order.ID, tx.ID, tx.Status, tx.Reference)

	paymentURL, err := h.wompi.PollForAsyncPaymentURL(tx.ID, 10, 500*time.Millisecond)
	if err != nil {
		log.Printf("[Bancolombia] polling failed: %v", err)
	} else {
		log.Printf("[Bancolombia] async_payment_url: %s", paymentURL)
	}

	resp := map[string]interface{}{
		"transactionId": tx.ID,
		"reference":     tx.Reference,
		"status":        tx.Status,
	}

	if paymentURL != "" {
		resp["redirectUrl"] = paymentURL
	} else if tx.PaymentMethod != nil && tx.PaymentMethod.Extra != nil {
		if v, ok := tx.PaymentMethod.Extra["async_payment_url"]; ok {
			resp["redirectUrl"] = v
		}
	}

	middleware.WriteJSON(w, http.StatusCreated, resp)
}

func (h *PaymentHandler) CheckTransaction(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	orderIDStr := r.URL.Query().Get("orderId")
	orderID, err := strconv.Atoi(orderIDStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "orderId inválido"})
		return
	}

	order, err := h.orderRepo.FindByID(orderID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "orden no encontrada"})
		return
	}
	if order.UserID != user.ID {
		middleware.WriteJSON(w, http.StatusForbidden, middleware.APIError{Error: "no autorizado"})
		return
	}

	if order.WompiTransactionID == "" {
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"status": "no_transaction"})
		return
	}

	tx, err := h.wompi.GetTransaction(order.WompiTransactionID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"status": order.WompiStatus})
		return
	}

	if tx.Status != order.WompiStatus {
		h.orderRepo.SaveWompiTransaction(order.ID, tx.ID, tx.Status, tx.Reference)
		if tx.Status == "APPROVED" {
			h.orderRepo.UpdateStatus(order.ID, "paid", "paid")
			h.cartRepo.Clear(order.UserID)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]string{
		"status":        tx.Status,
		"wompiStatus":   tx.Status,
		"paymentStatus": order.PaymentStatus,
	})
}

func (h *PaymentHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "error reading body", http.StatusBadRequest)
		return
	}

	checksum := r.Header.Get("X-Event-Checksum")

	if !h.wompi.VerifyWebhook(body, checksum) {
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	var evt struct {
		Event string `json:"event"`
		Data  struct {
			Transaction struct {
				ID        string `json:"id"`
				Reference string `json:"reference"`
				Status    string `json:"status"`
			} `json:"transaction"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &evt); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if evt.Event == "transaction.updated" {
		ref := strings.TrimPrefix(evt.Data.Transaction.Reference, "LATRODE-")
		if orderID, err := strconv.Atoi(ref); err == nil && orderID > 0 {
			h.orderRepo.SaveWompiTransaction(orderID, evt.Data.Transaction.ID, evt.Data.Transaction.Status, evt.Data.Transaction.Reference)
			if evt.Data.Transaction.Status == "APPROVED" {
				order, _ := h.orderRepo.FindByID(orderID)
				if order != nil {
					h.orderRepo.UpdateStatus(orderID, "paid", "paid")
					h.cartRepo.Clear(order.UserID)
				}
			}
		}
	}

	w.WriteHeader(http.StatusOK)
}

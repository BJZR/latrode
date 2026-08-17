package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"latrode-fusion/internal/config"
	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

type OrderHandler struct {
	orderRepo *repository.OrderRepo
	cartRepo  *repository.CartRepo
	cfg       *config.Config
}

func NewOrderHandler(orderRepo *repository.OrderRepo, cartRepo *repository.CartRepo, cfg *config.Config) *OrderHandler {
	return &OrderHandler{orderRepo: orderRepo, cartRepo: cartRepo, cfg: cfg}
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "debes iniciar sesión"})
		return
	}

	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	cartItems, err := h.cartRepo.FindByUserID(user.ID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener carrito"})
		return
	}

	if len(cartItems) == 0 {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "el carrito está vacío"})
		return
	}

	var total float64
	for _, item := range cartItems {
		if item.Product != nil {
			total += item.Product.Price
		}
	}

	order, err := h.orderRepo.Create(user.ID, &req, cartItems, total)
	if err != nil {
		if errors.Is(err, repository.ErrInsufficientStock) {
			middleware.WriteJSON(w, http.StatusConflict, middleware.APIError{Error: "stock insuficiente para algunos productos"})
			return
		}
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear orden"})
		return
	}

	h.orderRepo.LogActivity(user.ID, "crear_orden", "orders", order.ID, middleware.GetClientIP(r))

	go func() {
		items := make([]models.OrderItem, len(cartItems))
		for i, ci := range cartItems {
			pn := ""
			pp := 0.0
			if ci.Product != nil {
				pn = ci.Product.Name
				pp = ci.Product.Price
			}
			cn := ""
			if ci.Color != nil {
				cn = ci.Color.Name
			}
			qty := ci.Quantity
			if qty <= 0 {
				qty = 1
			}
			items[i] = models.OrderItem{
				ProductName:  pn,
				ProductPrice: pp,
				ColorName:    cn,
				Size:         ci.Size,
				Quantity:     qty,
				Subtotal:     pp * float64(qty),
			}
		}
		order.Items = items
		middleware.SendOrderNotification(h.cfg, order, user)
	}()

	middleware.WriteJSON(w, http.StatusCreated, order)
}

func (h *OrderHandler) GetMyOrders(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	orders, err := h.orderRepo.FindByUserID(user.ID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener órdenes"})
		return
	}

	if orders == nil {
		orders = []models.Order{}
	}

	middleware.WriteJSON(w, http.StatusOK, orders)
}

func (h *OrderHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	order, err := h.orderRepo.FindByID(id)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "orden no encontrada"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, order)
}

func (h *OrderHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	if err := h.orderRepo.CancelOrder(id, user.ID); err != nil {
		if err.Error() == "no autorizado" {
			middleware.WriteJSON(w, http.StatusForbidden, middleware.APIError{Error: err.Error()})
			return
		}
		if err.Error() == "no se puede cancelar después de 2 horas" {
			middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: err.Error()})
			return
		}
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al cancelar orden"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "orden cancelada"})
}

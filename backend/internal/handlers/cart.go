package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

type CartHandler struct {
	cartRepo  *repository.CartRepo
	orderRepo *repository.OrderRepo
}

func NewCartHandler(cartRepo *repository.CartRepo, orderRepo *repository.OrderRepo) *CartHandler {
	return &CartHandler{cartRepo: cartRepo, orderRepo: orderRepo}
}

func (h *CartHandler) GetCart(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusOK, []models.CartItem{})
		return
	}

	items, err := h.cartRepo.FindByUserID(user.ID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener carrito"})
		return
	}

	if items == nil {
		items = []models.CartItem{}
	}

	priceSettings := loadPriceSettings(h.orderRepo)
	for i := range items {
		if items[i].Product != nil {
			items[i].Product.FinalPrice = computeFinalPrice(items[i].Product.Price, priceSettings)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, items)
}

func (h *CartHandler) AddToCart(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "debes iniciar sesión"})
		return
	}

	var req models.AddToCartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.cartRepo.AddItem(user.ID, req.ProductID, req.ColorID, req.Size, req.Quantity); err != nil {
		middleware.WriteJSON(w, http.StatusConflict, middleware.APIError{Error: err.Error()})
		return
	}

	items, _ := h.cartRepo.FindByUserID(user.ID)
	if items == nil {
		items = []models.CartItem{}
	}

	middleware.WriteJSON(w, http.StatusOK, items)
}

func (h *CartHandler) RemoveFromCart(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	idStr := r.PathValue("id")
	itemID, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	if err := h.cartRepo.RemoveItem(itemID, user.ID); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar del carrito"})
		return
	}

	items, _ := h.cartRepo.FindByUserID(user.ID)
	if items == nil {
		items = []models.CartItem{}
	}

	middleware.WriteJSON(w, http.StatusOK, items)
}

func (h *CartHandler) ClearCart(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	if err := h.cartRepo.Clear(user.ID); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al vaciar carrito"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, []models.CartItem{})
}

func (h *CartHandler) UpdateCartItem(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	idStr := r.PathValue("id")
	itemID, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	var req struct {
		Quantity int `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.cartRepo.UpdateQuantity(itemID, user.ID, req.Quantity); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar"})
		return
	}

	items, _ := h.cartRepo.FindByUserID(user.ID)
	if items == nil {
		items = []models.CartItem{}
	}
	middleware.WriteJSON(w, http.StatusOK, items)
}

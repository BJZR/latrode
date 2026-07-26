package handlers

import (
	"net/http"
	"strconv"

	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

func parseFloat(s string) float64 {
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

type ProductHandler struct {
	productRepo *repository.ProductRepo
}

func NewProductHandler(productRepo *repository.ProductRepo) *ProductHandler {
	return &ProductHandler{productRepo: productRepo}
}

func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	name := r.URL.Query().Get("name")
	category := r.URL.Query().Get("category")
	minPrice := parseFloat(r.URL.Query().Get("min_price"))
	maxPrice := parseFloat(r.URL.Query().Get("max_price"))
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var products []models.Product
	var total int
	var err error

	hasFilters := query != "" || name != "" || category != "" || minPrice > 0 || maxPrice > 0

	if hasFilters {
		total, err = h.productRepo.CountFiltered(query, name, category, minPrice, maxPrice)
		if err != nil {
			middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al contar productos"})
			return
		}
		products, err = h.productRepo.SearchFiltered(query, name, category, minPrice, maxPrice, page, limit)
	} else {
		total, err = h.productRepo.Count()
		if err != nil {
			middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al contar productos"})
			return
		}
		products, err = h.productRepo.FindAllPaginated(page, limit)
	}

	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener productos"})
		return
	}

	totalPages := (total + limit - 1) / limit

	middleware.WriteJSON(w, http.StatusOK, models.PaginatedResponse{
		Data:       products,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	})
}

func (h *ProductHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	product, err := h.productRepo.FindByID(id)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "producto no encontrado"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, product)
}

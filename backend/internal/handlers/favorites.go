package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

type FavoriteHandler struct {
	favRepo *repository.FavoriteRepo
}

func NewFavoriteHandler(favRepo *repository.FavoriteRepo) *FavoriteHandler {
	return &FavoriteHandler{favRepo: favRepo}
}

func (h *FavoriteHandler) List(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusOK, []models.Favorite{})
		return
	}

	favs, err := h.favRepo.FindByUserID(user.ID)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener favoritos"})
		return
	}

	if favs == nil {
		favs = []models.Favorite{}
	}

	middleware.WriteJSON(w, http.StatusOK, favs)
}

func (h *FavoriteHandler) Add(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "debes iniciar sesión"})
		return
	}

	var req struct {
		ProductID int `json:"productId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.favRepo.Add(user.ID, req.ProductID); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al agregar favorito"})
		return
	}

	favs, _ := h.favRepo.FindByUserID(user.ID)
	if favs == nil {
		favs = []models.Favorite{}
	}

	middleware.WriteJSON(w, http.StatusOK, favs)
}

func (h *FavoriteHandler) Remove(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	idStr := r.PathValue("id")
	favID, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	if err := h.favRepo.Remove(favID, user.ID); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar favorito"})
		return
	}

	favs, _ := h.favRepo.FindByUserID(user.ID)
	if favs == nil {
		favs = []models.Favorite{}
	}

	middleware.WriteJSON(w, http.StatusOK, favs)
}

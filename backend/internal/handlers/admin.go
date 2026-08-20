package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"latrode-fusion/internal/email"
	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

type AdminHandler struct {
	orderRepo   *repository.OrderRepo
	productRepo *repository.ProductRepo
	userRepo    *repository.UserRepo
	email       *email.Service
}

func NewAdminHandler(orderRepo *repository.OrderRepo, productRepo *repository.ProductRepo, userRepo *repository.UserRepo, emailSvc *email.Service) *AdminHandler {
	return &AdminHandler{orderRepo: orderRepo, productRepo: productRepo, userRepo: userRepo, email: emailSvc}
}

func (h *AdminHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	stats, err := h.orderRepo.GetDashboardStats()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener estadísticas"})
		return
	}

	topProducts, err := h.productRepo.FindTopSelling(5)
	if err == nil && topProducts != nil {
		stats.TopProducts = topProducts
	}
	if stats.TopProducts == nil {
		stats.TopProducts = []models.Product{}
	}

	middleware.WriteJSON(w, http.StatusOK, stats)
}

func (h *AdminHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	paymentStatus := r.URL.Query().Get("payment_status")

	orders, err := h.orderRepo.FindAllWithFilters(status, paymentStatus)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener órdenes"})
		return
	}

	if orders == nil {
		orders = []models.Order{}
	}

	middleware.WriteJSON(w, http.StatusOK, orders)
}

func (h *AdminHandler) UpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	var req models.UpdateOrderStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.orderRepo.UpdateStatus(id, req.Status, req.PaymentStatus); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar orden"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "actualizar_orden", "orders", id, middleware.GetClientIP(r))

	order, _ := h.orderRepo.FindByID(id)

	if req.PaymentStatus == "paid" && order != nil && h.email != nil {
		go h.sendOrderPaidEmail(order)
	}

	middleware.WriteJSON(w, http.StatusOK, order)
}

func (h *AdminHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	products, err := h.productRepo.FindAll()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener productos"})
		return
	}

	if products == nil {
		products = []models.Product{}
	}

	middleware.WriteJSON(w, http.StatusOK, products)
}

func (h *AdminHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var req models.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	product, err := h.productRepo.Create(&req)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear producto"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "crear_producto", "products", product.ID, middleware.GetClientIP(r))

	middleware.WriteJSON(w, http.StatusCreated, product)
}

func (h *AdminHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	var req models.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	product, err := h.productRepo.Update(id, &req)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar producto"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "actualizar_producto", "products", id, middleware.GetClientIP(r))

	middleware.WriteJSON(w, http.StatusOK, product)
}

func (h *AdminHandler) TrashProduct(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	if err := h.productRepo.TrashProduct(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover producto a papelera"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "papelera_producto", "products", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "producto movido a papelera"})
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.userRepo.FindAll()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener usuarios"})
		return
	}
	if users == nil {
		users = []models.User{}
	}
	middleware.WriteJSON(w, http.StatusOK, users)
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	var req struct {
		Username       string `json:"username"`
		Email          string `json:"email"`
		Role           string `json:"role"`
		Phone          string `json:"phone"`
		Address        string `json:"address"`
		City           string `json:"city"`
		PostalCode     string `json:"postalCode"`
		Country        string `json:"country"`
		DocumentType   string `json:"documentType"`
		DocumentNumber string `json:"documentNumber"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.userRepo.AdminUpdateUser(id, req.Username, req.Email, req.Role, req.Phone, req.Address, req.City, req.PostalCode, req.Country, req.DocumentType, req.DocumentNumber); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar usuario"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "actualizar_usuario", "users", id, middleware.GetClientIP(r))
	updated, _ := h.userRepo.FindByID(id)
	middleware.WriteJSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) TrashUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	adminUser := middleware.GetUser(r)
	if adminUser.ID == id {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "no puedes eliminarte a ti mismo"})
		return
	}

	if err := h.userRepo.TrashUser(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover usuario a papelera"})
		return
	}

	h.orderRepo.LogActivity(adminUser.ID, "papelera_usuario", "users", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "usuario movido a papelera"})
}

func (h *AdminHandler) TrashUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	adminUser := middleware.GetUser(r)
	for _, id := range req.IDs {
		if adminUser.ID == id {
			middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "no puedes eliminarte a ti mismo"})
			return
		}
	}

	if err := h.userRepo.TrashUsers(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover usuarios a papelera"})
		return
	}

	h.orderRepo.LogActivity(adminUser.ID, "papelera_usuarios", "users", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"trashed": len(req.IDs)})
}

func (h *AdminHandler) TrashOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	if err := h.orderRepo.AdminTrashOrder(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover orden a papelera"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "papelera_orden", "orders", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "orden movida a papelera"})
}

func (h *AdminHandler) TrashOrders(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.orderRepo.AdminTrashOrders(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover órdenes a papelera"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "papelera_ordenes", "orders", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"trashed": len(req.IDs)})
}

func (h *AdminHandler) TrashAllOrders(w http.ResponseWriter, r *http.Request) {
	if err := h.orderRepo.AdminTrashAllOrders(); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al mover todas las órdenes a papelera"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "papelera_todas_ordenes", "orders", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "todas las órdenes movidas a papelera"})
}

func (h *AdminHandler) GetTrashedUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.userRepo.FindTrashed()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener papelera de usuarios"})
		return
	}
	if users == nil {
		users = []models.User{}
	}
	middleware.WriteJSON(w, http.StatusOK, users)
}

func (h *AdminHandler) GetTrashedOrders(w http.ResponseWriter, r *http.Request) {
	orders, err := h.orderRepo.FindTrashedOrders()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener papelera de órdenes"})
		return
	}
	if orders == nil {
		orders = []models.Order{}
	}
	middleware.WriteJSON(w, http.StatusOK, orders)
}

func (h *AdminHandler) GetTrashedProducts(w http.ResponseWriter, r *http.Request) {
	products, err := h.productRepo.FindTrashed()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener papelera de productos"})
		return
	}
	if products == nil {
		products = []models.Product{}
	}
	middleware.WriteJSON(w, http.StatusOK, products)
}

func (h *AdminHandler) RestoreUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}
	if err := h.userRepo.RestoreUser(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al restaurar usuario"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "restaurar_usuario", "users", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "usuario restaurado"})
}

func (h *AdminHandler) RestoreUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}
	if err := h.userRepo.RestoreUsers(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al restaurar usuarios"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "restaurar_usuarios", "users", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"restored": len(req.IDs)})
}

func (h *AdminHandler) RestoreOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}
	if err := h.orderRepo.RestoreOrder(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al restaurar orden"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "restaurar_orden", "orders", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "orden restaurada"})
}

func (h *AdminHandler) RestoreOrders(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}
	if err := h.orderRepo.RestoreOrders(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al restaurar órdenes"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "restaurar_ordenes", "orders", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"restored": len(req.IDs)})
}

func (h *AdminHandler) RestoreProduct(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}
	if err := h.productRepo.RestoreProduct(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al restaurar producto"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "restaurar_producto", "products", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "producto restaurado"})
}

func (h *AdminHandler) PermanentDeleteUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}
	adminUser := middleware.GetUser(r)
	if adminUser.ID == id {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "no puedes eliminarte a ti mismo"})
		return
	}
	if err := h.userRepo.PermanentDeleteUser(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar usuario permanentemente"})
		return
	}
	h.orderRepo.LogActivity(adminUser.ID, "eliminar_permanente_usuario", "users", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "usuario eliminado permanentemente"})
}

func (h *AdminHandler) PermanentDeleteUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}
	adminUser := middleware.GetUser(r)
	for _, id := range req.IDs {
		if adminUser.ID == id {
			middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "no puedes eliminarte a ti mismo"})
			return
		}
	}
	if err := h.userRepo.PermanentDeleteUsers(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar usuarios permanentemente"})
		return
	}
	h.orderRepo.LogActivity(adminUser.ID, "eliminar_permanente_usuarios", "users", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"deleted": len(req.IDs)})
}

func (h *AdminHandler) PermanentDeleteOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}
	if err := h.orderRepo.PermanentDeleteOrder(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar orden permanentemente"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "eliminar_permanente_orden", "orders", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "orden eliminada permanentemente"})
}

func (h *AdminHandler) PermanentDeleteOrders(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}
	if err := h.orderRepo.PermanentDeleteOrders(req.IDs); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar órdenes permanentemente"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "eliminar_permanente_ordenes", "orders", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]int{"deleted": len(req.IDs)})
}

func (h *AdminHandler) PermanentDeleteProduct(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "ID inválido"})
		return
	}
	if err := h.productRepo.PermanentDeleteProduct(id); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al eliminar producto permanentemente"})
		return
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "eliminar_permanente_producto", "products", id, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "producto eliminado"})
}

func (h *AdminHandler) EmptyTrash(w http.ResponseWriter, r *http.Request) {
	section := r.URL.Query().Get("section")
	switch section {
	case "users":
		h.userRepo.EmptyTrash()
	case "orders":
		h.orderRepo.EmptyOrdersTrash()
	case "products":
		h.productRepo.EmptyProductsTrash()
	default:
		h.userRepo.EmptyTrash()
		h.orderRepo.EmptyOrdersTrash()
		h.productRepo.EmptyProductsTrash()
	}
	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "vaciar_papelera", "all", 0, middleware.GetClientIP(r))
	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "papelera vaciada"})
}

func (h *AdminHandler) GetPaymentMethods(w http.ResponseWriter, r *http.Request) {
	methods, err := h.orderRepo.GetPaymentMethods()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener métodos de pago"})
		return
	}

	if methods == nil {
		methods = []models.PaymentMethod{}
	}

	middleware.WriteJSON(w, http.StatusOK, methods)
}

func (h *AdminHandler) UpdatePaymentMethod(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "id inválido"})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "cuerpo inválido"})
		return
	}

	if err := h.orderRepo.UpdatePaymentMethod(id, req.Enabled); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar método de pago"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]bool{"enabled": req.Enabled})
}

func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.orderRepo.GetSettings()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener configuraciones"})
		return
	}

	if settings == nil {
		settings = []models.Setting{}
	}

	middleware.WriteJSON(w, http.StatusOK, settings)
}

func (h *AdminHandler) GetPublicSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.orderRepo.GetSettings()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener configuraciones"})
		return
	}

	result := map[string]string{}
	for _, s := range settings {
		switch s.Key {
		case "contact_phone", "contact_email", "site_name", "site_description", "free_shipping_min",
			"iva", "comision", "envio":
			result[s.Key] = s.Value
		}
	}
	middleware.WriteJSON(w, http.StatusOK, result)
}

func (h *AdminHandler) UpdateSetting(w http.ResponseWriter, r *http.Request) {
	var req models.Setting
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.orderRepo.UpdateSetting(req.Key, req.Value); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar configuración"})
		return
	}

	user := middleware.GetUser(r)
	h.orderRepo.LogActivity(user.ID, "actualizar_config", "settings", 0, middleware.GetClientIP(r))

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "configuración actualizada"})
}

func (h *AdminHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.orderRepo.GetLogs()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al obtener logs"})
		return
	}

	if logs == nil {
		logs = []models.ActivityLog{}
	}

	middleware.WriteJSON(w, http.StatusOK, logs)
}

func (h *AdminHandler) sendOrderPaidEmail(order *models.Order) {
	user, err := h.userRepo.FindByID(order.UserID)
	if err != nil {
		log.Printf("[Email] error finding user for order #%d: %v", order.ID, err)
		return
	}

	var items []email.OrderItem
	for _, item := range order.Items {
		items = append(items, email.OrderItem{
			ProductName:  item.ProductName,
			ProductPrice: item.ProductPrice,
			ColorName:    item.ColorName,
			Size:         item.Size,
			Quantity:     item.Quantity,
			Subtotal:     item.Subtotal,
		})
	}

	if err := h.email.SendOrderConfirmation(order.ID, user.Email, user.Username, order.Total, items); err != nil {
		log.Printf("[Email] failed for order #%d: %v", order.ID, err)
	}
}

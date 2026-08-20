package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"latrode-fusion/internal/database"
	"latrode-fusion/internal/models"
)

var ErrInsufficientStock = errors.New("stock insuficiente")

type OrderRepo struct {
	db *database.DB
}

func NewOrderRepo(db *database.DB) *OrderRepo {
	return &OrderRepo{db: db}
}

func scanOrder(s scannable) (*models.Order, error) {
	o := &models.Order{}
	err := s.Scan(&o.ID, &o.UserID, &o.Total, &o.Status, &o.PaymentStatus,
		&o.PaymentMethod, &o.ShippingName, &o.ShippingPhone, &o.ShippingAddress,
		&o.ShippingCity, &o.ShippingPostalCode, &o.ShippingCountry,
		&o.WompiTransactionID, &o.WompiStatus, &o.WompiReference, &o.CreatedAt, &o.DeletedAt)
	if err != nil {
		return nil, err
	}
	return o, nil
}

const orderCols = `id, user_id, total, status, payment_status, payment_method,
	shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
	COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at, deleted_at`

func (r *OrderRepo) FindByUserID(userID int) ([]models.Order, error) {
	rows, err := r.db.DB.Query(
		`SELECT o.id, o.user_id, o.total, o.status, o.payment_status, o.payment_method,
		 o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_city, o.shipping_postal_code, o.shipping_country,
		 COALESCE(o.wompi_transaction_id,''), COALESCE(o.wompi_status,''), COALESCE(o.wompi_reference,''), o.created_at, o.deleted_at,
		 oi.id, oi.order_id, oi.product_id, oi.product_name, oi.product_price, oi.color_name, COALESCE(oi.color_image_url,''), oi.size, oi.quantity, oi.subtotal,
		 COALESCE(p.image_url,'')
		 FROM orders o
		 LEFT JOIN order_items oi ON oi.order_id = o.id
		 LEFT JOIN products p ON p.id = oi.product_id
		 WHERE o.user_id=$1 AND o.deleted_at IS NULL
		 ORDER BY o.created_at DESC, oi.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orderMap := make(map[int]*models.Order)
	var orderIDs []int

	for rows.Next() {
		var o models.Order
		var oiID, oiOrderID, oiProductID sql.NullInt64
		var oiProductName, oiColorName, oiColorImageUrl, oiSize, oiImageUrl sql.NullString
		var oiProductPrice, oiSubtotal sql.NullFloat64
		var oiQuantity sql.NullInt64

		err := rows.Scan(&o.ID, &o.UserID, &o.Total, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
			&o.ShippingName, &o.ShippingPhone, &o.ShippingAddress, &o.ShippingCity, &o.ShippingPostalCode, &o.ShippingCountry,
			&o.WompiTransactionID, &o.WompiStatus, &o.WompiReference, &o.CreatedAt, &o.DeletedAt,
			&oiID, &oiOrderID, &oiProductID, &oiProductName, &oiProductPrice, &oiColorName, &oiColorImageUrl, &oiSize, &oiQuantity, &oiSubtotal, &oiImageUrl)
		if err != nil {
			return nil, err
		}

		if existing, ok := orderMap[o.ID]; ok {
			if oiID.Valid {
				item := models.OrderItem{
					ID:            int(oiID.Int64),
					OrderID:       int(oiOrderID.Int64),
					ColorName:     oiColorName.String,
					ColorImageUrl: oiColorImageUrl.String,
					Size:          oiSize.String,
					Quantity:      int(oiQuantity.Int64),
					Subtotal:      oiSubtotal.Float64,
					ProductName:   oiProductName.String,
					ProductPrice:  oiProductPrice.Float64,
					ImageUrl:      oiImageUrl.String,
				}
				if oiProductID.Valid {
					pid := int(oiProductID.Int64)
					item.ProductID = &pid
				}
				existing.Items = append(existing.Items, item)
			}
		} else {
			o.Items = []models.OrderItem{}
			if oiID.Valid {
				item := models.OrderItem{
					ID:            int(oiID.Int64),
					OrderID:       int(oiOrderID.Int64),
					ColorName:     oiColorName.String,
					ColorImageUrl: oiColorImageUrl.String,
					Size:          oiSize.String,
					Quantity:      int(oiQuantity.Int64),
					Subtotal:      oiSubtotal.Float64,
					ProductName:   oiProductName.String,
					ProductPrice:  oiProductPrice.Float64,
					ImageUrl:      oiImageUrl.String,
				}
				if oiProductID.Valid {
					pid := int(oiProductID.Int64)
					item.ProductID = &pid
				}
				o.Items = append(o.Items, item)
			}
			orderMap[o.ID] = &o
			orderIDs = append(orderIDs, o.ID)
		}
	}

	orders := make([]models.Order, 0, len(orderIDs))
	for _, id := range orderIDs {
		orders = append(orders, *orderMap[id])
	}
	return orders, nil
}

func (r *OrderRepo) FindByID(id int) (*models.Order, error) {
	o, err := scanOrder(r.db.DB.QueryRow(
		`SELECT id, user_id, total, status, payment_status, payment_method,
		 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
		 COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at, deleted_at
		 FROM orders WHERE id=$1`, id))
	if err != nil {
		return nil, err
	}
	o.Items = r.findItems(o.ID)
	return o, nil
}

func (r *OrderRepo) Create(userID int, req *models.CreateOrderRequest,
	cartItems []models.CartItem, total float64) (*models.Order, error) {

	tx, err := r.db.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("error iniciando transacción: %w", err)
	}
	defer tx.Rollback()

	for _, ci := range cartItems {
		if ci.Product != nil {
			var currentStock int
			tx.QueryRow(`SELECT stock FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, ci.Product.ID).Scan(&currentStock)
			if currentStock != -1 && currentStock < 1 {
				return nil, ErrInsufficientStock
			}
		}
		if ci.ColorID != nil && *ci.ColorID > 0 {
			var colorStock int
			tx.QueryRow(`SELECT stock FROM product_colors WHERE id=$1 FOR UPDATE`, *ci.ColorID).Scan(&colorStock)
			if colorStock != -1 && colorStock < 1 {
				return nil, ErrInsufficientStock
			}
			if ci.Size != "" {
				var invStock int
				err := tx.QueryRow(`SELECT stock FROM inventory WHERE color_id=$1 AND size=$2 FOR UPDATE`, *ci.ColorID, ci.Size).Scan(&invStock)
				if err == nil && invStock != -1 && invStock < 1 {
					return nil, ErrInsufficientStock
				}
			}
		}
	}

	pm := req.PaymentMethod
	if pm == "" {
		pm = "cash_on_delivery"
	}
	orderStatus := "pending"
	if pm == "cash_on_delivery" {
		orderStatus = "processing"
	}
	o, err := scanOrder(tx.QueryRow(
		`INSERT INTO orders (user_id, total, status, payment_method,
		 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, user_id, total, status, payment_status, payment_method,
		 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
		 COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at`,
		userID, total, orderStatus, pm, req.ShippingName, req.ShippingPhone, req.ShippingAddress,
		req.ShippingCity, req.ShippingPostalCode, req.ShippingCountry))
	if err != nil {
		return nil, err
	}

	for _, ci := range cartItems {
		qty := ci.Quantity
		if qty <= 0 {
			qty = 1
		}
		subtotal := 0.0
		if ci.Product != nil {
			subtotal = ci.Product.Price * float64(qty)
		}
		colorName := ""
		productName := ""
		productPrice := 0.0
		if ci.Product != nil {
			productName = ci.Product.Name
			productPrice = ci.Product.Price
		}
		if ci.Color != nil {
			colorName = ci.Color.Name
		}
		colorImageURL := ""
		if ci.Color != nil {
			colorImageURL = ci.Color.ImageURL
		}
		var productID *int
		if ci.Product != nil {
			productID = &ci.Product.ID
		}

		item := &models.OrderItem{}
		err := tx.QueryRow(
			`INSERT INTO order_items (order_id, product_id, product_name, product_price, color_name, color_image_url, size, quantity, subtotal)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id, order_id, product_id, product_name, product_price, color_name, color_image_url, size, quantity, subtotal`,
			o.ID, productID, productName, productPrice, colorName, colorImageURL, ci.Size, qty, subtotal,
		).Scan(&item.ID, &item.OrderID, &item.ProductID, &item.ProductName, &item.ProductPrice,
			&item.ColorName, &item.ColorImageUrl, &item.Size, &item.Quantity, &item.Subtotal)
		if err != nil {
			return nil, fmt.Errorf("error insertando item: %w", err)
		}
		o.Items = append(o.Items, *item)

		if ci.Product != nil {
			_, err = tx.Exec(
				`UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock != -1`,
				qty, ci.Product.ID)
			if err != nil {
				return nil, fmt.Errorf("error actualizando stock producto: %w", err)
			}
		}
		if ci.ColorID != nil && *ci.ColorID > 0 {
			_, err = tx.Exec(
				`UPDATE product_colors SET stock = stock - $1 WHERE id = $2 AND stock != -1`,
				qty, *ci.ColorID)
			if err != nil {
				return nil, fmt.Errorf("error actualizando stock color: %w", err)
			}
			if ci.Size != "" {
				_, err = tx.Exec(
					`UPDATE inventory SET stock = stock - $1 WHERE color_id = $2 AND size = $3 AND stock != -1`,
					qty, *ci.ColorID, ci.Size)
				if err != nil {
					return nil, fmt.Errorf("error actualizando inventory: %w", err)
				}
			}
		}
	}

	if _, err := tx.Exec(`DELETE FROM cart_items WHERE user_id=$1`, userID); err != nil {
		return nil, fmt.Errorf("error vaciando carrito: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("error confirmando transacción: %w", err)
	}

	return o, nil
}

func (r *OrderRepo) UpdateStatus(id int, status, paymentStatus string) error {
	_, err := r.db.DB.Exec(
		`UPDATE orders SET status=$1, payment_status=$2, updated_at=NOW() WHERE id=$3`,
		status, paymentStatus, id)
	return err
}

func (r *OrderRepo) FindAllWithFilters(status, paymentStatus string) ([]models.Order, error) {
	query := `SELECT id, user_id, total, status, payment_status, payment_method,
	 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
	 COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at, deleted_at
	 FROM orders WHERE deleted_at IS NULL`
	var args []interface{}
	argIdx := 1

	if status != "" {
		query += fmt.Sprintf(" AND status=$%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	if paymentStatus != "" {
		query += fmt.Sprintf(" AND payment_status=$%d", argIdx)
		args = append(args, paymentStatus)
		argIdx++
	}
	query += " ORDER BY created_at DESC"

	rows, err := r.db.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		o.Items = r.findItems(o.ID)
		orders = append(orders, *o)
	}
	return orders, nil
}

func (r *OrderRepo) FindRecent(limit int) ([]models.Order, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, user_id, total, status, payment_status, payment_method,
		 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
		 COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at, deleted_at
		 FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		o.Items = r.findItems(o.ID)
		orders = append(orders, *o)
	}
	return orders, nil
}

func (r *OrderRepo) GetDashboardStats() (*models.DashboardStats, error) {
	stats := &models.DashboardStats{}
	err := r.db.DB.QueryRow(
		`SELECT COALESCE(SUM(total), 0), COUNT(*),
		 COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END), 0)
		 FROM orders`,
	).Scan(&stats.TotalRevenue, &stats.TotalOrders, &stats.PendingOrders)
	if err != nil {
		return nil, err
	}

	err = r.db.DB.QueryRow(
		`SELECT COUNT(*) FROM users WHERE role='customer'`,
	).Scan(&stats.TotalCustomers)
	if err != nil {
		return nil, err
	}

	stats.RecentOrders, _ = r.FindRecent(5)
	if stats.RecentOrders == nil {
		stats.RecentOrders = []models.Order{}
	}

	return stats, nil
}

func (r *OrderRepo) findItems(orderID int) []models.OrderItem {
	rows, err := r.db.DB.Query(
		`SELECT oi.id, oi.order_id, oi.product_id, oi.product_name, oi.product_price, oi.color_name, COALESCE(oi.color_image_url,''), oi.size, oi.quantity, oi.subtotal,
		 COALESCE(p.image_url,'')
		 FROM order_items oi
		 LEFT JOIN products p ON p.id = oi.product_id
		 WHERE oi.order_id=$1`, orderID)
	if err != nil {
		return []models.OrderItem{}
	}
	defer rows.Close()

	var items []models.OrderItem
	for rows.Next() {
		var item models.OrderItem
		if err := rows.Scan(&item.ID, &item.OrderID, &item.ProductID, &item.ProductName,
			&item.ProductPrice, &item.ColorName, &item.ColorImageUrl, &item.Size, &item.Quantity, &item.Subtotal, &item.ImageUrl); err != nil {
			continue
		}
		items = append(items, item)
	}
	if items == nil {
		items = []models.OrderItem{}
	}
	return items
}

func (r *OrderRepo) LogActivity(userID int, action, entity string, entityID int, ip string) error {
	var uid *int
	if userID > 0 {
		uid = &userID
	}
	_, err := r.db.DB.Exec(
		`INSERT INTO activity_logs (user_id, action, entity, entity_id, ip_address) VALUES ($1, $2, $3, $4, $5)`,
		uid, action, entity, entityID, ip)
	return err
}

func (r *OrderRepo) GetLogs() ([]models.ActivityLog, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, user_id, action, entity, entity_id, ip_address, created_at
		 FROM activity_logs ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.ActivityLog
	for rows.Next() {
		var l models.ActivityLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Action, &l.Entity, &l.EntityID, &l.IPAddress, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (r *OrderRepo) GetPaymentMethods() ([]models.PaymentMethod, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, name, description, enabled, created_at FROM payment_methods ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var methods []models.PaymentMethod
	for rows.Next() {
		var m models.PaymentMethod
		if err := rows.Scan(&m.ID, &m.Name, &m.Description, &m.Enabled, &m.CreatedAt); err != nil {
			return nil, err
		}
		methods = append(methods, m)
	}
	return methods, nil
}

func (r *OrderRepo) UpdatePaymentMethod(id int, enabled bool) error {
	_, err := r.db.DB.Exec(`UPDATE payment_methods SET enabled = $1 WHERE id = $2`, enabled, id)
	return err
}

func (r *OrderRepo) GetEnabledPaymentMethods() ([]models.PaymentMethod, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, name, description, enabled, created_at FROM payment_methods WHERE enabled = true ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var methods []models.PaymentMethod
	for rows.Next() {
		var m models.PaymentMethod
		if err := rows.Scan(&m.ID, &m.Name, &m.Description, &m.Enabled, &m.CreatedAt); err != nil {
			return nil, err
		}
		methods = append(methods, m)
	}
	return methods, nil
}

func (r *OrderRepo) GetSettings() ([]models.Setting, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, key, value FROM settings ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var settings []models.Setting
	for rows.Next() {
		var s models.Setting
		if err := rows.Scan(&s.ID, &s.Key, &s.Value); err != nil {
			return nil, err
		}
		settings = append(settings, s)
	}
	return settings, nil
}

func (r *OrderRepo) UpdateSetting(key, value string) error {
	_, err := r.db.DB.Exec(
		`INSERT INTO settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`, key, value)
	return err
}

func (r *OrderRepo) SaveWompiTransaction(orderID int, transactionID, status, reference string) error {
	_, err := r.db.DB.Exec(
		`UPDATE orders SET wompi_transaction_id=$1, wompi_status=$2, wompi_reference=$3, updated_at=NOW() WHERE id=$4`,
		transactionID, status, reference, orderID)
	return err
}

func (r *OrderRepo) CancelOrder(orderID, userID int) error {
	tx, err := r.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var orderUserID int
	var createdAt time.Time
	err = tx.QueryRow(`SELECT user_id, created_at FROM orders WHERE id=$1 FOR UPDATE`, orderID).Scan(&orderUserID, &createdAt)
	if err != nil {
		return err
	}
	if orderUserID != userID {
		return errors.New("no autorizado")
	}
	if time.Since(createdAt) > 2*time.Hour {
		return errors.New("no se puede cancelar después de 2 horas")
	}

	rows, err := tx.Query(`SELECT product_id, color_name, size, quantity FROM order_items WHERE order_id=$1`, orderID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type itemInfo struct {
		productID *int
		colorName string
		size      string
		quantity  int
	}
	var items []itemInfo
	for rows.Next() {
		var it itemInfo
		if err := rows.Scan(&it.productID, &it.colorName, &it.size, &it.quantity); err != nil {
			return err
		}
		if it.quantity <= 0 {
			it.quantity = 1
		}
		items = append(items, it)
	}

	for _, it := range items {
		if it.productID != nil {
			tx.Exec(`UPDATE products SET stock = stock + $1 WHERE id = $2 AND stock != -1`, it.quantity, *it.productID)
		}
		var colorID int
		if it.colorName != "" {
			tx.QueryRow(`SELECT id FROM product_colors WHERE product_id=$1 AND name=$2`, it.productID, it.colorName).Scan(&colorID)
			if colorID > 0 {
				tx.Exec(`UPDATE product_colors SET stock = stock + $1 WHERE id = $2 AND stock != -1`, it.quantity, colorID)
				if it.size != "" {
					tx.Exec(`UPDATE inventory SET stock = stock + $1 WHERE color_id = $2 AND size = $3 AND stock != -1`, it.quantity, colorID, it.size)
				}
			}
		}
		if it.productID != nil {
			var existingCartID int
			err := tx.QueryRow(
				`SELECT id FROM cart_items WHERE user_id=$1 AND product_id=$2 AND COALESCE(color_id,0)=$3 AND COALESCE(size,'')=$4`,
				userID, *it.productID, colorID, it.size).Scan(&existingCartID)
			if err != nil {
				tx.Exec(`INSERT INTO cart_items (user_id, product_id, color_id, size, quantity) VALUES ($1, $2, $3, NULLIF($4,''), $5)`,
					userID, *it.productID, colorID, it.size, it.quantity)
			} else {
				tx.Exec(`UPDATE cart_items SET quantity = quantity + $1 WHERE id=$2`, it.quantity, existingCartID)
			}
		}
	}

	tx.Exec(`UPDATE orders SET status='cancelled' WHERE id=$1`, orderID)

	return tx.Commit()
}

func buildQuery(base string, conditions []string, args []interface{}) (string, []interface{}) {
	if len(conditions) > 0 {
		base += " WHERE " + strings.Join(conditions, " AND ")
	}
	return base, args
}

func (r *OrderRepo) AdminTrashOrder(orderID int) error {
	_, err := r.db.DB.Exec(`UPDATE orders SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, orderID)
	return err
}

func (r *OrderRepo) AdminTrashOrders(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	_, err := r.db.DB.Exec(
		fmt.Sprintf(`UPDATE orders SET deleted_at=NOW() WHERE id IN (%s) AND deleted_at IS NULL`, strings.Join(placeholders, ",")),
		args...)
	return err
}

func (r *OrderRepo) AdminTrashAllOrders() error {
	_, err := r.db.DB.Exec(`UPDATE orders SET deleted_at=NOW() WHERE deleted_at IS NULL`)
	return err
}

func (r *OrderRepo) FindTrashedOrders() ([]models.Order, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, user_id, total, status, payment_status, payment_method,
		 shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, shipping_country,
		 COALESCE(wompi_transaction_id,''), COALESCE(wompi_status,''), COALESCE(wompi_reference,''), created_at, deleted_at
		 FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		o.Items = r.findItems(o.ID)
		orders = append(orders, *o)
	}
	return orders, nil
}

func (r *OrderRepo) RestoreOrder(orderID int) error {
	_, err := r.db.DB.Exec(`UPDATE orders SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL`, orderID)
	return err
}

func (r *OrderRepo) RestoreOrders(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	_, err := r.db.DB.Exec(
		fmt.Sprintf(`UPDATE orders SET deleted_at=NULL WHERE id IN (%s) AND deleted_at IS NOT NULL`, strings.Join(placeholders, ",")),
		args...)
	return err
}

func (r *OrderRepo) PermanentDeleteOrder(orderID int) error {
	tx, err := r.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	tx.Exec(`DELETE FROM order_items WHERE order_id=$1`, orderID)
	tx.Exec(`DELETE FROM orders WHERE id=$1`, orderID)
	return tx.Commit()
}

func (r *OrderRepo) PermanentDeleteOrders(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	tx, err := r.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	ph := strings.Join(placeholders, ",")
	tx.Exec(fmt.Sprintf(`DELETE FROM order_items WHERE order_id IN (%s)`, ph), args...)
	tx.Exec(fmt.Sprintf(`DELETE FROM orders WHERE id IN (%s)`, ph), args...)
	return tx.Commit()
}

func (r *OrderRepo) EmptyOrdersTrash() error {
	tx, err := r.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	tx.Exec(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE deleted_at IS NOT NULL)`)
	tx.Exec(`DELETE FROM orders WHERE deleted_at IS NOT NULL`)
	return tx.Commit()
}

package repository

import (
	"latrode-fusion/internal/database"
	"latrode-fusion/internal/models"
)

type CartRepo struct {
	db *database.DB
}

func NewCartRepo(db *database.DB) *CartRepo {
	return &CartRepo{db: db}
}

func (r *CartRepo) FindByUserID(userID int) ([]models.CartItem, error) {
	rows, err := r.db.DB.Query(
		`SELECT ci.id, ci.user_id, ci.product_id, ci.color_id, ci.size, ci.quantity, ci.created_at,
		        COALESCE(pc.id, 0), COALESCE(pc.name, ''), COALESCE(pc.hex, ''), COALESCE(pc.image_url, '')
		 FROM cart_items ci
		 LEFT JOIN product_colors pc ON pc.id = ci.color_id
		 WHERE ci.user_id=$1 ORDER BY ci.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.CartItem
	for rows.Next() {
		var item models.CartItem
		var colorID int
		var colorName, colorHex, colorImage string
		err := rows.Scan(&item.ID, &item.UserID, &item.ProductID, &item.ColorID,
			&item.Size, &item.Quantity, &item.CreatedAt,
			&colorID, &colorName, &colorHex, &colorImage)
		if err != nil {
			return nil, err
		}
		if item.Quantity == 0 {
			item.Quantity = 1
		}
		if colorName != "" && item.ColorID != nil {
			item.Color = &models.Color{
				ID:       colorID,
				Name:     colorName,
				Hex:      colorHex,
				ImageURL: colorImage,
			}
		}
		items = append(items, item)
	}

	for i := range items {
		items[i].Product = r.getProduct(items[i].ProductID)
	}

	return items, nil
}

func (r *CartRepo) AddItem(userID, productID, colorID int, size string, quantity int) error {
	if quantity <= 0 {
		quantity = 1
	}

	tx, err := r.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var existingID int
	err = tx.QueryRow(
		`SELECT id FROM cart_items WHERE user_id=$1 AND product_id=$2 AND color_id=$3 AND size=$4`,
		userID, productID, colorID, size,
	).Scan(&existingID)

	if err == nil {
		_, err = tx.Exec(
			`UPDATE cart_items SET quantity = quantity + $1 WHERE id=$2`,
			quantity, existingID)
		if err != nil {
			return err
		}
		return tx.Commit()
	}

	_, err = tx.Exec(
		`INSERT INTO cart_items (user_id, product_id, color_id, size, quantity)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, productID, colorID, size, quantity)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *CartRepo) RemoveItem(itemID, userID int) error {
	_, err := r.db.DB.Exec(
		`DELETE FROM cart_items WHERE id=$1 AND user_id=$2`, itemID, userID)
	return err
}

func (r *CartRepo) UpdateQuantity(itemID, userID, quantity int) error {
	if quantity <= 0 {
		return r.RemoveItem(itemID, userID)
	}
	_, err := r.db.DB.Exec(
		`UPDATE cart_items SET quantity=$1 WHERE id=$2 AND user_id=$3`,
		quantity, itemID, userID)
	return err
}

func (r *CartRepo) Clear(userID int) error {
	_, err := r.db.DB.Exec(`DELETE FROM cart_items WHERE user_id=$1`, userID)
	return err
}

func (r *CartRepo) getProduct(productID int) *models.Product {
	p, err := scanProduct(r.db.DB.QueryRow(
		`SELECT id, name, description, price, stock, category, image_url, sizes, material, care, created_at
		 FROM products WHERE id=$1`, productID))
	if err != nil {
		return nil
	}
	return p
}

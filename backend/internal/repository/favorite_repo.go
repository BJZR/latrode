package repository

import (
	"latrode-fusion/internal/database"
	"latrode-fusion/internal/models"
)

type FavoriteRepo struct {
	db *database.DB
}

func NewFavoriteRepo(db *database.DB) *FavoriteRepo {
	return &FavoriteRepo{db: db}
}

func (r *FavoriteRepo) FindByUserID(userID int) ([]models.Favorite, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, user_id, product_id, created_at FROM favorites WHERE user_id=$1
		 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var favs []models.Favorite
	for rows.Next() {
		var f models.Favorite
		if err := rows.Scan(&f.ID, &f.UserID, &f.ProductID, &f.CreatedAt); err != nil {
			return nil, err
		}
		favs = append(favs, f)
	}

	for i := range favs {
		p, err := scanProduct(r.db.DB.QueryRow(
			`SELECT id, name, description, price, stock, category, image_url, sizes, material, care, created_at
			 FROM products WHERE id=$1`, favs[i].ProductID))
		if err == nil {
			favs[i].Product = p
		}
	}

	return favs, nil
}

func (r *FavoriteRepo) Add(userID, productID int) error {
	_, err := r.db.DB.Exec(
		`INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, productID)
	return err
}

func (r *FavoriteRepo) Remove(favID, userID int) error {
	_, err := r.db.DB.Exec(
		`DELETE FROM favorites WHERE id=$1 AND user_id=$2`, favID, userID)
	return err
}

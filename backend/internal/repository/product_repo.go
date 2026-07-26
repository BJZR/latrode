package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"latrode-fusion/internal/database"
	"latrode-fusion/internal/models"
)

type ProductRepo struct {
	db *database.DB
}

func NewProductRepo(db *database.DB) *ProductRepo {
	return &ProductRepo{db: db}
}

func scanProduct(s scannable) (*models.Product, error) {
	p := &models.Product{}
	var sizesStr string
	err := s.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock,
		&p.Category, &p.ImageURL, &sizesStr, &p.Material, &p.Care, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(sizesStr), &p.Sizes); err != nil || p.Sizes == nil {
		p.Sizes = []string{}
	}
	return p, nil
}

func (r *ProductRepo) FindAll() ([]models.Product, error) {
	rows, err := r.db.DB.Query(
		`SELECT id, name, description, price, stock, category, image_url, sizes, material, care, created_at
		 FROM products ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, *p)
	}
	r.loadColorsForProducts(products)
	return products, nil
}

func (r *ProductRepo) Count() (int, error) {
	var total int
	err := r.db.DB.QueryRow(`SELECT COUNT(*) FROM products WHERE stock > 0`).Scan(&total)
	return total, err
}

func (r *ProductRepo) FindAllPaginated(page, limit int) ([]models.Product, error) {
	offset := (page - 1) * limit
	rows, err := r.db.DB.Query(
		`SELECT id, name, description, price, stock, category, image_url, sizes, material, care, created_at
		 FROM products WHERE stock > 0 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, *p)
	}
	r.loadColorsForProducts(products)
	if products == nil {
		products = []models.Product{}
	}
	return products, nil
}

func (r *ProductRepo) FindByID(id int) (*models.Product, error) {
	p, err := scanProduct(r.db.DB.QueryRow(
		`SELECT id, name, description, price, stock, category, image_url, sizes, material, care, created_at
		 FROM products WHERE id=$1`, id))
	if err != nil {
		return nil, err
	}
	p.Colors = r.findColors(p.ID)
	return p, nil
}

func (r *ProductRepo) Search(query string) ([]models.Product, error) {
	return r.SearchFiltered(query, "", "", 0, 0, 1, 100)
}

func (r *ProductRepo) CountSearch(query string) (int, error) {
	return r.CountFiltered(query, "", "", 0, 0)
}

func (r *ProductRepo) SearchPaginated(query string, page, limit int) ([]models.Product, error) {
	return r.SearchFiltered(query, "", "", 0, 0, page, limit)
}

const productCols = `id, name, description, price, stock, category, image_url, sizes, material, care, created_at`

func (r *ProductRepo) buildFilter(query, name, category string, minPrice, maxPrice float64) (string, []interface{}) {
	var conds []string
	var args []interface{}
	argIdx := 1

	conds = append(conds, "stock > 0")

	if query != "" {
		tsQuery := "plainto_tsquery('spanish', $" + strconv.Itoa(argIdx) + ")"
		conds = append(conds, fmt.Sprintf("search_vector @@ %s", tsQuery))
		args = append(args, query)
		argIdx++
		if _, err := strconv.ParseFloat(query, 64); err == nil {
			conds[len(conds)-1] = fmt.Sprintf("(%s OR CAST(price AS TEXT) LIKE $%d)", conds[len(conds)-1], argIdx)
			q := "%" + strings.ToLower(query) + "%"
			args = append(args, q)
			argIdx++
		}
	}
	if name != "" {
		conds = append(conds, fmt.Sprintf("LOWER(name) LIKE $%d", argIdx))
		args = append(args, "%"+strings.ToLower(name)+"%")
		argIdx++
	}
	if category != "" {
		conds = append(conds, fmt.Sprintf("LOWER(category) LIKE $%d", argIdx))
		args = append(args, "%"+strings.ToLower(category)+"%")
		argIdx++
	}
	if minPrice > 0 {
		conds = append(conds, fmt.Sprintf("price >= $%d", argIdx))
		args = append(args, minPrice)
		argIdx++
	}
	if maxPrice > 0 {
		conds = append(conds, fmt.Sprintf("price <= $%d", argIdx))
		args = append(args, maxPrice)
		argIdx++
	}

	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}
	return where, args
}

func (r *ProductRepo) SearchFiltered(query, name, category string, minPrice, maxPrice float64, page, limit int) ([]models.Product, error) {
	where, args := r.buildFilter(query, name, category, minPrice, maxPrice)
	offset := (page - 1) * limit

	orderBy := "created_at DESC"
	if query != "" {
		orderBy = fmt.Sprintf("ts_rank(search_vector, plainto_tsquery('spanish', $%d)) DESC, id", len(args))
	}

	q := fmt.Sprintf(`SELECT %s FROM products%s ORDER BY %s LIMIT $%d OFFSET $%d`,
		productCols, where, orderBy, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := r.db.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, *p)
	}
	r.loadColorsForProducts(products)
	if products == nil {
		products = []models.Product{}
	}
	return products, nil
}

func (r *ProductRepo) CountFiltered(query, name, category string, minPrice, maxPrice float64) (int, error) {
	where, args := r.buildFilter(query, name, category, minPrice, maxPrice)
	var total int
	q := fmt.Sprintf(`SELECT COUNT(*) FROM products%s`, where)
	err := r.db.DB.QueryRow(q, args...).Scan(&total)
	return total, err
}

func (r *ProductRepo) Create(req *models.CreateProductRequest) (*models.Product, error) {
	sizesJSON, _ := json.Marshal(req.Sizes)

	p, err := scanProduct(r.db.DB.QueryRow(
		`INSERT INTO products (name, description, price, stock, category, image_url, sizes, material, care)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, name, description, price, stock, category, image_url, sizes, material, care, created_at`,
		req.Name, req.Description, req.Price, req.Stock, req.Category,
		req.ImageURL, string(sizesJSON), req.Material, req.Care))
	if err != nil {
		return nil, err
	}

	colors, err := r.saveColors(p.ID, req.Colors)
	if err != nil {
		return nil, err
	}
	p.Colors = colors

	var totalStock int
	for _, c := range colors {
		totalStock += c.Stock
	}
	r.db.DB.Exec(`UPDATE products SET stock=$1 WHERE id=$2`, totalStock, p.ID)
	p.Stock = totalStock
	return p, nil
}

func (r *ProductRepo) saveColors(productID int, cols []models.ColorInput) ([]models.Color, error) {
	var colors []models.Color
	for _, c := range cols {
		color, err := scanColor(r.db.DB.QueryRow(
			`INSERT INTO product_colors (product_id, name, hex, stock) VALUES ($1, $2, $3, $4)
			 RETURNING id, product_id, name, hex, stock`, productID, c.Name, c.Hex, c.Stock))
		if err != nil {
			return nil, err
		}
		r.saveSizeStocks(color.ID, c.Sizes)
		color.Sizes = r.findSizeStocks(color.ID)

		var totalSizeStock int
		for _, s := range color.Sizes {
			totalSizeStock += s.Stock
		}
		if len(color.Sizes) > 0 {
			r.db.DB.Exec(`UPDATE product_colors SET stock=$1 WHERE id=$2`, totalSizeStock, color.ID)
			color.Stock = totalSizeStock
		}

		colors = append(colors, *color)
	}
	return colors, nil
}

func (r *ProductRepo) saveSizeStocks(colorID int, sizes []models.SizeStockInput) {
	for _, s := range sizes {
		r.db.DB.Exec(
			`INSERT INTO inventory (color_id, size, stock) VALUES ($1, $2, $3)
			 ON CONFLICT (color_id, size) DO UPDATE SET stock=$3`,
			colorID, s.Size, s.Stock)
	}
}

func (r *ProductRepo) Update(id int, req *models.CreateProductRequest) (*models.Product, error) {
	sizesJSON, _ := json.Marshal(req.Sizes)

	p, err := scanProduct(r.db.DB.QueryRow(
		`UPDATE products SET name=$1, description=$2, price=$3, stock=$4, category=$5,
		 image_url=$6, sizes=$7, material=$8, care=$9, updated_at=NOW()
		 WHERE id=$10
		 RETURNING id, name, description, price, stock, category, image_url, sizes, material, care, created_at`,
		req.Name, req.Description, req.Price, req.Stock, req.Category,
		req.ImageURL, string(sizesJSON), req.Material, req.Care, id))
	if err != nil {
		return nil, err
	}

	oldColors := r.findColors(id)
	for _, oc := range oldColors {
		r.db.DB.Exec(`DELETE FROM inventory WHERE color_id=$1`, oc.ID)
	}
	r.db.DB.Exec(`DELETE FROM product_colors WHERE product_id=$1`, id)

	colors, err := r.saveColors(id, req.Colors)
	if err != nil {
		return nil, err
	}
	p.Colors = colors

	var totalStock int
	for _, c := range colors {
		totalStock += c.Stock
	}
	r.db.DB.Exec(`UPDATE products SET stock=$1 WHERE id=$2`, totalStock, id)
	p.Stock = totalStock
	return p, nil
}

func (r *ProductRepo) FindTopSelling(limit int) ([]models.Product, error) {
	rows, err := r.db.DB.Query(
		`SELECT p.id, p.name, p.description, p.price, p.stock, p.category, p.image_url, p.sizes, p.material, p.care, p.created_at
		 FROM products p
		 LEFT JOIN order_items oi ON oi.product_id = p.id
		 GROUP BY p.id
		 ORDER BY COALESCE(SUM(oi.quantity), 0) DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, *p)
	}
	r.loadColorsForProducts(products)
	return products, nil
}

func (r *ProductRepo) Delete(id int) error {
	_, err := r.db.DB.Exec(`DELETE FROM products WHERE id=$1`, id)
	return err
}

func (r *ProductRepo) findSizeStocks(colorID int) []models.SizeStock {
	rows, err := r.db.DB.Query(
		`SELECT size, stock FROM inventory WHERE color_id=$1 ORDER BY size`, colorID)
	if err != nil {
		return []models.SizeStock{}
	}
	defer rows.Close()

	var sizes []models.SizeStock
	for rows.Next() {
		var s models.SizeStock
		if err := rows.Scan(&s.Size, &s.Stock); err != nil {
			continue
		}
		sizes = append(sizes, s)
	}
	if sizes == nil {
		sizes = []models.SizeStock{}
	}
	return sizes
}

func (r *ProductRepo) findColors(productID int) []models.Color {
	rows, err := r.db.DB.Query(
		`SELECT id, product_id, name, hex, stock FROM product_colors WHERE product_id=$1`, productID)
	if err != nil {
		return []models.Color{}
	}
	defer rows.Close()

	var colors []models.Color
	for rows.Next() {
		c, err := scanColor(rows)
		if err != nil {
			continue
		}
		c.Sizes = r.findSizeStocks(c.ID)
		colors = append(colors, *c)
	}
	if colors == nil {
		colors = []models.Color{}
	}
	return colors
}

func scanColor(s scannable) (*models.Color, error) {
	c := &models.Color{}
	err := s.Scan(&c.ID, &c.ProductID, &c.Name, &c.Hex, &c.Stock)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *ProductRepo) loadColorsForProducts(products []models.Product) {
	if len(products) == 0 {
		return
	}
	ids := make([]interface{}, len(products))
	placeholders := make([]string, len(products))
	for i, p := range products {
		ids[i] = p.ID
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	colorQuery := fmt.Sprintf(
		`SELECT id, product_id, name, hex, stock FROM product_colors WHERE product_id IN (%s)`,
		strings.Join(placeholders, ","))

	rows, err := r.db.DB.Query(colorQuery, ids...)
	if err != nil {
		return
	}
	defer rows.Close()

	colorByProduct := make(map[int][]models.Color)
	var allColorIDs []interface{}
	for rows.Next() {
		c, err := scanColor(rows)
		if err != nil {
			continue
		}
		colorByProduct[c.ProductID] = append(colorByProduct[c.ProductID], *c)
		allColorIDs = append(allColorIDs, c.ID)
	}
	rows.Close()

	sizeByColor := make(map[int][]models.SizeStock)
	if len(allColorIDs) > 0 {
		ph := make([]string, len(allColorIDs))
		for i := range allColorIDs {
			ph[i] = fmt.Sprintf("$%d", i+1)
		}
		sizeQuery := fmt.Sprintf(
			`SELECT color_id, size, stock FROM inventory WHERE color_id IN (%s) ORDER BY color_id, size`,
			strings.Join(ph, ","))
		srows, err := r.db.DB.Query(sizeQuery, allColorIDs...)
		if err == nil {
			defer srows.Close()
			for srows.Next() {
				var colorID int
				var ss models.SizeStock
				if err := srows.Scan(&colorID, &ss.Size, &ss.Stock); err != nil {
					continue
				}
				sizeByColor[colorID] = append(sizeByColor[colorID], ss)
			}
		}
	}

	for i := range products {
		colors := colorByProduct[products[i].ID]
		if colors == nil {
			colors = []models.Color{}
		}
		for ci := range colors {
			sizes := sizeByColor[colors[ci].ID]
			if sizes == nil {
				sizes = []models.SizeStock{}
			}
			colors[ci].Sizes = sizes
		}
		products[i].Colors = colors
	}

}

var _ scannable = &sql.Row{}
var _ scannable = &sql.Rows{}

package models

import "time"

type User struct {
	ID             int       `json:"id"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	PasswordHash   string    `json:"-"`
	Role           string    `json:"role"`
	GoogleID       string    `json:"googleId,omitempty"`
	HasPassword    bool      `json:"hasPassword"`
	Phone          string    `json:"phone"`
	Address        string    `json:"address"`
	City           string    `json:"city"`
	PostalCode     string    `json:"postalCode"`
	Country        string    `json:"country"`
	DocumentType   string    `json:"documentType"`
	DocumentNumber string    `json:"documentNumber"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Session struct {
	ID        int       `json:"id"`
	UserID    int       `json:"userId"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type Product struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	FinalPrice  float64   `json:"finalPrice"`
	Stock       int       `json:"stock"`
	Category    string    `json:"category"`
	ImageURL    string    `json:"imageUrl"`
	Sizes       []string  `json:"sizes"`
	Material    string    `json:"material"`
	Care        string    `json:"care"`
	Colors      []Color   `json:"colors,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type SizeStock struct {
	Size  string `json:"size"`
	Stock int    `json:"stock"`
}

type Color struct {
	ID        int         `json:"id"`
	ProductID int         `json:"productId"`
	Name      string      `json:"name"`
	Hex       string      `json:"hex"`
	Stock     int         `json:"stock"`
	ImageURL  string      `json:"imageUrl"`
	Sizes     []SizeStock `json:"sizes,omitempty"`
}

type CartItem struct {
	ID        int       `json:"id"`
	UserID    int       `json:"userId"`
	ProductID int       `json:"productId"`
	ColorID   *int      `json:"colorId"`
	Size      string    `json:"size"`
	Quantity  int       `json:"quantity"`
	Product   *Product  `json:"product,omitempty"`
	Color     *Color    `json:"color,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type Favorite struct {
	ID        int       `json:"id"`
	UserID    int       `json:"userId"`
	ProductID int       `json:"productId"`
	Product   *Product  `json:"product,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type Order struct {
	ID                 int         `json:"id"`
	UserID             int         `json:"userId"`
	Total              float64     `json:"total"`
	Status             string      `json:"status"`
	PaymentStatus      string      `json:"paymentStatus"`
	PaymentMethod      string      `json:"paymentMethod"`
	ShippingName       string      `json:"shippingName"`
	ShippingPhone      string      `json:"shippingPhone"`
	ShippingAddress    string      `json:"shippingAddress"`
	ShippingCity       string      `json:"shippingCity"`
	ShippingPostalCode string      `json:"shippingPostalCode"`
	ShippingCountry    string      `json:"shippingCountry"`
	WompiTransactionID string      `json:"wompiTransactionId,omitempty"`
	WompiStatus        string      `json:"wompiStatus,omitempty"`
	WompiReference     string      `json:"wompiReference,omitempty"`
	Items              []OrderItem `json:"items,omitempty"`
	CreatedAt          time.Time   `json:"createdAt"`
}

type OrderItem struct {
	ID            int     `json:"id"`
	OrderID       int     `json:"orderId"`
	ProductID     *int    `json:"productId"`
	ProductName   string  `json:"productName"`
	ProductPrice  float64 `json:"productPrice"`
	ImageUrl      string  `json:"imageUrl"`
	ColorImageUrl string  `json:"colorImageUrl"`
	ColorName     string  `json:"colorName"`
	Size          string  `json:"size"`
	Quantity      int     `json:"quantity"`
	Subtotal      float64 `json:"subtotal"`
}

type PaymentMethod struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Setting struct {
	ID    int    `json:"id"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

type ActivityLog struct {
	ID        int       `json:"id"`
	UserID    *int      `json:"userId"`
	Action    string    `json:"action"`
	Entity    string    `json:"entity"`
	EntityID  int       `json:"entityId"`
	IPAddress string    `json:"ipAddress"`
	CreatedAt time.Time `json:"createdAt"`
}

type DashboardStats struct {
	TotalRevenue   float64   `json:"totalRevenue"`
	TotalOrders    int       `json:"totalOrders"`
	PendingOrders  int       `json:"pendingOrders"`
	TotalCustomers int       `json:"totalCustomers"`
	RecentOrders   []Order   `json:"recentOrders"`
	TopProducts    []Product `json:"topProducts"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	Phone          string `json:"phone"`
	Address        string `json:"address"`
	City           string `json:"city"`
	PostalCode     string `json:"postalCode"`
	Country        string `json:"country"`
	DocumentType   string `json:"documentType"`
	DocumentNumber string `json:"documentNumber"`
}

type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	Limit      int         `json:"limit"`
	TotalPages int         `json:"totalPages"`
}

type AddToCartRequest struct {
	ProductID int    `json:"productId"`
	ColorID   int    `json:"colorId"`
	Size      string `json:"size"`
	Quantity  int    `json:"quantity"`
}

type CreateOrderRequest struct {
	ShippingName       string `json:"shippingName"`
	ShippingPhone      string `json:"shippingPhone"`
	ShippingAddress    string `json:"shippingAddress"`
	ShippingCity       string `json:"shippingCity"`
	ShippingPostalCode string `json:"shippingPostalCode"`
	ShippingCountry    string `json:"shippingCountry"`
	PaymentMethod      string `json:"paymentMethod"`
}

type CreateProductRequest struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Price       float64      `json:"price"`
	Stock       int          `json:"stock"`
	Category    string       `json:"category"`
	ImageURL    string       `json:"imageUrl"`
	Sizes       []string     `json:"sizes"`
	Material    string       `json:"material"`
	Care        string       `json:"care"`
	Colors      []ColorInput `json:"colors"`
}

type SizeStockInput struct {
	Size  string `json:"size"`
	Stock int    `json:"stock"`
}

type ColorInput struct {
	Name     string           `json:"name"`
	Hex      string           `json:"hex"`
	Stock    int              `json:"stock"`
	ImageURL string           `json:"imageUrl"`
	Sizes    []SizeStockInput `json:"sizes,omitempty"`
}

type UpdateOrderStatusRequest struct {
	Status        string `json:"status"`
	PaymentStatus string `json:"paymentStatus"`
}

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"latrode-fusion/internal/config"
	"latrode-fusion/internal/database"
	"latrode-fusion/internal/email"
	"latrode-fusion/internal/handlers"
	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/repository"
	"latrode-fusion/internal/wompi"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := db.RunMigrations("migrations"); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}
	db.Seed()

	userRepo := repository.NewUserRepo(db)
	productRepo := repository.NewProductRepo(db)
	cartRepo := repository.NewCartRepo(db)
	favRepo := repository.NewFavoriteRepo(db)
	orderRepo := repository.NewOrderRepo(db)
	resetRepo := repository.NewPasswordResetRepo(db)

	authHandler := handlers.NewAuthHandler(userRepo, resetRepo, cfg)
	productHandler := handlers.NewProductHandler(productRepo, orderRepo)
	cartHandler := handlers.NewCartHandler(cartRepo, orderRepo)
	favHandler := handlers.NewFavoriteHandler(favRepo, orderRepo)
	wompiCfg := &wompi.Config{
		PublicKey:    cfg.WompiPublicKey,
		SecretKey:    cfg.WompiSecretKey,
		IntegrityKey: cfg.WompiIntegrityKey,
		EventsKey:    cfg.WompiEventsKey,
		Sandbox:      cfg.WompiSandbox,
	}
	wompiClient := wompi.NewClient(wompiCfg)

	emailService := email.NewService(db, cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom)
	emailService.StartCron()

	adminHandler := handlers.NewAdminHandler(orderRepo, productRepo, userRepo, emailService)
	orderHandler := handlers.NewOrderHandler(orderRepo, cartRepo, cfg)
	paymentHandler := handlers.NewPaymentHandler(orderRepo, cartRepo, wompiClient, wompiCfg)
	oauthHandler := handlers.NewOAuthHandler(cfg, userRepo)
	uploadHandler := handlers.NewUploadHandler(cfg)

	auth := middleware.Auth(userRepo)
	adminEmail := "latrode.co@gmail.com"
	adminAuth := middleware.AdminOnly(adminEmail)
	optionalAuth := middleware.OptionalAuth(userRepo)

	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		for range ticker.C {
			n, err := userRepo.CleanupExpiredSessions()
			if err == nil && n > 0 {
				log.Printf("Limpieza de sesiones: %d sesiones expiradas eliminadas", n)
			}
		}
	}()

	loginLimiter := middleware.NewRateLimiter(10, time.Minute)
	resetLimiter := middleware.NewRateLimiter(3, time.Minute)

	wrap := func(fn http.HandlerFunc) http.Handler {
		return http.HandlerFunc(fn)
	}

	api := http.NewServeMux()

	api.HandleFunc("GET /products", productHandler.List)
	api.HandleFunc("GET /products/{id}", productHandler.Get)
	api.HandleFunc("GET /payment-methods", paymentHandler.ListMethods)
	api.HandleFunc("GET /settings", adminHandler.GetPublicSettings)
	api.HandleFunc("GET /email-quota", func(w http.ResponseWriter, r *http.Request) {
		used, limit, available := emailService.GetQuotaStatus()
		middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"used":      used,
			"limit":     limit,
			"available": available,
		})
	})
	api.Handle("POST /payments/create-nequi", auth(wrap(paymentHandler.CreateNequiPayment)))
	api.Handle("POST /payments/create-daviplata", auth(wrap(paymentHandler.CreateDaviplataPayment)))
	api.Handle("POST /payments/create-bancolombia-transfer", auth(wrap(paymentHandler.CreateBancolombiaTransferPayment)))
	api.Handle("GET /payments/status", auth(wrap(paymentHandler.CheckTransaction)))
	api.HandleFunc("POST /payments/webhook", paymentHandler.Webhook)

	api.HandleFunc("GET /auth/google/login", oauthHandler.GoogleLogin)
	api.HandleFunc("GET /auth/google/callback", oauthHandler.GoogleCallback)

	api.Handle("POST /auth/register", middleware.RateLimit(loginLimiter)(wrap(authHandler.Register)))
	api.Handle("POST /auth/login", middleware.RateLimit(loginLimiter)(wrap(authHandler.Login)))
	api.HandleFunc("POST /auth/logout", authHandler.Logout)
	api.Handle("POST /auth/forgot-password", middleware.RateLimit(resetLimiter)(wrap(authHandler.ForgotPassword)))
	api.Handle("POST /auth/verify-reset-code", middleware.RateLimit(resetLimiter)(wrap(authHandler.VerifyResetCode)))
	api.Handle("POST /auth/reset-password", middleware.RateLimit(resetLimiter)(wrap(authHandler.ResetPassword)))
	api.Handle("GET /auth/profile", auth(wrap(authHandler.GetProfile)))
	api.Handle("PUT /auth/profile", auth(wrap(authHandler.UpdateProfile)))
	api.Handle("POST /auth/set-password", auth(wrap(authHandler.SetPassword)))

	api.Handle("GET /cart", optionalAuth(wrap(cartHandler.GetCart)))
	api.Handle("POST /cart", optionalAuth(wrap(cartHandler.AddToCart)))
	api.Handle("PUT /cart/{id}", optionalAuth(wrap(cartHandler.UpdateCartItem)))
	api.Handle("DELETE /cart/{id}", optionalAuth(wrap(cartHandler.RemoveFromCart)))
	api.Handle("DELETE /cart", optionalAuth(wrap(cartHandler.ClearCart)))

	api.Handle("GET /favorites", optionalAuth(wrap(favHandler.List)))
	api.Handle("POST /favorites", optionalAuth(wrap(favHandler.Add)))
	api.Handle("DELETE /favorites/{id}", optionalAuth(wrap(favHandler.Remove)))

	api.Handle("POST /orders", optionalAuth(wrap(orderHandler.Create)))
	api.Handle("POST /orders/{id}/cancel", optionalAuth(wrap(orderHandler.Cancel)))
	api.Handle("GET /orders/my", optionalAuth(wrap(orderHandler.GetMyOrders)))
	api.Handle("GET /orders/{id}", optionalAuth(wrap(orderHandler.Get)))

	adminMux := http.NewServeMux()
	adminMux.HandleFunc("GET /dashboard/stats", adminHandler.Dashboard)
	adminMux.HandleFunc("GET /orders", adminHandler.ListOrders)
	adminMux.HandleFunc("PUT /orders/{id}/status", adminHandler.UpdateOrderStatus)
	adminMux.HandleFunc("GET /products", adminHandler.ListProducts)
	adminMux.HandleFunc("POST /products", adminHandler.CreateProduct)
	adminMux.HandleFunc("PUT /products/{id}", adminHandler.UpdateProduct)
	adminMux.HandleFunc("DELETE /products/{id}", adminHandler.TrashProduct)
	adminMux.HandleFunc("GET /users", adminHandler.ListUsers)
	adminMux.HandleFunc("PUT /users/{id}", adminHandler.UpdateUser)
	adminMux.HandleFunc("DELETE /users/{id}", adminHandler.TrashUser)
	adminMux.HandleFunc("DELETE /users", adminHandler.TrashUsers)
	adminMux.HandleFunc("GET /payment-methods", adminHandler.GetPaymentMethods)
	adminMux.HandleFunc("PUT /payment-methods/{id}", adminHandler.UpdatePaymentMethod)
	adminMux.HandleFunc("GET /settings", adminHandler.GetSettings)
	adminMux.HandleFunc("PUT /settings", adminHandler.UpdateSetting)
	adminMux.HandleFunc("GET /logs", adminHandler.GetLogs)
	adminMux.HandleFunc("DELETE /orders/{id}", adminHandler.TrashOrder)
	adminMux.HandleFunc("DELETE /orders", adminHandler.TrashOrders)
	adminMux.HandleFunc("DELETE /orders-all", adminHandler.TrashAllOrders)
	adminMux.HandleFunc("POST /upload", uploadHandler.UploadImage)
	adminMux.HandleFunc("GET /trash/users", adminHandler.GetTrashedUsers)
	adminMux.HandleFunc("GET /trash/orders", adminHandler.GetTrashedOrders)
	adminMux.HandleFunc("GET /trash/products", adminHandler.GetTrashedProducts)
	adminMux.HandleFunc("POST /trash/restore/users/{id}", adminHandler.RestoreUser)
	adminMux.HandleFunc("POST /trash/restore/users", adminHandler.RestoreUsers)
	adminMux.HandleFunc("POST /trash/restore/orders/{id}", adminHandler.RestoreOrder)
	adminMux.HandleFunc("POST /trash/restore/orders", adminHandler.RestoreOrders)
	adminMux.HandleFunc("POST /trash/restore/products/{id}", adminHandler.RestoreProduct)
	adminMux.HandleFunc("DELETE /trash/permanent/products/{id}", adminHandler.PermanentDeleteProduct)
	adminMux.HandleFunc("DELETE /trash/permanent/users/{id}", adminHandler.PermanentDeleteUser)
	adminMux.HandleFunc("DELETE /trash/permanent/users", adminHandler.PermanentDeleteUsers)
	adminMux.HandleFunc("DELETE /trash/permanent/orders/{id}", adminHandler.PermanentDeleteOrder)
	adminMux.HandleFunc("DELETE /trash/permanent/orders", adminHandler.PermanentDeleteOrders)
	adminMux.HandleFunc("DELETE /trash/empty", adminHandler.EmptyTrash)
	api.Handle("/admin/", auth(adminAuth(http.StripPrefix("/admin", adminMux))))

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.DB.Ping(); err != nil {
			middleware.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
			return
		}
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.Handle("/api/v1/", http.StripPrefix("/api/v1", api))

	fs := http.FileServer(http.Dir(cfg.Frontend))
	cacheFs := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, ".html"), strings.HasSuffix(r.URL.Path, ".js"):
			w.Header().Set("Cache-Control", "no-cache")
		case strings.HasSuffix(r.URL.Path, ".css"):
			w.Header().Set("Cache-Control", "public, max-age=3600")
		case strings.HasSuffix(r.URL.Path, ".svg"):
			w.Header().Set("Cache-Control", "no-cache")
		case strings.HasSuffix(r.URL.Path, ".jpg"), strings.HasSuffix(r.URL.Path, ".jpeg"),
			strings.HasSuffix(r.URL.Path, ".png"), strings.HasSuffix(r.URL.Path, ".webp"),
			strings.HasSuffix(r.URL.Path, ".gif"):
			w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
		case strings.HasSuffix(r.URL.Path, ".ttf"), strings.HasSuffix(r.URL.Path, ".woff"),
			strings.HasSuffix(r.URL.Path, ".woff2"):
			w.Header().Set("Cache-Control", "public, max-age=2592000, immutable")
		}
		fs.ServeHTTP(w, r)
	})
	mux.Handle("/assets/", cacheFs)
	mux.Handle("/css/", cacheFs)
	mux.Handle("/js/", cacheFs)
	mux.Handle("/admin/", cacheFs)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			fs.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, cfg.Frontend+"/index.html")
	})

	handler := middleware.Gzip(middleware.Logging(middleware.LimitBody(middleware.APICache(middleware.CSRF(cfg.Production)(middleware.CORS(cfg.AllowedOrigin)(mux))))))

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Servidor iniciado en http://localhost:%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("error en servidor: %v", err)
		}
	}()

	<-quit
	log.Println("Apagando servidor...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("error al apagar servidor: %v", err)
	}

	log.Println("Servidor detenido correctamente")
}

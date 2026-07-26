package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
)

func CSRF(production bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				ensureCSRFCookie(w, r, production)
				next.ServeHTTP(w, r)
				return
			}

			if strings.HasPrefix(r.URL.Path, "/api/v1/payments/webhook") {
				next.ServeHTTP(w, r)
				return
			}

			cookie, err := r.Cookie("csrf_token")
			if err != nil || cookie.Value == "" {
				ensureCSRFCookie(w, r, production)
				next.ServeHTTP(w, r)
				return
			}

			headerToken := r.Header.Get("X-CSRF-Token")
			if headerToken == "" || headerToken != cookie.Value {
				http.Error(w, `{"error":"CSRF token inválido"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func ensureCSRFCookie(w http.ResponseWriter, r *http.Request, production bool) {
	if _, err := r.Cookie("csrf_token"); err == nil {
		return
	}

	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)

	http.SetCookie(w, &http.Cookie{
		Name:     "csrf_token",
		Value:    token,
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
		Secure:   production,
		MaxAge:   3600,
	})
}

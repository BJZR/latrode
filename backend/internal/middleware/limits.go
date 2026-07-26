package middleware

import (
	"net/http"
	"strings"
)

const maxBodySize = 5 << 20

func LimitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" {
			r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
		}
		next.ServeHTTP(w, r)
	})
}

func APICache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			path := r.URL.Path
			switch {
			case strings.HasSuffix(path, "/products") || strings.Contains(path, "/products/"):
				w.Header().Set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
			case strings.HasSuffix(path, "/payment-methods"), strings.HasSuffix(path, "/settings"):
				w.Header().Set("Cache-Control", "private, max-age=120")
			}
		}
		next.ServeHTTP(w, r)
	})
}

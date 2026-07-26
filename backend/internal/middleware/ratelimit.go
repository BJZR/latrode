package middleware

import (
	"net/http"
	"sync"
	"time"
)

type RateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(rl.window)
		rl.mu.Lock()
		now := time.Now()
		for ip, times := range rl.requests {
			var recent []time.Time
			for _, t := range times {
				if now.Sub(t) <= rl.window {
					recent = append(recent, t)
				}
			}
			if len(recent) == 0 {
				delete(rl.requests, ip)
			} else {
				rl.requests[ip] = recent
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	times := rl.requests[ip]

	var recent []time.Time
	for _, t := range times {
		if now.Sub(t) <= rl.window {
			recent = append(recent, t)
		}
	}

	if len(recent) >= rl.limit {
		rl.requests[ip] = recent
		return false
	}

	rl.requests[ip] = append(recent, now)
	return true
}

func RateLimit(rl *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := GetClientIP(r)
			if !rl.Allow(ip) {
				w.Header().Set("Retry-After", "60")
				WriteJSON(w, http.StatusTooManyRequests, APIError{Error: "demasiadas solicitudes, intenta de nuevo en 60 segundos"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

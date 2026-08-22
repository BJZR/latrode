package handlers

import (
	"fmt"
	"net/http"
	"time"

	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/repository"
)

type SitemapHandler struct {
	productRepo *repository.ProductRepo
}

func NewSitemapHandler(productRepo *repository.ProductRepo) *SitemapHandler {
	return &SitemapHandler{productRepo: productRepo}
}

func (h *SitemapHandler) Generate(w http.ResponseWriter, r *http.Request) {
	products, err := h.productRepo.FindAll()
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "database error"})
		return
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")

	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://latrode.shop/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`)

	for _, p := range products {
		lastmod := p.CreatedAt.Format("2006-01-02")
		if p.CreatedAt.IsZero() {
			lastmod = time.Now().Format("2006-01-02")
		}
		fmt.Fprintf(w, `
  <url>
    <loc>https://latrode.shop/#product-%d</loc>
    <lastmod>%s</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`, p.ID, lastmod)
	}

	fmt.Fprint(w, `
</urlset>`)
}

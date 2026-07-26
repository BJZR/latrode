package handlers

import (
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"latrode-fusion/internal/config"
	"latrode-fusion/internal/middleware"
)

type UploadHandler struct {
	frontendPath string
}

func NewUploadHandler(cfg *config.Config) *UploadHandler {
	return &UploadHandler{frontendPath: cfg.Frontend}
}

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
}

const maxUploadSize = 5 << 20 // 5MB

func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1024)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "archivo demasiado máximo 5MB"})
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "no se proporcionó imagen"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExtensions[ext] {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "formato no permitido usa JPG, PNG, WebP o GIF"})
		return
	}

	if header.Size > maxUploadSize {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "archivo demasiado máximo 5MB"})
		return
	}

	filename := generateFilename(ext)

	destDir := filepath.Join(h.frontendPath, "assets", "img")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear directorio"})
		return
	}

	destPath := filepath.Join(destDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al guardar archivo"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al guardar archivo"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]string{
		"filename": filename,
		"url":      "/assets/img/" + filename,
	})
}

func generateFilename(ext string) string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x%s", b, ext)
}

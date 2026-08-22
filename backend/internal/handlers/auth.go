package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"latrode-fusion/internal/config"
	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/models"
	"latrode-fusion/internal/repository"
)

type AuthHandler struct {
	userRepo  *repository.UserRepo
	resetRepo *repository.PasswordResetRepo
	smtpCfg   *config.Config
}

func NewAuthHandler(userRepo *repository.UserRepo, resetRepo *repository.PasswordResetRepo, smtpCfg *config.Config) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, resetRepo: resetRepo, smtpCfg: smtpCfg}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if req.Username == "" || req.Email == "" || req.Password == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "todos los campos son requeridos"})
		return
	}

	if len(req.Password) < 6 {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "la contraseña debe tener al menos 6 caracteres"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al procesar contraseña"})
		return
	}

	user, err := h.userRepo.Create(req.Username, req.Email, string(hash))
	if err != nil {
		if isPGDuplicate(err) {
			middleware.WriteJSON(w, http.StatusConflict, middleware.APIError{Error: "el email o usuario ya existe"})
			return
		}
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al registrar usuario"})
		return
	}

	token := middleware.GenerateSessionToken()
	if err := h.userRepo.CreateSession(user.ID, token); err == nil {
		http.SetCookie(w, &http.Cookie{
			Name:     "session_id",
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   h.smtpCfg.Production,
			MaxAge:   7 * 24 * 3600,
		})
	}

	middleware.WriteJSON(w, http.StatusCreated, user)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	user, err := h.userRepo.FindByEmail(req.Email)
	if err != nil {
		middleware.WriteJSON(w, http.StatusNotFound, middleware.APIError{Error: "email_not_found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "email o contraseña incorrectos"})
		return
	}

	h.userRepo.DeleteSessionsForUser(user.ID)

	token := middleware.GenerateSessionToken()
	if err := h.userRepo.CreateSession(user.ID, token); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al crear sesión"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.smtpCfg.Production,
		MaxAge:   7 * 24 * 3600,
	})

	middleware.WriteJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := ""
	c, err := r.Cookie("session_id")
	if err == nil {
		token = c.Value
	}
	if token == "" {
		token = r.Header.Get("X-Session-Id")
	}

	if token != "" {
		h.userRepo.DeleteSession(token)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.smtpCfg.Production,
		MaxAge:   -1,
	})

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "sesión cerrada"})
}

func (h *AuthHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}
	middleware.WriteJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "datos inválidos"})
		return
	}

	if err := h.userRepo.UpdateProfile(user.ID, &req); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar perfil"})
		return
	}

	user.Phone = req.Phone
	user.Address = req.Address
	user.City = req.City
	user.PostalCode = req.PostalCode
	user.Country = req.Country
	user.DocumentType = req.DocumentType
	user.DocumentNumber = req.DocumentNumber

	middleware.WriteJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "no autorizado"})
		return
	}

	var req struct {
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewPassword == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "nueva contraseña requerida"})
		return
	}

	if len(req.NewPassword) < 6 {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "la contraseña debe tener al menos 6 caracteres"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al procesar contraseña"})
		return
	}

	if err := h.userRepo.UpdatePasswordByID(user.ID, string(hash)); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al guardar contraseña"})
		return
	}

	h.userRepo.DeleteSessionsForUser(user.ID)

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "contraseña establecida exitosamente"})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "email requerido"})
		return
	}

	user, err := h.userRepo.FindByEmail(req.Email)
	if err != nil {
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "si el email existe, recibirás un código de recuperación"})
		return
	}

	if user.GoogleID != "" && user.PasswordHash == "" {
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "si el email existe, recibirás un código de recuperación"})
		return
	}

	code := generateCode()
	if err := h.resetRepo.InvalidateByEmail(req.Email); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al procesar solicitud"})
		return
	}
	if err := h.resetRepo.Create(req.Email, code, time.Now().Add(15*time.Minute)); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al procesar solicitud"})
		return
	}

	subject := "Código de recuperación - Latrode"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
	<div style="background:#1a1a1a;padding:24px;text-align:center">
		<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px">LATRODE</h1>
	</div>
	<div style="padding:32px;text-align:center">
		<h2 style="color:#333;margin:0 0 8px">Recupera tu contraseña</h2>
		<p style="color:#666;margin:0 0 24px">Usa el siguiente código para restablecer tu contraseña:</p>
		<div style="background:#f9f9f9;border:2px dashed #ccc;border-radius:8px;padding:20px;margin:0 0 24px">
			<span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;font-family:monospace">%s</span>
		</div>
		<p style="color:#888;font-size:13px;margin:0 0 8px">Este código expira en <strong>15 minutos</strong>.</p>
		<p style="color:#888;font-size:13px;margin:0">Si no solicitaste este cambio, ignora este mensaje.</p>
	</div>
	<div style="background:#f9f9f9;padding:16px;text-align:center;color:#aaa;font-size:12px">
		Latrode &copy; %d
	</div>
</div>
</body>
</html>`, code, time.Now().Year())

	go func() {
		if h.smtpCfg.SMTPUser != "" {
			if err := middleware.SendEmail(h.smtpCfg, req.Email, subject, body); err != nil {
				fmt.Printf("Error enviando email: %v\n", err)
			}
		}
	}()

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "si el email existe, recibirás un código de recuperación"})
}

func (h *AuthHandler) VerifyResetCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Code == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "email y código requeridos"})
		return
	}

	valid, err := h.resetRepo.FindValid(req.Email, req.Code)
	if err != nil || !valid {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "código inválido o expirado"})
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "código válido"})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Code == "" || req.NewPassword == "" {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "todos los campos son requeridos"})
		return
	}

	if len(req.NewPassword) < 6 {
		middleware.WriteJSON(w, http.StatusBadRequest, middleware.APIError{Error: "la contraseña debe tener al menos 6 caracteres"})
		return
	}

	valid, err := h.resetRepo.FindValid(req.Email, req.Code)
	if err != nil || !valid {
		middleware.WriteJSON(w, http.StatusUnauthorized, middleware.APIError{Error: "código inválido o expirado"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al procesar contraseña"})
		return
	}

	if err := h.userRepo.UpdatePassword(req.Email, string(hash)); err != nil {
		middleware.WriteJSON(w, http.StatusInternalServerError, middleware.APIError{Error: "error al actualizar contraseña"})
		return
	}

	user, _ := h.userRepo.FindByEmail(req.Email)
	if user != nil {
		h.userRepo.DeleteSessionsForUser(user.ID)
	}

	h.resetRepo.MarkUsed(req.Email, req.Code)
	h.resetRepo.InvalidateByEmail(req.Email)

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"message": "contraseña actualizada exitosamente"})
}

func isPGDuplicate(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "duplicate key") ||
		strings.Contains(err.Error(), "23505"))
}

func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	return hex.EncodeToString(b)
}

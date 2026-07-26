package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"latrode-fusion/internal/config"
	"latrode-fusion/internal/middleware"
	"latrode-fusion/internal/repository"
)

type OAuthHandler struct {
	cfg      *config.Config
	userRepo *repository.UserRepo
}

func NewOAuthHandler(cfg *config.Config, userRepo *repository.UserRepo) *OAuthHandler {
	return &OAuthHandler{cfg: cfg, userRepo: userRepo}
}

func (h *OAuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	if h.cfg.GoogleClientID == "" {
		http.Error(w, "Google OAuth no configurado", http.StatusInternalServerError)
		return
	}

	state := randomState()
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   300,
		SameSite: http.SameSiteLaxMode,
	})

	v := url.Values{}
	v.Set("client_id", h.cfg.GoogleClientID)
	v.Set("redirect_uri", h.cfg.GoogleRedirectURL)
	v.Set("response_type", "code")
	v.Set("scope", "email profile")
	v.Set("state", state)
	v.Set("access_type", "online")
	v.Set("prompt", "select_account")

	http.Redirect(w, r, "https://accounts.google.com/o/oauth2/v2/auth?"+v.Encode(), http.StatusFound)
}

type googleTokenResp struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
}

type googleUserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (h *OAuthHandler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value == "" || cookie.Value != state {
		http.Error(w, "state inválido", http.StatusBadRequest)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	token, err := h.exchangeCode(code)
	if err != nil {
		http.Error(w, "error al intercambiar código: "+err.Error(), http.StatusInternalServerError)
		return
	}

	info, err := h.fetchUserInfo(token.AccessToken)
	if err != nil {
		http.Error(w, "error al obtener info de usuario: "+err.Error(), http.StatusInternalServerError)
		return
	}

	user, err := h.userRepo.FindByEmail(info.Email)
	if err != nil {
		user, err = h.userRepo.CreateFromGoogle(info.Name, info.Email, info.ID)
		if err != nil {
			http.Error(w, "error al crear usuario: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	sessionToken := middleware.GenerateSessionToken()
	if err := h.userRepo.CreateSession(user.ID, sessionToken); err != nil {
		http.Error(w, "error al crear sesión", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   7 * 24 * 3600,
	})

	frontendURL := h.cfg.Frontend
	if strings.HasPrefix(frontendURL, "../") {
		http.Redirect(w, r, "/", http.StatusFound)
	} else {
		http.Redirect(w, r, "/", http.StatusFound)
	}
}

func (h *OAuthHandler) exchangeCode(code string) (*googleTokenResp, error) {
	v := url.Values{}
	v.Set("code", code)
	v.Set("client_id", h.cfg.GoogleClientID)
	v.Set("client_secret", h.cfg.GoogleClientSecret)
	v.Set("redirect_uri", h.cfg.GoogleRedirectURL)
	v.Set("grant_type", "authorization_code")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", v)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token response %d: %s", resp.StatusCode, string(body))
	}

	var t googleTokenResp
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, fmt.Errorf("token parse: %w", err)
	}
	return &t, nil
}

func (h *OAuthHandler) fetchUserInfo(accessToken string) (*googleUserInfo, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("userinfo response %d: %s", resp.StatusCode, string(body))
	}

	var info googleUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("userinfo parse: %w", err)
	}
	return &info, nil
}

func randomState() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

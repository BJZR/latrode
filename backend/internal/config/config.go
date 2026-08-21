package config

import (
	"bufio"
	"log"
	"os"
	"strings"
)

func init() {
	loadEnvFile(".env")
	loadEnvFile("../.env")
}

func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("error reading .env: %v", err)
	}
}

type Config struct {
	Port               string
	DBHost             string
	DBPort             string
	DBUser             string
	DBPass             string
	DBName             string
	Frontend           string
	ImagesDir          string
	SecretKey          string
	AllowedOrigin      string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	SMTPHost           string
	SMTPPort           string
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	TgBotToken         string
	TgChatID           string
	WompiPublicKey     string
	WompiSecretKey     string
	WompiIntegrityKey  string
	WompiEventsKey     string
	WompiSandbox       bool
	Production         bool
}

func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8080"),
		DBHost:             getEnv("DB_HOST", "localhost"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "postgres"),
		DBPass:             getEnv("DB_PASS", ""),
		DBName:             getEnv("DB_NAME", "latrode"),
		Frontend:           getEnv("FRONTEND_PATH", "../frontend"),
		ImagesDir:          getEnv("IMAGES_DIR", "../imgs"),
		SecretKey:          getEnv("SECRET_KEY", ""),
		AllowedOrigin:      getEnv("ALLOWED_ORIGIN", ""),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", ""),
		SMTPHost:           getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:           getEnv("SMTP_PORT", "587"),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", ""),
		TgBotToken:         getEnv("TG_BOT_TOKEN", ""),
		TgChatID:           getEnv("TG_CHAT_ID", ""),
		WompiPublicKey:     getEnv("WOMPI_PUBLIC_KEY", ""),
		WompiSecretKey:     getEnv("WOMPI_SECRET_KEY", ""),
		WompiIntegrityKey:  getEnv("WOMPI_INTEGRITY_KEY", ""),
		WompiEventsKey:     getEnv("WOMPI_EVENTS_KEY", ""),
		WompiSandbox:       getEnv("WOMPI_SANDBOX", "true") == "true",
		Production:         getEnv("APP_ENV", "development") == "production",
	}
}

func (c *Config) DatabaseURL() string {
	return "postgres://" + c.DBUser + ":" + c.DBPass + "@" + c.DBHost + ":" + c.DBPort + "/" + c.DBName + "?sslmode=disable"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

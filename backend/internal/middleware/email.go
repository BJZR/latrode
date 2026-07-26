package middleware

import (
	"fmt"
	"net/smtp"

	"latrode-fusion/internal/config"
)

func SendEmail(cfg *config.Config, to, subject, body string) error {
	if cfg.SMTPUser == "" {
		return nil
	}
	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		cfg.SMTPFrom, to, subject, body))
	addr := fmt.Sprintf("%s:%s", cfg.SMTPHost, cfg.SMTPPort)
	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, msg)
}

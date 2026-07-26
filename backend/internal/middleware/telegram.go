package middleware

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"latrode-fusion/internal/config"
	"latrode-fusion/internal/models"
)

var telegramClient = &http.Client{
	Timeout: 10 * time.Second,
}

func SendOrderNotification(cfg *config.Config, order *models.Order, user *models.User) {
	if cfg.TgBotToken == "" || cfg.TgChatID == "" {
		return
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("*Orden \\#%d*\n", order.ID))
	b.WriteString(fmt.Sprintf("*Cliente:* %s\n", escapeMD(user.Username)))
	b.WriteString(fmt.Sprintf("*Email:* %s\n", escapeMD(user.Email)))
	if user.Phone != "" {
		b.WriteString(fmt.Sprintf("*Telefono:* %s\n", escapeMD(user.Phone)))
	}
	b.WriteString(fmt.Sprintf("*Direccion:* %s, %s %s %s\n",
		escapeMD(user.Address), escapeMD(user.City), escapeMD(user.PostalCode), escapeMD(user.Country)))
	b.WriteString(fmt.Sprintf("*Envio a:* %s\n", escapeMD(order.ShippingName)))
	b.WriteString(fmt.Sprintf("*Metodo de pago:* %s\n\n", escapeMD(order.PaymentMethod)))

	b.WriteString("*Productos:*\n")
	for i, item := range order.Items {
		line := fmt.Sprintf("  %d\\. %s", i+1, escapeMD(item.ProductName))
		if item.ColorName != "" {
			line += fmt.Sprintf(" \\(%s\\)", escapeMD(item.ColorName))
		}
		if item.Size != "" {
			line += fmt.Sprintf(" \\[%s\\]", escapeMD(item.Size))
		}
		line += fmt.Sprintf(" x%d \\$%.0f\n", item.Quantity, item.Subtotal)
		b.WriteString(line)
	}

	b.WriteString(fmt.Sprintf("\n*Total: \\$%.0f*", order.Total))

	go func() {
		body := fmt.Sprintf(`{"chat_id":"%s","text":"%s","parse_mode":"MarkdownV2"}`, cfg.TgChatID, escapeJSON(b.String()))
		resp, err := telegramClient.Post(
			fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.TgBotToken),
			"application/json",
			bytes.NewReader([]byte(body)),
		)
		if err != nil {
			log.Printf("[Telegram] error: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			log.Printf("[Telegram] status %d: %s", resp.StatusCode, string(respBody))
		}
	}()
}

func escapeMD(s string) string {
	replacer := strings.NewReplacer(
		"_", "\\_",
		"*", "\\*",
		"[", "\\[",
		"]", "\\]",
		"(", "\\(",
		")", "\\)",
		"~", "\\~",
		"`", "\\`",
		">", "\\>",
		"#", "\\#",
		"+", "\\+",
		"-", "\\-",
		"=", "\\=",
		"|", "\\|",
		"{", "\\{",
		"}", "\\}",
		".", "\\.",
		"!", "\\!",
		"$", "\\$",
	)
	return replacer.Replace(s)
}

func escapeJSON(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

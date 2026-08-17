package email

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"

	"latrode-fusion/internal/database"
)

const dailyLimit = 500

type Service struct {
	db     *database.DB
	auth   smtp.Auth
	from   string
	host   string
	port   string
	client *smtp.Client
}

func NewService(db *database.DB, host, port, user, pass, from string) *Service {
	return &Service{
		db:   db,
		auth: smtp.PlainAuth("", user, pass, host),
		from: from,
		host: host,
		port: port,
	}
}

func (s *Service) SendOrderConfirmation(orderID int, recipientEmail, username string, total float64, items []OrderItem) error {
	subject := fmt.Sprintf("Confirmación de pedido #%d - Latrode", orderID)
	body := s.buildOrderConfirmationHTML(orderID, username, total, items)

	canSend, err := s.canSendNow()
	if err != nil {
		log.Printf("[Email] error checking quota: %v", err)
		return s.enqueue(orderID, recipientEmail, subject, body)
	}

	if !canSend {
		log.Printf("[Email] daily limit reached (%d), queuing email for order #%d", dailyLimit, orderID)
		return s.enqueue(orderID, recipientEmail, subject, body)
	}

	if err := s.sendSMTP(recipientEmail, subject, body); err != nil {
		log.Printf("[Email] SMTP error for order #%d: %v, queuing", orderID, err)
		return s.enqueue(orderID, recipientEmail, subject, body)
	}

	s.incrementCount()
	log.Printf("[Email] confirmation sent for order #%d to %s", orderID, recipientEmail)
	return nil
}

func (s *Service) canSendNow() (bool, error) {
	var count int
	today := time.Now().Format("2006-01-02")
	err := s.db.DB.QueryRow(`SELECT count FROM email_daily_count WHERE date=$1`, today).Scan(&count)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return true, nil
		}
		return false, err
	}
	return count < dailyLimit, nil
}

func (s *Service) incrementCount() {
	today := time.Now().Format("2006-01-02")
	_, err := s.db.DB.Exec(`
		INSERT INTO email_daily_count (date, count) VALUES ($1, 1)
		ON CONFLICT (date) DO UPDATE SET count = email_daily_count.count + 1`, today)
	if err != nil {
		log.Printf("[Email] error incrementing count: %v", err)
	}
}

func (s *Service) enqueue(orderID int, recipientEmail, subject, body string) error {
	_, err := s.db.DB.Exec(`
		INSERT INTO email_queue (order_id, recipient_email, subject, body, status)
		VALUES ($1, $2, $3, $4, 'pending')`, orderID, recipientEmail, subject, body)
	return err
}

func (s *Service) sendSMTP(to, subject, htmlBody string) error {
	addr := s.host + ":" + s.port
	headers := map[string]string{
		"From":         s.from,
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": "text/html; charset=UTF-8",
	}
	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	return smtp.SendMail(addr, s.auth, s.from, []string{to}, []byte(msg.String()))
}

func (s *Service) ProcessQueue() int {
	rows, err := s.db.DB.Query(`
		SELECT id, order_id, recipient_email, subject, body, attempts
		FROM email_queue WHERE status='pending' AND attempts < 3
		ORDER BY created_at ASC LIMIT 10`)
	if err != nil {
		log.Printf("[Email queue] query error: %v", err)
		return 0
	}
	defer rows.Close()

	type pendingEmail struct {
		id       int
		orderID  int
		to       string
		subject  string
		body     string
		attempts int
	}
	var emails []pendingEmail
	for rows.Next() {
		var e pendingEmail
		if err := rows.Scan(&e.id, &e.orderID, &e.to, &e.subject, &e.body, &e.attempts); err != nil {
			continue
		}
		emails = append(emails, e)
	}

	sent := 0
	for _, e := range emails {
		canSend, _ := s.canSendNow()
		if !canSend {
			log.Printf("[Email queue] quota reached, stopping queue processing")
			break
		}
		if err := s.sendSMTP(e.to, e.subject, e.body); err != nil {
			s.db.DB.Exec(`UPDATE email_queue SET attempts=attempts+1, last_error=$1 WHERE id=$2`, err.Error(), e.id)
			log.Printf("[Email queue] send error for order #%d: %v", e.orderID, err)
			continue
		}
		s.db.DB.Exec(`UPDATE email_queue SET status='sent', sent_at=NOW() WHERE id=$1`, e.id)
		s.incrementCount()
		sent++
		log.Printf("[Email queue] sent email for order #%d to %s", e.orderID, e.to)
	}
	return sent
}

func (s *Service) StartCron() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			sent := s.ProcessQueue()
			if sent > 0 {
				log.Printf("[Email cron] processed %d queued emails", sent)
			}
		}
	}()
}

func (s *Service) GetQuotaStatus() (int, int, bool) {
	var count int
	today := time.Now().Format("2006-01-02")
	err := s.db.DB.QueryRow(`SELECT COALESCE(count, 0) FROM email_daily_count WHERE date=$1`, today).Scan(&count)
	if err != nil {
		return 0, dailyLimit, true
	}
	return count, dailyLimit, count < dailyLimit
}

type OrderItem struct {
	ProductName  string
	ProductPrice float64
	ColorName    string
	Size         string
	Quantity     int
	Subtotal     float64
}

func (s *Service) buildOrderConfirmationHTML(orderID int, username string, total float64, items []OrderItem) string {
	var rows string
	for _, item := range items {
		colorStr := ""
		if item.ColorName != "" {
			colorStr = fmt.Sprintf(" <span style=\"color:#888\">(%s)</span>", item.ColorName)
		}
		sizeStr := ""
		if item.Size != "" {
			sizeStr = fmt.Sprintf(" <span style=\"color:#888\">[%s]</span>", item.Size)
		}
		qtyStr := ""
		if item.Quantity > 1 {
			qtyStr = fmt.Sprintf(" <span style=\"color:#888\">x%d</span>", item.Quantity)
		}
		rows += fmt.Sprintf(`
			<tr>
				<td style="padding:8px;border-bottom:1px solid #eee">%s%s%s%s</td>
				<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$%s</td>
			</tr>`,
			item.ProductName, colorStr, sizeStr, qtyStr,
			formatNumber(item.Subtotal))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
	<div style="background:#1a1a1a;padding:24px;text-align:center">
		<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px">LATRODE</h1>
	</div>
	<div style="padding:32px">
		<h2 style="color:#333;margin:0 0 8px">Confirmación de pedido</h2>
		<p style="color:#666;margin:0 0 24px">Hola %s, tu pedido #%d ha sido recibido correctamente.</p>
		<table style="width:100%%;border-collapse:collapse;margin-bottom:24px">
			<tr style="background:#f9f9f9">
				<th style="padding:8px;text-align:left;font-size:12px;text-transform:uppercase;color:#888">Producto</th>
				<th style="padding:8px;text-align:right;font-size:12px;text-transform:uppercase;color:#888">Subtotal</th>
			</tr>
			%s
			<tr>
				<td colspan="2" style="padding:12px 8px;font-weight:bold;text-align:right;border-top:2px solid #333">Total</td>
				<td style="padding:12px 8px;font-weight:bold;text-align:right;border-top:2px solid #333;font-size:18px">$%s</td>
			</tr>
		</table>
		<p style="color:#666;font-size:13px">Si tienes alguna pregunta, responde a este correo o contáctanos.</p>
	</div>
	<div style="background:#f9f9f9;padding:16px;text-align:center;color:#aaa;font-size:12px">
		Latrode &copy; %d
	</div>
</div>
</body>
</html>`, username, orderID, rows, formatNumber(total), time.Now().Year())
}

func formatNumber(n float64) string {
	s := fmt.Sprintf("%.0f", n)
	negative := false
	if len(s) > 0 && s[0] == '-' {
		negative = true
		s = s[1:]
	}
	result := ""
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result += "."
		}
		result += string(c)
	}
	if negative {
		result = "-" + result
	}
	return result
}

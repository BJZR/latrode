package repository

import (
	"time"

	"latrode-fusion/internal/database"
)

type PasswordResetRepo struct {
	db *database.DB
}

func NewPasswordResetRepo(db *database.DB) *PasswordResetRepo {
	return &PasswordResetRepo{db: db}
}

func (r *PasswordResetRepo) Create(email, code string, expiresAt time.Time) error {
	_, err := r.db.DB.Exec(
		`INSERT INTO password_reset_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
		email, code, expiresAt)
	return err
}

func (r *PasswordResetRepo) FindValid(email, code string) (bool, error) {
	var id int
	err := r.db.DB.QueryRow(
		`SELECT id FROM password_reset_codes
		 WHERE email=$1 AND code=$2 AND used=FALSE AND expires_at > NOW()
		 ORDER BY created_at DESC LIMIT 1`,
		email, code,
	).Scan(&id)
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *PasswordResetRepo) MarkUsed(email, code string) error {
	_, err := r.db.DB.Exec(
		`UPDATE password_reset_codes SET used=TRUE WHERE email=$1 AND code=$2`,
		email, code)
	return err
}

func (r *PasswordResetRepo) InvalidateByEmail(email string) error {
	_, err := r.db.DB.Exec(
		`UPDATE password_reset_codes SET used=TRUE WHERE email=$1 AND used=FALSE`,
		email)
	return err
}

package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"latrode-fusion/internal/database"
	"latrode-fusion/internal/models"
)

type UserRepo struct {
	db *database.DB
}

func NewUserRepo(db *database.DB) *UserRepo {
	return &UserRepo{db: db}
}

func scanUser(s scannable) (*models.User, error) {
	u := &models.User{}
	err := s.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role,
		&u.GoogleID, &u.AvatarURL, &u.Phone, &u.Address, &u.City, &u.PostalCode, &u.Country,
		&u.DocumentType, &u.DocumentNumber, &u.CreatedAt, &u.DeletedAt)
	if err != nil {
		return nil, err
	}
	u.HasPassword = u.PasswordHash != ""
	return u, nil
}

const userCols = `id, username, email, password_hash, role, COALESCE(google_id,''), COALESCE(avatar_url,''), phone, address, city, postal_code, country, document_type, document_number, created_at, deleted_at`

func (r *UserRepo) Create(username, email, passwordHash string) (*models.User, error) {
	return scanUser(r.db.DB.QueryRow(
		`INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
		 RETURNING `+userCols,
		username, email, passwordHash,
	))
}

func (r *UserRepo) CreateFromGoogle(username, email, googleID, avatarURL string) (*models.User, error) {
	return scanUser(r.db.DB.QueryRow(
		`INSERT INTO users (username, email, password_hash, google_id, avatar_url) VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+userCols,
		username, email, "", googleID, avatarURL,
	))
}

func (r *UserRepo) FindByEmail(email string) (*models.User, error) {
	return scanUser(r.db.DB.QueryRow(
		`SELECT `+userCols+` FROM users WHERE email = $1`, email,
	))
}

func (r *UserRepo) FindByGoogleID(googleID string) (*models.User, error) {
	return scanUser(r.db.DB.QueryRow(
		`SELECT `+userCols+` FROM users WHERE google_id = $1`, googleID,
	))
}

func (r *UserRepo) FindByID(id int) (*models.User, error) {
	return scanUser(r.db.DB.QueryRow(
		`SELECT `+userCols+` FROM users WHERE id = $1`, id,
	))
}

func (r *UserRepo) UpdateProfile(id int, req *models.UpdateProfileRequest) error {
	_, err := r.db.DB.Exec(
		`UPDATE users SET phone=$1, address=$2, city=$3, postal_code=$4, country=$5,
		 document_type=$6, document_number=$7, updated_at=NOW() WHERE id=$8`,
		req.Phone, req.Address, req.City, req.PostalCode, req.Country,
		req.DocumentType, req.DocumentNumber, id)
	return err
}

func (r *UserRepo) UpdatePassword(email, hash string) error {
	_, err := r.db.DB.Exec(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE email=$2`, hash, email)
	return err
}

func (r *UserRepo) UpdatePasswordByID(id int, hash string) error {
	_, err := r.db.DB.Exec(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, hash, id)
	return err
}

func (r *UserRepo) CreateSession(userID int, token string) error {
	_, err := r.db.DB.Exec(
		`INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, token, time.Now().Add(24*time.Hour*7))
	return err
}

func (r *UserRepo) FindSession(token string) (*models.Session, error) {
	r.db.DB.Exec(`DELETE FROM sessions WHERE expires_at < NOW()`)

	s := &models.Session{}
	err := r.db.DB.QueryRow(
		`SELECT id, user_id, token, expires_at FROM sessions
		 WHERE token=$1 AND expires_at > NOW()`, token,
	).Scan(&s.ID, &s.UserID, &s.Token, &s.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *UserRepo) DeleteSession(token string) error {
	_, err := r.db.DB.Exec(`DELETE FROM sessions WHERE token=$1`, token)
	return err
}

func (r *UserRepo) DeleteSessionsForUser(userID int) error {
	_, err := r.db.DB.Exec(`DELETE FROM sessions WHERE user_id=$1`, userID)
	return err
}

func (r *UserRepo) DeleteOldestSessionsForUser(userID int, keep int) error {
	_, err := r.db.DB.Exec(
		`DELETE FROM sessions WHERE user_id=$1 AND id NOT IN (
			SELECT id FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2
		)`, userID, keep)
	return err
}

func (r *UserRepo) CleanupExpiredSessions() (int64, error) {
	result, err := r.db.DB.Exec(`DELETE FROM sessions WHERE expires_at < NOW()`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *UserRepo) FindAll() ([]models.User, error) {
	rows, err := r.db.DB.Query(
		`SELECT ` + userCols + ` FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, nil
}

func (r *UserRepo) FindTrashed() ([]models.User, error) {
	rows, err := r.db.DB.Query(
		`SELECT ` + userCols + ` FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, nil
}

func (r *UserRepo) TrashUser(id int) error {
	_, err := r.db.DB.Exec(`UPDATE users SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id)
	return err
}

func (r *UserRepo) TrashUsers(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	_, err := r.db.DB.Exec(
		fmt.Sprintf(`UPDATE users SET deleted_at=NOW() WHERE id IN (%s) AND deleted_at IS NULL`, strings.Join(placeholders, ",")),
		args...)
	return err
}

func (r *UserRepo) RestoreUser(id int) error {
	_, err := r.db.DB.Exec(`UPDATE users SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL`, id)
	return err
}

func (r *UserRepo) RestoreUsers(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	_, err := r.db.DB.Exec(
		fmt.Sprintf(`UPDATE users SET deleted_at=NULL WHERE id IN (%s) AND deleted_at IS NOT NULL`, strings.Join(placeholders, ",")),
		args...)
	return err
}

func (r *UserRepo) PermanentDeleteUser(id int) error {
	_, err := r.db.DB.Exec(`DELETE FROM users WHERE id=$1`, id)
	return err
}

func (r *UserRepo) PermanentDeleteUsers(ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	_, err := r.db.DB.Exec(
		fmt.Sprintf(`DELETE FROM users WHERE id IN (%s)`, strings.Join(placeholders, ",")),
		args...)
	return err
}

func (r *UserRepo) EmptyTrash() error {
	_, err := r.db.DB.Exec(`DELETE FROM users WHERE deleted_at IS NOT NULL`)
	return err
}

func (r *UserRepo) UpdateAvatarURL(userID int, avatarURL string) error {
	_, err := r.db.DB.Exec(`UPDATE users SET avatar_url=$1 WHERE id=$2`, avatarURL, userID)
	return err
}

func (r *UserRepo) AdminUpdateUser(id int, username, email, role, phone, address, city, postalCode, country, documentType, documentNumber string) error {
	_, err := r.db.DB.Exec(
		`UPDATE users SET username=$2, email=$3, role=$4, phone=$5, address=$6, city=$7,
		 postal_code=$8, country=$9, document_type=$10, document_number=$11, updated_at=NOW()
		 WHERE id=$1`,
		id, username, email, role, phone, address, city, postalCode, country, documentType, documentNumber)
	return err
}

// helper interface for both *sql.Row and *sql.Rows
type scannable interface {
	Scan(dest ...interface{}) error
}

// ensure *sql.Row and *sql.Rows satisfy scannable
var _ scannable = &sql.Row{}
var _ scannable = &sql.Rows{}

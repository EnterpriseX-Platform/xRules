package database

import (
	"fmt"
	"time"

	"xrules-api/internal/config"
	"xrules-api/internal/domain/connection"
	"xrules-api/internal/domain/execution"
	"xrules-api/internal/domain/project"
	"xrules-api/internal/domain/rules"
	"xrules-api/internal/domain/user"
	"xrules-api/internal/domain/workspace"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// New creates a new database connection
func New(cfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := cfg.DSN()

	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	}

	db, err := gorm.Open(postgres.Open(dsn), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql db: %w", err)
	}

	// Set connection pool settings
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Second)

	return db, nil
}

// AutoMigrate runs auto migration for all models
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&user.User{},
		&workspace.Workspace{},
		&workspace.WorkspaceMember{},
		&project.Project{},
		&rules.RulesProject{},
		&connection.Connection{},
		&execution.Execution{},
		&execution.Log{},
	)
}

// Migrate runs database migrations using golang-migrate
func Migrate(cfg config.DatabaseConfig) error {
	// For now, we'll use GORM AutoMigrate
	// In production, you should use proper migration files
	db, err := New(cfg)
	if err != nil {
		return err
	}

	return AutoMigrate(db)
}

// Close closes the database connection
func Close(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// Transaction executes a function within a database transaction
func Transaction(db *gorm.DB, fn func(tx *gorm.DB) error) error {
	return db.Transaction(fn)
}

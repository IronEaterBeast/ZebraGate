package model

import (
	"bytes"
	"errors"
	"log"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGormLoggerIgnoresRecordNotFound(t *testing.T) {
	var buf bytes.Buffer
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: newGormLogger(log.New(&buf, "", 0)),
	})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&TwoFA{}))

	err = db.Where("user_id = ?", 123).First(&TwoFA{}).Error

	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.Empty(t, buf.String())
}

func TestGormLoggerKeepsDatabaseErrors(t *testing.T) {
	var buf bytes.Buffer
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: newGormLogger(log.New(&buf, "", 0)),
	})
	require.NoError(t, err)

	err = db.Where("user_id = ?", 123).First(&TwoFA{}).Error

	require.Error(t, err)
	require.False(t, errors.Is(err, gorm.ErrRecordNotFound))
	require.Contains(t, buf.String(), "no such table")
}

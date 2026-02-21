package errors

import (
	"errors"
	"fmt"
	"net/http"
)

// Application error codes
const (
	ErrCodeUnknown          = "UNKNOWN_ERROR"
	ErrCodeValidation       = "VALIDATION_ERROR"
	ErrCodeNotFound         = "NOT_FOUND"
	ErrCodeUnauthorized     = "UNAUTHORIZED"
	ErrCodeForbidden        = "FORBIDDEN"
	ErrCodeConflict         = "CONFLICT"
	ErrCodeBadRequest       = "BAD_REQUEST"
	ErrCodeInternal         = "INTERNAL_ERROR"
	ErrCodeDatabase         = "DATABASE_ERROR"
	ErrCodeExternalService  = "EXTERNAL_SERVICE_ERROR"
	ErrCodeRateLimit        = "RATE_LIMIT_EXCEEDED"
)

// AppError represents an application error
type AppError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	StatusCode int    `json:"-"`
	Err        error  `json:"-"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s (cause: %v)", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// HTTP status code mapping
func (e *AppError) HTTPStatus() int {
	if e.StatusCode != 0 {
		return e.StatusCode
	}
	return http.StatusInternalServerError
}

// Error constructors
func NewValidationError(message string) *AppError {
	return &AppError{
		Code:       ErrCodeValidation,
		Message:    message,
		StatusCode: http.StatusBadRequest,
	}
}

func NewNotFoundError(resource string) *AppError {
	return &AppError{
		Code:       ErrCodeNotFound,
		Message:    fmt.Sprintf("%s not found", resource),
		StatusCode: http.StatusNotFound,
	}
}

func NewUnauthorizedError(message string) *AppError {
	if message == "" {
		message = "unauthorized"
	}
	return &AppError{
		Code:       ErrCodeUnauthorized,
		Message:    message,
		StatusCode: http.StatusUnauthorized,
	}
}

func NewForbiddenError(message string) *AppError {
	if message == "" {
		message = "forbidden"
	}
	return &AppError{
		Code:       ErrCodeForbidden,
		Message:    message,
		StatusCode: http.StatusForbidden,
	}
}

func NewConflictError(message string) *AppError {
	return &AppError{
		Code:       ErrCodeConflict,
		Message:    message,
		StatusCode: http.StatusConflict,
	}
}

func NewBadRequestError(message string) *AppError {
	return &AppError{
		Code:       ErrCodeBadRequest,
		Message:    message,
		StatusCode: http.StatusBadRequest,
	}
}

func NewInternalError(err error) *AppError {
	return &AppError{
		Code:       ErrCodeInternal,
		Message:    "internal server error",
		StatusCode: http.StatusInternalServerError,
		Err:        err,
	}
}

func NewDatabaseError(err error) *AppError {
	return &AppError{
		Code:       ErrCodeDatabase,
		Message:    "database error",
		StatusCode: http.StatusInternalServerError,
		Err:        err,
	}
}

func NewExternalServiceError(service string, err error) *AppError {
	return &AppError{
		Code:       ErrCodeExternalService,
		Message:    fmt.Sprintf("%s service error", service),
		StatusCode: http.StatusBadGateway,
		Err:        err,
	}
}

func NewRateLimitError() *AppError {
	return &AppError{
		Code:       ErrCodeRateLimit,
		Message:    "rate limit exceeded",
		StatusCode: http.StatusTooManyRequests,
	}
}

// Wrap wraps an error with additional context
func Wrap(err error, code string, message string) *AppError {
	if err == nil {
		return nil
	}
	
	if appErr, ok := err.(*AppError); ok {
		return &AppError{
			Code:       code,
			Message:    message,
			StatusCode: appErr.StatusCode,
			Err:        appErr,
		}
	}
	
	return &AppError{
		Code:       code,
		Message:    message,
		StatusCode: http.StatusInternalServerError,
		Err:        err,
	}
}

// IsNotFound checks if error is not found
func IsNotFound(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrCodeNotFound
	}
	return false
}

// IsValidationError checks if error is validation error
func IsValidationError(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrCodeValidation
	}
	return false
}

// IsUnauthorized checks if error is unauthorized
func IsUnauthorized(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrCodeUnauthorized
	}
	return false
}

// IsForbidden checks if error is forbidden
func IsForbidden(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrCodeForbidden
	}
	return false
}

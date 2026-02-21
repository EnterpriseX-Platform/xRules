package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"

	apperrors "xrules-api/pkg/errors"
)

// handleError handles service errors and sends appropriate HTTP responses
func handleError(c *gin.Context, err error) {
	if appErr, ok := err.(*apperrors.AppError); ok {
		c.JSON(appErr.HTTPStatus(), gin.H{
			"error": gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			},
		})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{
		"error": gin.H{
			"code":    "INTERNAL_ERROR",
			"message": "internal server error",
		},
	})
}

// handleValidationError handles validation errors from binding
func handleValidationError(c *gin.Context, err error) {
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		errors := make([]gin.H, 0, len(validationErrors))
		for _, e := range validationErrors {
			errors = append(errors, gin.H{
				"field":   e.Field(),
				"message": e.Error(),
			})
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "validation failed",
				"details": errors,
			},
		})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{
		"error": gin.H{
			"code":    "VALIDATION_ERROR",
			"message": err.Error(),
		},
	})
}

// parseInt parses a string to int with a default value
func parseInt(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	val, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return val
}

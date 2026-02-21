package handlers

import (
	"net/http"

	"xrules-api/internal/domain/project"
	"xrules-api/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ProjectHandler handles project requests
type ProjectHandler struct {
	projectService service.ProjectService
}

// NewProjectHandler creates a new project handler
func NewProjectHandler(projectService service.ProjectService) *ProjectHandler {
	return &ProjectHandler{projectService: projectService}
}

// Create handles project creation
func (h *ProjectHandler) Create(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	var req project.CreateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	workspaceID, err := uuid.Parse(c.Param("workspaceID"))
	if err != nil {
		handleValidationError(c, err)
		return
	}

	p, err := h.projectService.Create(c.Request.Context(), workspaceID, *userID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, p.ToResponse())
}

// Get handles getting a project by ID
func (h *ProjectHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		handleValidationError(c, err)
		return
	}

	p, err := h.projectService.GetByID(c.Request.Context(), id)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, p.ToResponse())
}

// List handles listing projects for a workspace
func (h *ProjectHandler) List(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspaceID"))
	if err != nil {
		handleValidationError(c, err)
		return
	}

	page := parseInt(c.Query("page"), 1)
	limit := parseInt(c.Query("limit"), 20)
	search := c.Query("search")

	result, err := h.projectService.ListByWorkspace(c.Request.Context(), workspaceID, page, limit, search)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// Update handles project update
func (h *ProjectHandler) Update(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		handleValidationError(c, err)
		return
	}

	var req project.UpdateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	p, err := h.projectService.Update(c.Request.Context(), id, *userID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, p.ToResponse())
}

// Delete handles project deletion
func (h *ProjectHandler) Delete(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		handleValidationError(c, err)
		return
	}

	if err := h.projectService.Delete(c.Request.Context(), id, *userID); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

package handlers

import (
	"net/http"

	"xrules-api/internal/domain/workspace"
	"xrules-api/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// WorkspaceHandler handles workspace requests
type WorkspaceHandler struct {
	workspaceService service.WorkspaceService
}

// NewWorkspaceHandler creates a new workspace handler
func NewWorkspaceHandler(workspaceService service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{workspaceService: workspaceService}
}

// Create handles workspace creation
func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	var req workspace.CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	w, err := h.workspaceService.Create(c.Request.Context(), *userID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, w.ToResponse())
}

// Get handles getting a workspace by ID
func (h *WorkspaceHandler) Get(c *gin.Context) {
	id, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	w, err := h.workspaceService.GetByID(c.Request.Context(), *id)
	if err != nil {
		handleError(c, err)
		return
	}

	resp := w.ToResponse()
	// Get member count
	members, _ := h.workspaceService.GetMembers(c.Request.Context(), w.ID)
	resp.MemberCount = len(members)

	c.JSON(http.StatusOK, resp)
}

// List handles listing workspaces for current user
func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	page, limit := getPagination(c)

	result, err := h.workspaceService.ListByUser(c.Request.Context(), *userID, page, limit)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// Update handles workspace update
func (h *WorkspaceHandler) Update(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	id, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	var req workspace.UpdateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	w, err := h.workspaceService.Update(c.Request.Context(), *id, *userID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, w.ToResponse())
}

// Delete handles workspace deletion
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	id, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	if err := h.workspaceService.Delete(c.Request.Context(), *id, *userID); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// GetMembers handles getting workspace members
func (h *WorkspaceHandler) GetMembers(c *gin.Context) {
	id, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	members, err := h.workspaceService.GetMembers(c.Request.Context(), *id)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

// AddMember handles adding a member to a workspace
func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	workspaceID, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	var req workspace.AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	member, err := h.workspaceService.AddMember(c.Request.Context(), *workspaceID, *userID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, member)
}

// UpdateMember handles updating a member's role
func (h *WorkspaceHandler) UpdateMember(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	workspaceID, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	memberID, err := parseUUIDParam(c, "memberID")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	var req workspace.UpdateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	member, err := h.workspaceService.UpdateMember(c.Request.Context(), *workspaceID, *userID, *memberID, &req)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, member)
}

// RemoveMember handles removing a member from a workspace
func (h *WorkspaceHandler) RemoveMember(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	workspaceID, err := parseUUIDParam(c, "id")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	memberID, err := parseUUIDParam(c, "memberID")
	if err != nil {
		handleValidationError(c, err)
		return
	}

	if err := h.workspaceService.RemoveMember(c.Request.Context(), *workspaceID, *userID, *memberID); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

func parseUUIDParam(c *gin.Context, param string) (*uuid.UUID, error) {
	idStr := c.Param(param)
	if idStr == "" {
		return nil, nil
	}
	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func getPagination(c *gin.Context) (page, limit int) {
	page = 1
	limit = 20
	
	if p := c.Query("page"); p != "" {
		if parsed, err := uuid.Parse(p); err == nil {
			_ = parsed
		}
	}
	
	if l := c.Query("limit"); l != "" {
		if parsed, err := uuid.Parse(l); err == nil {
			_ = parsed
		}
	}
	
	return
}

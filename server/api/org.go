package api

import (
	"net/http"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// ── Department ────────────────────────────────────────────────────────────────

func ListDepartments(c *gin.Context) {
	var rows []models.Department
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	// build tree
	c.JSON(http.StatusOK, gin.H{"items": buildDeptTree(rows, nil)})
}

func CreateDepartment(c *gin.Context) {
	var body struct {
		ParentID  *uint  `json:"parent_id"`
		Name      string `json:"name" binding:"required"`
		Code      string `json:"code" binding:"required"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := models.Department{ParentID: body.ParentID, Name: body.Name, Code: body.Code, SortOrder: body.SortOrder}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, row)
}

func UpdateDepartment(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		ParentID  *uint  `json:"parent_id"`
		Name      string `json:"name"`
		Code      string `json:"code"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&models.Department{}).Where("id = ?", id).Updates(map[string]any{
		"parent_id": body.ParentID, "name": body.Name, "code": body.Code, "sort_order": body.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDepartment(c *gin.Context) {
	database.DB.Delete(&models.Department{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func buildDeptTree(all []models.Department, parentID *uint) []models.Department {
	var out []models.Department
	for _, d := range all {
		match := (parentID == nil && d.ParentID == nil) ||
			(parentID != nil && d.ParentID != nil && *d.ParentID == *parentID)
		if match {
			d.Children = buildDeptTree(all, &d.ID)
			out = append(out, d)
		}
	}
	return out
}

// ── Position ──────────────────────────────────────────────────────────────────

func ListPositions(c *gin.Context) {
	deptID := c.Query("department_id")
	q := database.DB.Order("sort_order ASC, id ASC")
	if deptID != "" {
		q = q.Where("department_id = ?", deptID)
	}
	var rows []models.Position
	q.Find(&rows)
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func CreatePosition(c *gin.Context) {
	var body struct {
		DepartmentID uint   `json:"department_id" binding:"required"`
		Name         string `json:"name" binding:"required"`
		Code         string `json:"code" binding:"required"`
		SortOrder    int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := models.Position{DepartmentID: body.DepartmentID, Name: body.Name, Code: body.Code, SortOrder: body.SortOrder}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, row)
}

func UpdatePosition(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name      string `json:"name"`
		Code      string `json:"code"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&models.Position{}).Where("id = ?", id).Updates(map[string]any{
		"name": body.Name, "code": body.Code, "sort_order": body.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeletePosition(c *gin.Context) {
	database.DB.Delete(&models.Position{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── UserDepartment ────────────────────────────────────────────────────────────

func ListUserDepartments(c *gin.Context) {
	userID := c.Param("user_id")
	var rows []models.UserDepartment
	database.DB.Where("user_id = ?", userID).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func AssignUserDepartment(c *gin.Context) {
	userID := c.Param("user_id")
	var body struct {
		DepartmentID uint  `json:"department_id" binding:"required"`
		PositionID   *uint `json:"position_id"`
		IsPrimary    bool  `json:"is_primary"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var row models.UserDepartment
	database.DB.Where("user_id = ? AND department_id = ?", userID, body.DepartmentID).FirstOrInit(&row)
	row.PositionID = body.PositionID
	row.IsPrimary = body.IsPrimary
	if row.ID == 0 {
		row.UserID = orgParseUint(userID)
		row.DepartmentID = body.DepartmentID
		database.DB.Create(&row)
	} else {
		database.DB.Save(&row)
	}
	c.JSON(http.StatusOK, row)
}

func RemoveUserDepartment(c *gin.Context) {
	database.DB.Where("user_id = ? AND department_id = ?", c.Param("user_id"), c.Param("dept_id")).
		Delete(&models.UserDepartment{})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── DeviceGroup ───────────────────────────────────────────────────────────────

func ListDeviceGroupsTree(c *gin.Context) {
	var rows []models.DeviceGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": buildGroupTree(rows, nil)})
}

func CreateDeviceGroup(c *gin.Context) {
	var body struct {
		ParentID  *uint  `json:"parent_id"`
		Name      string `json:"name" binding:"required"`
		Code      string `json:"code" binding:"required"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := models.DeviceGroup{ParentID: body.ParentID, Name: body.Name, Code: body.Code, SortOrder: body.SortOrder}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, row)
}

func UpdateDeviceGroup(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		ParentID  *uint  `json:"parent_id"`
		Name      string `json:"name"`
		Code      string `json:"code"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&models.DeviceGroup{}).Where("id = ?", id).Updates(map[string]any{
		"parent_id": body.ParentID, "name": body.Name, "code": body.Code, "sort_order": body.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDeviceGroup(c *gin.Context) {
	database.DB.Delete(&models.DeviceGroup{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ListDeviceGroupMembers(c *gin.Context) {
	groupID := c.Param("id")
	var rows []models.DeviceGroupMember
	database.DB.Where("group_id = ?", groupID).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func AddDeviceGroupMember(c *gin.Context) {
	groupID := c.Param("id")
	var body struct {
		DeviceID uint `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := models.DeviceGroupMember{DeviceID: body.DeviceID, GroupID: orgParseUint(groupID)}
	database.DB.FirstOrCreate(&row, row)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func RemoveDeviceGroupMember(c *gin.Context) {
	database.DB.Where("group_id = ? AND device_id = ?", c.Param("id"), c.Param("device_id")).
		Delete(&models.DeviceGroupMember{})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func buildGroupTree(all []models.DeviceGroup, parentID *uint) []models.DeviceGroup {
	var out []models.DeviceGroup
	for _, g := range all {
		match := (parentID == nil && g.ParentID == nil) ||
			(parentID != nil && g.ParentID != nil && *g.ParentID == *parentID)
		if match {
			g.Children = buildGroupTree(all, &g.ID)
			out = append(out, g)
		}
	}
	return out
}

func orgParseUint(s string) uint {
	var v uint
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		v = v*10 + uint(c-'0')
	}
	return v
}

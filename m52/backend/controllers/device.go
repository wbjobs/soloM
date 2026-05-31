package controllers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"sensor-platform/config"
	"sensor-platform/models"
)

type CreateDeviceRequest struct {
	Name        string `json:"name" binding:"required"`
	Type        string `json:"type" binding:"required"`
	Description string `json:"description"`
}

func CreateDevice(c *gin.Context) {
	var req CreateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device := models.Device{
		Name:        req.Name,
		Type:        req.Type,
		Description: req.Description,
		Status:      "active",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := config.DB.Create(&device).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device"})
		return
	}

	c.JSON(http.StatusCreated, device)
}

func GetDevices(c *gin.Context) {
	var devices []models.Device
	if err := config.DB.Find(&devices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch devices"})
		return
	}

	c.JSON(http.StatusOK, devices)
}

func GetDevice(c *gin.Context) {
	id := c.Param("id")
	var device models.Device
	if err := config.DB.Where("id = ?", id).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	c.JSON(http.StatusOK, device)
}

func UpdateDevice(c *gin.Context) {
	id := c.Param("id")
	var device models.Device
	if err := config.DB.Where("id = ?", id).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	var req struct {
		Name        string `json:"name"`
		Type        string `json:"type"`
		Description string `json:"description"`
		Status      string `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device.Name = req.Name
	device.Type = req.Type
	device.Description = req.Description
	device.Status = req.Status
	device.UpdatedAt = time.Now()

	if err := config.DB.Save(&device).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device"})
		return
	}

	c.JSON(http.StatusOK, device)
}

func DeleteDevice(c *gin.Context) {
	id := c.Param("id")
	if err := config.DB.Where("id = ?", id).Delete(&models.Device{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
}

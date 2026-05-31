package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dicom-backend/config"
	"dicom-backend/db"
	"dicom-backend/handlers"
	"dicom-backend/storage"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	config.Load()

	db.Init()
	defer db.Close()

	storage.Init()
	handlers.InitUploadLimiter()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.MaxMultipartMemory = config.AppConfig.MaxUploadSize

	api := r.Group("/api")
	{
		api.GET("/health", handlers.HealthCheck)

		images := api.Group("/images")
		{
			images.POST("", handlers.UploadImage)
			images.GET("", handlers.ListImages)
			images.GET("/:id", handlers.GetImage)
			images.GET("/:id/download", handlers.DownloadImage)
			images.GET("/:id/url", handlers.GetImageURL)
			images.DELETE("/:id", handlers.DeleteImage)
		}
	}

	addr := config.AppConfig.ServerHost + ":" + config.AppConfig.ServerPort
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Server starting on %s", addr)
		log.Printf("API Endpoints:")
		log.Printf("  POST   /api/images       - Upload image")
		log.Printf("  GET    /api/images       - List images")
		log.Printf("  GET    /api/images/:id   - Get image metadata")
		log.Printf("  GET    /api/images/:id/download - Download image")
		log.Printf("  GET    /api/images/:id/url      - Get presigned URL")
		log.Printf("  DELETE /api/images/:id   - Delete image")
		log.Printf("  GET    /api/health       - Health check")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}

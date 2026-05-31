package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"push-gateway/config"
)

type Server struct {
	config   *config.APIConfig
	handler  *PushHandler
	httpSrv  *http.Server
}

func NewServer(cfg *config.APIConfig, handler *PushHandler) *Server {
	return &Server{
		config:  cfg,
		handler: handler,
	}
}

func (s *Server) Start() error {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithWriter(zap.NewStdLog(zap.L()).Writer()))

	api := r.Group("/api")
	{
		api.POST("/push", s.handler.HandlePush)
		api.POST("/broadcast", s.handler.HandleBroadcast)
		api.GET("/health", s.handler.HandleHealth)
		api.GET("/history", s.handler.HandleHistory)
	}

	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	s.httpSrv = &http.Server{
		Addr:    addr,
		Handler: r,
	}

	zap.L().Info("API server starting", zap.String("addr", addr))

	if err := s.httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start API server: %w", err)
	}

	return nil
}

func (s *Server) Stop(ctx context.Context) error {
	if s.httpSrv != nil {
		shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		return s.httpSrv.Shutdown(shutdownCtx)
	}
	return nil
}

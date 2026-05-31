package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"server-monitor/internal/ui"
)

func main() {
	var configFile string
	flag.StringVar(&configFile, "config", "", "服务器配置文件路径")
	flag.Parse()

	if configFile == "" {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			configFile = filepath.Join(homeDir, ".server-monitor", "servers.json")
		}
	}

	app := ui.NewApp(configFile)
	if err := app.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "运行失败: %v\n", err)
		os.Exit(1)
	}
}

"""
RAG 代码库智能问答助手 - 启动脚本
"""

import os
import sys
import logging
import uvicorn
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def check_dependencies():
    """检查必需的依赖"""
    required_dirs = [
        "backend",
        "frontend",
        "data/chroma",
    ]

    for dir_path in required_dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        logger.info(f"Ensured directory exists: {dir_path}")

    env_file = Path(".env")
    if not env_file.exists():
        logger.warning(".env file not found, please create it based on .env.example")


def main():
    """主函数"""
    from dotenv import load_dotenv

    load_dotenv()

    check_dependencies()

    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", "8000"))

    logger.info("=" * 60)
    logger.info("  RAG 代码库智能问答助手")
    logger.info("=" * 60)
    logger.info(f"Server starting on http://{host}:{port}")
    logger.info(f"Web interface: http://{host}:{port}/static/index.html")
    logger.info(f"API docs: http://{host}:{port}/docs")
    logger.info("=" * 60)

    try:
        uvicorn.run(
            "backend.main:app",
            host=host,
            port=port,
            reload=False,
            log_level="info",
        )
    except KeyboardInterrupt:
        logger.info("\nServer stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

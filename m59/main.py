import argparse
import logging
import sys

from common.config import settings


def run_api():
    import uvicorn
    uvicorn.run(
        "api.app:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )


def run_cleaner():
    from cleaner.worker import CleanerWorker
    worker = CleanerWorker()
    try:
        worker.start()
    except KeyboardInterrupt:
        worker.stop()


def run_crawler(spider_name: str = "generic"):
    from scrapy.crawler import CrawlerProcess
    from crawler.settings import BOT_NAME, SPIDER_MODULES

    process = CrawlerProcess(settings={
        "BOT_NAME": BOT_NAME,
        "SPIDER_MODULES": SPIDER_MODULES,
    })
    process.crawl(spider_name)
    process.start()


def run_dead_task_worker():
    from scheduler.dead_task import DeadTaskWorker
    worker = DeadTaskWorker()
    try:
        worker.start()
    except KeyboardInterrupt:
        worker.stop()


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )

    parser = argparse.ArgumentParser(description="Distributed Crawler Platform")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    api_parser = subparsers.add_parser("api", help="Start REST API server")
    api_parser.add_argument("--host", default=None, help="API host")
    api_parser.add_argument("--port", type=int, default=None, help="API port")

    cleaner_parser = subparsers.add_parser("cleaner", help="Start cleaner worker")

    crawler_parser = subparsers.add_parser("crawler", help="Start crawler node")
    crawler_parser.add_argument("--spider", default="generic", help="Spider name")

    dead_task_parser = subparsers.add_parser("dead-task-worker", help="Start dead task detector worker")

    args = parser.parse_args()

    if args.command == "api":
        if args.host:
            settings.api_host = args.host
        if args.port:
            settings.api_port = args.port
        run_api()
    elif args.command == "cleaner":
        run_cleaner()
    elif args.command == "crawler":
        run_crawler(args.spider)
    elif args.command == "dead-task-worker":
        run_dead_task_worker()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()

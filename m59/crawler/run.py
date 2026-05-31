from scrapy.crawler import CrawlerProcess
from crawler.settings import BOT_NAME, SPIDER_MODULES


def run_spider(spider_name: str = "generic"):
    process = CrawlerProcess(settings={
        "BOT_NAME": BOT_NAME,
        "SPIDER_MODULES": SPIDER_MODULES,
        "NEWSPIDER_MODULE": SPIDER_MODULES,
    })
    process.crawl(spider_name)
    process.start()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--spider", default="generic", help="Spider name to run")
    args = parser.parse_args()
    run_spider(args.spider)

import logging

from scrapy import Spider
from scrapy.http import Request

from crawler.redis_spider import RedisSpiderMixin

logger = logging.getLogger(__name__)


class GenericSpider(RedisSpiderMixin, Spider):
    name = "generic"
    custom_settings = {
        "DOWNLOAD_TIMEOUT": 30,
    }

    def parse(self, response, **kwargs):
        task_info = response.meta.get("task_info", {})
        url = response.url
        title = response.css("title::text").get(default="").strip()
        meta_desc = response.css('meta[name="description"]::attr(content)').get(default="").strip()
        keywords = response.css('meta[name="keywords"]::attr(content)').get(default="").strip()

        text_content = " ".join(response.css("body ::text").getall())
        text_content = " ".join(text_content.split())

        links = []
        for link in response.css("a[href]"):
            href = link.css("::attr(href)").get()
            link_text = link.css("::text").get(default="").strip()
            if href and not href.startswith(("javascript:", "mailto:", "#")):
                links.append({"url": response.urljoin(href), "text": link_text})

        yield {
            "task_info": task_info,
            "url": url,
            "status_code": response.status,
            "title": title,
            "meta_description": meta_desc,
            "keywords": keywords,
            "content": text_content[:50000],
            "links": links[:500],
            "spider_name": self.name,
        }

        if task_info.get("meta", {}).get("follow_links"):
            for link_data in links:
                yield Request(
                    url=link_data["url"],
                    callback=self.parse,
                    meta={"task_info": task_info},
                    dont_filter=False,
                )

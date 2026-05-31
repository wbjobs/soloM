import re
import html
import unicodedata
from typing import Any, Callable, Dict, List, Optional


class Rule:
    def __init__(self, name: str, fn: Callable[[Any], Any], field: Optional[str] = None):
        self.name = name
        self.fn = fn
        self.field = field

    def apply(self, value: Any) -> Any:
        try:
            return self.fn(value)
        except Exception:
            return value


def strip_whitespace(value: str) -> str:
    if not isinstance(value, str):
        return value
    return " ".join(value.split())


def decode_html_entities(value: str) -> str:
    if not isinstance(value, str):
        return value
    return html.unescape(value)


def normalize_unicode(value: str) -> str:
    if not isinstance(value, str):
        return value
    return unicodedata.normalize("NFKC", value)


def remove_html_tags(value: str) -> str:
    if not isinstance(value, str):
        return value
    return re.sub(r"<[^>]+>", "", value)


def remove_urls(value: str) -> str:
    if not isinstance(value, str):
        return value
    return re.sub(r"https?://\S+", "", value)


def remove_emails(value: str) -> str:
    if not isinstance(value, str):
        return value
    return re.sub(r"\S+@\S+\.\S+", "", value)


def truncate_content(max_length: int = 10000):
    def _truncate(value: str) -> str:
        if not isinstance(value, str):
            return value
        return value[:max_length]
    return _truncate


def filter_links_by_domain(allowed_domains: Optional[List[str]] = None):
    def _filter(links: List[Dict]) -> List[Dict]:
        if not isinstance(links, list):
            return links
        if not allowed_domains:
            return links
        from urllib.parse import urlparse
        return [
            link for link in links
            if isinstance(link, dict) and urlparse(link.get("url", "")).netloc in allowed_domains
        ]
    return _filter


DEFAULT_RULES = [
    Rule("decode_html_entities", decode_html_entities, field="content"),
    Rule("remove_html_tags", remove_html_tags, field="content"),
    Rule("normalize_unicode", normalize_unicode, field="content"),
    Rule("strip_whitespace", strip_whitespace, field="content"),
    Rule("strip_whitespace_title", strip_whitespace, field="title"),
    Rule("strip_whitespace_desc", strip_whitespace, field="meta_description"),
    Rule("strip_whitespace_keywords", strip_whitespace, field="keywords"),
    Rule("truncate_content", truncate_content(50000), field="content"),
]

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from app.inference.pipeline import TextBox

_KEY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(发票|票据|账单|号码|编号|代码|代码号|发票号码|发票代码)", re.IGNORECASE),
    re.compile(r"(日期|时间|开票日期|购买|销售|收款|付款|开票|受票)", re.IGNORECASE),
    re.compile(r"(金额|合计|总计|价税|税额|不含税|税率|单价|数量|价格)", re.IGNORECASE),
    re.compile(r"(名称|姓名|单位|公司|地址|电话|银行|账号|开户)", re.IGNORECASE),
    re.compile(r"(校验|密码|备注|规格|型号|项目)", re.IGNORECASE),
    re.compile(r"\b(date|time|invoice|number|no\.?|code)\b", re.IGNORECASE),
    re.compile(r"\b(amount|total|price|tax|rate|qty|quantity)\b", re.IGNORECASE),
    re.compile(r"\b(name|company|address|tel|phone|bank|account)\b", re.IGNORECASE),
]

_AMOUNT_PATTERN = re.compile(r"[\d,]+\.\d{2}")
_DATE_PATTERN = re.compile(r"\d{4}[/-]\d{1,2}[/-]\d{1,2}")
_COLON_SUFFIX = re.compile(r"[:：]\s*$")


@dataclass
class KeyValue:
    key: str
    value: str
    confidence: float = 1.0


def _is_likely_key(text: str) -> bool:
    if _COLON_SUFFIX.search(text):
        return True
    for pat in _KEY_PATTERNS:
        if pat.search(text):
            return True
    if len(text) <= 6 and not _AMOUNT_PATTERN.search(text) and not _DATE_PATTERN.search(text):
        if re.search(r"[\u4e00-\u9fff]", text):
            return True
    return False


def _is_likely_value(text: str) -> bool:
    if _AMOUNT_PATTERN.search(text):
        return True
    if _DATE_PATTERN.search(text):
        return True
    if re.search(r"^\d+$", text):
        return True
    if re.search(r"[a-zA-Z0-9]{4,}", text):
        return True
    return False


def _horizontal_distance(a: TextBox, b: TextBox) -> float:
    if a.right < b.left:
        return b.left - a.right
    if b.right < a.left:
        return a.left - b.right
    return 0.0


def _vertical_distance(a: TextBox, b: TextBox) -> float:
    if a.bottom < b.top:
        return b.top - a.bottom
    if b.bottom < a.top:
        return a.bottom - b.top
    return 0.0


def _project_to_y(box: TextBox, x: float) -> float:
    angle = box.angle
    if abs(angle) < 0.1:
        return (box.top + box.bottom) / 2
    cx, cy = box.center
    dx = x - cx
    dy = dx * np.tan(np.radians(angle))
    return cy - dy


def _same_row(
    a: TextBox,
    b: TextBox,
    row_thresh: float | None = None,
) -> bool:
    if row_thresh is None:
        avg_h = (a.bottom - a.top + b.bottom - b.top) / 2
        row_thresh = max(avg_h * 0.6, 15.0)

    mid_x = (a.center[0] + b.center[0]) / 2
    ya = _project_to_y(a, mid_x)
    yb = _project_to_y(b, mid_x)
    return abs(ya - yb) < row_thresh


def cluster_rows(text_boxes: list[TextBox]) -> list[list[TextBox]]:
    if not text_boxes:
        return []

    n = len(text_boxes)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    for i in range(n):
        for j in range(i + 1, n):
            if _same_row(text_boxes[i], text_boxes[j]):
                union(i, j)

    rows_dict: dict[int, list[tuple[int, TextBox]]] = {}
    for i in range(n):
        root = find(i)
        if root not in rows_dict:
            rows_dict[root] = []
        rows_dict[root].append((i, text_boxes[i]))

    rows: list[list[TextBox]] = []
    for items in rows_dict.values():
        items_sorted = sorted(items, key=lambda x: x[1].center[0])
        rows.append([tb for _, tb in items_sorted])

    rows.sort(key=lambda r: np.mean([tb.top for tb in r]))
    return rows


def cluster_key_value_pairs(
    text_boxes: list[TextBox],
    max_h_gap_ratio: float = 3.0,
) -> list[KeyValue]:
    if not text_boxes:
        return []

    rows = cluster_rows(text_boxes)
    pairs: list[KeyValue] = []
    used_boxes: set[int] = set()

    for row in rows:
        keys_in_row: list[tuple[int, TextBox]] = []
        values_in_row: list[tuple[int, TextBox]] = []

        for idx, tb in enumerate(row):
            text_id = id(tb)
            if text_id in used_boxes:
                continue
            if _is_likely_key(tb.text):
                keys_in_row.append((idx, tb))
            elif _is_likely_value(tb.text):
                values_in_row.append((idx, tb))

        for key_idx, key_tb in keys_in_row:
            best_value = None
            best_score = float("inf")

            for value_idx, value_tb in values_in_row:
                if id(value_tb) in used_boxes:
                    continue
                if value_idx <= key_idx:
                    continue

                h_dist = _horizontal_distance(key_tb, value_tb)
                avg_w = (key_tb.right - key_tb.left + value_tb.right - value_tb.left) / 2
                if h_dist > avg_w * max_h_gap_ratio:
                    continue

                score = h_dist
                if score < best_score:
                    best_score = score
                    best_value = value_tb

            if best_value is not None:
                used_boxes.add(id(key_tb))
                used_boxes.add(id(best_value))
                pairs.append(KeyValue(key=key_tb.text, value=best_value.text))

    all_box_ids = {id(tb) for tb in text_boxes}
    unused = all_box_ids - used_boxes

    for tb in text_boxes:
        if id(tb) in unused:
            if _AMOUNT_PATTERN.search(tb.text):
                pairs.append(KeyValue(key="金额", value=tb.text))
            elif _DATE_PATTERN.search(tb.text):
                pairs.append(KeyValue(key="日期", value=tb.text))
            elif _is_likely_value(tb.text):
                pairs.append(KeyValue(key="未标注", value=tb.text))
            elif _is_likely_key(tb.text):
                pairs.append(KeyValue(key=tb.text, value=""))

    return pairs


def pairs_to_dict(pairs: list[KeyValue]) -> dict[str, str]:
    result: dict[str, str] = {}
    for kv in pairs:
        key = kv.key
        if key in result:
            idx = 2
            while f"{key}_{idx}" in result:
                idx += 1
            key = f"{key}_{idx}"
        result[key] = kv.value
    return result

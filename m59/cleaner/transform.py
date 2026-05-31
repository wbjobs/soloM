import logging
import time
from typing import Any, Dict, List, Optional

from cleaner.rules import DEFAULT_RULES, Rule

logger = logging.getLogger(__name__)


class Cleaner:
    def __init__(self, rules: Optional[List[Rule]] = None):
        self.rules = rules or DEFAULT_RULES
        self._field_rules: Dict[str, List[Rule]] = {}
        self._global_rules: List[Rule] = []
        self._build_index()

    def _build_index(self):
        for rule in self.rules:
            if rule.field:
                self._field_rules.setdefault(rule.field, []).append(rule)
            else:
                self._global_rules.append(rule)

    def clean(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = dict(raw_data)

        for key, value in list(cleaned.items()):
            if key in self._field_rules:
                for rule in self._field_rules[key]:
                    value = rule.apply(value)
                cleaned[key] = value

        for rule in self._global_rules:
            for key, value in list(cleaned.items()):
                if isinstance(value, str):
                    cleaned[key] = rule.apply(value)

        cleaned["cleaned_at"] = time.time()
        cleaned["is_cleaned"] = True
        return cleaned

    def clean_batch(self, raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.clean(item) for item in raw_items]

    def validate(self, data: Dict[str, Any]) -> bool:
        if not data.get("url"):
            return False
        if not data.get("task_id"):
            return False
        return True

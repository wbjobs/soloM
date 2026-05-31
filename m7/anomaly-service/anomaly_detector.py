import numpy as np
from collections import OrderedDict
from typing import List, Dict
from sklearn.ensemble import IsolationForest
from config import (
    MODEL_MIN_SAMPLES,
    ANOMALY_THRESHOLD_ZSCORE,
    EWMA_ALPHA,
    DEVIATION_THRESHOLD,
    CONSECUTIVE_ANOMALIES_REQUIRED,
    MAX_MODELS
)


class AnomalyDetector:
    def __init__(self):
        self.models: OrderedDict[str, Dict] = OrderedDict()

    def _evict_if_needed(self):
        while len(self.models) >= MAX_MODELS:
            self.models.popitem(last=False)

    def has_model(self, service_pair: str) -> bool:
        return service_pair in self.models

    def get_baseline(self, service_pair: str) -> float:
        if service_pair not in self.models:
            return 0.0
        return self.models[service_pair]['ewma']

    def train(self, service_pair: str, history_data: List[float]) -> None:
        if len(history_data) < MODEL_MIN_SAMPLES:
            raise ValueError(f"At least {MODEL_MIN_SAMPLES} samples required")

        self._evict_if_needed()

        data = np.array(history_data, dtype=np.float64).reshape(-1, 1)

        model = IsolationForest(contamination=0.1, random_state=42)
        model.fit(data)

        mean = float(np.mean(history_data))
        std = float(np.std(history_data))
        ewma = mean

        self.models[service_pair] = {
            'model': model,
            'mean': mean,
            'std': std if std > 0 else 1.0,
            'ewma': ewma,
            'consecutive_anomalies': 0,
            'history': history_data[-100:].copy()
        }
        self.models.move_to_end(service_pair)

    def detect(self, service_pair: str, value: float, timestamp: float) -> Dict:
        if service_pair not in self.models:
            return {
                'is_anomaly': False,
                'score': 0.0,
                'deviation_percent': 0.0,
                'method': 'none',
                'baseline': 0.0
            }

        entry = self.models[service_pair]
        self.models.move_to_end(service_pair)

        data_point = np.array([[value]], dtype=np.float64)
        if_score = entry['model'].decision_function(data_point)[0]
        is_if_anomaly = if_score < 0

        z_score = abs(value - entry['mean']) / entry['std']
        is_z_anomaly = z_score > ANOMALY_THRESHOLD_ZSCORE

        deviation = abs(value - entry['ewma']) / entry['ewma'] if entry['ewma'] > 0 else 0
        is_ewma_anomaly = deviation > DEVIATION_THRESHOLD

        is_anomaly = is_if_anomaly or is_z_anomaly or is_ewma_anomaly

        if is_anomaly:
            entry['consecutive_anomalies'] += 1
        else:
            entry['consecutive_anomalies'] = 0

        should_alert = entry['consecutive_anomalies'] >= CONSECUTIVE_ANOMALIES_REQUIRED

        entry['ewma'] = EWMA_ALPHA * value + (1 - EWMA_ALPHA) * entry['ewma']

        method = []
        if is_if_anomaly:
            method.append('isolation_forest')
        if is_z_anomaly:
            method.append('z_score')
        if is_ewma_anomaly:
            method.append('ewma')

        return {
            'is_anomaly': should_alert,
            'score': float(if_score),
            'deviation_percent': float(deviation * 100),
            'method': ','.join(method) if method else 'none',
            'baseline': float(entry['ewma']),
            'consecutive_count': entry['consecutive_anomalies']
        }

    def delete_model(self, service_pair: str) -> bool:
        if service_pair in self.models:
            del self.models[service_pair]
            return True
        return False

    def get_all_models(self) -> List[str]:
        return list(self.models.keys())

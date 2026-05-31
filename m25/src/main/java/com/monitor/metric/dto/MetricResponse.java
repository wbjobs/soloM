package com.monitor.metric.dto;

import java.time.LocalDateTime;
import java.util.Map;

public class MetricResponse {
    
    private String metric;
    private Double value;
    private Map<String, String> labels;
    private LocalDateTime timestamp;
    
    public MetricResponse() {
    }
    
    public MetricResponse(String metric, Double value, Map<String, String> labels, LocalDateTime timestamp) {
        this.metric = metric;
        this.value = value;
        this.labels = labels;
        this.timestamp = timestamp;
    }
    
    public String getMetric() {
        return metric;
    }
    
    public void setMetric(String metric) {
        this.metric = metric;
    }
    
    public Double getValue() {
        return value;
    }
    
    public void setValue(Double value) {
        this.value = value;
    }
    
    public Map<String, String> getLabels() {
        return labels;
    }
    
    public void setLabels(Map<String, String> labels) {
        this.labels = labels;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
}

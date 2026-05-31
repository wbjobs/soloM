package com.monitor.metric.dto;

import java.time.LocalDateTime;
import java.util.Map;

public class RateResult {
    
    private String metric;
    private Double rate;
    private Map<String, String> labels;
    private LocalDateTime windowStart;
    private LocalDateTime windowEnd;
    private String windowDuration;
    private Long dataPointsUsed;
    
    public RateResult() {
    }
    
    public RateResult(String metric, Double rate, Map<String, String> labels, 
                      LocalDateTime windowStart, LocalDateTime windowEnd, 
                      String windowDuration, Long dataPointsUsed) {
        this.metric = metric;
        this.rate = rate;
        this.labels = labels;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.windowDuration = windowDuration;
        this.dataPointsUsed = dataPointsUsed;
    }
    
    public String getMetric() {
        return metric;
    }
    
    public void setMetric(String metric) {
        this.metric = metric;
    }
    
    public Double getRate() {
        return rate;
    }
    
    public void setRate(Double rate) {
        this.rate = rate;
    }
    
    public Map<String, String> getLabels() {
        return labels;
    }
    
    public void setLabels(Map<String, String> labels) {
        this.labels = labels;
    }
    
    public LocalDateTime getWindowStart() {
        return windowStart;
    }
    
    public void setWindowStart(LocalDateTime windowStart) {
        this.windowStart = windowStart;
    }
    
    public LocalDateTime getWindowEnd() {
        return windowEnd;
    }
    
    public void setWindowEnd(LocalDateTime windowEnd) {
        this.windowEnd = windowEnd;
    }
    
    public String getWindowDuration() {
        return windowDuration;
    }
    
    public void setWindowDuration(String windowDuration) {
        this.windowDuration = windowDuration;
    }
    
    public Long getDataPointsUsed() {
        return dataPointsUsed;
    }
    
    public void setDataPointsUsed(Long dataPointsUsed) {
        this.dataPointsUsed = dataPointsUsed;
    }
}

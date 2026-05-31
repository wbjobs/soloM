package com.monitor.metric.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "metrics")
public class MetricData {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String metric;
    
    @Column(name = "metric_value", nullable = false)
    private Double value;
    
    @Column(columnDefinition = "TEXT")
    private String labels;
    
    @Column(nullable = false)
    private LocalDateTime timestamp;
    
    public MetricData() {
    }
    
    public MetricData(String metric, Double value, String labels, LocalDateTime timestamp) {
        this.metric = metric;
        this.value = value;
        this.labels = labels;
        this.timestamp = timestamp;
    }
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
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
    
    public String getLabels() {
        return labels;
    }
    
    public void setLabels(String labels) {
        this.labels = labels;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
}

package com.monitor.metric.controller;

import com.monitor.metric.dto.MetricRequest;
import com.monitor.metric.dto.MetricResponse;
import com.monitor.metric.service.MetricService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class MetricController {
    
    private static final Logger logger = LoggerFactory.getLogger(MetricController.class);
    
    @Autowired
    private MetricService metricService;
    
    @PostMapping("/push")
    public ResponseEntity<String> pushMetric(@RequestBody MetricRequest request) {
        if (request.getMetric() == null || request.getMetric().isEmpty()) {
            return ResponseEntity.badRequest().body("Metric name is required");
        }
        if (request.getValue() == null) {
            return ResponseEntity.badRequest().body("Value is required");
        }
        
        try {
            metricService.pushMetric(request);
            return ResponseEntity.ok("Metric pushed successfully");
        } catch (RuntimeException e) {
            logger.warn("Failed to push metric: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body("System is busy, queue full. Please try again later.");
        }
    }
    
    @GetMapping("/query")
    public ResponseEntity<?> queryMetric(@RequestParam String metric) {
        if (metric == null || metric.isEmpty()) {
            return ResponseEntity.badRequest().body("Query parameter is required");
        }
        
        try {
            Object result = metricService.queryPromQL(metric);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            logger.warn("Invalid PromQL query: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }
    
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(metricService.getQueueStatus());
    }
}

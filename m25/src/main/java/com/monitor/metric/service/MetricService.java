package com.monitor.metric.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.monitor.metric.dto.MetricRequest;
import com.monitor.metric.dto.MetricResponse;
import com.monitor.metric.dto.RateResult;
import com.monitor.metric.entity.MetricData;
import com.monitor.metric.promql.PromQLParser;
import com.monitor.metric.repository.MetricRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class MetricService {
    
    private static final Logger logger = LoggerFactory.getLogger(MetricService.class);
    
    private static final int QUEUE_CAPACITY = 10000;
    private static final int BATCH_SIZE = 100;
    private static final int CONSUMER_THREADS = 2;
    private static final long POLL_TIMEOUT = 100;
    
    private final BlockingQueue<MetricData> metricQueue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    
    private ExecutorService consumerExecutor;
    private volatile boolean running = true;
    
    @Autowired
    private MetricRepository metricRepository;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @PostConstruct
    public void init() {
        consumerExecutor = Executors.newFixedThreadPool(CONSUMER_THREADS);
        for (int i = 0; i < CONSUMER_THREADS; i++) {
            consumerExecutor.submit(this::consumeMetrics);
        }
        logger.info("Metric consumer threads started, queue capacity: {}, batch size: {}", 
            QUEUE_CAPACITY, BATCH_SIZE);
    }
    
    @PreDestroy
    public void shutdown() {
        running = false;
        consumerExecutor.shutdown();
        try {
            if (!consumerExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                consumerExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            consumerExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
        flushRemainingMetrics();
        logger.info("Metric service shutdown completed");
    }
    
    public void pushMetric(MetricRequest request) {
        MetricData metricData = convertToEntity(request);
        
        try {
            boolean offered = metricQueue.offer(metricData, 5, TimeUnit.SECONDS);
            if (!offered) {
                logger.warn("Queue is full, metric dropped: {}", request.getMetric());
                throw new RuntimeException("System is busy, please try again later");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while pushing metric", e);
        }
    }
    
    private void consumeMetrics() {
        List<MetricData> batch = new ArrayList<>(BATCH_SIZE);
        
        while (running || !metricQueue.isEmpty()) {
            try {
                batch.clear();
                
                MetricData first = metricQueue.poll(POLL_TIMEOUT, TimeUnit.MILLISECONDS);
                if (first != null) {
                    batch.add(first);
                    metricQueue.drainTo(batch, BATCH_SIZE - 1);
                }
                
                if (!batch.isEmpty()) {
                    saveBatch(batch);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.error("Error consuming metrics batch", e);
            }
        }
        
        if (!batch.isEmpty()) {
            saveBatch(batch);
        }
    }
    
    private void saveBatch(List<MetricData> batch) {
        try {
            metricRepository.saveAll(batch);
            logger.debug("Saved {} metrics to database", batch.size());
        } catch (Exception e) {
            logger.error("Failed to save batch of {} metrics", batch.size(), e);
            retrySaveBatch(batch);
        }
    }
    
    private void retrySaveBatch(List<MetricData> batch) {
        for (MetricData data : batch) {
            try {
                metricRepository.save(data);
            } catch (Exception e) {
                logger.error("Failed to save metric: {} = {}", data.getMetric(), data.getValue(), e);
            }
        }
    }
    
    private void flushRemainingMetrics() {
        List<MetricData> remaining = new ArrayList<>();
        metricQueue.drainTo(remaining);
        
        if (!remaining.isEmpty()) {
            logger.info("Flushing remaining {} metrics to database", remaining.size());
            saveBatch(remaining);
        }
    }
    
    private MetricData convertToEntity(MetricRequest request) {
        String labelsJson = null;
        if (request.getLabels() != null && !request.getLabels().isEmpty()) {
            try {
                labelsJson = objectMapper.writeValueAsString(request.getLabels());
            } catch (JsonProcessingException e) {
                labelsJson = "{}";
            }
        }
        
        return new MetricData(
            request.getMetric(),
            request.getValue(),
            labelsJson,
            LocalDateTime.now()
        );
    }
    
    public List<MetricResponse> queryMetric(String metric) {
        List<MetricData> dataList = metricRepository.findTop10ByMetricOrderByTimestampDesc(metric);
        
        return dataList.stream()
            .map(this::convertToResponse)
            .collect(Collectors.toList());
    }
    
    private MetricResponse convertToResponse(MetricData data) {
        Map<String, String> labels = Collections.emptyMap();
        if (data.getLabels() != null && !data.getLabels().isEmpty()) {
            try {
                labels = objectMapper.readValue(data.getLabels(), new TypeReference<Map<String, String>>() {});
            } catch (JsonProcessingException e) {
                labels = Collections.emptyMap();
            }
        }
        
        return new MetricResponse(
            data.getMetric(),
            data.getValue(),
            labels,
            data.getTimestamp()
        );
    }
    
    public Map<String, Object> getQueueStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("queueSize", metricQueue.size());
        status.put("queueCapacity", QUEUE_CAPACITY);
        status.put("remainingCapacity", metricQueue.remainingCapacity());
        status.put("consumerThreads", CONSUMER_THREADS);
        status.put("batchSize", BATCH_SIZE);
        return status;
    }
    
    public Object queryPromQL(String query) {
        PromQLParser.PromQLQuery promqlQuery = PromQLParser.parse(query);
        
        if (promqlQuery.isRateQuery()) {
            return calculateRate(promqlQuery.getMetric(), promqlQuery.getDuration());
        } else {
            return queryMetric(promqlQuery.getMetric());
        }
    }
    
    public RateResult calculateRate(String metric, Duration duration) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime windowStart = now.minus(duration);
        
        List<MetricData> dataList = metricRepository
            .findByMetricAndTimestampAfterOrderByTimestampAsc(metric, windowStart);
        
        if (dataList == null || dataList.size() < 2) {
            return new RateResult(metric, 0.0, Collections.emptyMap(), 
                windowStart, now, formatDuration(duration), 0L);
        }
        
        MetricData first = dataList.get(0);
        MetricData last = dataList.get(dataList.size() - 1);
        
        double valueDiff = last.getValue() - first.getValue();
        
        long secondsDiff = ChronoUnit.SECONDS.between(first.getTimestamp(), last.getTimestamp());
        
        double rate = 0.0;
        if (secondsDiff > 0) {
            rate = valueDiff / secondsDiff;
        }
        
        Map<String, String> labels = parseLabels(last.getLabels());
        
        return new RateResult(
            metric,
            rate,
            labels,
            first.getTimestamp(),
            last.getTimestamp(),
            formatDuration(duration),
            (long) dataList.size()
        );
    }
    
    private String formatDuration(Duration duration) {
        long seconds = duration.getSeconds();
        if (seconds >= 86400) {
            return (seconds / 86400) + "d";
        } else if (seconds >= 3600) {
            return (seconds / 3600) + "h";
        } else if (seconds >= 60) {
            return (seconds / 60) + "m";
        } else {
            return seconds + "s";
        }
    }
    
    private Map<String, String> parseLabels(String labelsJson) {
        if (labelsJson == null || labelsJson.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(labelsJson, new TypeReference<Map<String, String>>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyMap();
        }
    }
}

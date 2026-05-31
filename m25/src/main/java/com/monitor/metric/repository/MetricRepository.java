package com.monitor.metric.repository;

import com.monitor.metric.entity.MetricData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MetricRepository extends JpaRepository<MetricData, Long> {
    
    List<MetricData> findTop10ByMetricOrderByTimestampDesc(String metric);
    
    List<MetricData> findByMetricAndTimestampAfterOrderByTimestampAsc(String metric, LocalDateTime timestamp);
    
    List<MetricData> findByMetricOrderByTimestampAsc(String metric);
}

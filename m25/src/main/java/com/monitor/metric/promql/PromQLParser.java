package com.monitor.metric.promql;

import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PromQLParser {
    
    private static final Pattern RATE_PATTERN = Pattern.compile(
        "^rate\\s*\\(\\s*(\\w+)\\s*\\[\\s*(\\d+)([smhd])\\s*\\]\\s*\\)$"
    );
    
    public static PromQLQuery parse(String query) {
        if (query == null || query.trim().isEmpty()) {
            throw new IllegalArgumentException("Query cannot be empty");
        }
        
        String trimmedQuery = query.trim();
        
        Matcher rateMatcher = RATE_PATTERN.matcher(trimmedQuery);
        if (rateMatcher.matches()) {
            String metric = rateMatcher.group(1);
            int amount = Integer.parseInt(rateMatcher.group(2));
            String unit = rateMatcher.group(3);
            
            Duration duration = parseDuration(amount, unit);
            
            return new PromQLQuery(PromQLQueryType.RATE, metric, duration);
        }
        
        if (isSimpleMetricName(trimmedQuery)) {
            return new PromQLQuery(PromQLQueryType.SIMPLE, trimmedQuery, null);
        }
        
        throw new IllegalArgumentException("Unsupported PromQL syntax: " + query + 
            ". Supported formats: 'metric_name' or 'rate(metric_name[1m])'");
    }
    
    private static boolean isSimpleMetricName(String query) {
        return query.matches("^[a-zA-Z_][a-zA-Z0-9_]*$");
    }
    
    private static Duration parseDuration(int amount, String unit) {
        switch (unit) {
            case "s":
                return Duration.ofSeconds(amount);
            case "m":
                return Duration.ofMinutes(amount);
            case "h":
                return Duration.ofHours(amount);
            case "d":
                return Duration.ofDays(amount);
            default:
                throw new IllegalArgumentException("Unsupported time unit: " + unit);
        }
    }
    
    public enum PromQLQueryType {
        SIMPLE,
        RATE
    }
    
    public static class PromQLQuery {
        private final PromQLQueryType type;
        private final String metric;
        private final Duration duration;
        
        public PromQLQuery(PromQLQueryType type, String metric, Duration duration) {
            this.type = type;
            this.metric = metric;
            this.duration = duration;
        }
        
        public PromQLQueryType getType() {
            return type;
        }
        
        public String getMetric() {
            return metric;
        }
        
        public Duration getDuration() {
            return duration;
        }
        
        public boolean isRateQuery() {
            return type == PromQLQueryType.RATE;
        }
    }
}

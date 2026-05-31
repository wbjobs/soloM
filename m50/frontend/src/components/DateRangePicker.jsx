import React from 'react';

const DateRangePicker = ({ startDate, endDate, minDate, maxDate, onDateChange, onApply, onReset, appliedStartDate, appliedEndDate }) => {
  const quickOptions = [
    { label: '全部', days: null },
    { label: '最近7天', days: 7 },
    { label: '最近14天', days: 14 },
    { label: '最近30天', days: 30 }
  ];

  const isQuickActive = (days) => {
    if (days === null) {
      return !appliedStartDate && !appliedEndDate;
    }
    if (!appliedStartDate || !appliedEndDate) return false;
    
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(today.getDate() - days + 1);
    
    const formatDate = (d) => d.toISOString().split('T')[0];
    const expectedStart = formatDate(start);
    const expectedEnd = formatDate(end);
    
    return appliedStartDate === expectedStart && appliedEndDate === expectedEnd;
  };

  const handleQuickSelect = (days) => {
    if (days === null) {
      onReset();
      return;
    }
    
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(today.getDate() - days + 1);
    
    const formatDate = (d) => d.toISOString().split('T')[0];
    
    if (minDate) {
      const minD = new Date(minDate);
      if (start < minD) start.setTime(minD.getTime());
    }
    
    onDateChange(formatDate(start), formatDate(end));
  };

  const handleStartChange = (e) => {
    onDateChange(e.target.value, endDate);
  };

  const handleEndChange = (e) => {
    onDateChange(startDate, e.target.value);
  };

  return (
    <div className="date-range-picker">
      <div className="picker-header">
        <span className="picker-label">📅 时间范围</span>
      </div>
      
      <div className="quick-options">
        {quickOptions.map((option, index) => (
          <button
            key={index}
            className={`quick-btn ${isQuickActive(option.days) ? 'active' : ''}`}
            onClick={() => handleQuickSelect(option.days)}
          >
            {option.label}
          </button>
        ))}
      </div>
      
      <div className="date-inputs">
        <div className="input-group">
          <label>开始日期</label>
          <input
            type="date"
            value={startDate || ''}
            onChange={handleStartChange}
            min={minDate}
            max={endDate || maxDate}
            className="date-input"
          />
        </div>
        
        <span className="date-separator">至</span>
        
        <div className="input-group">
          <label>结束日期</label>
          <input
            type="date"
            value={endDate || ''}
            onChange={handleEndChange}
            min={startDate || minDate}
            max={maxDate}
            className="date-input"
          />
        </div>
        
        <button className="apply-btn" onClick={onApply}>
          应用筛选
        </button>
      </div>
      
      {(appliedStartDate || appliedEndDate) && (
        <div className="date-info">
          <span>
            已选择: <strong>{appliedStartDate || '不限'}</strong> 至 <strong>{appliedEndDate || '不限'}</strong>
          </span>
          <button className="clear-btn" onClick={onReset}>
            清除
          </button>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;

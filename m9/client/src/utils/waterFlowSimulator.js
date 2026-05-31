function generateWaterFlowData(pipesData, timeInterval = 0.1) {
  if (!pipesData || !pipesData.features) {
    return { particles: [], flowRates: [] };
  }

  const particles = [];
  const flowRates = [];
  let particleId = 0;

  pipesData.features.forEach((pipe, pipeIndex) => {
    if (pipe.properties?.type !== 'water' && pipe.properties?.type !== 'sewage') {
      return;
    }

    const coordinates = pipe.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return;

    const baseFlowSpeed = 0.5 + Math.random() * 1.5;
    const flowDirection = Math.random() > 0.5 ? 1 : -1;
    const pipeLength = pipe.properties?.length || 100;

    const numParticles = Math.max(3, Math.floor(pipeLength / 20));

    for (let i = 0; i < numParticles; i++) {
      const position = i / numParticles;
      particles.push({
        id: particleId++,
        pipeIndex,
        pipeId: pipe.properties?.pipeId,
        position,
        baseFlowSpeed,
        flowDirection,
        currentOffset: position,
        size: 3 + Math.random() * 2,
        color: pipe.properties?.type === 'water' ? [30, 144, 255] : [85, 107, 47]
      });
    }

    flowRates.push({
      pipeId: pipe.properties?.pipeId,
      type: pipe.properties?.type,
      baseFlowRate: pipe.properties?.flowRate || 100
    });
  });

  return { particles, flowRates };
}

function updateParticlePositions(particles, time, timeSpeed = 1) {
  return particles.map(particle => {
    const { baseFlowSpeed, flowDirection, position } = particle;
    
    let newOffset = position + (time * baseFlowSpeed * timeSpeed * flowDirection * 0.001);
    
    if (flowDirection > 0) {
      newOffset = newOffset % 1;
    } else {
      newOffset = ((newOffset % 1) + 1) % 1;
    }

    return {
      ...particle,
      currentOffset: newOffset
    };
  });
}

function getParticlePosition(coordinates, offset) {
  if (!coordinates || coordinates.length < 2) return [0, 0, 0];

  const totalSegments = coordinates.length - 1;
  const segmentIndex = Math.min(Math.floor(offset * totalSegments), totalSegments - 1);
  const segmentOffset = (offset * totalSegments) - segmentIndex;

  const start = coordinates[segmentIndex];
  const end = coordinates[segmentIndex + 1];

  return [
    start[0] + (end[0] - start[0]) * segmentOffset,
    start[1] + (end[1] - start[1]) * segmentOffset,
    -2 + (Math.random() - 0.5) * 0.5
  ];
}

function getFlowRateAtTime(baseFlowRate, timeOfDay) {
  const hour = (timeOfDay % 24 + 24) % 24;
  
  let multiplier;
  if (hour >= 6 && hour < 9) {
    multiplier = 1.5;
  } else if (hour >= 11 && hour < 13) {
    multiplier = 1.2;
  } else if (hour >= 17 && hour < 20) {
    multiplier = 1.4;
  } else if (hour >= 23 || hour < 5) {
    multiplier = 0.5;
  } else {
    multiplier = 1.0;
  }

  return baseFlowRate * multiplier;
}

const TIME_PERIODS = [
  { id: 'night', label: '凌晨', startHour: 0, endHour: 6, icon: '🌙' },
  { id: 'morning', label: '早高峰', startHour: 6, endHour: 9, icon: '🌅' },
  { id: 'forenoon', label: '上午', startHour: 9, endHour: 12, icon: '☀️' },
  { id: 'noon', label: '午间', startHour: 12, endHour: 14, icon: '🍱' },
  { id: 'afternoon', label: '下午', startHour: 14, endHour: 17, icon: '🌤️' },
  { id: 'evening', label: '晚高峰', startHour: 17, endHour: 20, icon: '🌆' },
  { id: 'night2', label: '夜间', startHour: 20, endHour: 24, icon: '🌃' }
];

function getTimePeriod(hour) {
  return TIME_PERIODS.find(p => hour >= p.startHour && hour < p.endHour) || TIME_PERIODS[0];
}

function formatTimeLabel(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export {
  generateWaterFlowData,
  updateParticlePositions,
  getParticlePosition,
  getFlowRateAtTime,
  TIME_PERIODS,
  getTimePeriod,
  formatTimeLabel
};

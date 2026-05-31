const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const serverRoomData = {
  room: {
    name: '数据中心 A 区',
    width: 20,
    depth: 10
  },
  racks: [
    {
      id: 'RACK-001',
      name: '机柜 1',
      position: { x: -6, z: 0 },
      servers: [
        { id: 'SRV-001', name: 'Web 服务器 1', status: 'normal', uPosition: 1 },
        { id: 'SRV-002', name: 'Web 服务器 2', status: 'normal', uPosition: 2 },
        { id: 'SRV-003', name: '数据库服务器', status: 'alarm', uPosition: 3 },
        { id: 'SRV-004', name: '缓存服务器', status: 'normal', uPosition: 4 },
        { id: 'SRV-005', name: '应用服务器 1', status: 'normal', uPosition: 5 },
        { id: 'SRV-006', name: '应用服务器 2', status: 'alarm', uPosition: 6 },
        { id: 'SRV-007', name: '存储服务器', status: 'normal', uPosition: 7 },
        { id: 'SRV-008', name: '备份服务器', status: 'normal', uPosition: 8 }
      ]
    },
    {
      id: 'RACK-002',
      name: '机柜 2',
      position: { x: -3, z: 0 },
      servers: [
        { id: 'SRV-009', name: 'API 网关', status: 'normal', uPosition: 1 },
        { id: 'SRV-010', name: '负载均衡', status: 'normal', uPosition: 2 },
        { id: 'SRV-011', name: '日志服务器', status: 'normal', uPosition: 3 },
        { id: 'SRV-012', name: '监控服务器', status: 'alarm', uPosition: 4 },
        { id: 'SRV-013', name: '消息队列', status: 'normal', uPosition: 5 },
        { id: 'SRV-014', name: '搜索服务', status: 'normal', uPosition: 6 }
      ]
    },
    {
      id: 'RACK-003',
      name: '机柜 3',
      position: { x: 0, z: 0 },
      servers: [
        { id: 'SRV-015', name: 'AI 训练节点 1', status: 'normal', uPosition: 1 },
        { id: 'SRV-016', name: 'AI 训练节点 2', status: 'normal', uPosition: 2 },
        { id: 'SRV-017', name: 'AI 训练节点 3', status: 'alarm', uPosition: 3 },
        { id: 'SRV-018', name: 'AI 推理节点 1', status: 'normal', uPosition: 4 },
        { id: 'SRV-019', name: 'AI 推理节点 2', status: 'normal', uPosition: 5 },
        { id: 'SRV-020', name: 'GPU 服务器', status: 'normal', uPosition: 6 },
        { id: 'SRV-021', name: '模型存储', status: 'normal', uPosition: 7 },
        { id: 'SRV-022', name: '特征工程', status: 'alarm', uPosition: 8 },
        { id: 'SRV-023', name: '数据预处理', status: 'normal', uPosition: 9 }
      ]
    },
    {
      id: 'RACK-004',
      name: '机柜 4',
      position: { x: 3, z: 0 },
      servers: [
        { id: 'SRV-024', name: 'Redis 集群 1', status: 'normal', uPosition: 1 },
        { id: 'SRV-025', name: 'Redis 集群 2', status: 'normal', uPosition: 2 },
        { id: 'SRV-026', name: 'MongoDB 主', status: 'alarm', uPosition: 3 },
        { id: 'SRV-027', name: 'MongoDB 从', status: 'normal', uPosition: 4 },
        { id: 'SRV-028', name: 'Elasticsearch 1', status: 'normal', uPosition: 5 },
        { id: 'SRV-029', name: 'Elasticsearch 2', status: 'normal', uPosition: 6 },
        { id: 'SRV-030', name: 'Kafka 节点', status: 'normal', uPosition: 7 }
      ]
    },
    {
      id: 'RACK-005',
      name: '机柜 5',
      position: { x: 6, z: 0 },
      servers: [
        { id: 'SRV-031', name: 'K8s Master 1', status: 'normal', uPosition: 1 },
        { id: 'SRV-032', name: 'K8s Master 2', status: 'normal', uPosition: 2 },
        { id: 'SRV-033', name: 'K8s Master 3', status: 'normal', uPosition: 3 },
        { id: 'SRV-034', name: 'K8s Worker 1', status: 'normal', uPosition: 4 },
        { id: 'SRV-035', name: 'K8s Worker 2', status: 'alarm', uPosition: 5 },
        { id: 'SRV-036', name: 'K8s Worker 3', status: 'normal', uPosition: 6 },
        { id: 'SRV-037', name: 'K8s Worker 4', status: 'normal', uPosition: 7 },
        { id: 'SRV-038', name: 'Harbor 仓库', status: 'normal', uPosition: 8 },
        { id: 'SRV-039', name: 'Prometheus', status: 'alarm', uPosition: 9 },
        { id: 'SRV-040', name: 'Grafana', status: 'normal', uPosition: 10 }
      ]
    }
  ]
};

function generateTemperatureField() {
  const temperatureField = {
    room: {
      name: serverRoomData.room.name,
      width: serverRoomData.room.width,
      depth: serverRoomData.room.depth
    },
    racks: []
  };

  serverRoomData.racks.forEach(rack => {
    const rackTempData = {
      id: rack.id,
      name: rack.name,
      position: rack.position,
      avgTemperature: 0,
      temperaturePoints: []
    };

    let totalTemp = 0;
    const alarmServers = rack.servers.filter(s => s.status === 'alarm').length;
    const baseTemp = 22 + alarmServers * 2;

    rack.servers.forEach(server => {
      const serverTemp = baseTemp + 
        (server.status === 'alarm' ? 8 + Math.random() * 5 : Math.random() * 6);
      
      const tempPoint = {
        id: server.id,
        name: server.name,
        uPosition: server.uPosition,
        temperature: parseFloat(serverTemp.toFixed(1)),
        status: server.status
      };
      
      rackTempData.temperaturePoints.push(tempPoint);
      totalTemp += serverTemp;
    });

    rackTempData.avgTemperature = parseFloat((totalTemp / rack.servers.length).toFixed(1));
    temperatureField.racks.push(rackTempData);
  });

  return temperatureField;
}

app.get('/api/server-room', (req, res) => {
  res.json(serverRoomData);
});

app.get('/api/temperature-field', (req, res) => {
  res.json(generateTemperatureField());
});

app.listen(PORT, () => {
  console.log(`3D Server Room 服务运行在 http://localhost:${PORT}`);
  console.log(`  - /api/server-room`);
  console.log(`  - /api/temperature-field`);
});

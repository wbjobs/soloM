const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pipe = sequelize.define('Pipe', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  pipeId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '管网编号'
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '管网类型：water, sewage, gas, electric, telecom, heating'
  },
  material: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '管材：concrete, steel, pvc, cast_iron, copper'
  },
  diameter: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: '管径（毫米）'
  },
  length: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: '管长（米）'
  },
  depth: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: '埋深（米）'
  },
  pressure: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: '设计压力（MPa）'
  },
  flowRate: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: '设计流量（m³/h）'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'normal',
    comment: '状态：normal, maintenance, damaged, abandoned'
  },
  yearInstalled: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '铺设年份'
  },
  owner: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '产权单位'
  },
  geom: {
    type: DataTypes.GEOMETRY('LINESTRING', 4326),
    allowNull: false,
    comment: '管线几何（WGS84坐标系）'
  },
  properties: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: '其他属性信息'
  }
}, {
  tableName: 'pipes',
  timestamps: true,
  indexes: [
    {
      name: 'idx_pipes_geom',
      fields: ['geom'],
      using: 'gist'
    },
    {
      name: 'idx_pipes_type',
      fields: ['type']
    }
  ]
});

module.exports = Pipe;

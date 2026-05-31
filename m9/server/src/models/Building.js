const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Building = sequelize.define('Building', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  height: {
    type: DataTypes.FLOAT,
    allowNull: false,
    comment: '建筑高度（米）'
  },
  floors: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '楼层数'
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '建筑类型：commercial, residential, industrial, public'
  },
  yearBuilt: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '建成年份'
  },
  address: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  geom: {
    type: DataTypes.GEOMETRY('POLYGON', 4326),
    allowNull: false,
    comment: '建筑 footprint 多边形（WGS84坐标系）'
  },
  properties: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: '其他属性信息'
  }
}, {
  tableName: 'buildings',
  timestamps: true,
  indexes: [
    {
      name: 'idx_buildings_geom',
      fields: ['geom'],
      using: 'gist'
    }
  ]
});

module.exports = Building;

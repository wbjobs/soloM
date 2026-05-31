import React, { useState } from 'react';
import { Input, Select, Button, Form, message, Switch, InputNumber, Collapse, Divider, Slider } from 'antd';
import { SearchOutlined, SettingOutlined, ThunderboltOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { QueryOptions } from '../services/api';
import { LinkPredictionResult } from '../types';

const { Option } = Select;
const { Panel } = Collapse;

interface QueryPanelProps {
  onQuery: (ip: string, depth: number, options?: QueryOptions) => void;
  onPredictThreats: (ip: string, maxDepth: number, topK: number, minScore: number) => void;
  onTogglePredictions: () => void;
  loading: boolean;
  predictionLoading: boolean;
  showPredictions: boolean;
  predictions: LinkPredictionResult[] | null;
}

interface PredictionOptions {
  maxDepth: number;
  topK: number;
  minScore: number;
}

const QueryPanel: React.FC<QueryPanelProps> = ({
  onQuery,
  onPredictThreats,
  onTogglePredictions,
  loading,
  predictionLoading,
  showPredictions,
  predictions,
}) => {
  const [form] = Form.useForm();
  const [predictionForm] = Form.useForm();
  const [sampleIPs] = useState([
    '185.220.101.34',
    '91.234.99.42',
    '103.224.182.210',
    '192.168.1.100',
    '45.33.32.156',
  ]);

  const handleSampleSelect = (value: string | undefined) => {
    if (value) {
      form.setFieldsValue({ ip: value });
    }
  };

  const handleSubmit = async (values: {
    ip: string;
    depth: number;
    maxNodes: number;
    maxRelationships: number;
    useCache: boolean;
  }) => {
    if (!values.ip.trim()) {
      message.warning('请输入IP地址');
      return;
    }

    const options: QueryOptions = {
      maxNodes: values.maxNodes,
      maxRelationships: values.maxRelationships,
      useCache: values.useCache,
    };

    onQuery(values.ip.trim(), values.depth, options);
  };

  const handlePredict = async (values: PredictionOptions) => {
    const ip = form.getFieldValue('ip');
    if (!ip || !ip.trim()) {
      message.warning('请先输入IP地址并查询图谱');
      return;
    }

    onPredictThreats(ip.trim(), values.maxDepth, values.topK, values.minScore);
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-title">
        <SearchOutlined />
        查询关联图谱
      </div>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          depth: 2,
          maxNodes: 2000,
          maxRelationships: 5000,
          useCache: true,
        }}
        onFinish={handleSubmit}
        className="query-form"
      >
        <Form.Item
          name="ip"
          label="恶意IP地址"
          rules={[{ required: true, message: '请输入IP地址' }]}
        >
          <Input
            placeholder="输入IP地址，如 185.220.101.34"
            style={{ background: '#1c1f26', borderColor: '#2f3336', color: '#e7e9ea' }}
          />
        </Form.Item>

        <Form.Item label="示例IP" style={{ marginBottom: 12 }}>
          <Select
            placeholder="选择示例IP快速查询"
            style={{ width: '100%' }}
            onSelect={handleSampleSelect}
            value={undefined}
            allowClear
            options={sampleIPs.map((ip) => ({ label: ip, value: ip }))}
          />
        </Form.Item>

        <Form.Item name="depth" label="关联深度">
          <Select
            options={[
              { label: '1 度关联（直接关联）', value: 1 },
              { label: '2 度关联（推荐）', value: 2 },
              { label: '3 度关联（较大数据量）', value: 3 },
            ]}
          />
        </Form.Item>

        <Collapse
          ghost
          defaultActiveKey={[]}
          style={{
            background: 'transparent',
            border: 'none',
          }}
        >
          <Panel
            header={
              <span style={{ color: '#8899a6', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SettingOutlined />
                高级选项
              </span>
            }
            key="1"
          >
            <Form.Item
              name="maxNodes"
              label="最大节点数"
              style={{ marginBottom: 12 }}
            >
              <InputNumber
                min={100}
                max={20000}
                step={100}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="maxRelationships"
              label="最大关系数"
              style={{ marginBottom: 12 }}
            >
              <InputNumber
                min={100}
                max={50000}
                step={100}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="useCache"
              label="使用查询缓存"
              valuePropName="checked"
              style={{ marginBottom: 0 }}
            >
              <Switch defaultChecked />
            </Form.Item>
          </Panel>
        </Collapse>

        <Form.Item style={{ marginBottom: 0, marginTop: 12 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{
              background: '#1da1f2',
              borderColor: '#1da1f2',
              height: 40,
              fontWeight: 600,
            }}
          >
            <SearchOutlined />
            查询图谱
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ borderColor: '#2f3336', margin: '16px 0' }} />

      <div className="sidebar-section">
        <div className="sidebar-title">
          <ThunderboltOutlined />
          潜在威胁预测
        </div>

        <Form
          form={predictionForm}
          layout="vertical"
          initialValues={{
            maxDepth: 3,
            topK: 20,
            minScore: 0.3,
          }}
          onFinish={handlePredict}
          className="query-form"
        >
          <Form.Item
            name="maxDepth"
            label="预测深度"
            style={{ marginBottom: 12 }}
          >
            <Select
              options={[
                { label: '2 跳（快速）', value: 2 },
                { label: '3 跳（推荐）', value: 3 },
                { label: '4 跳（较慢）', value: 4 },
                { label: '5 跳（较慢）', value: 5 },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="topK"
            label="返回预测数量"
            style={{ marginBottom: 12 }}
          >
            <Slider
              min={5}
              max={100}
              step={5}
              marks={{
                5: '5',
                20: '20',
                50: '50',
                100: '100',
              }}
            />
          </Form.Item>

          <Form.Item
            name="minScore"
            label="最小置信度阈值"
            style={{ marginBottom: 12 }}
          >
            <Slider
              min={0.1}
              max={0.9}
              step={0.1}
              marks={{
                0.1: '0.1',
                0.3: '0.3',
                0.5: '0.5',
                0.7: '0.7',
                0.9: '0.9',
              }}
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Form.Item style={{ flex: 1, marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={predictionLoading}
                style={{
                  background: '#ef4444',
                  borderColor: '#ef4444',
                  height: 36,
                  fontWeight: 600,
                }}
              >
                <ThunderboltOutlined />
                预测威胁
              </Button>
            </Form.Item>

            <Button
              onClick={onTogglePredictions}
              disabled={!predictions || predictions.length === 0}
              style={{
                height: 36,
                minWidth: 80,
              }}
            >
              {showPredictions ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              {showPredictions ? '隐藏' : '显示'}
            </Button>
          </div>
        </Form>

        {predictions && predictions.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: '#1c1f26', borderRadius: 6, fontSize: 12 }}>
            <div style={{ color: '#8899a6', marginBottom: 8 }}>
              已发现 {predictions.length} 条潜在攻击链路
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: '#ef4444' }}>
                高置信: {predictions.filter(p => p.confidence === 'high').length}
              </span>
              <span style={{ color: '#f59e0b' }}>
                中置信: {predictions.filter(p => p.confidence === 'medium').length}
              </span>
              <span style={{ color: '#10b981' }}>
                低置信: {predictions.filter(p => p.confidence === 'low').length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryPanel;

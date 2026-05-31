import React, { useState } from 'react'
import { X, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, Shield, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useIpc } from '@/hooks/useIpc'
import type { RuleCondition, RuleOperator, SecurityRule } from '@shared/types'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30',
  medium: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30',
  high: 'bg-neon-red/20 text-neon-red border-neon-red/30',
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
}

const FIELD_OPTIONS = [
  { value: 'syscall', label: '系统调用' },
  { value: 'uid', label: '用户 ID (UID)' },
  { value: 'gid', label: '组 ID (GID)' },
  { value: 'pid', label: '进程 ID (PID)' },
  { value: 'ppid', label: '父进程 ID (PPID)' },
  { value: 'comm', label: '进程名' },
  { value: 'args.arg0', label: '参数 0' },
  { value: 'args.arg1', label: '参数 1' },
]

const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头为' },
  { value: 'endsWith', label: '结尾为' },
  { value: 'in', label: '在列表中' },
  { value: 'notIn', label: '不在列表中' },
  { value: 'regex', label: '正则匹配' },
]

export const RulesPanel: React.FC = () => {
  const { config, showRulesPanel, setShowRulesPanel, addSecurityRule, updateSecurityRule, deleteSecurityRule } = useStore()
  const { setConfig } = useIpc()
  const [editingRule, setEditingRule] = useState<SecurityRule | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateNew = () => {
    const newRule: SecurityRule = {
      id: `rule-${Date.now()}`,
      name: '',
      description: '',
      enabled: true,
      severity: 'medium',
      conditions: [
        { field: 'syscall', operator: 'eq', value: '' },
      ],
      operator: 'AND',
      action: { alert: true, block: false, log: true },
      createdAt: Date.now(),
    }
    setEditingRule(newRule)
    setIsCreating(true)
  }

  const handleEdit = (rule: SecurityRule) => {
    setEditingRule({ ...rule, conditions: [...rule.conditions] })
    setIsCreating(false)
  }

  const handleSave = async () => {
    if (!editingRule) return

    if (isCreating) {
      addSecurityRule(editingRule)
    } else {
      updateSecurityRule(editingRule)
    }

    await setConfig({ ...config })
    setEditingRule(null)
    setIsCreating(false)
  }

  const handleDelete = async (ruleId: string) => {
    deleteSecurityRule(ruleId)
    await setConfig({ ...config })
  }

  const handleToggleEnabled = async (rule: SecurityRule) => {
    const updatedRule = { ...rule, enabled: !rule.enabled }
    updateSecurityRule(updatedRule)
    await setConfig({ ...config })
  }

  const handleConditionChange = (index: number, field: keyof RuleCondition, value: any) => {
    if (!editingRule) return
    const newConditions = [...editingRule.conditions]
    newConditions[index] = { ...newConditions[index], [field]: value }
    setEditingRule({ ...editingRule, conditions: newConditions })
  }

  const handleAddCondition = () => {
    if (!editingRule) return
    setEditingRule({
      ...editingRule,
      conditions: [...editingRule.conditions, { field: 'syscall', operator: 'eq', value: '' }],
    })
  }

  const handleRemoveCondition = (index: number) => {
    if (!editingRule || editingRule.conditions.length <= 1) return
    const newConditions = editingRule.conditions.filter((_, i) => i !== index)
    setEditingRule({ ...editingRule, conditions: newConditions })
  }

  if (!showRulesPanel) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-panel w-full max-w-4xl max-h-[85vh] flex flex-col m-4 animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-cyber-border flex-shrink-0">
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple flex items-center gap-2">
            <Shield className="w-6 h-6" />
            安全规则配置
          </h2>
          <button
            onClick={() => {
              setShowRulesPanel(false)
              setEditingRule(null)
            }}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-cyber-border/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 border-r border-cyber-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-400">规则列表 ({config.securityRules?.length || 0})</h3>
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                新建规则
              </button>
            </div>

            <div className="space-y-2">
              {config.securityRules?.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    editingRule?.id === rule.id
                      ? 'border-neon-cyan bg-neon-cyan/10'
                      : 'border-cyber-border hover:border-neon-cyan/50 bg-cyber-panel/50'
                  }`}
                  onClick={() => handleEdit(rule)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity] || SEVERITY_COLORS.medium}`}
                        >
                          {rule.severity}
                        </span>
                        <span
                          className={`font-semibold truncate ${
                            rule.enabled ? 'text-white' : 'text-gray-500'
                          }`}
                        >
                          {rule.name || '未命名规则'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{rule.description || '无描述'}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                        <span>条件: {rule.conditions.length}</span>
                        <span>·</span>
                        {rule.action.alert && <span className="text-neon-yellow">告警</span>}
                        {rule.action.log && <span className="text-neon-cyan">日志</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleEnabled(rule)
                        }}
                        className="p-1 rounded"
                      >
                        {rule.enabled ? (
                          <ToggleRight className="w-5 h-5 text-neon-green" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-600" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(rule.id)
                        }}
                        className="p-1 rounded text-gray-500 hover:text-neon-red"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(!config.securityRules || config.securityRules.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>暂无安全规则</p>
                  <p className="text-xs">点击「新建规则」创建第一条规则</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-1/2 p-4 overflow-y-auto">
            {editingRule ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400">
                  {isCreating ? '新建规则' : '编辑规则'}
                </h3>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">规则名称</label>
                  <input
                    type="text"
                    value={editingRule.name}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    placeholder="例如: 禁止非 root 执行 bash"
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">描述</label>
                  <textarea
                    value={editingRule.description}
                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                    placeholder="规则描述..."
                    rows={2}
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">严重程度</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high', 'critical'] as const).map((severity) => (
                      <button
                        key={severity}
                        onClick={() => setEditingRule({ ...editingRule, severity })}
                        className={`px-3 py-1 rounded border text-sm transition-colors ${
                          editingRule.severity === severity
                            ? SEVERITY_COLORS[severity]
                            : 'border-cyber-border text-gray-500 hover:border-cyber-border/80'
                        }`}
                      >
                        {severity}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">匹配条件</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={editingRule.operator}
                        onChange={(e) =>
                          setEditingRule({ ...editingRule, operator: e.target.value as 'AND' | 'OR' })
                        }
                        className="bg-cyber-bg border border-cyber-border rounded px-2 py-1 text-sm focus:outline-none focus:border-neon-cyan"
                      >
                        <option value="AND">全部匹配 (AND)</option>
                        <option value="OR">任意匹配 (OR)</option>
                      </select>
                      <button
                        onClick={handleAddCondition}
                        className="p-1 rounded text-neon-cyan hover:bg-neon-cyan/10"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {editingRule.conditions.map((condition, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <select
                          value={condition.field}
                          onChange={(e) => handleConditionChange(index, 'field', e.target.value)}
                          className="flex-1 bg-cyber-bg border border-cyber-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-neon-cyan"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={condition.operator}
                          onChange={(e) => handleConditionChange(index, 'operator', e.target.value)}
                          className="flex-1 bg-cyber-bg border border-cyber-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-neon-cyan"
                        >
                          {OPERATOR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={String(condition.value)}
                          onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                          placeholder="值"
                          className="flex-1 bg-cyber-bg border border-cyber-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-neon-cyan"
                        />
                        <button
                          onClick={() => handleRemoveCondition(index)}
                          className="p-1 rounded text-gray-500 hover:text-neon-red disabled:opacity-30"
                          disabled={editingRule.conditions.length <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">触发动作</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingRule.action.alert}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            action: { ...editingRule.action, alert: e.target.checked },
                          })
                        }
                        className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-neon-cyan"
                      />
                      <span className="text-sm">系统通知</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingRule.action.log}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            action: { ...editingRule.action, log: e.target.checked },
                          })
                        }
                        className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-neon-cyan"
                      />
                      <span className="text-sm">记录审计日志</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-cyber-border">
                  <button
                    onClick={handleSave}
                    className="flex-1 btn-neon"
                    disabled={!editingRule.name}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingRule(null)}
                    className="px-4 py-2 rounded-lg border border-cyber-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Edit2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>选择一个规则进行编辑</p>
                  <p className="text-xs mt-1">或点击「新建规则」创建</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

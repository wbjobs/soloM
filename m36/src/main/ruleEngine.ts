import type { RuleCondition, RuleOperator, SecurityAlert, SecurityRule, SyscallEvent } from '@shared/types'
import { Notification } from 'electron'
import { insertAlert, insertAuditLog } from './auditDatabase'

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

function evaluateCondition(event: SyscallEvent, condition: RuleCondition): boolean {
  const value = getNestedValue(event, condition.field)
  const conditionValue = condition.value

  switch (condition.operator) {
    case 'eq':
      return value === conditionValue

    case 'ne':
      return value !== conditionValue

    case 'gt':
      return typeof value === 'number' && typeof conditionValue === 'number' && value > conditionValue

    case 'lt':
      return typeof value === 'number' && typeof conditionValue === 'number' && value < conditionValue

    case 'gte':
      return typeof value === 'number' && typeof conditionValue === 'number' && value >= conditionValue

    case 'lte':
      return typeof value === 'number' && typeof conditionValue === 'number' && value <= conditionValue

    case 'contains':
      return typeof value === 'string' && typeof conditionValue === 'string' && value.includes(conditionValue)

    case 'startsWith':
      return typeof value === 'string' && typeof conditionValue === 'string' && value.startsWith(conditionValue)

    case 'endsWith':
      return typeof value === 'string' && typeof conditionValue === 'string' && value.endsWith(conditionValue)

    case 'in':
      if (Array.isArray(conditionValue)) {
        return (conditionValue as any[]).includes(value)
      }
      return false

    case 'notIn':
      if (Array.isArray(conditionValue)) {
        return !(conditionValue as any[]).includes(value)
      }
      return true

    case 'regex':
      if (typeof conditionValue === 'string') {
        try {
          const regex = new RegExp(conditionValue)
          return typeof value === 'string' && regex.test(value)
        } catch {
          return false
        }
      }
      return false

    default:
      return false
  }
}

function matchRule(event: SyscallEvent, rule: SecurityRule): boolean {
  if (!rule.enabled) return false

  if (rule.conditions.length === 0) return false

  const results = rule.conditions.map((condition) => evaluateCondition(event, condition))

  if (rule.operator === 'AND') {
    return results.every((r) => r)
  } else {
    return results.some((r) => r)
  }
}

function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function generateAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

const severityColors: Record<string, string> = {
  low: '#00f5d4',
  medium: '#ffa502',
  high: '#ff4757',
  critical: '#ff0000',
}

const severityIcons: Record<string, string> = {
  low: 'ℹ️',
  medium: '⚠️',
  high: '🚨',
  critical: '🔴',
}

export interface RuleMatchResult {
  matched: boolean
  alerts: SecurityAlert[]
}

export class RuleEngine {
  private rules: SecurityRule[] = []
  private lastAlertTimestamps = new Map<string, number>()
  private alertCooldownMs = 5000

  setRules(rules: SecurityRule[]): void {
    this.rules = rules.filter((r) => r.enabled)
  }

  processEvent(event: SyscallEvent): RuleMatchResult {
    const alerts: SecurityAlert[] = []

    for (const rule of this.rules) {
      if (matchRule(event, rule)) {
        const now = Date.now()
        const lastAlert = this.lastAlertTimestamps.get(rule.id) || 0

        if (now - lastAlert >= this.alertCooldownMs) {
          this.lastAlertTimestamps.set(rule.id, now)

          const alert: SecurityAlert = {
            id: generateAlertId(),
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            event,
            timestamp: now,
            message: `规则 [${rule.name}] 触发: ${event.comm} (PID ${event.pid}) 执行了 ${event.syscall}`,
          }

          alerts.push(alert)

          if (rule.action.log) {
            this.logToDatabase(event, alert, rule)
          }

          if (rule.action.alert) {
            this.sendSystemNotification(alert)
          }
        }
      }
    }

    return {
      matched: alerts.length > 0,
      alerts,
    }
  }

  private logToDatabase(event: SyscallEvent, alert: SecurityAlert, rule: SecurityRule): void {
    try {
      insertAuditLog({
        id: generateAuditId(),
        event,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        alertTriggered: rule.action.alert,
        timestamp: Date.now(),
      })

      if (rule.action.alert) {
        insertAlert(alert)
      }
    } catch (error) {
      console.error('Failed to log to database:', error)
    }
  }

  private sendSystemNotification(alert: SecurityAlert): void {
    try {
      const notification = new Notification({
        title: `${severityIcons[alert.severity]} 安全告警: ${alert.ruleName}`,
        body: alert.message,
        silent: false,
        timeoutType: 'default',
        urgency: 'critical',
      })

      notification.show()
    } catch (error) {
      console.error('Failed to send notification:', error)
    }
  }

  getRules(): SecurityRule[] {
    return this.rules
  }
}

export const ruleEngine = new RuleEngine()

<template>
  <div class="complex">
    <p>{{ formattedText }}</p>
    <p>{{ statusLabel }}</p>
    <p>{{ validatedEmail }}</p>
  </div>
</template>

<script>
export default {
  name: 'ComplexComponent',
  props: {
    text: String,
    status: Number,
    email: String
  },
  data() {
    return {
      userType: 'admin',
      isActive: true,
      priority: 2
    }
  },
  computed: {
    // 格式化文本，包含复杂正则
    formattedText() {
      // 移除特殊字符并截断
      const cleaned = this.text?.replace(/[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/`~]/g, '') || ''
      // 多行正则匹配
      const matches = cleaned.match(/^[a-zA-Z0-9\s\-_]+$/gm)
      return matches ? matches.join(' ').replace(/\s+/g, ' ').trim() : ''
    },
    // 多层嵌套三元运算符
    statusLabel() {
      // 根据状态返回标签
      return this.status === 0
        ? '待处理'
        : this.status === 1
          ? this.isActive
            ? '处理中'
            : '已暂停'
          : this.status === 2
            ? this.userType === 'admin'
              ? '管理员已审核'
              : '待管理员审核'
            : '已完成'
    },
    // 复杂正则 + 三元组合
    validatedEmail() {
      // 邮箱验证正则
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
      
      const isEmailValid = emailRegex.test(this.email || '')
      
      // 多层嵌套判断
      return isEmailValid
        ? this.priority === 1
          ? `【高优先级】${this.email.toLowerCase()}`
          : this.priority === 2
            ? `【普通】${this.email.toLowerCase()}`
            : `【低】${this.email.toLowerCase()}`
        : '无效邮箱地址'
    }
  },
  methods: {
    // 包含复杂正则的方法
    extractNumbers(str) {
      // 提取所有数字
      const numbers = str.match(/\d+(?:\.\d+)?/g)
      return numbers ? numbers.map(n => parseFloat(n)) : []
    }
  }
}
</script>

<style scoped>
.complex {
  color: #333;
}
</style>

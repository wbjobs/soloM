<template>
  <div class="complex">
    <p>{{ formattedText }}</p>
    <p>{{ statusLabel }}</p>
    <p>{{ validatedEmail }}</p>
  </div>
</template>

<script setup>
import { defineProps, ref, reactive, computed } from 'vue';
const props = defineProps({
  text: String,
  status: Number,
  email: String
});
const userType = ref('admin');
const isActive = ref(true);
const priority = ref(2);
// 格式化文本，包含复杂正则
const formattedText = computed(function () {
  // 移除特殊字符并截断
  const cleaned = props.text?.replace(/[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/`~]/g, '') || '';
  // 多行正则匹配
  const matches = cleaned.match(/^[a-zA-Z0-9\s\-_]+$/gm);
  return matches ? matches.join(' ').replace(/\s+/g, ' ').trim() : '';
});
// 多层嵌套三元运算符
const statusLabel = computed(function () {
  // 根据状态返回标签
  return props.status === 0
    ? '待处理'
    : props.status === 1
    ? isActive
      ? '处理中'
      : '已暂停'
    : props.status === 2
    ? userType === 'admin'
      ? '管理员已审核'
      : '待管理员审核'
    : '已完成';
});
// 复杂正则 + 三元组合
const validatedEmail = computed(function () {
  // 邮箱验证正则
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const isEmailValid = emailRegex.test(props.email || '');

  // 多层嵌套判断
  return isEmailValid
    ? priority === 1
      ? `【高优先级】${props.email.toLowerCase()}`
      : priority === 2
      ? `【普通】${props.email.toLowerCase()}`
      : `【低】${props.email.toLowerCase()}`
    : '无效邮箱地址';
});
function extractNumbers(str) {
  // 提取所有数字
  const numbers = str.match(/\d+(?:\.\d+)?/g);
  return numbers ? numbers.map(n => parseFloat(n)) : [];
}
</script>

<style scoped>
  .complex {
  color: #333;
}
</style>
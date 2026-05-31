<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    <p>Count: {{ count }}</p>
    <p>Double: {{ doubleCount }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<script setup>
import { someUtil } from '../utils';
import { defineProps, defineEmits, ref, reactive, computed, watch, onMounted } from 'vue';
const props = defineProps({
  msg: {
    type: String,
    default: ''
  }
});
const emit = defineEmits(['update']);
const count = ref(0);
const user = reactive({
  name: 'John',
  age: 30
});
const doubleCount = computed(function () {
  return count * 2;
});
function increment() {
  count++;
  emit('update', count);
}
async function fetchData() {
  const data = await someUtil();
  console.log(data);
}
watch(() => count, function (newVal) {
  console.log('Count changed:', newVal);
}, {
  deep: true
});
onMounted(function () {
  console.log('Component mounted');
  fetchData();
});
</script>

<style scoped>
  .hello {
  color: blue;
}
</style>
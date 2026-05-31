<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    <p>Count: {{ count }}</p>
    <p>Double: {{ doubleCount }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<script>
import { someUtil } from '../utils'

export default {
  name: 'HelloWorld',
  props: {
    msg: {
      type: String,
      default: ''
    }
  },
  emits: ['update'],
  components: {
  },
  data() {
    return {
      count: 0,
      user: {
        name: 'John',
        age: 30
      }
    }
  },
  computed: {
    doubleCount() {
      return this.count * 2
    }
  },
  watch: {
    count: {
      handler(newVal) {
        console.log('Count changed:', newVal)
      },
      deep: true
    }
  },
  mounted() {
    console.log('Component mounted')
    this.fetchData()
  },
  methods: {
    increment() {
      this.count++
      this.$emit('update', this.count)
    },
    async fetchData() {
      const data = await someUtil()
      console.log(data)
    }
  }
}
</script>

<style scoped>
.hello {
  color: blue;
}
</style>

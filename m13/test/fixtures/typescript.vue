<template>
  <div class="user-profile">
    <h1>{{ userName }}</h1>
    <p>Age: {{ userAge }}</p>
    <p>Score: {{ score }}</p>
    <p>Tags: {{ tags.join(', ') }}</p>
    <p>Status: {{ statusText }}</p>
  </div>
</template>

<script>
export default {
  name: 'UserProfile',
  props: {
    userId: {
      type: String,
      required: true
    },
    userName: {
      type: String,
      default: ''
    },
    userAge: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      score: 100,
      isVerified: false,
      tags: ['developer', 'vue', 'typescript'],
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        address: {
          city: 'Beijing',
          country: 'China'
        }
      },
      currentStatus: 1,
      lastLogin: null,
      settings: {}
    }
  },
  computed: {
    statusText() {
      return this.currentStatus === 0 
        ? 'Pending' 
        : this.currentStatus === 1 
          ? 'Active' 
          : 'Inactive'
    },
    fullName() {
      return `${this.profile.firstName} ${this.profile.lastName}`
    }
  },
  methods: {
    updateScore(newScore) {
      this.score = newScore
    },
    addTag(tag) {
      this.tags.push(tag)
    },
    async fetchUserData() {
      const response = await fetch(`/api/users/${this.userId}`)
      return response.json()
    }
  }
}
</script>

<style scoped>
.user-profile {
  padding: 20px;
}
</style>

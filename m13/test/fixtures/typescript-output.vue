<template>
  <div class="user-profile">
    <h1>{{ userName }}</h1>
    <p>Age: {{ userAge }}</p>
    <p>Score: {{ score }}</p>
    <p>Tags: {{ tags.join(', ') }}</p>
    <p>Status: {{ statusText }}</p>
  </div>
</template>

<script setup>
import { defineProps, ref, reactive, computed } from 'vue';
const props = defineProps({
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
});
const score = ref<number>(100);
const isVerified = ref<boolean>(false);
const tags = ref<string[]>(['developer', 'vue', 'typescript']);
const profile = reactive<{   firstName: string;   lastName: string;   email: string;   address: {   city: string;   country: string } }>({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  address: {
    city: 'Beijing',
    country: 'China'
  }
});
const currentStatus = ref<number>(1);
const lastLogin = ref<null>(null);
const settings = reactive<Record<string, any>>({});
const statusText = computed(function () {
  return currentStatus === 0
    ? 'Pending'
    : currentStatus === 1
    ? 'Active'
    : 'Inactive';
});
const fullName = computed(function () {
  return `${profile.firstName} ${profile.lastName}`;
});
function updateScore(newScore) {
  score = newScore;
}
function addTag(tag) {
  tags.push(tag);
}
async function fetchUserData() {
  const response = await fetch(`/api/users/${props.userId}`);
  return response.json();
}
</script>

<style scoped>
  .user-profile {
  padding: 20px;
}
</style>
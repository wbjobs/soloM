export interface UserProfileProps {
  userId: string
  userName: string
  userAge: number
  isActive: boolean
}

export interface UserProfileState {
  score: number
  isVerified: boolean
  tags: string[]
  profile: {
  firstName: string
  lastName: string
  email: string
  address: {
  city: string
  country: string
}
}
  currentStatus: number
  lastLogin: null
  settings: Record<string, any>
}

export interface UserProfileComputed {
  statusText: any
  fullName: any
}

export interface UserProfileMethods {
  updateScore: Function
  addTag: Function
  fetchUserData: Function
}

declare const UserProfile: import('vue').DefineComponent<
  UserProfileProps,
  UserProfileState,
  UserProfileMethods,
  UserProfileComputed
>

export default UserProfile
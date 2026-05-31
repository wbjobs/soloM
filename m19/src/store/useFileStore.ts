import { create } from 'zustand'

interface FileItem {
  cid: string
  name: string
  size: number
  mimeType: string
  uploadedAt: string
  pin_count: number
  reward_level: number
  owner_nickname: string
  is_pinned?: boolean
  is_owner?: boolean
}

interface PinResult {
  success: boolean
  pointsEarned: number
  message: string
}

interface User {
  id: number
  address: string
  nickname: string
  points: number
  total_earned: number
  total_spent: number
}

interface FileStore {
  files: FileItem[]
  uploading: boolean
  progress: number
  currentUser: User | null
  fetchFiles: () => Promise<void>
  uploadFile: (file: File) => Promise<FileItem>
  deleteFile: (cid: string) => Promise<void>
  register: (nickname: string) => Promise<void>
  login: (address: string) => Promise<void>
  logout: () => void
  pinFile: (cid: string) => Promise<PinResult>
  purchaseReward: (cid: string, level: number) => Promise<void>
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  uploading: false,
  progress: 0,
  currentUser: null,

  fetchFiles: async () => {
    try {
      const headers: Record<string, string> = {}
      const currentUser = get().currentUser
      if (currentUser) {
        headers['X-User-Id'] = currentUser.id
      }
      const res = await fetch('/api/files', { headers })
      const json = await res.json()
      const files = json?.data?.files ?? json?.files ?? []
      set({ files })
    } catch {
      set({ files: [] })
    }
  },

  uploadFile: (file: File) => {
    return new Promise<FileItem>((resolve, reject) => {
      set({ uploading: true, progress: 0 })

      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          set({ progress: pct })
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText)
            const uploaded = json?.data ?? json
            set((state) => ({
              files: [uploaded, ...state.files],
              uploading: false,
              progress: 0,
            }))
            resolve(uploaded)
          } catch {
            set({ uploading: false, progress: 0 })
            reject(new Error('Parse error'))
          }
        } else {
          set({ uploading: false, progress: 0 })
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        set({ uploading: false, progress: 0 })
        reject(new Error('Upload error'))
      })

      xhr.open('POST', '/api/upload')
      const currentUser = get().currentUser
      if (currentUser) {
        xhr.setRequestHeader('X-User-Id', currentUser.id)
      }
      xhr.send(formData)
    })
  },

  deleteFile: async (cid: string) => {
    await fetch(`/api/file/${cid}`, { method: 'DELETE' })
    set((state) => ({
      files: state.files.filter((f) => f.cid !== cid),
    }))
  },

  register: async (nickname: string) => {
    const res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    })
    const json = await res.json()
    const user = json?.data ?? json
    set({ currentUser: user })
  },

  login: async (address: string) => {
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const json = await res.json()
    const user = json?.data ?? json
    set({ currentUser: user })
  },

  logout: () => {
    set({ currentUser: null })
  },

  pinFile: async (cid: string): Promise<PinResult> => {
    const currentUser = get().currentUser
    if (!currentUser) return { success: false, pointsEarned: 0, message: '请先登录' }
    const res = await fetch(`/api/file/${cid}/pin`, {
      method: 'POST',
      headers: { 'X-User-Id': currentUser.id },
    })
    const json = await res.json()
    if (json.success) {
      await get().fetchFiles()
    }
    return json
  },

  purchaseReward: async (cid: string, level: number) => {
    const currentUser = get().currentUser
    if (!currentUser) return
    await fetch(`/api/file/${cid}/reward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': currentUser.id,
      },
      body: JSON.stringify({ level }),
    })
  },
}))

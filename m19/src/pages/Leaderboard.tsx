import { useEffect, useState } from 'react'
import { Trophy, Medal } from 'lucide-react'

interface TopUser {
  id: number
  nickname: string
  points: number
  total_earned: number
}

export default function Leaderboard() {
  const [users, setUsers] = useState<TopUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTopUsers = async () => {
      try {
        const res = await fetch('/api/users/top')
        const json = await res.json()
        const data = json?.data?.users ?? json?.users ?? []
        setUsers(data)
      } catch {
        setUsers([])
      } finally {
        setLoading(false)
      }
    }
    fetchTopUsers()
  }, [])

  const getRankStyle = (rank: number) => {
    if (rank === 1) {
      return {
        bg: 'rgba(251, 191, 36, 0.15)',
        border: 'rgba(251, 191, 36, 0.5)',
        color: '#fbbf24',
        glow: '0 0 20px rgba(251, 191, 36, 0.3)',
      }
    }
    if (rank === 2) {
      return {
        bg: 'rgba(156, 163, 175, 0.15)',
        border: 'rgba(156, 163, 175, 0.5)',
        color: '#9ca3af',
        glow: '0 0 20px rgba(156, 163, 175, 0.3)',
      }
    }
    if (rank === 3) {
      return {
        bg: 'rgba(217, 119, 6, 0.15)',
        border: 'rgba(217, 119, 6, 0.5)',
        color: '#d97706',
        glow: '0 0 20px rgba(217, 119, 6, 0.3)',
      }
    }
    return {
      bg: 'rgba(255, 255, 255, 0.03)',
      border: 'rgba(255, 255, 255, 0.1)',
      color: 'rgba(255, 255, 255, 0.5)',
      glow: 'none',
    }
  }

  const getMedalIcon = (rank: number) => {
    if (rank === 1) return <Medal size={20} style={{ color: '#fbbf24' }} />
    if (rank === 2) return <Medal size={20} style={{ color: '#9ca3af' }} />
    if (rank === 3) return <Medal size={20} style={{ color: '#d97706' }} />
    return null
  }

  return (
    <div className="min-h-screen px-4 pt-16 pb-12" style={{ backgroundColor: '#0f0f23' }}>
      <div className="flex items-center justify-center gap-3 mb-10">
        <Trophy size={36} style={{ color: '#00d4aa' }} />
        <h1
          className="text-4xl font-bold"
          style={{
            fontFamily: "'Outfit', sans-serif",
            color: '#00d4aa',
            textShadow: '0 0 10px rgba(0,212,170,0.6), 0 0 30px rgba(0,212,170,0.3), 0 0 60px rgba(0,212,170,0.15)',
          }}
        >
          积分排行榜
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
            加载中...
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
            暂无数据
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {users.map((user, index) => {
              const rank = index + 1
              const style = getRankStyle(rank)
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    boxShadow: style.glow,
                  }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg"
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      backgroundColor: rank <= 3 ? style.bg : 'rgba(255,255,255,0.05)',
                      color: style.color,
                    }}
                  >
                    {getMedalIcon(rank) || rank}
                  </div>

                  <div className="flex-1">
                    <p
                      className="font-medium"
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        color: '#fff',
                      }}
                    >
                      {user.nickname}
                    </p>
                    <p
                      className="text-xs"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      累计获得: {user.total_earned} 积分
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className="text-xl font-bold"
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        color: rank <= 3 ? style.color : '#00d4aa',
                      }}
                    >
                      {user.points}
                    </p>
                    <p
                      className="text-xs"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      积分
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

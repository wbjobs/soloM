import { Router, type Request, type Response } from 'express'
import {
  createUser,
  getUserByAddress,
  getUserById,
  getTopUsers,
  getUserTransactions,
} from '../services/user.service.js'

const router = Router()

router.post('/user/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nickname } = req.body
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      res.status(400).json({ success: false, error: '昵称不能为空' })
      return
    }

    const user = createUser(nickname.trim().slice(0, 20))
    res.status(200).json({ success: true, data: user })
  } catch (err: any) {
    console.error('Register error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/user/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { address } = req.body
    if (address) {
      const user = getUserByAddress(address)
      if (user) {
        res.status(200).json({ success: true, data: user })
        return
      }
    }
    res.status(404).json({ success: false, error: '用户不存在' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/user/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUserById(Number(req.params.id))
    if (user) {
      res.status(200).json({ success: true, data: user })
    } else {
      res.status(404).json({ success: false, error: '用户不存在' })
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/users/top', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = getTopUsers(20)
    res.status(200).json({ success: true, data: { users } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/user/:id/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const txs = getUserTransactions(Number(req.params.id))
    res.status(200).json({ success: true, data: { transactions: txs } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

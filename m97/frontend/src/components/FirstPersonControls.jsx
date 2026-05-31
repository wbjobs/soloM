import React, { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SPEED = 8
const MOUSE_SENSITIVITY = 0.002
const PLAYER_HALF_WIDTH = 0.3
const PLAYER_HEIGHT = 1.7
const PLAYER_EYE_HEIGHT = 1.55
const MAX_STEP = 0.6
const GRAVITY = 20
const JUMP_SPEED = 7
const COLLISION_ITERATIONS = 3

const KEY_MAP = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'up',
  ShiftLeft: 'down',
}

export default function FirstPersonControls({ spatialHash }) {
  const { camera, gl } = useThree()
  const keysRef = useRef({})
  const eulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const isLockedRef = useRef(false)
  const velocityYRef = useRef(0)
  const onGroundRef = useRef(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    const domElement = gl.domElement

    const handleKeyDown = (e) => {
      keysRef.current[KEY_MAP[e.code]] = true
      if (e.code === 'Space') e.preventDefault()
    }

    const handleKeyUp = (e) => {
      keysRef.current[KEY_MAP[e.code]] = false
    }

    const handleMouseMove = (e) => {
      if (!isLockedRef.current) return
      eulerRef.current.setFromQuaternion(camera.quaternion)
      eulerRef.current.y -= e.movementX * MOUSE_SENSITIVITY
      eulerRef.current.x -= e.movementY * MOUSE_SENSITIVITY
      eulerRef.current.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, eulerRef.current.x))
      camera.quaternion.setFromEuler(eulerRef.current)
    }

    const handlePointerLockChange = () => {
      isLockedRef.current = document.pointerLockElement === domElement
    }

    const handleClick = () => {
      if (!isLockedRef.current) {
        domElement.requestPointerLock()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    domElement.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      domElement.removeEventListener('click', handleClick)
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock()
      }
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    if (!isLockedRef.current || !spatialHash) return

    if (!initializedRef.current) {
      initializedRef.current = true
      camera.position.set(32, 30, 50)
      velocityYRef.current = 0
    }

    const dt = Math.min(delta, 0.05)
    const keys = keysRef.current
    const hash = spatialHash

    const direction = new THREE.Vector3()
    const right = new THREE.Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    direction.normalize()
    right.crossVectors(direction, camera.up).normalize()

    const moveSpeed = SPEED * dt
    let moveX = 0
    let moveZ = 0
    let moveY = 0

    if (keys.forward) { moveX += direction.x * moveSpeed; moveZ += direction.z * moveSpeed }
    if (keys.backward) { moveX -= direction.x * moveSpeed; moveZ -= direction.z * moveSpeed }
    if (keys.left) { moveX -= right.x * moveSpeed; moveZ -= right.z * moveSpeed }
    if (keys.right) { moveX += right.x * moveSpeed; moveZ += right.z * moveSpeed }

    const feetY = camera.position.y - PLAYER_EYE_HEIGHT
    const groundCheckY = feetY - 0.05
    onGroundRef.current = hash.isSolid(
      Math.floor(camera.position.x),
      Math.floor(groundCheckY),
      Math.floor(camera.position.z)
    ) || hash.isSolid(
      Math.floor(camera.position.x + PLAYER_HALF_WIDTH),
      Math.floor(groundCheckY),
      Math.floor(camera.position.z)
    ) || hash.isSolid(
      Math.floor(camera.position.x - PLAYER_HALF_WIDTH),
      Math.floor(groundCheckY),
      Math.floor(camera.position.z)
    ) || hash.isSolid(
      Math.floor(camera.position.x),
      Math.floor(groundCheckY),
      Math.floor(camera.position.z + PLAYER_HALF_WIDTH)
    ) || hash.isSolid(
      Math.floor(camera.position.x),
      Math.floor(groundCheckY),
      Math.floor(camera.position.z - PLAYER_HALF_WIDTH)
    )

    if (onGroundRef.current) {
      velocityYRef.current = 0
      if (keys.up) {
        velocityYRef.current = JUMP_SPEED
        onGroundRef.current = false
      }
    } else {
      velocityYRef.current -= GRAVITY * dt
    }

    moveY = velocityYRef.current * dt

    if (keys.down && onGroundRef.current) {
      moveY = -moveSpeed * 0.5
    }

    camera.position.x += moveX
    resolveAxisX(camera.position, hash)

    camera.position.z += moveZ
    resolveAxisZ(camera.position, hash)

    camera.position.y += moveY
    resolveAxisY(camera.position, hash, moveY)

    if (camera.position.y < -20) {
      camera.position.y = 40
      velocityYRef.current = 0
    }
  })

  return null
}

function resolveAxisX(pos, hash) {
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    const feetY = pos.y - PLAYER_EYE_HEIGHT
    const headY = feetY + PLAYER_HEIGHT
    const hw = PLAYER_HALF_WIDTH

    const minX = pos.x - hw
    const maxX = pos.x + hw
    const minZ = pos.z - hw
    const maxZ = pos.z + hw

    const y0 = Math.floor(feetY + 0.01)
    const y1 = Math.floor(headY - 0.01)
    const z0 = Math.floor(minZ)
    const z1 = Math.floor(maxZ)

    let collided = false
    for (let by = y0; by <= y1 && !collided; by++) {
      for (let bz = z0; bz <= z1 && !collided; bz++) {
        if (hash.isSolid(Math.floor(minX), by, bz) && pos.x >= Math.floor(minX) + 1 - hw - 0.01) {
          pos.x = Math.floor(minX) + 1 + hw + 0.001
          collided = true
        }
        if (hash.isSolid(Math.floor(maxX), by, bz) && pos.x <= Math.floor(maxX) + hw + 0.01) {
          pos.x = Math.floor(maxX) - hw - 0.001
          collided = true
        }
      }
    }
    if (!collided) break
  }
}

function resolveAxisZ(pos, hash) {
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    const feetY = pos.y - PLAYER_EYE_HEIGHT
    const headY = feetY + PLAYER_HEIGHT
    const hw = PLAYER_HALF_WIDTH

    const minX = pos.x - hw
    const maxX = pos.x + hw
    const minZ = pos.z - hw
    const maxZ = pos.z + hw

    const y0 = Math.floor(feetY + 0.01)
    const y1 = Math.floor(headY - 0.01)
    const x0 = Math.floor(minX)
    const x1 = Math.floor(maxX)

    let collided = false
    for (let by = y0; by <= y1 && !collided; by++) {
      for (let bx = x0; bx <= x1 && !collided; bx++) {
        if (hash.isSolid(bx, by, Math.floor(minZ)) && pos.z >= Math.floor(minZ) + 1 - hw - 0.01) {
          pos.z = Math.floor(minZ) + 1 + hw + 0.001
          collided = true
        }
        if (hash.isSolid(bx, by, Math.floor(maxZ)) && pos.z <= Math.floor(maxZ) + hw + 0.01) {
          pos.z = Math.floor(maxZ) - hw - 0.001
          collided = true
        }
      }
    }
    if (!collided) break
  }
}

function resolveAxisY(pos, hash, moveY) {
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    const feetY = pos.y - PLAYER_EYE_HEIGHT
    const headY = feetY + PLAYER_HEIGHT
    const hw = PLAYER_HALF_WIDTH

    const minX = pos.x - hw
    const maxX = pos.x + hw
    const minZ = pos.z - hw
    const maxZ = pos.z + hw

    const x0 = Math.floor(minX)
    const x1 = Math.floor(maxX)
    const z0 = Math.floor(minZ)
    const z1 = Math.floor(maxZ)

    let collided = false

    if (moveY < 0) {
      const y0 = Math.floor(feetY)
      for (let bx = x0; bx <= x1 && !collided; bx++) {
        for (let bz = z0; bz <= z1 && !collided; bz++) {
          if (hash.isSolid(bx, y0, bz)) {
            pos.y = y0 + 1 + PLAYER_EYE_HEIGHT + 0.001
            collided = true
          }
        }
      }
    } else if (moveY > 0) {
      const y1 = Math.floor(headY)
      for (let bx = x0; bx <= x1 && !collided; bx++) {
        for (let bz = z0; bz <= z1 && !collided; bz++) {
          if (hash.isSolid(bx, y1, bz)) {
            pos.y = y1 - PLAYER_EYE_HEIGHT - 0.001
            collided = true
          }
        }
      }
    }

    if (!collided) break
  }
}

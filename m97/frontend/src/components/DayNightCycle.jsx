import React, { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const DAY_LENGTH = 120
const SUN_DISTANCE = 150

const PHASES = [
  { t: 0.00, name: 'night',   sky: '#0a0f23', sun: 0x6688bb, ambient: 0.08, sunInt: 0.05, moonInt: 0.25 },
  { t: 0.15, name: 'dawn',    sky: '#ff8c64', sun: 0xffaa55, ambient: 0.25, sunInt: 0.4,  moonInt: 0.05 },
  { t: 0.30, name: 'day',     sky: '#87ceeb', sun: 0xffffff, ambient: 0.45, sunInt: 0.9,  moonInt: 0.0 },
  { t: 0.70, name: 'dusk',    sky: '#ff8c64', sun: 0xffaa55, ambient: 0.25, sunInt: 0.4,  moonInt: 0.05 },
  { t: 0.85, name: 'night',   sky: '#0a0f23', sun: 0x6688bb, ambient: 0.08, sunInt: 0.05, moonInt: 0.25 },
  { t: 1.00, name: 'night',   sky: '#0a0f23', sun: 0x6688bb, ambient: 0.08, sunInt: 0.05, moonInt: 0.25 },
]

function sampleTime(t) {
  const norm = ((t % 1) + 1) % 1
  for (let i = 0; i < PHASES.length - 1; i++) {
    if (norm >= PHASES[i].t && norm < PHASES[i + 1].t) {
      const a = PHASES[i]
      const b = PHASES[i + 1]
      const range = b.t - a.t
      const progress = range > 0 ? (norm - a.t) / range : 0
      const smooth = progress * progress * (3 - 2 * progress)
      return {
        sky: lerpColor(new THREE.Color(a.sky), new THREE.Color(b.sky), smooth),
        sun: new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), smooth),
        ambient: a.ambient + (b.ambient - a.ambient) * smooth,
        sunInt: a.sunInt + (b.sunInt - a.sunInt) * smooth,
        moonInt: a.moonInt + (b.moonInt - a.moonInt) * smooth,
      }
    }
  }
  return {
    sky: new THREE.Color(PHASES[0].sky),
    sun: new THREE.Color(PHASES[0].sun),
    ambient: PHASES[0].ambient,
    sunInt: PHASES[0].sunInt,
    moonInt: PHASES[0].moonInt,
  }
}

function lerpColor(a, b, t) {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  )
}

export default function DayNightCycle({ enabled = true, speed = 1, startTime = 0.5 }) {
  const { scene } = useThree()
  const sunLightRef = useRef()
  const sunMeshRef = useRef()
  const moonLightRef = useRef()
  const moonMeshRef = useRef()
  const ambientRef = useRef()
  const timeRef = useRef(startTime)

  const sunDir = new THREE.Vector3()
  const moonDir = new THREE.Vector3()

  useFrame((_, delta) => {
    if (!enabled) return

    timeRef.current = (timeRef.current + delta * speed / DAY_LENGTH) % 1
    const t = timeRef.current

    const sunAngle = t * Math.PI * 2 - Math.PI / 2
    sunDir.set(
      Math.cos(sunAngle) * SUN_DISTANCE,
      Math.sin(sunAngle) * SUN_DISTANCE,
      30
    )

    const moonAngle = (t + 0.5) * Math.PI * 2 - Math.PI / 2
    moonDir.set(
      Math.cos(moonAngle) * SUN_DISTANCE,
      Math.sin(moonAngle) * SUN_DISTANCE,
      -30
    )

    if (sunLightRef.current) {
      sunLightRef.current.position.copy(sunDir)
    }
    if (sunMeshRef.current) {
      sunMeshRef.current.position.copy(sunDir)
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.copy(moonDir)
    }
    if (moonMeshRef.current) {
      moonMeshRef.current.position.copy(moonDir)
    }

    const sample = sampleTime(t)

    if (sunLightRef.current) {
      sunLightRef.current.color.copy(sample.sun)
      sunLightRef.current.intensity = sample.sunInt
      sunLightRef.current.visible = sunDir.y > -30
    }
    if (moonLightRef.current) {
      moonLightRef.current.intensity = sample.moonInt
      moonLightRef.current.visible = moonDir.y > -30
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = sample.ambient
    }

    if (scene) {
      scene.background = sample.sky
      if (scene.fog) {
        scene.fog.color.copy(sample.sky)
      }
    }
  })

  return (
    <>
      <directionalLight
        ref={sunLightRef}
        position={[50, 80, 30]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={300}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />
      <mesh ref={sunMeshRef} position={[50, 80, 30]}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshBasicMaterial color={0xffffcc} toneMapped={false} />
      </mesh>

      <directionalLight
        ref={moonLightRef}
        position={[-50, 60, -30]}
        intensity={0.1}
        color={0x88aaff}
      />
      <mesh ref={moonMeshRef} position={[-50, 60, -30]}>
        <sphereGeometry args={[4, 32, 32]} />
        <meshBasicMaterial color={0xeef0ff} toneMapped={false} />
      </mesh>

      <ambientLight ref={ambientRef} intensity={0.4} color={0xffffff} />
      <hemisphereLight args={['#ffffff', '#5a4a30', 0.3]} />
      <fog attach="fog" args={['#87ceeb', 80, 180]} />
    </>
  )
}

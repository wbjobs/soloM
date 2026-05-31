export class Camera {
  x: number
  y: number
  private lerpFactor: number

  constructor(x = 0, y = 0, lerpFactor = 0.1) {
    this.x = x
    this.y = y
    this.lerpFactor = lerpFactor
  }

  update(targetX: number, targetY: number, deltaTime: number): void {
    const t = 1 - Math.pow(1 - this.lerpFactor, deltaTime * 60)
    this.x += (targetX - this.x) * t
    this.y += (targetY - this.y) * t
  }

  getViewport(
    mapWidth: number,
    mapHeight: number,
    canvasWidth: number,
    canvasHeight: number,
  ): { x: number; y: number; width: number; height: number } {
    const mapPixelW = mapWidth * 32
    const mapPixelH = mapHeight * 32

    let vx = this.x - canvasWidth / 2
    let vy = this.y - canvasHeight / 2

    vx = Math.max(0, Math.min(vx, mapPixelW - canvasWidth))
    vy = Math.max(0, Math.min(vy, mapPixelH - canvasHeight))

    if (mapPixelW < canvasWidth) vx = (mapPixelW - canvasWidth) / 2
    if (mapPixelH < canvasHeight) vy = (mapPixelH - canvasHeight) / 2

    return { x: vx, y: vy, width: canvasWidth, height: canvasHeight }
  }
}

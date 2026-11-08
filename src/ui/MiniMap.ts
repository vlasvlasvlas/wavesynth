export class MiniMap {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 200
    this.canvas.height = 100
    this.canvas.style.cssText = `
      position:absolute; top:16px; right:16px;
      border:1px solid rgba(0,245,212,0.2);
      cursor:default;
    `
    document.body.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
  }

  update(lat: number | null, lon: number | null): void {
    const { canvas: cv, ctx } = this
    const W = cv.width, H = cv.height

    ctx.fillStyle = '#040f1e'
    ctx.fillRect(0, 0, W, H)

    // Simplified land blocks [lonMin, lonMax, latMin, latMax]
    const land = [
      [-170, -50,  15, 75],  // North America
      [ -80, -35, -55, 15],  // South America
      [ -15,  50, -35, 72],  // Europe / Africa
      [  25,  50,  30, 72],  // Middle East / extend Europe
      [  50, 180,   0, 75],  // Asia
      [ 115, 155, -45, -10], // Australia
      [ -25,  -5,  60, 70],  // Iceland / Greenland hint
    ]

    ctx.fillStyle = '#1a3a28'
    for (const [l1, l2, lat1, lat2] of land) {
      const x1 = ((l1 + 180) / 360) * W
      const x2 = ((l2 + 180) / 360) * W
      const y1 = ((90 - lat2) / 180) * H
      const y2 = ((90 - lat1) / 180) * H
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
    }

    // Equator line
    ctx.strokeStyle = '#1a4a6b44'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, H / 2)
    ctx.lineTo(W, H / 2)
    ctx.stroke()

    if (lat === null || lon === null) return

    const x = ((lon + 180) / 360) * W
    const y = ((90 - lat) / 180) * H

    // Pulse ring
    ctx.strokeStyle = 'rgba(0,245,212,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.stroke()

    // Dot
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#00f5d4'
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Label
    ctx.fillStyle = 'rgba(0,245,212,0.6)'
    ctx.font = '8px Courier New'
    ctx.fillText(`${lat >= 0 ? lat.toFixed(1)+'°N' : Math.abs(lat).toFixed(1)+'°S'}  ${lon >= 0 ? lon.toFixed(1)+'°E' : Math.abs(lon).toFixed(1)+'°W'}`, 4, H - 4)
  }
}

/// <reference types="vite/client" />

declare module 'ngl' {
  export class Stage {
    constructor(element: string | HTMLElement, options?: any)
    loadFile(path: string, options?: any): Promise<any>
    removeAllComponents(): void
    removeComponent(component: any): void
    handleResize(): void
    dispose(): void
    viewer: { requestRender(): void }
    signals: { componentAdded: { add(fn: (component: any) => void): void } }
  }
}

declare module 'echarts-for-react' {
  import { Component } from 'react'
  export default class ReactECharts extends Component<any, any> {}
}

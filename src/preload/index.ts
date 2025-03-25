import { contextBridge, ipcRenderer } from 'electron'

export type SearchResult = {
  title: string
  url: string
  content: string
  engine: string
  score?: number
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
  answers: string[]
  corrections: string[]
  suggestions: string[]
  infoboxes: any[]
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add Ollama API communication
  chatWithOllama: (messages: any[]) => ipcRenderer.invoke('chat-with-ollama', messages),
  
  // 添加流式响应监听
  onOllamaStream: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('ollama-stream', listener)
    
    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener('ollama-stream', listener)
    }
  },

  // 获取Ollama可用模型列表
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),

  // 设置当前使用的模型
  setCurrentModel: (modelName: string) => ipcRenderer.invoke('set-current-model', modelName),

  // 搜索功能
  search: (query: string, engines?: string[]): Promise<SearchResponse> => {
    return ipcRenderer.invoke('search', query, engines)
  },

  // 获取可用的搜索引擎
  getEngines: (): Promise<string[]> => {
    return ipcRenderer.invoke('get-engines')
  }
})

// Function executed when window is loaded
window.addEventListener('DOMContentLoaded', () => {
  // You can do any DOM-related setup here if needed
}) 
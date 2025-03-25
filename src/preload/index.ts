import { contextBridge, ipcRenderer } from 'electron'

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
  }
})

// Function executed when window is loaded
window.addEventListener('DOMContentLoaded', () => {
  // You can do any DOM-related setup here if needed
}) 
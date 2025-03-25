import { app, BrowserWindow, globalShortcut, screen, ipcMain } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null
let ollama: any = null
// 默认模型
let currentModel = 'llama2'

async function initOllama() {
  try {
    const { Ollama } = await import('ollama')
    ollama = new Ollama()
    return ollama
  } catch (error) {
    console.error('Failed to initialize Ollama:', error)
    return null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Hide window when it loses focus
  mainWindow.on('blur', () => {
    mainWindow?.hide()
  })
}

app.whenReady().then(async () => {
  await initOllama()
  
  createWindow()

  // Register global shortcut
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (!mainWindow) return

    // Toggle window visibility: hide if visible, show if hidden
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      // Get current mouse position
      const mousePos = screen.getCursorScreenPoint()
      const { width, height } = mainWindow.getBounds()

      // Position window near mouse cursor
      mainWindow.setBounds({
        x: mousePos.x - width / 2,
        y: mousePos.y - 20,
        width,
        height
      })

      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 获取可用模型列表
  ipcMain.handle('get-ollama-models', async () => {
    if (!ollama) {
      return {
        error: true,
        message: 'Ollama is not initialized'
      }
    }

    try {
      const models = await ollama.list()
      return {
        error: false,
        data: models
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error)
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // 设置当前使用的模型
  ipcMain.handle('set-current-model', async (_, modelName) => {
    currentModel = modelName
    return { success: true, currentModel }
  })

  // 使用当前选择的模型进行聊天
  ipcMain.handle('chat-with-ollama', async (_, messages) => {
    if (!ollama) {
      return {
        error: true,
        message: 'Ollama is not initialized'
      }
    }

    try {
      const response = await ollama.chat({
        model: currentModel, // 使用选择的模型
        messages,
        stream: true
      })

      // 返回一个初始响应以启动流
      const initialResponse = {
        error: false,
        type: 'stream-start',
        data: { id: Date.now().toString() }
      }
      
      // 创建一个处理流的异步函数
      const processStream = async () => {
        let accumulatedContent = ''
        
        for await (const chunk of response) {
          accumulatedContent += chunk.message.content
          
          // 发送每个流块到渲染进程
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ollama-stream', {
              type: 'chunk',
              content: chunk.message.content,
              accumulatedContent: accumulatedContent
            })
          }
        }
        
        // 流完成时发送完成信号
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ollama-stream', {
            type: 'end',
            content: accumulatedContent
          })
        }
      }
      
      // 开始处理流但不等待它完成
      processStream().catch(error => {
        console.error('Streaming error:', error)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ollama-stream', {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown streaming error'
          })
        }
      })
      
      // 返回初始响应，流将通过事件继续
      return initialResponse
    } catch (error) {
      console.error('Ollama API error:', error)
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
}) 
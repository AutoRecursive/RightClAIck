<template>
  <div class="app-container neon-border">
    <div class="chat-container">
      <div class="messages" ref="messagesContainer">
        <div v-for="(message, index) in messages" :key="index" 
             :class="['message', message.role === 'user' ? 'user-message' : 'ai-message', message.streaming ? 'streaming' : '']">
          {{ message.content }}
          <span v-if="message.streaming" class="typing-indicator"></span>
        </div>
      </div>
      <div class="input-container">
        <input 
          v-model="userInput"
          @keyup.enter="sendMessage"
          placeholder="Type your message..."
          class="message-input neon-border"
          :disabled="isProcessing"
        />
        <button 
          @click="sendMessage" 
          class="send-button neon-text"
          :disabled="isProcessing || !userInput.trim()"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onUnmounted } from 'vue'

const userInput = ref('')
const isProcessing = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
let removeStreamListener: (() => void) | null = null

// 添加类型声明以使用暴露的API
declare global {
  interface Window {
    electronAPI: {
      chatWithOllama: (messages: any[]) => Promise<any>,
      onOllamaStream: (callback: (data: any) => void) => () => void
    }
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const messages = ref<Message[]>([
  {
    role: 'assistant',
    content: 'Hi! How can I help you today?'
  }
])

// 设置流式响应监听器
function setupStreamListener() {
  if (removeStreamListener) {
    removeStreamListener()
  }
  
  removeStreamListener = window.electronAPI.onOllamaStream((data) => {
    if (data.type === 'chunk') {
      // 查找最后一条助手消息并更新它
      const lastAssistantMessageIndex = findLastAssistantMessageIndex()
      if (lastAssistantMessageIndex !== -1) {
        messages.value[lastAssistantMessageIndex].content = data.accumulatedContent
        messages.value[lastAssistantMessageIndex].streaming = true
      }
    } else if (data.type === 'end') {
      // 流结束时，更新最终内容并移除streaming标志
      const lastAssistantMessageIndex = findLastAssistantMessageIndex()
      if (lastAssistantMessageIndex !== -1) {
        messages.value[lastAssistantMessageIndex].content = data.content
        messages.value[lastAssistantMessageIndex].streaming = false
      }
      isProcessing.value = false
    } else if (data.type === 'error') {
      // 处理错误
      messages.value.push({
        role: 'assistant',
        content: `Error: ${data.error || 'Unknown streaming error'}`
      })
      isProcessing.value = false
    }
    
    // 每次更新后滚动到底部
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  })
}

// 查找最后一条助手消息的索引
function findLastAssistantMessageIndex(): number {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant') {
      return i
    }
  }
  return -1
}

async function sendMessage() {
  if (!userInput.value.trim() || isProcessing.value) return

  const userMessage = userInput.value
  messages.value.push({
    role: 'user',
    content: userMessage
  })
  userInput.value = ''
  isProcessing.value = true

  // 首先添加一个空的助手消息，用于流式更新
  messages.value.push({
    role: 'assistant',
    content: '',
    streaming: true
  })

  // 确保滚动到最新消息
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }

  try {
    // 使用通过IPC暴露的真实Ollama API
    const response = await window.electronAPI.chatWithOllama(
      messages.value
        .filter(msg => !msg.streaming) // 过滤掉正在流式传输的消息
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))
    )

    if (response.error) {
      // 替换空消息为错误消息
      const lastIndex = messages.value.length - 1
      messages.value[lastIndex] = {
        role: 'assistant',
        content: `Error: ${response.message || 'Unknown error occurred'}`
      }
      isProcessing.value = false
    }
    // 成功情况下，流式内容会通过事件处理程序更新
  } catch (error) {
    // 替换空消息为错误消息
    const lastIndex = messages.value.length - 1
    messages.value[lastIndex] = {
      role: 'assistant',
      content: 'Sorry, I encountered an error connecting to the AI service. Please try again.'
    }
    isProcessing.value = false
  }
}

onMounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
  
  // 设置流式响应监听器
  setupStreamListener()
})

onUnmounted(() => {
  // 清理流式响应监听器
  if (removeStreamListener) {
    removeStreamListener()
  }
})
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  background: var(--background);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  height: 100%;
  overflow: hidden;
}

.messages {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 1rem;
  padding-right: 0.5rem;
  display: flex;
  flex-direction: column;
  max-height: calc(100% - 60px);
}

.message {
  margin-bottom: 0.8rem;
  padding: 0.8rem;
  border-radius: 8px;
  max-width: 80%;
  word-wrap: break-word;
}

.user-message {
  background: var(--primary-neon);
  margin-left: auto;
  color: white;
}

.ai-message {
  background: var(--secondary-neon);
  margin-right: auto;
  color: white;
}

.input-container {
  display: flex;
  gap: 0.5rem;
}

.message-input {
  flex: 1;
  padding: 0.8rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
  outline: none;
}

.message-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.send-button {
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--primary-neon);
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-button:not(:disabled):hover {
  transform: translateY(-2px);
}

/* Scrollbar styling */
.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--primary-neon);
  border-radius: 3px;
}

/* 添加流式输入的样式 */
.typing-indicator {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--primary-neon);
  margin-left: 6px;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}
</style> 
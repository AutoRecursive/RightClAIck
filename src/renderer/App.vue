<template>
  <div class="app-container neon-border">
    <div class="header">
      <div class="model-selector">
        <label for="model-select">Model:</label>
        <select 
          id="model-select" 
          v-model="selectedModel" 
          @change="changeModel"
          class="neon-border model-dropdown"
          :disabled="isProcessing || isLoadingModels"
        >
          <option v-if="isLoadingModels" value="">Loading models...</option>
          <option v-else-if="availableModels.length === 0" value="">No models found</option>
          <option v-for="model in availableModels" :key="model.name" :value="model.name">
            {{ model.name }}
          </option>
        </select>
      </div>
      <button @click="refreshModels" class="refresh-button neon-text" :disabled="isProcessing || isLoadingModels">
        ⟳
      </button>
    </div>

    <!-- 添加搜索栏 -->
    <div class="search-container">
      <input 
        v-model="searchQuery"
        @keyup.enter="performSearch"
        placeholder="Search the web..."
        class="search-input neon-border"
        :disabled="isSearching"
      />
      <button 
        @click="performSearch" 
        class="search-button neon-text"
        :disabled="isSearching || !searchQuery.trim()"
      >
        Search
      </button>
    </div>

    <!-- 添加搜索结果组件 -->
    <SearchResults 
      v-if="showSearchResults"
      :results="searchResults"
      :isLoading="isSearching"
    />

    <div class="chat-container" :class="{ 'with-search-results': showSearchResults }">
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
          :disabled="isProcessing || !userInput.trim() || availableModels.length === 0"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onUnmounted } from 'vue'
import SearchResults from './components/SearchResults.vue'

const userInput = ref('')
const isProcessing = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
let removeStreamListener: (() => void) | null = null

// 模型相关状态
const selectedModel = ref('llama2')
const availableModels = ref<any[]>([])
const isLoadingModels = ref(false)

// 添加搜索相关的状态
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const showSearchResults = ref(false)

// 添加类型声明以使用暴露的API
declare global {
  interface Window {
    electronAPI: {
      chatWithOllama: (messages: any[]) => Promise<any>,
      onOllamaStream: (callback: (data: any) => void) => () => void,
      getOllamaModels: () => Promise<any>,
      setCurrentModel: (modelName: string) => Promise<any>,
      search: (query: string) => Promise<any>
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

// 获取可用模型列表
async function fetchModels() {
  isLoadingModels.value = true
  try {
    const response = await window.electronAPI.getOllamaModels()
    if (!response.error && response.data) {
      availableModels.value = response.data.models || []
      
      // 如果有可用模型且当前选择的模型不在列表中，则选择第一个模型
      if (availableModels.value.length > 0) {
        const modelNames = availableModels.value.map(model => model.name)
        if (!modelNames.includes(selectedModel.value)) {
          selectedModel.value = availableModels.value[0].name
          await changeModel()
        }
      }
    } else {
      console.error('Failed to fetch models:', response.message)
    }
  } catch (error) {
    console.error('Error loading models:', error)
  } finally {
    isLoadingModels.value = false
  }
}

// 更新当前使用的模型
async function changeModel() {
  try {
    await window.electronAPI.setCurrentModel(selectedModel.value)
    
    // 添加系统消息通知用户模型已更改
    messages.value.push({
      role: 'assistant',
      content: `Model switched to ${selectedModel.value}`
    })
    
    // 滚动到底部
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  } catch (error) {
    console.error('Error changing model:', error)
  }
}

// 刷新模型列表按钮
async function refreshModels() {
  await fetchModels()
}

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

// 执行搜索
async function performSearch() {
  if (!searchQuery.value.trim() || isSearching.value) return

  isSearching.value = true
  showSearchResults.value = true
  searchResults.value = []

  try {
    const response = await window.electronAPI.search(searchQuery.value)
    
    if (response.error) {
      throw new Error(response.message || 'Search failed')
    }

    searchResults.value = response.data.results || []

    if (searchResults.value.length === 0) {
      messages.value.push({
        role: 'assistant',
        content: 'No results found for your search query.'
      })
      return
    }

    // 将搜索查询和结果发送给 LLM 处理
    const searchContext = formatSearchResultsForLLM(searchQuery.value, searchResults.value)
    
    // 添加用户的搜索消息
    messages.value.push({
      role: 'user',
      content: `Search query: ${searchQuery.value}`
    })

    // 添加一个空的助手消息用于流式更新
    messages.value.push({
      role: 'assistant',
      content: '',
      streaming: true
    })

    isProcessing.value = true

    // 确保滚动到最新消息
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }

    try {
      await window.electronAPI.chatWithOllama([
        {
          role: 'system',
          content: 'You are a helpful assistant. I will provide you with a search query and its results. Please analyze the results and provide a comprehensive summary that answers the user\'s query. Focus on the most relevant information and highlight key points.'
        },
        {
          role: 'user',
          content: searchContext
        }
      ])
      // 流式响应会通过事件处理程序更新
    } catch (error) {
      // 替换空消息为错误消息
      const lastIndex = messages.value.length - 1
      messages.value[lastIndex] = {
        role: 'assistant',
        content: 'Sorry, I encountered an error analyzing the search results. Please try again.'
      }
      isProcessing.value = false
    }
  } catch (error) {
    console.error('Search error:', error)
    messages.value.push({
      role: 'assistant',
      content: error instanceof Error ? error.message : 'An error occurred while performing the search. Please try again.'
    })
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// 格式化搜索结果以供 LLM 处理
function formatSearchResultsForLLM(query: string, results: any[]): string {
  let context = `Search Query: "${query}"\n\nSearch Results:\n\n`
  
  results.forEach((result, index) => {
    context += `[Result ${index + 1}]\n`
    context += `Title: ${result.title}\n`
    context += `URL: ${result.url}\n`
    context += `Content: ${result.content}\n`
    context += `Source: ${result.engine}\n\n`
  })

  context += `\nPlease analyze these search results and provide a comprehensive answer to the query "${query}". `
  context += `Focus on the most relevant information and provide a clear, well-structured response. `
  context += `If the results contain conflicting information, please highlight this and explain the different perspectives.`

  return context
}

onMounted(async () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
  
  // 设置流式响应监听器
  setupStreamListener()
  
  // 获取模型列表
  await fetchModels()
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
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1rem;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  background-color: var(--color-bg-primary);
  padding: 0.5rem;
  border-radius: 4px;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--color-bg-primary);
}

.model-selector label {
  margin-right: 0.5rem;
  color: var(--color-text-primary);
  font-weight: bold;
}

.model-dropdown {
  padding: 0.5rem;
  border-radius: 4px;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-neon-magenta);
}

.refresh-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-neon-magenta);
  border-radius: 4px;
  background-color: var(--color-bg-secondary);
  color: var(--color-neon-green);
  text-shadow: 0 0 5px var(--color-neon-green);
  cursor: pointer;
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-container {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  background-color: var(--color-bg-primary);
  padding: 0.5rem;
  border-radius: 4px;
}

.search-input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 4px;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-neon-magenta);
}

.search-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-neon-magenta);
  border-radius: 4px;
  background-color: var(--color-bg-secondary);
  color: var(--color-neon-green);
  text-shadow: 0 0 5px var(--color-neon-green);
  cursor: pointer;
}

.search-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 1rem;
  background-color: var(--color-bg-primary);
  border-radius: 4px;
  padding: 0.5rem;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background-color: var(--color-bg-secondary);
  border-radius: 4px;
  margin-bottom: 1rem;
  border: 1px solid var(--color-neon-magenta);
}

.message {
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  max-width: 80%;
  background-color: var(--color-bg-tertiary);
}

.user-message {
  background-color: var(--color-bg-tertiary);
  margin-left: auto;
  color: var(--color-neon-magenta);
  text-shadow: 0 0 5px var(--color-neon-magenta);
  border: 1px solid var(--color-neon-magenta);
}

.ai-message {
  background-color: var(--color-bg-quaternary);
  margin-right: auto;
  color: var(--color-neon-green);
  text-shadow: 0 0 5px var(--color-neon-green);
  border: 1px solid var(--color-neon-green);
}

.input-container {
  display: flex;
  gap: 0.5rem;
  background-color: var(--color-bg-primary);
  padding: 0.5rem;
  border-radius: 4px;
}

.message-input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 4px;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-neon-magenta);
}

.send-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-neon-magenta);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-neon-green);
  text-shadow: 0 0 5px var(--color-neon-green);
  cursor: pointer;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 添加滚动条样式 */
.messages::-webkit-scrollbar {
  width: 8px;
}

.messages::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
  border-radius: 4px;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--color-text-secondary);
  border-radius: 4px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-primary);
}

/* 打字动画 */
.typing-indicator {
  display: inline-block;
  margin-left: 4px;
}

.typing-indicator::after {
  content: '...';
  animation: typing 1.5s infinite;
}

@keyframes typing {
  0% { content: '.'; }
  33% { content: '..'; }
  66% { content: '...'; }
}

/* 霓虹灯效果 */
.neon-border {
  border: 1px solid var(--color-neon-magenta);
  box-shadow: 0 0 5px var(--color-neon-magenta);
}

.neon-text {
  color: var(--color-neon-green);
  text-shadow: 0 0 5px var(--color-neon-green);
}

.chat-container.with-search-results {
  height: calc(100vh - 400px);
}
</style>

<style>
/* 暗色主题变量 - 移到全局样式中 */
:root {
  --color-bg-primary: #1a1a1a;
  --color-bg-secondary: #2d2d2d;
  --color-bg-tertiary: #3d3d3d;
  --color-bg-quaternary: #4d4d4d;
  --color-text-primary: #ffffff;
  --color-text-secondary: #a0a0a0;
  --color-neon-magenta: #ff00ff;
  --color-neon-green: #00ff9d;
}

/* 确保根元素有背景色 */
html, body {
  margin: 0;
  padding: 0;
  background-color: var(--color-bg-primary);
}
</style> 
<!-- SearchResults.vue -->
<template>
  <div class="search-results">
    <div v-if="results.length > 0" class="results-container">
      <div v-for="(result, index) in results" :key="index" class="result-item">
        <a :href="result.url" target="_blank" class="result-title">{{ result.title }}</a>
      </div>
    </div>
    <div v-else-if="isLoading" class="loading">
      <span>Searching...</span>
    </div>
    <div v-else class="no-results">
      <span>No results found</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  score?: number;
}

defineProps<{
  results: SearchResult[];
  isLoading: boolean;
}>();
</script>

<style scoped>
.search-results {
  padding: 0.5rem;
  max-width: 800px;
  margin: 0 auto;
  max-height: 200px;
  overflow-y: auto;
}

.result-item {
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--color-bg-secondary);
}

.result-title {
  color: #1a0dab;
  font-size: 1rem;
  text-decoration: none;
  display: block;
}

.result-title:hover {
  text-decoration: underline;
}

.loading, .no-results {
  text-align: center;
  padding: 1rem;
  color: var(--color-text-secondary);
}

/* 添加滚动条样式 */
.search-results::-webkit-scrollbar {
  width: 8px;
}

.search-results::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
  border-radius: 4px;
}

.search-results::-webkit-scrollbar-thumb {
  background: var(--color-text-secondary);
  border-radius: 4px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-primary);
}
</style> 
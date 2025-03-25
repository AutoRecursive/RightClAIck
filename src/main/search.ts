import axios from 'axios';

const SEARXNG_URL = 'http://localhost:8080';

interface SearchResult {
  title: string;
  url: string;
  content?: string;
  engine: string;
  score?: number;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  answers: string[];
  corrections: string[];
  suggestions: string[];
  infoboxes: any[];
}

interface APIResponse {
  error: boolean;
  data?: SearchResponse;
  message?: string;
}

interface SimplifiedSearchResult {
  title: string;
  url: string;
}

async function sendToLLM(query: string, results: SimplifiedSearchResult[]) {
  try {
    // 这里替换为实际的 LLM API 调用
    console.log('Sending to LLM:', {
      query,
      results: results.map(r => `${r.title}: ${r.url}`).join('\n')
    });
    // TODO: 实现实际的 LLM API 调用
  } catch (error) {
    console.error('Error sending to LLM:', error);
  }
}

export async function search(query: string, engines: string[] = ['google']): Promise<APIResponse> {
  try {
    console.log('Sending search request:', {
      query,
      engines,
      url: `${SEARXNG_URL}/search`
    });

    const response = await axios.get(`${SEARXNG_URL}/search`, {
      params: {
        q: query,
        format: 'json',
        engines: engines.join(',')
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000 // 10 seconds timeout
    });

    console.log('Search response:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    });

    // 简化搜索结果
    const simplifiedResults = response.data.results.map((result: SearchResult) => ({
      title: result.title,
      url: result.url
    }));

    console.log('Simplified results:', simplifiedResults);

    // 发送到 LLM
    await sendToLLM(query, simplifiedResults);

    return {
      error: false,
      data: {
        ...response.data,
        results: simplifiedResults
      }
    };
  } catch (error) {
    console.error('Search error:', error);
    let message = 'An unknown error occurred';
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        message = 'Could not connect to search service. Please make sure SearXNG is running.';
      } else if (error.response) {
        message = `Search service error: ${error.response.status} ${error.response.statusText}`;
        console.error('Error response data:', error.response.data);
      } else if (error.request) {
        message = 'No response received from search service';
      } else {
        message = error.message;
      }
    }

    return {
      error: true,
      message
    };
  }
}

export async function getEngines(): Promise<APIResponse> {
  try {
    const response = await axios.get(`${SEARXNG_URL}/config`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 5000 // 5 seconds timeout
    });
    
    return {
      error: false,
      data: {
        engines: Object.keys(response.data.engines)
      }
    };
  } catch (error) {
    console.error('Failed to get engines:', error);
    let message = 'An unknown error occurred';
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        message = 'Could not connect to search service. Please make sure SearXNG is running.';
      } else if (error.response) {
        message = `Search service error: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        message = 'No response received from search service';
      } else {
        message = error.message;
      }
    }

    return {
      error: true,
      message
    };
  }
} 
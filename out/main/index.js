"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const axios = require("axios");
const SEARXNG_URL = "http://localhost:8080";
async function sendToLLM(query, results) {
  try {
    console.log("Sending to LLM:", {
      query,
      results: results.map((r) => `${r.title}: ${r.url}`).join("\n")
    });
  } catch (error) {
    console.error("Error sending to LLM:", error);
  }
}
async function search(query, engines = ["google"]) {
  try {
    console.log("Sending search request:", {
      query,
      engines,
      url: `${SEARXNG_URL}/search`
    });
    const response = await axios.get(`${SEARXNG_URL}/search`, {
      params: {
        q: query,
        format: "json",
        engines: engines.join(",")
      },
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 1e4
      // 10 seconds timeout
    });
    console.log("Search response:", {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    });
    const simplifiedResults = response.data.results.map((result) => ({
      title: result.title,
      url: result.url
    }));
    console.log("Simplified results:", simplifiedResults);
    await sendToLLM(query, simplifiedResults);
    return {
      error: false,
      data: {
        ...response.data,
        results: simplifiedResults
      }
    };
  } catch (error) {
    console.error("Search error:", error);
    let message = "An unknown error occurred";
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        message = "Could not connect to search service. Please make sure SearXNG is running.";
      } else if (error.response) {
        message = `Search service error: ${error.response.status} ${error.response.statusText}`;
        console.error("Error response data:", error.response.data);
      } else if (error.request) {
        message = "No response received from search service";
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
async function getEngines() {
  try {
    const response = await axios.get(`${SEARXNG_URL}/config`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 5e3
      // 5 seconds timeout
    });
    return {
      error: false,
      data: {
        engines: Object.keys(response.data.engines)
      }
    };
  } catch (error) {
    console.error("Failed to get engines:", error);
    let message = "An unknown error occurred";
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        message = "Could not connect to search service. Please make sure SearXNG is running.";
      } else if (error.response) {
        message = `Search service error: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        message = "No response received from search service";
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
let mainWindow = null;
let ollama = null;
let currentModel = "llama2";
async function initOllama() {
  try {
    const { Ollama } = await import("ollama");
    ollama = new Ollama();
    return ollama;
  } catch (error) {
    console.error("Failed to initialize Ollama:", error);
    return null;
  }
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("blur", () => {
    mainWindow?.hide();
  });
}
electron.app.whenReady().then(async () => {
  await initOllama();
  createWindow();
  electron.globalShortcut.register("CommandOrControl+Shift+A", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      const mousePos = electron.screen.getCursorScreenPoint();
      const { width, height } = mainWindow.getBounds();
      mainWindow.setBounds({
        x: mousePos.x - width / 2,
        y: mousePos.y - 20,
        width,
        height
      });
      mainWindow.show();
      mainWindow.focus();
    }
  });
  electron.ipcMain.handle("get-ollama-models", async () => {
    if (!ollama) {
      return {
        error: true,
        message: "Ollama is not initialized"
      };
    }
    try {
      const models = await ollama.list();
      return {
        error: false,
        data: models
      };
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      return {
        error: true,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("set-current-model", async (_, modelName) => {
    currentModel = modelName;
    return { success: true, currentModel };
  });
  electron.ipcMain.handle("chat-with-ollama", async (_, messages) => {
    if (!ollama) {
      return {
        error: true,
        message: "Ollama is not initialized"
      };
    }
    try {
      const response = await ollama.chat({
        model: currentModel,
        // 使用选择的模型
        messages,
        stream: true
      });
      const initialResponse = {
        error: false,
        type: "stream-start",
        data: { id: Date.now().toString() }
      };
      const processStream = async () => {
        let accumulatedContent = "";
        for await (const chunk of response) {
          accumulatedContent += chunk.message.content;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("ollama-stream", {
              type: "chunk",
              content: chunk.message.content,
              accumulatedContent
            });
          }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("ollama-stream", {
            type: "end",
            content: accumulatedContent
          });
        }
      };
      processStream().catch((error) => {
        console.error("Streaming error:", error);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("ollama-stream", {
            type: "error",
            error: error instanceof Error ? error.message : "Unknown streaming error"
          });
        }
      });
      return initialResponse;
    } catch (error) {
      console.error("Ollama API error:", error);
      return {
        error: true,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("search", async (_, query, engines) => {
    try {
      const results = await search(query, engines);
      return results;
    } catch (error) {
      console.error("Search error in IPC handler:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("get-engines", async () => {
    try {
      const engines = await getEngines();
      return engines;
    } catch (error) {
      console.error("Get engines error in IPC handler:", error);
      throw error;
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluL3NlYXJjaC50cyIsIi4uLy4uL3NyYy9tYWluL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBheGlvcyBmcm9tICdheGlvcyc7XG5cbmNvbnN0IFNFQVJYTkdfVVJMID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MCc7XG5cbmludGVyZmFjZSBTZWFyY2hSZXN1bHQge1xuICB0aXRsZTogc3RyaW5nO1xuICB1cmw6IHN0cmluZztcbiAgY29udGVudD86IHN0cmluZztcbiAgZW5naW5lOiBzdHJpbmc7XG4gIHNjb3JlPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VhcmNoUmVzcG9uc2Uge1xuICBxdWVyeTogc3RyaW5nO1xuICByZXN1bHRzOiBTZWFyY2hSZXN1bHRbXTtcbiAgYW5zd2Vyczogc3RyaW5nW107XG4gIGNvcnJlY3Rpb25zOiBzdHJpbmdbXTtcbiAgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdO1xuICBpbmZvYm94ZXM6IGFueVtdO1xufVxuXG5pbnRlcmZhY2UgQVBJUmVzcG9uc2Uge1xuICBlcnJvcjogYm9vbGVhbjtcbiAgZGF0YT86IFNlYXJjaFJlc3BvbnNlO1xuICBtZXNzYWdlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2ltcGxpZmllZFNlYXJjaFJlc3VsdCB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHVybDogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZW5kVG9MTE0ocXVlcnk6IHN0cmluZywgcmVzdWx0czogU2ltcGxpZmllZFNlYXJjaFJlc3VsdFtdKSB7XG4gIHRyeSB7XG4gICAgLy8g6L+Z6YeM5pu/5o2i5Li65a6e6ZmF55qEIExMTSBBUEkg6LCD55SoXG4gICAgY29uc29sZS5sb2coJ1NlbmRpbmcgdG8gTExNOicsIHtcbiAgICAgIHF1ZXJ5LFxuICAgICAgcmVzdWx0czogcmVzdWx0cy5tYXAociA9PiBgJHtyLnRpdGxlfTogJHtyLnVybH1gKS5qb2luKCdcXG4nKVxuICAgIH0pO1xuICAgIC8vIFRPRE86IOWunueOsOWunumZheeahCBMTE0gQVBJIOiwg+eUqFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNlbmRpbmcgdG8gTExNOicsIGVycm9yKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIGVuZ2luZXM6IHN0cmluZ1tdID0gWydnb29nbGUnXSk6IFByb21pc2U8QVBJUmVzcG9uc2U+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygnU2VuZGluZyBzZWFyY2ggcmVxdWVzdDonLCB7XG4gICAgICBxdWVyeSxcbiAgICAgIGVuZ2luZXMsXG4gICAgICB1cmw6IGAke1NFQVJYTkdfVVJMfS9zZWFyY2hgXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChgJHtTRUFSWE5HX1VSTH0vc2VhcmNoYCwge1xuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHE6IHF1ZXJ5LFxuICAgICAgICBmb3JtYXQ6ICdqc29uJyxcbiAgICAgICAgZW5naW5lczogZW5naW5lcy5qb2luKCcsJylcbiAgICAgIH0sXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdVc2VyLUFnZW50JzogJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNiBFZGcvMTIyLjAuMC4wJyxcbiAgICAgICAgJ1gtUmVxdWVzdGVkLVdpdGgnOiAnWE1MSHR0cFJlcXVlc3QnLFxuICAgICAgICAnQWNjZXB0LUxhbmd1YWdlJzogJ2VuLVVTLGVuO3E9MC45J1xuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IDEwMDAwIC8vIDEwIHNlY29uZHMgdGltZW91dFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ1NlYXJjaCByZXNwb25zZTonLCB7XG4gICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIHN0YXR1c1RleHQ6IHJlc3BvbnNlLnN0YXR1c1RleHQsXG4gICAgICBkYXRhOiByZXNwb25zZS5kYXRhXG4gICAgfSk7XG5cbiAgICAvLyDnroDljJbmkJzntKLnu5PmnpxcbiAgICBjb25zdCBzaW1wbGlmaWVkUmVzdWx0cyA9IHJlc3BvbnNlLmRhdGEucmVzdWx0cy5tYXAoKHJlc3VsdDogU2VhcmNoUmVzdWx0KSA9PiAoe1xuICAgICAgdGl0bGU6IHJlc3VsdC50aXRsZSxcbiAgICAgIHVybDogcmVzdWx0LnVybFxuICAgIH0pKTtcblxuICAgIGNvbnNvbGUubG9nKCdTaW1wbGlmaWVkIHJlc3VsdHM6Jywgc2ltcGxpZmllZFJlc3VsdHMpO1xuXG4gICAgLy8g5Y+R6YCB5YiwIExMTVxuICAgIGF3YWl0IHNlbmRUb0xMTShxdWVyeSwgc2ltcGxpZmllZFJlc3VsdHMpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVycm9yOiBmYWxzZSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgLi4ucmVzcG9uc2UuZGF0YSxcbiAgICAgICAgcmVzdWx0czogc2ltcGxpZmllZFJlc3VsdHNcbiAgICAgIH1cbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1NlYXJjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgbGV0IG1lc3NhZ2UgPSAnQW4gdW5rbm93biBlcnJvciBvY2N1cnJlZCc7XG4gICAgXG4gICAgaWYgKGF4aW9zLmlzQXhpb3NFcnJvcihlcnJvcikpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSAnRUNPTk5SRUZVU0VEJykge1xuICAgICAgICBtZXNzYWdlID0gJ0NvdWxkIG5vdCBjb25uZWN0IHRvIHNlYXJjaCBzZXJ2aWNlLiBQbGVhc2UgbWFrZSBzdXJlIFNlYXJYTkcgaXMgcnVubmluZy4nO1xuICAgICAgfSBlbHNlIGlmIChlcnJvci5yZXNwb25zZSkge1xuICAgICAgICBtZXNzYWdlID0gYFNlYXJjaCBzZXJ2aWNlIGVycm9yOiAke2Vycm9yLnJlc3BvbnNlLnN0YXR1c30gJHtlcnJvci5yZXNwb25zZS5zdGF0dXNUZXh0fWA7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlc3BvbnNlIGRhdGE6JywgZXJyb3IucmVzcG9uc2UuZGF0YSk7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yLnJlcXVlc3QpIHtcbiAgICAgICAgbWVzc2FnZSA9ICdObyByZXNwb25zZSByZWNlaXZlZCBmcm9tIHNlYXJjaCBzZXJ2aWNlJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlcnJvcjogdHJ1ZSxcbiAgICAgIG1lc3NhZ2VcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRFbmdpbmVzKCk6IFByb21pc2U8QVBJUmVzcG9uc2U+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChgJHtTRUFSWE5HX1VSTH0vY29uZmlnYCwge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnVXNlci1BZ2VudCc6ICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIFNhZmFyaS81MzcuMzYgRWRnLzEyMi4wLjAuMCcsXG4gICAgICAgICdYLVJlcXVlc3RlZC1XaXRoJzogJ1hNTEh0dHBSZXF1ZXN0JyxcbiAgICAgICAgJ0FjY2VwdC1MYW5ndWFnZSc6ICdlbi1VUyxlbjtxPTAuOSdcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiA1MDAwIC8vIDUgc2Vjb25kcyB0aW1lb3V0XG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIGVycm9yOiBmYWxzZSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgZW5naW5lczogT2JqZWN0LmtleXMocmVzcG9uc2UuZGF0YS5lbmdpbmVzKVxuICAgICAgfVxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBlbmdpbmVzOicsIGVycm9yKTtcbiAgICBsZXQgbWVzc2FnZSA9ICdBbiB1bmtub3duIGVycm9yIG9jY3VycmVkJztcbiAgICBcbiAgICBpZiAoYXhpb3MuaXNBeGlvc0Vycm9yKGVycm9yKSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09ICdFQ09OTlJFRlVTRUQnKSB7XG4gICAgICAgIG1lc3NhZ2UgPSAnQ291bGQgbm90IGNvbm5lY3QgdG8gc2VhcmNoIHNlcnZpY2UuIFBsZWFzZSBtYWtlIHN1cmUgU2VhclhORyBpcyBydW5uaW5nLic7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yLnJlc3BvbnNlKSB7XG4gICAgICAgIG1lc3NhZ2UgPSBgU2VhcmNoIHNlcnZpY2UgZXJyb3I6ICR7ZXJyb3IucmVzcG9uc2Uuc3RhdHVzfSAke2Vycm9yLnJlc3BvbnNlLnN0YXR1c1RleHR9YDtcbiAgICAgIH0gZWxzZSBpZiAoZXJyb3IucmVxdWVzdCkge1xuICAgICAgICBtZXNzYWdlID0gJ05vIHJlc3BvbnNlIHJlY2VpdmVkIGZyb20gc2VhcmNoIHNlcnZpY2UnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVycm9yOiB0cnVlLFxuICAgICAgbWVzc2FnZVxuICAgIH07XG4gIH1cbn0gIiwiaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93LCBnbG9iYWxTaG9ydGN1dCwgc2NyZWVuLCBpcGNNYWluLCBzaGVsbCB9IGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBlbGVjdHJvbkFwcCwgb3B0aW1pemVyLCBpcyB9IGZyb20gJ0BlbGVjdHJvbi10b29sa2l0L3V0aWxzJ1xuaW1wb3J0IGljb24gZnJvbSAnLi4vLi4vcmVzb3VyY2VzL2ljb24ucG5nP2Fzc2V0J1xuaW1wb3J0IHsgc2VhcmNoLCBnZXRFbmdpbmVzIH0gZnJvbSAnLi9zZWFyY2gnXG5cbmxldCBtYWluV2luZG93OiBCcm93c2VyV2luZG93IHwgbnVsbCA9IG51bGxcbmxldCBvbGxhbWE6IGFueSA9IG51bGxcbi8vIOm7mOiupOaooeWei1xubGV0IGN1cnJlbnRNb2RlbCA9ICdsbGFtYTInXG5cbmFzeW5jIGZ1bmN0aW9uIGluaXRPbGxhbWEoKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBPbGxhbWEgfSA9IGF3YWl0IGltcG9ydCgnb2xsYW1hJylcbiAgICBvbGxhbWEgPSBuZXcgT2xsYW1hKClcbiAgICByZXR1cm4gb2xsYW1hXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgT2xsYW1hOicsIGVycm9yKVxuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlV2luZG93KCkge1xuICBtYWluV2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coe1xuICAgIHdpZHRoOiA0MDAsXG4gICAgaGVpZ2h0OiA2MDAsXG4gICAgZnJhbWU6IGZhbHNlLFxuICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgIHJlc2l6YWJsZTogZmFsc2UsXG4gICAgc2hvdzogZmFsc2UsXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIHByZWxvYWQ6IGpvaW4oX19kaXJuYW1lLCAnLi4vcHJlbG9hZC9pbmRleC5qcycpLFxuICAgICAgY29udGV4dElzb2xhdGlvbjogdHJ1ZSxcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogZmFsc2VcbiAgICB9XG4gIH0pXG5cbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnKSB7XG4gICAgbWFpbldpbmRvdy5sb2FkVVJMKCdodHRwOi8vbG9jYWxob3N0OjUxNzMnKVxuICB9IGVsc2Uge1xuICAgIG1haW5XaW5kb3cubG9hZEZpbGUoam9pbihfX2Rpcm5hbWUsICcuLi9yZW5kZXJlci9pbmRleC5odG1sJykpXG4gIH1cblxuICAvLyBIaWRlIHdpbmRvdyB3aGVuIGl0IGxvc2VzIGZvY3VzXG4gIG1haW5XaW5kb3cub24oJ2JsdXInLCAoKSA9PiB7XG4gICAgbWFpbldpbmRvdz8uaGlkZSgpXG4gIH0pXG59XG5cbmFwcC53aGVuUmVhZHkoKS50aGVuKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgaW5pdE9sbGFtYSgpXG4gIFxuICBjcmVhdGVXaW5kb3coKVxuXG4gIC8vIFJlZ2lzdGVyIGdsb2JhbCBzaG9ydGN1dFxuICBnbG9iYWxTaG9ydGN1dC5yZWdpc3RlcignQ29tbWFuZE9yQ29udHJvbCtTaGlmdCtBJywgKCkgPT4ge1xuICAgIGlmICghbWFpbldpbmRvdykgcmV0dXJuXG5cbiAgICAvLyBUb2dnbGUgd2luZG93IHZpc2liaWxpdHk6IGhpZGUgaWYgdmlzaWJsZSwgc2hvdyBpZiBoaWRkZW5cbiAgICBpZiAobWFpbldpbmRvdy5pc1Zpc2libGUoKSkge1xuICAgICAgbWFpbldpbmRvdy5oaWRlKClcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gR2V0IGN1cnJlbnQgbW91c2UgcG9zaXRpb25cbiAgICAgIGNvbnN0IG1vdXNlUG9zID0gc2NyZWVuLmdldEN1cnNvclNjcmVlblBvaW50KClcbiAgICAgIGNvbnN0IHsgd2lkdGgsIGhlaWdodCB9ID0gbWFpbldpbmRvdy5nZXRCb3VuZHMoKVxuXG4gICAgICAvLyBQb3NpdGlvbiB3aW5kb3cgbmVhciBtb3VzZSBjdXJzb3JcbiAgICAgIG1haW5XaW5kb3cuc2V0Qm91bmRzKHtcbiAgICAgICAgeDogbW91c2VQb3MueCAtIHdpZHRoIC8gMixcbiAgICAgICAgeTogbW91c2VQb3MueSAtIDIwLFxuICAgICAgICB3aWR0aCxcbiAgICAgICAgaGVpZ2h0XG4gICAgICB9KVxuXG4gICAgICBtYWluV2luZG93LnNob3coKVxuICAgICAgbWFpbldpbmRvdy5mb2N1cygpXG4gICAgfVxuICB9KVxuXG4gIC8vIOiOt+WPluWPr+eUqOaooeWei+WIl+ihqFxuICBpcGNNYWluLmhhbmRsZSgnZ2V0LW9sbGFtYS1tb2RlbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgaWYgKCFvbGxhbWEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGVycm9yOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnT2xsYW1hIGlzIG5vdCBpbml0aWFsaXplZCdcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgb2xsYW1hLmxpc3QoKVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZXJyb3I6IGZhbHNlLFxuICAgICAgICBkYXRhOiBtb2RlbHNcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgT2xsYW1hIG1vZGVsczonLCBlcnJvcilcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGVycm9yOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ1xuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICAvLyDorr7nva7lvZPliY3kvb/nlKjnmoTmqKHlnotcbiAgaXBjTWFpbi5oYW5kbGUoJ3NldC1jdXJyZW50LW1vZGVsJywgYXN5bmMgKF8sIG1vZGVsTmFtZSkgPT4ge1xuICAgIGN1cnJlbnRNb2RlbCA9IG1vZGVsTmFtZVxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGN1cnJlbnRNb2RlbCB9XG4gIH0pXG5cbiAgLy8g5L2/55So5b2T5YmN6YCJ5oup55qE5qih5Z6L6L+b6KGM6IGK5aSpXG4gIGlwY01haW4uaGFuZGxlKCdjaGF0LXdpdGgtb2xsYW1hJywgYXN5bmMgKF8sIG1lc3NhZ2VzKSA9PiB7XG4gICAgaWYgKCFvbGxhbWEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGVycm9yOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnT2xsYW1hIGlzIG5vdCBpbml0aWFsaXplZCdcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvbGxhbWEuY2hhdCh7XG4gICAgICAgIG1vZGVsOiBjdXJyZW50TW9kZWwsIC8vIOS9v+eUqOmAieaLqeeahOaooeWei1xuICAgICAgICBtZXNzYWdlcyxcbiAgICAgICAgc3RyZWFtOiB0cnVlXG4gICAgICB9KVxuXG4gICAgICAvLyDov5Tlm57kuIDkuKrliJ3lp4vlk43lupTku6XlkK/liqjmtYFcbiAgICAgIGNvbnN0IGluaXRpYWxSZXNwb25zZSA9IHtcbiAgICAgICAgZXJyb3I6IGZhbHNlLFxuICAgICAgICB0eXBlOiAnc3RyZWFtLXN0YXJ0JyxcbiAgICAgICAgZGF0YTogeyBpZDogRGF0ZS5ub3coKS50b1N0cmluZygpIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8g5Yib5bu65LiA5Liq5aSE55CG5rWB55qE5byC5q2l5Ye95pWwXG4gICAgICBjb25zdCBwcm9jZXNzU3RyZWFtID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBsZXQgYWNjdW11bGF0ZWRDb250ZW50ID0gJydcbiAgICAgICAgXG4gICAgICAgIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgcmVzcG9uc2UpIHtcbiAgICAgICAgICBhY2N1bXVsYXRlZENvbnRlbnQgKz0gY2h1bmsubWVzc2FnZS5jb250ZW50XG4gICAgICAgICAgXG4gICAgICAgICAgLy8g5Y+R6YCB5q+P5Liq5rWB5Z2X5Yiw5riy5p+T6L+b56iLXG4gICAgICAgICAgaWYgKG1haW5XaW5kb3cgJiYgIW1haW5XaW5kb3cuaXNEZXN0cm95ZWQoKSkge1xuICAgICAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdvbGxhbWEtc3RyZWFtJywge1xuICAgICAgICAgICAgICB0eXBlOiAnY2h1bmsnLFxuICAgICAgICAgICAgICBjb250ZW50OiBjaHVuay5tZXNzYWdlLmNvbnRlbnQsXG4gICAgICAgICAgICAgIGFjY3VtdWxhdGVkQ29udGVudDogYWNjdW11bGF0ZWRDb250ZW50XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5rWB5a6M5oiQ5pe25Y+R6YCB5a6M5oiQ5L+h5Y+3XG4gICAgICAgIGlmIChtYWluV2luZG93ICYmICFtYWluV2luZG93LmlzRGVzdHJveWVkKCkpIHtcbiAgICAgICAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ29sbGFtYS1zdHJlYW0nLCB7XG4gICAgICAgICAgICB0eXBlOiAnZW5kJyxcbiAgICAgICAgICAgIGNvbnRlbnQ6IGFjY3VtdWxhdGVkQ29udGVudFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8g5byA5aeL5aSE55CG5rWB5L2G5LiN562J5b6F5a6D5a6M5oiQXG4gICAgICBwcm9jZXNzU3RyZWFtKCkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdTdHJlYW1pbmcgZXJyb3I6JywgZXJyb3IpXG4gICAgICAgIGlmIChtYWluV2luZG93ICYmICFtYWluV2luZG93LmlzRGVzdHJveWVkKCkpIHtcbiAgICAgICAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ29sbGFtYS1zdHJlYW0nLCB7XG4gICAgICAgICAgICB0eXBlOiAnZXJyb3InLFxuICAgICAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gc3RyZWFtaW5nIGVycm9yJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBcbiAgICAgIC8vIOi/lOWbnuWIneWni+WTjeW6lO+8jOa1geWwhumAmui/h+S6i+S7tue7p+e7rVxuICAgICAgcmV0dXJuIGluaXRpYWxSZXNwb25zZVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdPbGxhbWEgQVBJIGVycm9yOicsIGVycm9yKVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZXJyb3I6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIC8vIEFkZCB0aGVzZSBJUEMgaGFuZGxlcnMgYmVmb3JlIGFwcC53aGVuUmVhZHkoKVxuICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoJywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcsIGVuZ2luZXM/OiBzdHJpbmdbXSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgc2VhcmNoKHF1ZXJ5LCBlbmdpbmVzKTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdTZWFyY2ggZXJyb3IgaW4gSVBDIGhhbmRsZXI6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9KTtcblxuICBpcGNNYWluLmhhbmRsZSgnZ2V0LWVuZ2luZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGVuZ2luZXMgPSBhd2FpdCBnZXRFbmdpbmVzKCk7XG4gICAgICByZXR1cm4gZW5naW5lcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignR2V0IGVuZ2luZXMgZXJyb3IgaW4gSVBDIGhhbmRsZXI6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9KTtcbn0pXG5cbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJykge1xuICAgIGFwcC5xdWl0KClcbiAgfVxufSlcblxuYXBwLm9uKCdhY3RpdmF0ZScsICgpID0+IHtcbiAgaWYgKEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmxlbmd0aCA9PT0gMCkge1xuICAgIGNyZWF0ZVdpbmRvdygpXG4gIH1cbn0pICJdLCJuYW1lcyI6WyJCcm93c2VyV2luZG93Iiwiam9pbiIsImFwcCIsImdsb2JhbFNob3J0Y3V0Iiwic2NyZWVuIiwiaXBjTWFpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLGNBQWM7QUE4QnBCLGVBQWUsVUFBVSxPQUFlLFNBQW1DO0FBQ3JFLE1BQUE7QUFFRixZQUFRLElBQUksbUJBQW1CO0FBQUEsTUFDN0I7QUFBQSxNQUNBLFNBQVMsUUFBUSxJQUFJLENBQUEsTUFBSyxHQUFHLEVBQUUsS0FBSyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFBQSxDQUM1RDtBQUFBLFdBRU0sT0FBTztBQUNOLFlBQUEsTUFBTSx5QkFBeUIsS0FBSztBQUFBLEVBQUE7QUFFaEQ7QUFFQSxlQUFzQixPQUFPLE9BQWUsVUFBb0IsQ0FBQyxRQUFRLEdBQXlCO0FBQzVGLE1BQUE7QUFDRixZQUFRLElBQUksMkJBQTJCO0FBQUEsTUFDckM7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLLEdBQUcsV0FBVztBQUFBLElBQUEsQ0FDcEI7QUFFRCxVQUFNLFdBQVcsTUFBTSxNQUFNLElBQUksR0FBRyxXQUFXLFdBQVc7QUFBQSxNQUN4RCxRQUFRO0FBQUEsUUFDTixHQUFHO0FBQUEsUUFDSCxRQUFRO0FBQUEsUUFDUixTQUFTLFFBQVEsS0FBSyxHQUFHO0FBQUEsTUFDM0I7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLFVBQVU7QUFBQSxRQUNWLGNBQWM7QUFBQSxRQUNkLG9CQUFvQjtBQUFBLFFBQ3BCLG1CQUFtQjtBQUFBLE1BQ3JCO0FBQUEsTUFDQSxTQUFTO0FBQUE7QUFBQSxJQUFBLENBQ1Y7QUFFRCxZQUFRLElBQUksb0JBQW9CO0FBQUEsTUFDOUIsUUFBUSxTQUFTO0FBQUEsTUFDakIsWUFBWSxTQUFTO0FBQUEsTUFDckIsTUFBTSxTQUFTO0FBQUEsSUFBQSxDQUNoQjtBQUdELFVBQU0sb0JBQW9CLFNBQVMsS0FBSyxRQUFRLElBQUksQ0FBQyxZQUEwQjtBQUFBLE1BQzdFLE9BQU8sT0FBTztBQUFBLE1BQ2QsS0FBSyxPQUFPO0FBQUEsSUFBQSxFQUNaO0FBRU0sWUFBQSxJQUFJLHVCQUF1QixpQkFBaUI7QUFHOUMsVUFBQSxVQUFVLE9BQU8saUJBQWlCO0FBRWpDLFdBQUE7QUFBQSxNQUNMLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxRQUNKLEdBQUcsU0FBUztBQUFBLFFBQ1osU0FBUztBQUFBLE1BQUE7QUFBQSxJQUViO0FBQUEsV0FDTyxPQUFPO0FBQ04sWUFBQSxNQUFNLGlCQUFpQixLQUFLO0FBQ3BDLFFBQUksVUFBVTtBQUVWLFFBQUEsTUFBTSxhQUFhLEtBQUssR0FBRztBQUN6QixVQUFBLE1BQU0sU0FBUyxnQkFBZ0I7QUFDdkIsa0JBQUE7QUFBQSxNQUFBLFdBQ0QsTUFBTSxVQUFVO0FBQ3pCLGtCQUFVLHlCQUF5QixNQUFNLFNBQVMsTUFBTSxJQUFJLE1BQU0sU0FBUyxVQUFVO0FBQ3JGLGdCQUFRLE1BQU0sd0JBQXdCLE1BQU0sU0FBUyxJQUFJO0FBQUEsTUFBQSxXQUNoRCxNQUFNLFNBQVM7QUFDZCxrQkFBQTtBQUFBLE1BQUEsT0FDTDtBQUNMLGtCQUFVLE1BQU07QUFBQSxNQUFBO0FBQUEsSUFDbEI7QUFHSyxXQUFBO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUFBO0FBRUo7QUFFQSxlQUFzQixhQUFtQztBQUNuRCxNQUFBO0FBQ0YsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJLEdBQUcsV0FBVyxXQUFXO0FBQUEsTUFDeEQsU0FBUztBQUFBLFFBQ1AsVUFBVTtBQUFBLFFBQ1YsY0FBYztBQUFBLFFBQ2Qsb0JBQW9CO0FBQUEsUUFDcEIsbUJBQW1CO0FBQUEsTUFDckI7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBLElBQUEsQ0FDVjtBQUVNLFdBQUE7QUFBQSxNQUNMLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxRQUNKLFNBQVMsT0FBTyxLQUFLLFNBQVMsS0FBSyxPQUFPO0FBQUEsTUFBQTtBQUFBLElBRTlDO0FBQUEsV0FDTyxPQUFPO0FBQ04sWUFBQSxNQUFNLDBCQUEwQixLQUFLO0FBQzdDLFFBQUksVUFBVTtBQUVWLFFBQUEsTUFBTSxhQUFhLEtBQUssR0FBRztBQUN6QixVQUFBLE1BQU0sU0FBUyxnQkFBZ0I7QUFDdkIsa0JBQUE7QUFBQSxNQUFBLFdBQ0QsTUFBTSxVQUFVO0FBQ3pCLGtCQUFVLHlCQUF5QixNQUFNLFNBQVMsTUFBTSxJQUFJLE1BQU0sU0FBUyxVQUFVO0FBQUEsTUFBQSxXQUM1RSxNQUFNLFNBQVM7QUFDZCxrQkFBQTtBQUFBLE1BQUEsT0FDTDtBQUNMLGtCQUFVLE1BQU07QUFBQSxNQUFBO0FBQUEsSUFDbEI7QUFHSyxXQUFBO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUFBO0FBRUo7QUNySkEsSUFBSSxhQUFtQztBQUN2QyxJQUFJLFNBQWM7QUFFbEIsSUFBSSxlQUFlO0FBRW5CLGVBQWUsYUFBYTtBQUN0QixNQUFBO0FBQ0YsVUFBTSxFQUFFLE9BQUEsSUFBVyxNQUFNLE9BQU8sUUFBUTtBQUN4QyxhQUFTLElBQUksT0FBTztBQUNiLFdBQUE7QUFBQSxXQUNBLE9BQU87QUFDTixZQUFBLE1BQU0sZ0NBQWdDLEtBQUs7QUFDNUMsV0FBQTtBQUFBLEVBQUE7QUFFWDtBQUVBLFNBQVMsZUFBZTtBQUN0QixlQUFhLElBQUlBLFNBQUFBLGNBQWM7QUFBQSxJQUM3QixPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxNQUFNO0FBQUEsSUFDTixnQkFBZ0I7QUFBQSxNQUNkLFNBQVNDLEtBQUFBLEtBQUssV0FBVyxxQkFBcUI7QUFBQSxNQUM5QyxrQkFBa0I7QUFBQSxNQUNsQixpQkFBaUI7QUFBQSxJQUFBO0FBQUEsRUFDbkIsQ0FDRDtBQUVHLE1BQUEsUUFBQSxJQUFZLGFBQWEsZUFBZTtBQUMxQyxlQUFXLFFBQVEsdUJBQXVCO0FBQUEsRUFBQSxPQUNyQztBQUNMLGVBQVcsU0FBU0EsS0FBQUEsS0FBSyxXQUFXLHdCQUF3QixDQUFDO0FBQUEsRUFBQTtBQUlwRCxhQUFBLEdBQUcsUUFBUSxNQUFNO0FBQzFCLGdCQUFZLEtBQUs7QUFBQSxFQUFBLENBQ2xCO0FBQ0g7QUFFQUMsU0FBQUEsSUFBSSxVQUFBLEVBQVksS0FBSyxZQUFZO0FBQy9CLFFBQU0sV0FBVztBQUVKLGVBQUE7QUFHRUMsMEJBQUEsU0FBUyw0QkFBNEIsTUFBTTtBQUN4RCxRQUFJLENBQUMsV0FBWTtBQUdiLFFBQUEsV0FBVyxhQUFhO0FBQzFCLGlCQUFXLEtBQUs7QUFBQSxJQUFBLE9BQ1g7QUFFQyxZQUFBLFdBQVdDLGdCQUFPLHFCQUFxQjtBQUM3QyxZQUFNLEVBQUUsT0FBTyxXQUFXLFdBQVcsVUFBVTtBQUcvQyxpQkFBVyxVQUFVO0FBQUEsUUFDbkIsR0FBRyxTQUFTLElBQUksUUFBUTtBQUFBLFFBQ3hCLEdBQUcsU0FBUyxJQUFJO0FBQUEsUUFDaEI7QUFBQSxRQUNBO0FBQUEsTUFBQSxDQUNEO0FBRUQsaUJBQVcsS0FBSztBQUNoQixpQkFBVyxNQUFNO0FBQUEsSUFBQTtBQUFBLEVBQ25CLENBQ0Q7QUFHT0MsbUJBQUEsT0FBTyxxQkFBcUIsWUFBWTtBQUM5QyxRQUFJLENBQUMsUUFBUTtBQUNKLGFBQUE7QUFBQSxRQUNMLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxNQUNYO0FBQUEsSUFBQTtBQUdFLFFBQUE7QUFDSSxZQUFBLFNBQVMsTUFBTSxPQUFPLEtBQUs7QUFDMUIsYUFBQTtBQUFBLFFBQ0wsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLE1BQ1I7QUFBQSxhQUNPLE9BQU87QUFDTixjQUFBLE1BQU0saUNBQWlDLEtBQUs7QUFDN0MsYUFBQTtBQUFBLFFBQ0wsT0FBTztBQUFBLFFBQ1AsU0FBUyxpQkFBaUIsUUFBUSxNQUFNLFVBQVU7QUFBQSxNQUNwRDtBQUFBLElBQUE7QUFBQSxFQUNGLENBQ0Q7QUFHREEsV0FBQUEsUUFBUSxPQUFPLHFCQUFxQixPQUFPLEdBQUcsY0FBYztBQUMzQyxtQkFBQTtBQUNSLFdBQUEsRUFBRSxTQUFTLE1BQU0sYUFBYTtBQUFBLEVBQUEsQ0FDdEM7QUFHREEsV0FBQUEsUUFBUSxPQUFPLG9CQUFvQixPQUFPLEdBQUcsYUFBYTtBQUN4RCxRQUFJLENBQUMsUUFBUTtBQUNKLGFBQUE7QUFBQSxRQUNMLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxNQUNYO0FBQUEsSUFBQTtBQUdFLFFBQUE7QUFDSSxZQUFBLFdBQVcsTUFBTSxPQUFPLEtBQUs7QUFBQSxRQUNqQyxPQUFPO0FBQUE7QUFBQSxRQUNQO0FBQUEsUUFDQSxRQUFRO0FBQUEsTUFBQSxDQUNUO0FBR0QsWUFBTSxrQkFBa0I7QUFBQSxRQUN0QixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixNQUFNLEVBQUUsSUFBSSxLQUFLLElBQUksRUFBRSxTQUFXLEVBQUE7QUFBQSxNQUNwQztBQUdBLFlBQU0sZ0JBQWdCLFlBQVk7QUFDaEMsWUFBSSxxQkFBcUI7QUFFekIseUJBQWlCLFNBQVMsVUFBVTtBQUNsQyxnQ0FBc0IsTUFBTSxRQUFRO0FBR3BDLGNBQUksY0FBYyxDQUFDLFdBQVcsZUFBZTtBQUNoQyx1QkFBQSxZQUFZLEtBQUssaUJBQWlCO0FBQUEsY0FDM0MsTUFBTTtBQUFBLGNBQ04sU0FBUyxNQUFNLFFBQVE7QUFBQSxjQUN2QjtBQUFBLFlBQUEsQ0FDRDtBQUFBLFVBQUE7QUFBQSxRQUNIO0FBSUYsWUFBSSxjQUFjLENBQUMsV0FBVyxlQUFlO0FBQ2hDLHFCQUFBLFlBQVksS0FBSyxpQkFBaUI7QUFBQSxZQUMzQyxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFBQSxDQUNWO0FBQUEsUUFBQTtBQUFBLE1BRUw7QUFHYyxvQkFBQSxFQUFFLE1BQU0sQ0FBUyxVQUFBO0FBQ3JCLGdCQUFBLE1BQU0sb0JBQW9CLEtBQUs7QUFDdkMsWUFBSSxjQUFjLENBQUMsV0FBVyxlQUFlO0FBQ2hDLHFCQUFBLFlBQVksS0FBSyxpQkFBaUI7QUFBQSxZQUMzQyxNQUFNO0FBQUEsWUFDTixPQUFPLGlCQUFpQixRQUFRLE1BQU0sVUFBVTtBQUFBLFVBQUEsQ0FDakQ7QUFBQSxRQUFBO0FBQUEsTUFDSCxDQUNEO0FBR00sYUFBQTtBQUFBLGFBQ0EsT0FBTztBQUNOLGNBQUEsTUFBTSxxQkFBcUIsS0FBSztBQUNqQyxhQUFBO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxTQUFTLGlCQUFpQixRQUFRLE1BQU0sVUFBVTtBQUFBLE1BQ3BEO0FBQUEsSUFBQTtBQUFBLEVBQ0YsQ0FDRDtBQUdEQSxXQUFBLFFBQVEsT0FBTyxVQUFVLE9BQU8sR0FBRyxPQUFlLFlBQXVCO0FBQ25FLFFBQUE7QUFDRixZQUFNLFVBQVUsTUFBTSxPQUFPLE9BQU8sT0FBTztBQUNwQyxhQUFBO0FBQUEsYUFDQSxPQUFPO0FBQ04sY0FBQSxNQUFNLGdDQUFnQyxLQUFLO0FBQzdDLFlBQUE7QUFBQSxJQUFBO0FBQUEsRUFDUixDQUNEO0FBRU9BLG1CQUFBLE9BQU8sZUFBZSxZQUFZO0FBQ3BDLFFBQUE7QUFDSSxZQUFBLFVBQVUsTUFBTSxXQUFXO0FBQzFCLGFBQUE7QUFBQSxhQUNBLE9BQU87QUFDTixjQUFBLE1BQU0scUNBQXFDLEtBQUs7QUFDbEQsWUFBQTtBQUFBLElBQUE7QUFBQSxFQUNSLENBQ0Q7QUFDSCxDQUFDO0FBRURILFNBQUFBLElBQUksR0FBRyxxQkFBcUIsTUFBTTtBQUM1QixNQUFBLFFBQVEsYUFBYSxVQUFVO0FBQ2pDQSxhQUFBQSxJQUFJLEtBQUs7QUFBQSxFQUFBO0FBRWIsQ0FBQztBQUVEQSxTQUFBQSxJQUFJLEdBQUcsWUFBWSxNQUFNO0FBQ3ZCLE1BQUlGLHVCQUFjLGdCQUFnQixXQUFXLEdBQUc7QUFDakMsaUJBQUE7QUFBQSxFQUFBO0FBRWpCLENBQUM7In0=

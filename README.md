# RightClAIck

A cyberpunk-styled AI chat application that appears at your cursor position with Ctrl+Shift+A.

## Prerequisites

- Node.js (v16 or later)
- Ollama installed and running locally
- A running Llama2 model in Ollama

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure Ollama is running and the Llama2 model is installed:
```bash
ollama pull llama2
```

## Development

Start the development server:
```bash
npm run dev
```

## Build

Build the application:
```bash
npm run build
```

## Usage

1. Start the application
2. Press Ctrl+Shift+A (Cmd+Shift+A on macOS) to open the chat window at your cursor position
3. Type your message and press Enter or click Send
4. Click outside the window or press Escape to close it

## Features

- Global shortcut (Ctrl/Cmd+Shift+A) to open chat window
- Cyberpunk-styled UI with neon effects
- Seamless integration with Ollama's Llama2 model
- Transparent window that follows cursor position
- Auto-hiding when losing focus

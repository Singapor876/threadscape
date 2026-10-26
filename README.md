# Threadscape

一个使用 JavaScript 前端与 Python、FastAPI、LangGraph 后端构建的 AI 知识探索工具，支持流式对话、工具调用、条件循环、术语分支、无限层级知识树、队列和知识图谱。

## 运行要求

- Node.js 24 LTS 或更高版本
- npm
- Python 3.12 或更高版本
- 一个 OpenAI 或 OpenAI 兼容接口的 API Key

## 安装与启动

1. 解压项目并进入目录。
2. 安装前端依赖：

   ```bash
   npm install
   ```

3. 将 `.env.example` 复制为 `.env.local`，填写自己的接口配置：

   ```env
   OPENAI_API_KEY=你的API_Key
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_MODEL=gpt-4.1-mini
   ```

   使用 DeepSeek 时可改为：

   ```env
   OPENAI_API_KEY=你的DeepSeek_Key
   OPENAI_BASE_URL=https://api.deepseek.com
   OPENAI_MODEL=deepseek-chat
   ```

4. 创建 Python 环境并安装 LangGraph 后端依赖：

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

5. Windows 一键启动前后端：

   ```powershell
   .\start-langgraph.cmd
   ```

   或分别启动：

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
   npm run dev
   ```

6. 浏览器访问 `http://localhost:3000`。

## LangGraph 架构

```text
START → Agent Node ──无工具调用──→ END
             │
             └──有工具调用──→ Tool Node ──→ Agent Node
                                  ↑              │
                                  └──最多循环2轮─┘
```

- `backend/graph.py`：State、Node、Edge、条件路由和循环。
- `backend/tools.py`：公开资料检索工具。
- `backend/storage.py`：Python SQLite 对话记忆。
- `backend/main.py`：FastAPI 与流式输出。

## 前端技术

- JavaScript / JSX
- React 19
- Next.js 16
- 原生 CSS
- 页面入口：`app/page.jsx`

## 单独启动前端

Python 后端已运行时，可以执行：

   ```bash
   npm run dev
   ```

## 使用说明

- 点击 AI 回答中的紫色术语，创建子对话分支。
- 也可用鼠标选中回答中的任意文字，再点击“创建知识分支”。
- 每个节点拥有独立上下文，可以继续无限分叉。
- 节点、对话、队列和资料来源保存在服务器的 SQLite 数据库 `data/threadscape.db` 中。
- 同一服务器上的不同浏览器会读取同一套知识数据；分享项目时不会打包已有数据库。
- `.env.local` 包含私密 Key，不要分享或提交；压缩包中只包含安全的 `.env.example`。

## 前端生产构建

```bash
npm run build
npm start
```

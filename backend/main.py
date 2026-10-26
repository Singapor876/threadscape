import json
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage, AIMessage
from pydantic import BaseModel

from .config import OPENAI_API_KEY
from .graph import graph
from .storage import initialize, read_state, write_state
from .tools import search_sources


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(title="Threadscape LangGraph API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "runtime": "python", "framework": "langgraph", "modelConfigured": bool(OPENAI_API_KEY)}


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    if not OPENAI_API_KEY:
        raise HTTPException(500, "服务端尚未配置 OPENAI_API_KEY")
    if not request.messages:
        raise HTTPException(400, "问题不能为空")

    async def stream():
        messages = [HumanMessage(content=item.content) if item.role == "user" else AIMessage(content=item.content) for item in request.messages]
        try:
            async for event in graph.astream_events({"messages": messages, "tool_rounds": 0}, version="v2"):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"].get("chunk")
                    if isinstance(chunk, AIMessageChunk):
                        if isinstance(chunk.content, str):
                            text = chunk.content
                        else:
                            text = "".join(str(block.get("text", "")) for block in chunk.content if isinstance(block, dict))
                        if text:
                            yield text.encode("utf-8")
        except Exception as error:
            yield f"\n\n[模型调用失败：{error}]".encode("utf-8")

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")


@app.get("/sources")
async def sources(q: str = "") -> dict:
    return {"sources": await search_sources(q.strip()) if q.strip() else []}


@app.get("/state")
async def get_state() -> dict:
    return {"state": read_state()}


@app.put("/state")
async def put_state(state: dict) -> dict:
    try:
        write_state(state)
        return {"ok": True}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error

from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from .tools import search_public_sources


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    tool_rounds: int


SYSTEM_PROMPT = """你是 Threadscape 的中文知识研究助手。
回答必须准确、清晰、结构自然。首次出现且值得深入探索的专业术语写成【术语】，每次标记3到8个。
当问题涉及可验证事实、定义或专业资料时，调用 search_public_sources 工具；引用工具结果时附上来源链接。
不要使用 Markdown 表格。工具最多调用两轮。"""

model = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
    model=OPENAI_MODEL,
    temperature=0.6,
    streaming=True,
)
tools = [search_public_sources]
model_with_tools = model.bind_tools(tools)


async def agent_node(state: AgentState) -> dict:
    messages = state["messages"]
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SYSTEM_PROMPT), *messages]
    response = await (model if state.get("tool_rounds", 0) >= 2 else model_with_tools).ainvoke(messages)
    return {"messages": [response]}


def route_after_agent(state: AgentState) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls and state.get("tool_rounds", 0) < 2:
        return "tools"
    return END


async def tool_node(state: AgentState) -> dict:
    result = await ToolNode(tools).ainvoke(state)
    return {"messages": result["messages"], "tool_rounds": state.get("tool_rounds", 0) + 1}


builder = StateGraph(AgentState)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", route_after_agent, {"tools": "tools", END: END})
builder.add_edge("tools", "agent")
graph = builder.compile()

from __future__ import annotations
import json
from typing import Any, Callable, Dict, List, Optional, TypedDict
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from config import settings
from db.core import get_db
from tools.langchain_tools import BASE_TOOLS
from typing import TypedDict, Optional, List, Dict, Any

class AgentState(TypedDict, total=False):
    """Shared state threaded through every node in a stage-owner subgraph."""
    session_id: str
    project_id: str
    trace_id: str
    stage: str
    instruction: str
    directives: List[str]
    context_refs: Dict[str, Any]
    
    messages: List[BaseMessage]
    
    runtime: Dict[str, Any]
    db: Any
    peer_call_count: int

    skills_markdown: str
    thinking: List[str]
    output: Dict[str, Any]
    output_text: str
    error: Optional[str]
    status: str


# ─── Base Agent Builder ────────────────────────────────────────

class BaseAgent:
    """
    Base Agent builder class using LangGraph and LangChain OpenAI LLM.
    """
    def __init__(self, name: str, system_prompt: str, tools: List[Callable] = None):
        self.name = name
        self.system_prompt = system_prompt
        self.tools = tools or BASE_TOOLS
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL or "gpt-4o",
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL
        )
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        workflow = StateGraph(AgentState)
        
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("action", ToolNode(self.tools))
        
        workflow.add_edge(START, "agent")
        
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {
                "continue": "action",
                "end": END
            }
        )
        
        workflow.add_edge("action", "agent")
        
        return workflow.compile()

    async def _agent_node(self, state: AgentState):
        """Invoke the LLM"""
        messages = state.get("messages", [])
        
        # Inject system prompt if it's the first run
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=self.system_prompt)] + messages

        response = await self.llm_with_tools.ainvoke(messages)
        return {"messages": [response]}
        
    def _should_continue(self, state: AgentState):
        messages = state.get("messages", [])
        if not messages:
            return "end"
        last_message = messages[-1]
        # If the LLM requested a tool call, route to the action node
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "continue"
        return "end"

    async def invoke(self, state: AgentState) -> AgentState:
        """Run the agent graph"""
        return await self.graph.ainvoke(state)

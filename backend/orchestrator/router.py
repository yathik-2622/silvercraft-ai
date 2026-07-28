"""
LangGraph-based Orchestrator for SilverCraft AI.
Uses pure LangGraph routing to dispatch tasks to internal subagents and external MCP servers.
"""

from __future__ import annotations
import json
import sys
from collections.abc import AsyncIterator
from typing import Any, Dict, List, Optional, TypedDict, Callable, Type
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, create_model, Field

from langgraph.graph import END, StateGraph, START
from langchain_core.messages import HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import StructuredTool

# --- MCP Imports ---
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client

from config import settings
from db.core import get_db
from api.routes.auth import get_current_user
from models.user import UserModel
from core.logging import get_logger

from subagents.modeling_agents import (
    DataVaultAgent, KimballAgent, InmonAgent, ThreeNFAgent,
    SourceProfilerAgent, ConceptualAgent, STTMAutomatorAgent
)

logger = get_logger(__name__)
orchestrator_router = APIRouter()

# ─── LangGraph pipeline state ───────────────────────────────────────────────
class OrchestratorState(TypedDict, total=False):
    messages: List[Any]
    current_stage: str
    skills: List[str]
    schema_context: Dict[str, Any]
    output: str
    selected_agent: str
    remote_mcp_uri: Optional[str]
    error: Optional[str]

# ─── MCP Conversion Helpers ─────────────────────────────────────────────────
def mcp_schema_to_pydantic(name: str, schema: Dict[str, Any]) -> Type[BaseModel]:
    """Convert JSON schema from MCP tool into a Pydantic BaseModel for LangChain."""
    fields = {}
    for field_name, field_def in schema.get("properties", {}).items():
        field_type = int if field_def.get("type") == "integer" else str
        if field_name in schema.get("required", []):
            fields[field_name] = (field_type, Field(description=field_def.get("description", "")))
        else:
            fields[field_name] = (field_type | None, Field(default=None, description=field_def.get("description", "")))
    return create_model(f"{name}Input", **fields)

def create_mcp_tool_wrapper(session: ClientSession, tool_name: str) -> Callable:
    """Create an async wrapper for LangChain to execute the MCP tool."""
    async def _tool_wrapper(**kwargs):
        actual_args = kwargs.get("kwargs", kwargs) if isinstance(kwargs.get("kwargs"), dict) else kwargs
        result = await session.call_tool(tool_name, arguments=actual_args)
        return result.content[0].text if result.content else "Success"
    return _tool_wrapper

# ─── Orchestrator Router Node ───────────────────────────────────────────────
async def router_node(state: OrchestratorState) -> OrchestratorState:
    """Determine which subagent or MCP server should handle the request based on the skills and stage."""
    skills = state.get("skills", [])
    stage = state.get("current_stage", "")
    
    agent_map = {
        "data-vault": "data_vault_agent",
        "dimensional-modeling": "kimball_agent",
        "inmon": "inmon_agent",
        "3nf-normalization": "three_nf_agent",
        "source-analysis": "source_profiler_agent",
        "conceptual-modeling": "conceptual_agent",
        "sttm": "sttm_automator_agent",
    }
    
    if state.get("remote_mcp_uri"):
        state["selected_agent"] = "mcp_client_node"
        return state
        
    selected = "source_profiler_agent" # default
    for s in skills:
        if s in agent_map:
            selected = agent_map[s]
            break
            
    if "conceptual" in stage:
        selected = "conceptual_agent"
    elif "physical" in stage or "sttm" in stage:
        selected = "sttm_automator_agent"
        
    state["selected_agent"] = selected
    return state

# ─── MCP Client Node ────────────────────────────────────────────────────────
async def mcp_client_node(state: OrchestratorState) -> OrchestratorState:
    """Connect to an external MCP server, retrieve tools, and execute a LangChain ReAct agent."""
    uri = state.get("remote_mcp_uri")
    try:
        if uri.startswith("http"):
            # Use SSE client for HTTP URIs
            async with sse_client(uri) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    mcp_tools = await session.list_tools()
                    langchain_tools = []
                    for tool in mcp_tools.tools:
                        langchain_tools.append(StructuredTool.from_function(
                            name=tool.name,
                            description=tool.description,
                            coroutine=create_mcp_tool_wrapper(session, tool.name),
                            args_schema=mcp_schema_to_pydantic(tool.name, tool.inputSchema)
                        ))
                    
                    llm = ChatOpenAI(model=settings.LLM_MODEL or "gpt-4o", api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
                    from langgraph.prebuilt import create_react_agent
                    agent = create_react_agent(llm, langchain_tools)
                    result = await agent.ainvoke({"messages": state.get("messages", [])})
                    
                    if result.get("messages") and isinstance(result["messages"][-1], AIMessage):
                        state["output"] = result["messages"][-1].content
                    else:
                        state["output"] = "MCP Agent completed without generating text."
        else:
            # Assume it's a local script path
            server_params = StdioServerParameters(command=sys.executable, args=[uri])
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    mcp_tools = await session.list_tools()
                    langchain_tools = []
                    for tool in mcp_tools.tools:
                        langchain_tools.append(StructuredTool.from_function(
                            name=tool.name,
                            description=tool.description,
                            coroutine=create_mcp_tool_wrapper(session, tool.name),
                            args_schema=mcp_schema_to_pydantic(tool.name, tool.inputSchema)
                        ))
                    
                    llm = ChatOpenAI(model=settings.LLM_MODEL or "gpt-4o", api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
                    from langgraph.prebuilt import create_react_agent
                    agent = create_react_agent(llm, langchain_tools)
                    result = await agent.ainvoke({"messages": state.get("messages", [])})
                    
                    if result.get("messages") and isinstance(result["messages"][-1], AIMessage):
                        state["output"] = result["messages"][-1].content
                    else:
                        state["output"] = "MCP Agent completed without generating text."
    except Exception as exc:
        state["error"] = f"MCP Client Error: {exc}"
    return state

# ─── Subagent Nodes ─────────────────────────────────────────────────────────
async def _run_subagent(agent_class, state: OrchestratorState) -> OrchestratorState:
    agent = agent_class()
    result = await agent.invoke({
        "messages": state.get("messages", []),
        "context_refs": state.get("schema_context", {})
    })
    
    if result.get("messages") and isinstance(result["messages"][-1], AIMessage):
        state["output"] = result["messages"][-1].content
    else:
        state["output"] = f"Executed {agent.name} successfully."
    return state

async def data_vault_node(state: OrchestratorState): return await _run_subagent(DataVaultAgent, state)
async def kimball_node(state: OrchestratorState): return await _run_subagent(KimballAgent, state)
async def inmon_node(state: OrchestratorState): return await _run_subagent(InmonAgent, state)
async def three_nf_node(state: OrchestratorState): return await _run_subagent(ThreeNFAgent, state)
async def source_profiler_node(state: OrchestratorState): return await _run_subagent(SourceProfilerAgent, state)
async def conceptual_node(state: OrchestratorState): return await _run_subagent(ConceptualAgent, state)
async def sttm_node(state: OrchestratorState): return await _run_subagent(STTMAutomatorAgent, state)

# ─── Build Master Graph ─────────────────────────────────────────────────────
def build_orchestrator_graph() -> StateGraph:
    workflow = StateGraph(OrchestratorState)
    
    workflow.add_node("router", router_node)
    workflow.add_node("mcp_client_node", mcp_client_node)
    workflow.add_node("data_vault_agent", data_vault_node)
    workflow.add_node("kimball_agent", kimball_node)
    workflow.add_node("inmon_agent", inmon_node)
    workflow.add_node("three_nf_agent", three_nf_node)
    workflow.add_node("source_profiler_agent", source_profiler_node)
    workflow.add_node("conceptual_agent", conceptual_node)
    workflow.add_node("sttm_automator_agent", sttm_node)
    
    workflow.add_edge(START, "router")
    
    workflow.add_conditional_edges(
        "router",
        lambda state: state["selected_agent"],
        {
            "mcp_client_node": "mcp_client_node",
            "data_vault_agent": "data_vault_agent",
            "kimball_agent": "kimball_agent",
            "inmon_agent": "inmon_agent",
            "three_nf_agent": "three_nf_agent",
            "source_profiler_agent": "source_profiler_agent",
            "conceptual_agent": "conceptual_agent",
            "sttm_automator_agent": "sttm_automator_agent",
        }
    )
    
    for node in ["mcp_client_node", "data_vault_agent", "kimball_agent", "inmon_agent", "three_nf_agent", "source_profiler_agent", "conceptual_agent", "sttm_automator_agent"]:
        workflow.add_edge(node, END)
        
    return workflow.compile()

ORCHESTRATOR = build_orchestrator_graph()

# ─── Request / Response schemas ─────────────────────────────────────────────
class OrchestratorRequest(BaseModel):
    prompt: str
    current_stage: str = "1-source-analysis"
    workflow_type: str = "default"
    skills: List[str] = []
    schema_context: Dict[str, Any] = {}
    remote_mcp_uri: Optional[str] = None
    project_id: Optional[str] = None
    chat_id: Optional[str] = None

class OrchestratorResponse(BaseModel):
    reply: str
    stage: str
    source: str
    agent_events: List[Dict[str, Any]] = []

def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"

# ─── POST /orchestrator/run ─────────────────────────────────────────────────
@orchestrator_router.post("/run", response_model=OrchestratorResponse)
async def run_orchestrator(req: OrchestratorRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    state = OrchestratorState(
        messages=[HumanMessage(content=req.prompt)],
        current_stage=req.current_stage,
        skills=req.skills,
        schema_context=req.schema_context,
        remote_mcp_uri=req.remote_mcp_uri
    )
    
    result = await ORCHESTRATOR.ainvoke(state)
    
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
        
    return OrchestratorResponse(
        reply=result.get("output", "Done."),
        stage=req.current_stage,
        source=result.get("selected_agent", "unknown")
    )

@orchestrator_router.post("/stream")
async def stream_orchestrator(req: OrchestratorRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """SSE endpoint for visible orchestration milestones."""
    async def events() -> AsyncIterator[str]:
        yield _sse("activity", {"label": "Orchestrator is classifying the request", "status": "running"})
        try:
            state = OrchestratorState(
                messages=[HumanMessage(content=req.prompt)],
                current_stage=req.current_stage,
                skills=req.skills,
                schema_context=req.schema_context,
                remote_mcp_uri=req.remote_mcp_uri
            )
            
            async for event in ORCHESTRATOR.astream(state):
                for node_name, node_state in event.items():
                    yield _sse("activity", {"label": f"Executing {node_name}", "status": "running"})
                    
            final_state = await ORCHESTRATOR.ainvoke(state)
            yield _sse("result", OrchestratorResponse(
                reply=final_state.get("output", "Done."),
                stage=req.current_stage,
                source=final_state.get("selected_agent", "unknown")
            ).model_dump())
            
        except HTTPException as exc:
            yield _sse("error", {"detail": exc.detail, "status": exc.status_code})
        except Exception as exc:
            yield _sse("error", {"detail": str(exc), "status": 500})
            
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

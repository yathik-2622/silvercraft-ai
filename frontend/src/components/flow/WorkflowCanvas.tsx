import React, { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges, MarkerType, Node, Edge, Connection
} from 'reactflow';
import 'reactflow/dist/style.css';
import AgentNode from './AgentNode';
import AgentConfigPanel from './AgentConfigPanel';

const nodeTypes = { agent: AgentNode };

interface WorkflowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  theme?: 'dark' | 'light';
  readOnly?: boolean;
  activeNodeId?: string;
}

export default function WorkflowCanvas({ initialNodes = [], initialEdges = [], onChange, theme = 'dark', readOnly = false, activeNodeId = '' }: WorkflowCanvasProps) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<any>(null);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    setNodes(initialNodes);
  }, [JSON.stringify(initialNodes.map((node) => ({ id: node.id, data: node.data })))]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [JSON.stringify(initialEdges)]);

  useEffect(() => {
    onChange?.(nodes, edges);
  }, [nodes, edges]);

  useEffect(() => {
    if (!activeNodeId || !reactFlowRef.current || nodes.length === 0) return;
    const targetNode = nodes.find((node) => node.id === activeNodeId);
    if (!targetNode) return;
    window.setTimeout(() => {
      reactFlowRef.current?.setCenter(
        targetNode.position.x + 120,
        targetNode.position.y + 50,
        { zoom: 1.1, duration: 650 },
      );
    }, 40);
  }, [activeNodeId, nodes]);

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed }, animated: true }, eds));
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleUpdateNodeData = (id: string, newData: any) => {
    setNodes((nds) => {
      const next = nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, ...newData } };
        }
        return n;
      });
      return next;
    });
  };

  const handleRemoveNode = (id: string) => {
    setNodes((nds) => {
      const nextNodes = nds.filter((node) => node.id !== id);
      setEdges((eds) => {
        const nextEdges = eds.filter((edge) => edge.source !== id && edge.target !== id);
        return nextEdges;
      });
      setSelectedNodeId(null);
      return nextNodes;
    });
  };

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const payload = event.dataTransfer.getData('application/agent');
    if (!payload) return;
    const agent = JSON.parse(payload);
    const bounds = wrapper.current?.getBoundingClientRect();
    const screenPosition = bounds
      ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: event.clientX, y: event.clientY };
    const flowPosition = reactFlowRef.current?.screenToFlowPosition
      ? reactFlowRef.current.screenToFlowPosition(screenPosition)
      : screenPosition;
    const position = { x: flowPosition.x - 115, y: flowPosition.y - 45 };
    setNodes((nds) => {
      const node: Node = {
        id: `${agent.id}-${Date.now()}`,
        type: 'agent',
        position,
        data: {
          agentId: agent.id,
          name: agent.name,
          description: agent.description,
          framework: agent.agent_type === 'remote' ? 'A2A Remote' : '',
          status: 'idle',
          model: agent.model || 'gemini-2.5-flash',
          skills: (agent.default_skills ?? []).join(', '),
          inputs: 'all project sources, project constraints',
          knowledgeFiles: '',
          hitlEnabled: true,
          a2aEnabled: agent.agent_type === 'remote',
          remoteUri: agent.remote_uri ?? '',
          customPrompt: '',
          kgOptIn: false,
          includeTextInput: true,
          includeUploadedFiles: true,
          includeSourceInputs: true,
          includeKnowledgeBase: true,
          includeUpstreamOutputs: true,
          includeExistingModel: true,
        },
      };
      const next = [...nds, node];
      return next;
    });
  }, [readOnly]);

  const themedNodes = useMemo(
    () => nodes.map((node) => ({ ...node, data: { ...node.data, canvasTheme: theme } })),
    [nodes, theme],
  );

  const styledEdges = useMemo(() => edges.map((edge) => ({
    ...edge,
    markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed },
    animated: edge.animated ?? true,
  })), [edges]);

  return (
    <div ref={wrapper} data-testid="workflow-canvas" className={`w-full h-full relative ${theme === 'dark' ? 'bg-[#0d1117]' : 'bg-slate-50'}`} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={themedNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        onInit={(instance) => { reactFlowRef.current = instance; }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesUpdatable={!readOnly}
        className={theme === 'dark' ? 'bg-[#0d1117]' : 'bg-slate-50'}
      >
        <Background color={theme === 'dark' ? '#30363d' : '#cbd5e1'} gap={20} size={1} />
        <Controls showInteractive={false} className={theme === 'dark' ? 'bg-[#161b22] border-[#30363d] fill-white' : 'bg-white border-slate-200'} />
        <MiniMap 
          nodeColor={(n) => n.id === selectedNodeId ? '#e67225' : theme === 'dark' ? '#161b22' : '#ffffff'} 
          maskColor={theme === 'dark' ? 'rgba(13, 17, 23, 0.7)' : 'rgba(241, 245, 249, 0.7)'}
          style={{ backgroundColor: theme === 'dark' ? '#0d1117' : '#ffffff', border: theme === 'dark' ? '1px solid #30363d' : '1px solid #e2e8f0' }}
        />
      </ReactFlow>

      {!readOnly && selectedNodeId && (
        <AgentConfigPanel
          nodeId={selectedNodeId}
          nodeData={nodes.find((n) => n.id === selectedNodeId)?.data || {}}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={handleUpdateNodeData}
          onRemove={handleRemoveNode}
          theme={theme}
        />
      )}
    </div>
  );
}

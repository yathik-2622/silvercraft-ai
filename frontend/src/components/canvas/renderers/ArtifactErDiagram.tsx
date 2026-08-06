import React, { useEffect, useMemo, useRef } from "react";
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { EntityNode, type EntityNodeData } from "./EntityNode";

interface Props {
  output: unknown;
}

const nodeTypes = { entity: EntityNode };

function slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_") || "entity";
}

function firstPresent(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function hasFlag(flags: unknown, pattern: RegExp): boolean {
  return Array.isArray(flags) && flags.some((f) => typeof f === "string" && pattern.test(f));
}

/** generate_ddl shape: { tables: [{ table_name, columns, primary_key, foreign_keys }] } */
function fromDdlShape(output: { tables: Record<string, unknown>[] }): { nodes: Node<EntityNodeData>[]; edges: Edge[] } {
  const nodes: Node<EntityNodeData>[] = [];
  const edges: Edge[] = [];

  output.tables.forEach((table, i) => {
    const tableName = String(firstPresent(table, "table_name", "name") ?? `table_${i}`);
    const id = slug(tableName);
    const pk = ((table.primary_key ?? table.primary_keys ?? []) as unknown[]).map(String);
    const columns = ((table.columns as Record<string, unknown>[]) ?? []).map((c) => {
      const colName = String(firstPresent(c, "column_name", "name") ?? "column");
      return {
        name: colName,
        type: String(firstPresent(c, "dtype", "data_type", "type") ?? ""),
        isPk: pk.includes(colName) || hasFlag(c.flags, /primary/i),
        isFk: hasFlag(c.flags, /foreign/i),
        description: typeof c.description === "string" ? c.description : undefined,
      };
    });
    nodes.push({
      id, type: "entity",
      position: { x: (i % 4) * 300, y: Math.floor(i / 4) * 260 },
      data: { title: tableName, rows: columns },
    });

    const foreignKeys = (table.foreign_keys as Record<string, unknown>[] | undefined) ?? [];
    for (const fk of foreignKeys) {
      const refTable = String(firstPresent(fk, "ref_table", "references_table", "foreign_table") ?? "");
      if (!refTable) continue;
      const fkCols = firstPresent(fk, "columns", "column");
      const label = Array.isArray(fkCols) ? fkCols.join(", ") : String(fkCols ?? "");
      const source = slug(refTable);
      edges.push({
        id: `${source}->${id}:${label}`, source, target: id, label,
        markerEnd: { type: MarkerType.ArrowClosed }, animated: true,
      });
    }
  });

  return { nodes, edges };
}

/** generate_conceptual_entities shape: [{ entity_name, attributes: [...] }] — no relationship data in this shape alone. */
function fromEntityArrayShape(entities: Record<string, unknown>[]): { nodes: Node<EntityNodeData>[]; edges: Edge[] } {
  const nodes = entities.map((entity, i) => {
    const attrs = (entity.attributes as Record<string, unknown>[] | undefined) ?? [];
    return {
      id: slug(String(entity.entity_name ?? `entity_${i}`)),
      type: "entity",
      position: { x: (i % 4) * 300, y: Math.floor(i / 4) * 260 },
      data: {
        title: String(entity.entity_name ?? `Entity ${i + 1}`),
        rows: attrs.map((a) => ({
          name: String(firstPresent(a, "attribute_name", "name") ?? "attribute"),
          type: typeof a.sensitivity === "string" ? a.sensitivity : undefined,
          isPk: hasFlag(a.flags, /primary/i),
          isFk: hasFlag(a.flags, /foreign/i),
          description: typeof a.description === "string" ? a.description : undefined,
        })),
      },
    };
  });
  return { nodes, edges: [] };
}

export const ArtifactErDiagram: React.FC<Props> = ({ output }) => {
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (Array.isArray(output)) {
      return fromEntityArrayShape(output as Record<string, unknown>[]);
    }
    if (output && typeof output === "object" && Array.isArray((output as { tables?: unknown }).tables)) {
      return fromDdlShape(output as { tables: Record<string, unknown>[] });
    }
    return { nodes: [], edges: [] };
  }, [output]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const id = window.setTimeout(() => reactFlowRef.current?.fitView({ padding: 0.3 }), 30);
    return () => window.clearTimeout(id);
  }, [nodes]);

  if (nodes.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs text-slate-400">No entities to diagram.</div>;
  }

  return (
    <div className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          reactFlowRef.current = instance;
          instance.fitView({ padding: 0.3 });
        }}
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

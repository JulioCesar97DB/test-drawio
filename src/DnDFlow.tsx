import { useRef, useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  useReactFlow,
  Background,
  Node,
  Edge,
  Connection,
  XYPosition,
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  MiniMap,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import Sidebar from "./components/Sidebar";
import { DnDProvider, useDnD } from "./context/DnDContext";
import PropertiesSidebar from "./components/PropertiesSidebar";
import {
  SubscriptionNode,
  ResourceGroupNode,
  VnetNode,
} from "./components/CustomNodes";

let id = 0;
const getId = () => `dndnode_${id++}`;

const nodeTypes: NodeTypes = {
  subscription: SubscriptionNode,
  resourceGroup: ResourceGroupNode,
  vnet: VnetNode,
};

interface CustomNode extends Node {
  width?: number;
  height?: number;
  parentId?: string;
  type: string;
}

const DnDFlow = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition, getNodes } = useReactFlow<CustomNode>();
  const [type] = useDnD();

  const [selectedNode, setSelectedNode] = useState<CustomNode | null>(null);

  useEffect(() => {
    if (selectedNode) {
      const updatedNode = nodes.find((node) => node.id === selectedNode.id);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      } else {
        setSelectedNode(null);
      }
    }
  }, [nodes, selectedNode]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setSelectedNode(node as CustomNode);
  }, []);

  const isValidVnetConnection = useCallback(
    (sourceId: string | null, targetId: string | null): boolean => {
      if (!sourceId || !targetId) return false;
      
      const sourceNode = nodes.find((node) => node.id === sourceId);
      const targetNode = nodes.find((node) => node.id === targetId);
      
      // Both must be VNet nodes and in the same Resource Group
      return (
        sourceNode?.type === 'vnet' && 
        targetNode?.type === 'vnet' &&
        sourceNode.parentId === targetNode.parentId &&
        sourceNode.parentId !== undefined
      );
    },
    [nodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Find source and target nodes
      const sourceNode = nodes.find((node) => node.id === params.source);
      const targetNode = nodes.find((node) => node.id === params.target);
      
      // Check if both are VNet nodes
      if (sourceNode?.type === 'vnet' && targetNode?.type === 'vnet') {
        // Check if they share the same parent (same Resource Group)
        if (sourceNode.parentId === targetNode.parentId) {
          // Add the connection
          setEdges((eds) => addEdge({
            ...params,
            animated: true,
            style: { stroke: '#0078D4', strokeWidth: 2 },
            label: 'VNet Connection'
          }, eds));
        } else {
          console.log("Cannot connect VNet nodes from different Resource Groups");
          // You could add a toast/notification here to inform the user
        }
      } else {
        // Default behavior for non-VNet connections
        setEdges((eds) => addEdge(params, eds));
      }
    },
    [nodes, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const getAbsolutePosition = useCallback(
    (node: CustomNode, allNodes: CustomNode[]): XYPosition => {
      let x = node.position.x;
      let y = node.position.y;

      if (node.parentId) {
        const parentNode = allNodes.find((n) => n.id === node.parentId);
        if (parentNode) {
          const parentPos = getAbsolutePosition(parentNode, allNodes);
          x += parentPos.x;
          y += parentPos.y;
        }
      }

      return { x, y };
    },
    []
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      console.log(`[${type}] Drop position: (${position.x}, ${position.y})`);

      const currentNodes = getNodes();
      console.log(
        "Nodos actuales:",
        currentNodes.map((n) => ({ id: n.id, type: n.type, pos: n.position }))
      );

      let width = 150;
      let height = 40;

      if (type === "subscription") {
        width = 300;
        height = 300;
      } else if (type === "resourceGroup") {
        width = 200;
        height = 200;
      }

      const newNode: CustomNode = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
        width,
        height,
      };

      let parentNode: CustomNode | null = null;

      if (type === "resourceGroup" || type === "vnet") {
        const parentType =
          type === "resourceGroup" ? "subscription" : "resourceGroup";

        console.log(`Buscando nodo padre de tipo: ${parentType}`);

        const potentialParents = currentNodes.filter(
          (node) => node.type === parentType
        );
        console.log(
          `Encontrados ${potentialParents.length} nodos de tipo ${parentType}`
        );

        for (const node of potentialParents) {
          const absolutePos = getAbsolutePosition(node, currentNodes);
          console.log(
            `Verificando ${node.id} (${node.type}) en posición absoluta (${absolutePos.x}, ${absolutePos.y}) con tamaño ${node.width}x${node.height}`
          );

          const isInside =
            position.x >= absolutePos.x &&
            position.x <= absolutePos.x + (node.width || 0) &&
            position.y >= absolutePos.y &&
            position.y <= absolutePos.y + (node.height || 0);

          console.log(
            `¿Punto (${position.x}, ${position.y}) dentro de ${node.id}?: ${
              isInside ? "SÍ" : "NO"
            }`
          );

          if (isInside) {
            console.log(
              `¡ENCONTRADO! Padre potencial: ${node.id} (${node.type})`
            );
            parentNode = node;
            break;
          }
        }

        if (!parentNode) {
          console.log(
            `No se encontró un nodo ${parentType} donde colocar el ${type}`
          );
          return;
        }

        newNode.parentId = parentNode.id;
        newNode.extent = "parent";

        const absoluteParentPos = getAbsolutePosition(parentNode, currentNodes);

        newNode.position = {
          x: position.x - absoluteParentPos.x,
          y: position.y - absoluteParentPos.y,
        };

        const margin = 10;
        const maxX = (parentNode.width || 0) - width - margin;
        const maxY = (parentNode.height || 0) - height - margin;

        if (maxX < margin || maxY < margin) {
          console.log(
            `El nodo padre es demasiado pequeño para contener un ${type}`
          );
          return;
        }

        if (newNode.position.x < margin) newNode.position.x = margin;
        if (newNode.position.y < margin) newNode.position.y = margin;
        if (newNode.position.x > maxX) newNode.position.x = maxX;
        if (newNode.position.y > maxY) newNode.position.y = maxY;

        console.log(
          `Añadiendo ${type} con ID ${newNode.id} dentro de ${parentNode.type} con ID ${parentNode.id}`
        );
        console.log(
          `Posición relativa: (${newNode.position.x}, ${newNode.position.y})`
        );
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, type, getNodes, setNodes, getAbsolutePosition]
  );

  const nodeClassName = (node: CustomNode): string => node.type;

  return (
    <div className="dndflow flex h-full flex-row">
      <Sidebar />
      <div className="flex flex-grow h-svh" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as OnNodesChange}
          onEdgesChange={onEdgesChange as OnEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          isValidConnection={({ source, target }) => 
            (source && target) ? isValidVnetConnection(source, target) : false
          }
          fitView
          style={{ backgroundColor: "#F7F9FB" }}
        >
          <MiniMap zoomable pannable nodeClassName={nodeClassName} />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <PropertiesSidebar selectedNode={selectedNode} />
    </div>
  );
};

export default function WrappedDnDFlow() {
  return (
    <ReactFlowProvider>
      <DnDProvider>
        <DnDFlow />
      </DnDProvider>
    </ReactFlowProvider>
  );
}

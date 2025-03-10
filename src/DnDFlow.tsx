import { useRef, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  useReactFlow,
  Background,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import Sidebar from "./components/Sidebar";
import { DnDProvider, useDnD } from "./context/DnDContext";
import PropertiesSidebar from "./components/PropertiesSidebar";
import { SubscriptionNode, ResourceGroupNode, VnetNode } from "./components/CustomNodes";

let id = 0;
const getId = () => `dndnode_${id++}`;

// Define custom node types
const nodeTypes = {
  subscription: SubscriptionNode,
  resourceGroup: ResourceGroupNode,
  vnet: VnetNode,
};

const DnDFlow = () => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const [type] = useDnD();

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Función auxiliar para calcular la posición absoluta de un nodo
  const getAbsolutePosition = (node, allNodes) => {
    let x = node.position.x;
    let y = node.position.y;
    
    // Si el nodo tiene un padre, añadir la posición del padre
    if (node.parentId) {
      const parentNode = allNodes.find(n => n.id === node.parentId);
      if (parentNode) {
        // Llamada recursiva para obtener la posición absoluta del padre
        const parentPos = getAbsolutePosition(parentNode, allNodes);
        x += parentPos.x;
        y += parentPos.y;
      }
    }
    
    return { x, y };
  };

  // Función auxiliar para determinar si un punto está dentro de un nodo
  const isPointInsideNode = (point, node, allNodes) => {
    // Calcular posición absoluta del nodo
    const absPos = getAbsolutePosition(node, allNodes);
    
    const result = (
      point.x >= absPos.x &&
      point.x <= absPos.x + (node.width || 0) &&
      point.y >= absPos.y &&
      point.y <= absPos.y + (node.height || 0)
    );
    
    console.log(`Punto (${point.x}, ${point.y}) dentro de nodo ${node.id} en (${absPos.x}, ${absPos.y}) con tamaño ${node.width}x${node.height}: ${result ? 'SÍ' : 'NO'}`);
    
    return result;
  };

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      console.log(`[${type}] Drop position: (${position.x}, ${position.y})`);
      
      // Obtener los nodos actualizados directamente del store
      const currentNodes = getNodes();
      console.log("Nodos actuales:", currentNodes.map(n => ({ id: n.id, type: n.type, pos: n.position })));
      
      // Configurar tamaños según el tipo de nodo
      let width = 150;
      let height = 40;
      
      if (type === 'subscription') {
        width = 300;
        height = 300;
      } else if (type === 'resourceGroup') {
        width = 200;
        height = 200;
      }

      // Inicializar el nuevo nodo
      const newNode = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
        width,
        height,
      };

      // Buscar nodo padre potencial
      let parentNode = null;
      
      if (type === 'resourceGroup' || type === 'vnet') {
        // Determinar qué tipo de nodo padre buscamos
        const parentType = type === 'resourceGroup' ? 'subscription' : 'resourceGroup';
        
        console.log(`Buscando nodo padre de tipo: ${parentType}`);
        
        // Primero, encontrar todos los nodos potenciales del tipo correcto
        const potentialParents = currentNodes.filter(node => node.type === parentType);
        console.log(`Encontrados ${potentialParents.length} nodos de tipo ${parentType}`);
        
        // Para cada potencial padre, verificar si el punto está dentro
        for (const node of potentialParents) {
          const absolutePos = getAbsolutePosition(node, currentNodes);
          console.log(`Verificando ${node.id} (${node.type}) en posición absoluta (${absolutePos.x}, ${absolutePos.y}) con tamaño ${node.width}x${node.height}`);
          
          // Verificación explícita para depuración
          const isInside = 
            position.x >= absolutePos.x &&
            position.x <= absolutePos.x + node.width &&
            position.y >= absolutePos.y &&
            position.y <= absolutePos.y + node.height;
            
          console.log(`¿Punto (${position.x}, ${position.y}) dentro de ${node.id}?: ${isInside ? 'SÍ' : 'NO'}`);
          
          if (isInside) {
            console.log(`¡ENCONTRADO! Padre potencial: ${node.id} (${node.type})`);
            parentNode = node;
            break; // Salir del bucle al encontrar un padre
          }
        }
        
        // Si no se encontró un padre adecuado, mostrar error y salir
        if (!parentNode) {
          console.log(`No se encontró un nodo ${parentType} donde colocar el ${type}`);
          return;
        }
        
        // Configurar relación padre-hijo según el estándar de React Flow
        newNode.parentId = parentNode.id;
        newNode.extent = 'parent';
        
        // Calcular posición absoluta del padre para calcular posición relativa
        const absoluteParentPos = getAbsolutePosition(parentNode, currentNodes);
        
        // Calcular posición relativa al padre
        newNode.position = {
          x: position.x - absoluteParentPos.x,
          y: position.y - absoluteParentPos.y
        };
        
        // Verificar que quepa dentro del padre
        const margin = 10;
        const maxX = parentNode.width - width - margin;
        const maxY = parentNode.height - height - margin;
        
        if (maxX < margin || maxY < margin) {
          console.log(`El nodo padre es demasiado pequeño para contener un ${type}`);
          return;
        }
        
        // Ajustar posición si está fuera de los límites
        if (newNode.position.x < margin) newNode.position.x = margin;
        if (newNode.position.y < margin) newNode.position.y = margin;
        if (newNode.position.x > maxX) newNode.position.x = maxX;
        if (newNode.position.y > maxY) newNode.position.y = maxY;
        
        console.log(`Añadiendo ${type} con ID ${newNode.id} dentro de ${parentNode.type} con ID ${parentNode.id}`);
        console.log(`Posición relativa: (${newNode.position.x}, ${newNode.position.y})`);
      }

      // Añadir el nuevo nodo
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, type, getNodes]
  );

  return (
    <div className="dndflow flex h-full flex-row">
      <Sidebar />
      <div className="flex flex-grow h-svh" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          style={{ backgroundColor: "#F7F9FB" }}
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <PropertiesSidebar />
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
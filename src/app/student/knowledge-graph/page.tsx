// ============================================
// 學生端 — Knowledge Graph（知識圖譜視覺化）
// DAG 顯示學習路徑、節點依賴關係、掌握度狀態
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';
import {
  GitBranch, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw,
  ChevronRight, Target, CheckCircle, Lock, Circle, Filter,
  BookOpen, MessageSquare, Headphones, PenTool, Mic, Type,
} from 'lucide-react';

interface KGNode {
  id: string; title: string; titleZh: string; skill: string;
  difficulty: number; cefr: string; hkdseLevel: string;
  prerequisites: string[]; successors: string[];
  learningObjectivesZh: string[];
  isMastered?: boolean; masteryScore?: number;
  isUnlocked?: boolean; isRecommended?: boolean;
}

interface KGEdge { source: string; target: string; type: string; }
interface KGGraph { nodes: KGNode[]; edges: KGEdge[]; }

const SKILL_COLORS: Record<string, string> = {
  grammar: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
  vocabulary: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  reading: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
  writing: 'border-violet-400 bg-violet-50 dark:bg-violet-900/20',
  listening: 'border-rose-400 bg-rose-50 dark:bg-rose-900/20',
  speaking: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20',
};

const SKILL_ICONS: Record<string, React.ReactNode> = {
  grammar: <Type className="w-3 h-3" />,
  vocabulary: <BookOpen className="w-3 h-3" />,
  reading: <BookOpen className="w-3 h-3" />,
  writing: <PenTool className="w-3 h-3" />,
  listening: <Headphones className="w-3 h-3" />,
  speaking: <Mic className="w-3 h-3" />,
};

export default function KnowledgeGraphPage() {
  const { t, language } = useT();
  const { userId } = useAppStore();
  const [graph, setGraph] = useState<KGGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterSkill, setFilterSkill] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    fetchGraph();
  }, [filterSkill]);

  async function fetchGraph() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filterSkill) params.set('skill', filterSkill);
      params.set('includeNodes', 'true');
      params.set('includeEdges', 'true');
      const res = await fetch(`/api/knowledge-graph/graph?${params}`);
      const json = await res.json();
      if (res.ok) {
        // Auto-load mastery data if student is logged in
        if (userId && json.nodes) {
          try {
            const masteryRes = await fetch(`/api/knowledge-graph/recommend-next`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ studentId: userId, limit: 100 }),
            });
            const masteryData = await masteryRes.json();
            if (masteryRes.ok && masteryData.recommendations) {
              const masteryMap = new Map<string, number>();
              masteryData.recommendations.forEach((r: { nodeId: string; masteryScore: number }) => {
                masteryMap.set(r.nodeId, r.masteryScore);
              });
              json.nodes = json.nodes.map((n: KGNode) => ({
                ...n,
                masteryScore: masteryMap.get(n.id),
                isMastered: (masteryMap.get(n.id) || 0) >= 80,
                isUnlocked: (masteryMap.get(n.id) || 0) >= 0,
              }));
            }
          } catch { /* silent — graph works without mastery */ }
        }
        setGraph(json);
      } else {
        setError(json.error || 'Failed to load knowledge graph');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const handleNodeClick = (node: KGNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  };

  // Simple grid layout — distribute nodes in columns by dependency depth
  function layoutNodes(nodes: KGNode[]): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const visited = new Set<string>();
    const depthMap = new Map<string, number>();

    function getDepth(id: string): number {
      if (depthMap.has(id)) return depthMap.get(id)!;
      if (visited.has(id)) return 0;
      visited.add(id);
      const node = nodes.find(n => n.id === id);
      if (!node || node.prerequisites.length === 0) {
        depthMap.set(id, 0);
        return 0;
      }
      const maxPrereq = Math.max(...node.prerequisites.map(p => getDepth(p)));
      const depth = maxPrereq + 1;
      depthMap.set(id, depth);
      return depth;
    }

    nodes.forEach(n => getDepth(n.id));

    // Group by depth
    const byDepth = new Map<number, KGNode[]>();
    nodes.forEach(n => {
      const d = depthMap.get(n.id) || 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n);
    });

    // Position each depth column
    const colGap = 220;
    const rowGap = 120;
    byDepth.forEach((depthNodes, depth) => {
      depthNodes.forEach((node, i) => {
        positions.set(node.id, {
          x: depth * colGap + 60,
          y: i * rowGap + 40,
        });
      });
    });

    return positions;
  }

  const MAX_COLUMNS = 8;

  return (
    <div className="max-w-full mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitBranch className="w-6 h-6" /> {language === 'en' ? 'Knowledge Graph' : '知識圖譜'}
        </h1>
        <p className="text-teal-100 text-sm mt-1">
          {language === 'en'
            ? 'Visualize your learning path, prerequisites, and skill mastery'
            : '視覺化你的學習路徑、前置知識與技能掌握度'}
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-sm border flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-gray-400" />
        <button onClick={() => setFilterSkill('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filterSkill ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
          全部
        </button>
        {['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'].map(skill => (
          <button key={skill} onClick={() => setFilterSkill(skill)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${filterSkill === skill ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {SKILL_ICONS[skill]} {skill}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setZoom(z => Math.max(30, z - 20))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 w-10 text-center">{zoom}%</span>
        <button onClick={() => setZoom(z => Math.min(200, z + 20))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={fetchGraph}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Graph Visualization */}
      {graph && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-auto" style={{ minHeight: '500px' }}>
          <div
            className="relative p-8"
            style={{
              width: `${Math.max(1200, (layoutNodes(graph.nodes).size > 0 ? Math.max(...Array.from(layoutNodes(graph.nodes).values()).map(p => p.x)) + 200 : 1200)) * zoom / 100}px`,
              minHeight: `${Math.max(400, (layoutNodes(graph.nodes).size > 0 ? Math.max(...Array.from(layoutNodes(graph.nodes).values()).map(p => p.y)) + 150 : 400)) * zoom / 100}px`,
            }}
          >
            {/* SVG edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {graph.edges.map((edge, i) => {
                const from = layoutNodes(graph.nodes).get(edge.source);
                const to = layoutNodes(graph.nodes).get(edge.target);
                if (!from || !to) return null;
                const x1 = (from.x + 80) * zoom / 100;
                const y1 = (from.y + 30) * zoom / 100;
                const x2 = (to.x) * zoom / 100;
                const y2 = (to.y + 30) * zoom / 100;
                return (
                  <line key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={edge.type === 'prerequisite' ? '#d4d4d8' : edge.type === 'reinforcement' ? '#a78bfa' : '#fcd34d'}
                    strokeWidth={1.5}
                    strokeDasharray={edge.type === 'extension' ? '4 2' : undefined}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#d4d4d8" />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {graph.nodes.map(node => {
              const pos = layoutNodes(graph.nodes).get(node.id);
              if (!pos) return null;
              const colors = SKILL_COLORS[node.skill] || 'border-gray-300 bg-gray-50 dark:bg-gray-700';
              return (
                <button
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className={`absolute p-3 rounded-xl border-2 shadow-sm transition-all hover:shadow-md hover:scale-105 cursor-pointer text-left ${colors} ${
                    selectedNode?.id === node.id ? 'ring-2 ring-teal-500 ring-offset-2' : ''
                  } ${node.isMastered ? 'opacity-80' : ''}`}
                  style={{
                    left: `${pos.x * zoom / 100}px`,
                    top: `${pos.y * zoom / 100}px`,
                    width: '160px',
                    zIndex: 10,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs">{SKILL_ICONS[node.skill]}</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate flex-1">
                      {language === 'en' ? node.title : node.titleZh}
                    </span>
                    {node.isMastered ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : node.isUnlocked === false ? (
                      <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span>{node.cefr}</span>
                    <span>•</span>
                    <span>Lv.{node.difficulty}</span>
                    {node.masteryScore !== undefined && (
                      <>
                        <span>•</span>
                        <span className={node.masteryScore >= 80 ? 'text-green-500' : node.masteryScore >= 50 ? 'text-amber-500' : 'text-red-500'}>
                          {node.masteryScore}%
                        </span>
                      </>
                    )}
                  </div>
                  {/* Mastery bar */}
                  {node.masteryScore !== undefined && (
                    <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                      <div
                        className={`h-1 rounded-full ${node.masteryScore >= 80 ? 'bg-green-500' : node.masteryScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${node.masteryScore}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {graph && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-gray-300" /> 前置依賴
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-violet-300" /> 強化關聯
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-amber-300" style={{ borderTop: '1.5px dashed #fcd34d' }} /> 延伸關聯
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-green-500" /> 已掌握
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-gray-400" /> 未解鎖
          </div>
        </div>
      )}

      {/* Node Detail Panel */}
      {selectedNode && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white">
              {language === 'en' ? selectedNode.title : selectedNode.titleZh}
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SKILL_COLORS[selectedNode.skill]}`}>
              {selectedNode.skill} · {selectedNode.cefr} · {selectedNode.hkdseLevel}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">學習目標</h4>
              <ul className="space-y-0.5">
                {selectedNode.learningObjectivesZh.map((obj, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                    <ChevronRight className="w-3 h-3 text-teal-500 mt-0.5 shrink-0" /> {obj}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">前置知識</h4>
              {selectedNode.prerequisites.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedNode.prerequisites.map(p => {
                    const prereqNode = graph?.nodes.find(n => n.id === p);
                    return (
                      <span key={p} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                        {language === 'en' ? (prereqNode?.title || p) : (prereqNode?.titleZh || p)}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-gray-400">無（基礎節點）</span>
              )}
              {selectedNode.successors.length > 0 && (
                <>
                  <h4 className="text-xs font-medium text-gray-500 mb-1 mt-2">後續知識</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.successors.map(s => {
                      const succNode = graph?.nodes.find(n => n.id === s);
                      return (
                        <span key={s} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 rounded text-xs text-teal-700 dark:text-teal-400">
                          {language === 'en' ? (succNode?.title || s) : (succNode?.titleZh || s)}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

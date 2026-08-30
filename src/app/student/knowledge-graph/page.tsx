// ============================================
// 學生端 — Knowledge Graph（知識圖譜視覺化）
// DAG 顯示學習路徑、節點依賴關係、掌握度狀態
// ============================================
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';
import {
  GitBranch, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw,
  ChevronRight, CheckCircle, Lock, Circle, Filter, Search,
  BookOpen, Headphones, PenTool, Mic, Type, Lightbulb, Clock,
} from 'lucide-react';

interface KGNode {
  id: string; title: string; titleZh: string; skill: string;
  difficulty: number; cefr: string; hkdseLevel: string;
  prerequisites: string[]; successors: string[];
  learningObjectives: string[]; learningObjectivesZh: string[];
  estimatedLearningTime?: number;
  commonMistakes?: { description: string; descriptionZh: string; severity: string }[];
  exampleQuestions?: { question: string; questionZh: string; answer: string; explanation: string }[];
  isMastered?: boolean; masteryScore?: number;
  isUnlocked?: boolean; isRecommended?: boolean;
}

interface KGEdge { source: string; target: string; type: string; }
interface KGGraph { nodes: KGNode[]; edges: KGEdge[]; }

interface NodePosition { x: number; y: number; }

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

const SKILL_LABELS: Record<string, { zh: string; en: string }> = {
  grammar: { zh: '文法', en: 'Grammar' },
  vocabulary: { zh: '詞彙', en: 'Vocabulary' },
  reading: { zh: '閱讀', en: 'Reading' },
  writing: { zh: '寫作', en: 'Writing' },
  listening: { zh: '聆聽', en: 'Listening' },
  speaking: { zh: '會話', en: 'Speaking' },
};

const SKILL_DOT_COLORS: Record<string, string> = {
  grammar: 'bg-blue-400',
  vocabulary: 'bg-emerald-400',
  reading: 'bg-amber-400',
  writing: 'bg-violet-400',
  listening: 'bg-rose-400',
  speaking: 'bg-cyan-400',
};

const GRADE_OPTIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

const EDGE_LABELS: Record<string, { zh: string; en: string }> = {
  prerequisite: { zh: '前置依賴', en: 'Prerequisite' },
  reinforcement: { zh: '強化關聯', en: 'Reinforcement' },
  extension: { zh: '延伸關聯', en: 'Extension' },
};

/**
 * Simple grid layout — distribute nodes in columns by dependency depth.
 * Uses a pre-built nodeMap for O(1) lookups instead of O(N) array.find().
 */
function computeLayout(
  nodes: KGNode[],
  nodeMap: Map<string, KGNode>,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const visited = new Set<string>();
  const depthMap = new Map<string, number>();

  function getDepth(id: string): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = nodeMap.get(id);
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

export default function KnowledgeGraphPage() {
  const { t, language } = useT();
  const { userId } = useAppStore();
  const [graph, setGraph] = useState<KGGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterSkill, setFilterSkill] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [zoom, setZoom] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('');

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

      // Parallel: graph + mastery loaded together via Promise.all()
      const fetchPromises: [Promise<Response>, Promise<Response> | null] = [
        fetch(`/api/knowledge-graph/graph?${params}`),
        null,
      ];
      if (userId) {
        fetchPromises[1] = fetch('/api/knowledge-graph/recommend-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: userId, limit: 100 }),
        });
      }

      const [graphRes, masteryRes] = await Promise.all(fetchPromises);
      const json = await graphRes.json();

      if (!graphRes.ok) {
        setError(json.error || (language === 'en' ? 'Failed to load knowledge graph' : '無法載入知識圖譜'));
        return;
      }

      // Merge mastery data from parallel request
      if (masteryRes) {
        try {
          const masteryData = await masteryRes.json();
          if (masteryData.recommendations) {
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
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setLoading(false);
    }
  }

  const handleNodeClick = useCallback((node: KGNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  // ── Memoized derivations (computed once when graph changes) ──

  // O(1) lookup: Map<nodeId, KGNode>
  const nodeMap = useMemo<Map<string, KGNode>>(() => {
    if (!graph) return new Map();
    const map = new Map<string, KGNode>();
    graph.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [graph]);

  // ── Focus mode: compute transitive dependency chain ──
  const focusedNodeIds = useMemo<Set<string>>(() => {
    if (!selectedNode || !nodeMap.size) return new Set();
    const chain = new Set<string>();
    const visited = new Set<string>();

    function walkUp(id: string) {
      if (visited.has(id)) return;
      visited.add(id);
      chain.add(id);
      const node = nodeMap.get(id);
      node?.prerequisites.forEach(p => walkUp(p));
    }
    function walkDown(id: string) {
      if (visited.has(id)) return;
      visited.add(id);
      chain.add(id);
      const node = nodeMap.get(id);
      node?.successors.forEach(s => walkDown(s));
    }

    walkUp(selectedNode.id);
    visited.clear();
    walkDown(selectedNode.id);
    return chain;
  }, [selectedNode, nodeMap]);

  // Layout: computed once per graph update (was called 4+ times per render)
  const layout = useMemo<Map<string, NodePosition>>(() => {
    if (!graph) return new Map();
    return computeLayout(graph.nodes, nodeMap);
  }, [graph, nodeMap]);

  // Canvas dimensions: derived once from layout
  const canvasDimensions = useMemo(() => {
    let maxX = 1200;
    let maxY = 400;
    if (layout.size > 0) {
      for (const pos of layout.values()) {
        if (pos.x + 200 > maxX) maxX = pos.x + 200;
        if (pos.y + 150 > maxY) maxY = pos.y + 150;
      }
    }
    return { width: maxX, height: maxY };
  }, [layout]);

  // Pre-compute edge coordinates (avoids repeated zoom multiplication in render)
  const edgeLines = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .map((edge, i) => {
        const from = layout.get(edge.source);
        const to = layout.get(edge.target);
        if (!from || !to) return null;
        const isFocused = focusedNodeIds.size > 0 &&
          focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target);
        return {
          key: i,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          x1: (from.x + 80) * zoom / 100,
          y1: (from.y + 30) * zoom / 100,
          x2: to.x * zoom / 100,
          y2: (to.y + 30) * zoom / 100,
          stroke: edge.type === 'prerequisite' ? '#d4d4d8' : edge.type === 'reinforcement' ? '#a78bfa' : '#fcd34d',
          dashArray: edge.type === 'extension' ? '4 2' : undefined,
          opacity: focusedNodeIds.size > 0 ? (isFocused ? 1 : 0.08) : 1,
        };
      })
      .filter(Boolean) as { key: number; source: string; target: string; type: string; x1: number; y1: number; x2: number; y2: number; stroke: string; dashArray?: string; opacity: number }[];
  }, [graph, layout, zoom, focusedNodeIds]);

  // Pre-compute node render data (with search + grade filters)
  const nodeRenderData = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .map(node => {
        const pos = layout.get(node.id);
        if (!pos) return null;
        const colors = SKILL_COLORS[node.skill] || 'border-gray-300 bg-gray-50 dark:bg-gray-700';

        // Search filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase().trim();
          const matchesEn = node.title.toLowerCase().includes(term);
          const matchesZh = node.titleZh.includes(term);
          const matchesSkill = SKILL_LABELS[node.skill]?.zh.includes(term) ||
            SKILL_LABELS[node.skill]?.en.toLowerCase().includes(term);
          if (!matchesEn && !matchesZh && !matchesSkill) return null;
        }

        // Grade filter
        if (gradeFilter && node.hkdseLevel !== gradeFilter) return null;

        return { node, pos, colors };
      })
      .filter(Boolean) as { node: KGNode; pos: NodePosition; colors: string }[];
  }, [graph, layout, searchTerm, gradeFilter]);

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
          {language === 'en' ? 'All' : '全部'}
        </button>
        {['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'].map(skill => (
          <button key={skill} onClick={() => setFilterSkill(skill)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${filterSkill === skill ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {SKILL_ICONS[skill]} {language === 'en' ? SKILL_LABELS[skill].en : SKILL_LABELS[skill].zh}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={language === 'en' ? 'Search skills…' : '搜尋技能…'}
            className="pl-7 pr-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-36 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        {/* Grade filter */}
        <select
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">{language === 'en' ? 'All Grades' : '全部年級'}</option>
          {GRADE_OPTIONS.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {/* Active filter count badge */}
        {(searchTerm || gradeFilter) && (
          <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-[10px] font-medium">
            {nodeRenderData.length} {language === 'en' ? 'nodes' : '個節點'}
          </span>
        )}
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
              width: `${canvasDimensions.width * zoom / 100}px`,
              minHeight: `${canvasDimensions.height * zoom / 100}px`,
            }}
          >
            {/* SVG edges — with tooltips and focus mode dimming */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {edgeLines.map(edge => (
                <line key={edge.key}
                  x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                  stroke={edge.stroke}
                  strokeWidth={edge.opacity < 0.2 ? 0.5 : 1.5}
                  strokeDasharray={edge.dashArray}
                  opacity={edge.opacity}
                  markerEnd="url(#arrowhead)"
                >
                  <title>{language === 'en' ? EDGE_LABELS[edge.type]?.en : EDGE_LABELS[edge.type]?.zh}: {edge.source} → {edge.target}</title>
                </line>
              ))}
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#d4d4d8" />
                </marker>
              </defs>
            </svg>

            {/* Nodes — with focus mode dimming and hover tooltip */}
            {nodeRenderData.map(({ node, pos, colors }) => {
              const isFocused = focusedNodeIds.size === 0 || focusedNodeIds.has(node.id);
              const isDimmed = focusedNodeIds.size > 0 && !isFocused;
              const tooltipText = node.learningObjectivesZh?.[0] || node.learningObjectives?.[0] || '';
              return (
              <button
                key={node.id}
                onClick={() => handleNodeClick(node)}
                title={tooltipText}
                className={`absolute p-3 rounded-xl border-2 shadow-sm transition-all hover:shadow-md hover:scale-105 cursor-pointer text-left ${colors} ${
                  selectedNode?.id === node.id ? 'ring-2 ring-teal-500 ring-offset-2 z-20' : ''
                } ${node.isMastered ? 'opacity-80' : ''} ${isDimmed ? 'opacity-20 saturate-0' : ''}`}
                style={{
                  left: `${pos.x * zoom / 100}px`,
                  top: `${pos.y * zoom / 100}px`,
                  width: '160px',
                  zIndex: selectedNode?.id === node.id ? 20 : isDimmed ? 5 : 10,
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
                  <span title={language === 'en' ? 'CEFR — platform reference mapping (not an official EDB/HKEAA table)' : 'CEFR 平台參考對照（非官方對照表）'}>{node.cefr}</span>
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
                {/* Recommended pulse indicator */}
                {node.isRecommended && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full animate-pulse" />
                )}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {graph && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border space-y-2">
          {/* Edge types */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-gray-300" /> {language === 'en' ? 'Prerequisite' : '前置依賴'}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-violet-300" /> {language === 'en' ? 'Reinforcement' : '強化關聯'}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-amber-300" style={{ borderTop: '1.5px dashed #fcd34d' }} /> {language === 'en' ? 'Extension' : '延伸關聯'}
            </div>
            <div className="w-px h-3 bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-green-500" /> {language === 'en' ? 'Mastered' : '已掌握'}
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-gray-400" /> {language === 'en' ? 'Locked' : '未解鎖'}
            </div>
          </div>
          {/* Skill colors */}
          <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-gray-400">
            <span className="font-medium">{language === 'en' ? 'Skills:' : '技能：'}</span>
            {['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'].map(skill => (
              <span key={skill} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${SKILL_DOT_COLORS[skill]}`} />
                {language === 'en' ? SKILL_LABELS[skill].en : SKILL_LABELS[skill].zh}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Node Detail Panel — enriched with mistakes, examples, and learning time */}
      {selectedNode && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              {language === 'en' ? selectedNode.title : selectedNode.titleZh}
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SKILL_COLORS[selectedNode.skill]}`} title={language === 'en' ? 'CEFR/HKDSE — platform reference mapping (not an official EDB/HKEAA table)' : 'CEFR/HKDSE 平台參考對照（非官方對照表）'}>
              {SKILL_LABELS[selectedNode.skill]?.[language === 'en' ? 'en' : 'zh'] || selectedNode.skill} · {selectedNode.cefr} · {selectedNode.hkdseLevel}
            </span>
          </div>

          {/* Quick stats row */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {selectedNode.estimatedLearningTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {language === 'en' ? '~' + selectedNode.estimatedLearningTime + ' min' : '約' + selectedNode.estimatedLearningTime + ' 分鐘'}
              </span>
            )}
            <span>Lv.{selectedNode.difficulty}</span>
            {selectedNode.masteryScore !== undefined && (
              <span className={selectedNode.masteryScore >= 80 ? 'text-green-500 font-medium' : selectedNode.masteryScore >= 50 ? 'text-amber-500 font-medium' : 'text-red-500 font-medium'}>
                {language === 'en' ? 'Mastery: ' : '掌握度：'}{selectedNode.masteryScore}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Learning Objectives' : '學習目標'}</h4>
              <ul className="space-y-0.5">
                {(selectedNode.learningObjectivesZh?.length ? selectedNode.learningObjectivesZh : selectedNode.learningObjectives || []).map((obj, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                    <ChevronRight className="w-3 h-3 text-teal-500 mt-0.5 shrink-0" /> {obj}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Prerequisites' : '前置知識'}</h4>
              {selectedNode.prerequisites.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedNode.prerequisites.map(p => {
                    const prereqNode = nodeMap.get(p);
                    return (
                      <button key={p} onClick={() => prereqNode && handleNodeClick(prereqNode)}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 hover:bg-teal-100 dark:hover:bg-teal-900/30 rounded text-xs text-gray-600 dark:text-gray-400 transition-colors">
                        {language === 'en' ? (prereqNode?.title || p) : (prereqNode?.titleZh || p)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-gray-400">{language === 'en' ? 'None (foundation node)' : '無（基礎節點）'}</span>
              )}
              {selectedNode.successors.length > 0 && (
                <>
                  <h4 className="text-xs font-medium text-gray-500 mb-1 mt-2">{language === 'en' ? 'Successors' : '後續知識'}</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.successors.map(s => {
                      const succNode = nodeMap.get(s);
                      return (
                        <button key={s} onClick={() => succNode && handleNodeClick(succNode)}
                          className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded text-xs text-teal-700 dark:text-teal-400 transition-colors">
                          {language === 'en' ? (succNode?.title || s) : (succNode?.titleZh || s)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Common Mistakes */}
          {selectedNode.commonMistakes && selectedNode.commonMistakes.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-400" />
                {language === 'en' ? 'Common Mistakes' : '常見錯誤'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedNode.commonMistakes.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 bg-red-50 dark:bg-red-900/10 rounded-lg p-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      m.severity === 'critical' ? 'bg-red-500' : m.severity === 'major' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />
                    <div>
                      <p className="text-xs text-red-700 dark:text-red-300">{language === 'en' ? m.description : m.descriptionZh}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Example Questions */}
          {selectedNode.exampleQuestions && selectedNode.exampleQuestions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-amber-400" />
                {language === 'en' ? 'Example Questions' : '範例題目'}
              </h4>
              <div className="space-y-2">
                {selectedNode.exampleQuestions.map((eq, i) => (
                  <div key={i} className="bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                      {language === 'en' ? eq.question : eq.questionZh}
                    </p>
                    {eq.answer && (
                      <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                        {eq.answer}
                      </p>
                    )}
                    {eq.explanation && (
                      <p className="text-xs text-gray-500 mt-0.5">{eq.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

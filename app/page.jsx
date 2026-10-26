'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'threadscape-knowledge-v2';
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const initialNode = {
  id: 'root', parentId: null, title: '大模型幻觉', createdAt: 0,
  messages: [
    { id: 'welcome-q', role: 'user', content: '为什么大模型会产生“幻觉”？' },
    { id: 'welcome-a', role: 'assistant', content: '大模型通过预测下一个最可能出现的词元生成内容，它优化的是语言上的合理性，而不是事实真实性。训练中的【代理目标】、有限的【训练数据】、不完整的【上下文】与带随机性的【概率采样】，都可能让模型产生流畅但错误的回答。' },
  ],
};

function extractTerms(text) {
  return [...text.matchAll(/【([^】]{1,30})】/g)].map(match => match[1].trim()).filter(Boolean);
}

function TermText({ text, onTerm }) {
  const parts = text.split(/(【[^】]+】)/g);
  return <>{parts.map((part, index) => part.startsWith('【') && part.endsWith('】')
    ? <button className="term" key={`${part}-${index}`} onClick={() => onTerm(part.slice(1, -1))}>{part.slice(1, -1)}</button>
    : <span key={index}>{part}</span>)}</>;
}

function TreeBranch({ node, nodes, activeId, depth = 0, onSelect }) {
  const children = nodes.filter(item => item.parentId === node.id);
  return <div className="tree-branch">
    <button className={`tree-node ${activeId === node.id ? 'active' : ''}`} style={{ paddingLeft: `${10 + depth * 12}px` }} onClick={() => onSelect(node.id)}>
      <span className={depth === 0 ? 'tree-root-dot' : 'tree-child-mark'}>{depth === 0 ? '' : '↳'}</span><span>{node.title}</span>
    </button>
    {children.map(child => <TreeBranch key={child.id} node={child} nodes={nodes} activeId={activeId} depth={depth + 1} onSelect={onSelect} />)}
  </div>;
}

export default function Home() {
  const [nodes, setNodes] = useState([initialNode]);
  const [activeId, setActiveId] = useState('root');
  const [queue, setQueue] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [graphOpen, setGraphOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/state'); const data = await response.json();
        if (!response.ok) throw new Error(data.error || '数据库读取失败');
        if (data.state?.nodes?.length) {
          const saved = data.state; setNodes(saved.nodes); setActiveId(saved.activeId || saved.nodes[0].id); setQueue(saved.queue || []);
        } else {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) { const saved = JSON.parse(raw); if (saved.nodes?.length) { setNodes(saved.nodes); setActiveId(saved.activeId || saved.nodes[0].id); setQueue(saved.queue || []); } }
        }
      } catch (reason) { setError(reason instanceof Error ? reason.message : '数据库连接失败'); }
      finally { setReady(true); }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes, activeId, queue }) })
        .then(async response => { if (!response.ok) { const data = await response.json(); throw new Error(data.error || '数据库保存失败'); } localStorage.removeItem(STORAGE_KEY); })
        .catch(reason => setError(reason instanceof Error ? reason.message : '数据库保存失败'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [nodes, activeId, queue, ready]);

  const active = nodes.find(node => node.id === activeId) || nodes[0];
  const children = nodes.filter(node => node.parentId === active.id);
  const path = useMemo(() => {
    const result = []; let current = active;
    while (current) { result.unshift(current); current = nodes.find(node => node.id === current?.parentId); }
    return result;
  }, [active, nodes]);
  const allTerms = useMemo(() => Array.from(new Set(nodes.flatMap(node => node.messages.filter(m => m.role === 'assistant').flatMap(m => extractTerms(m.content))))), [nodes]);

  const openTerm = async (term) => {
    const existing = nodes.find(node => node.parentId === active.id && node.title === term);
    if (existing) { setActiveId(existing.id); return; }
    const child = { id: uid(), parentId: active.id, title: term, createdAt: Date.now(), messages: [], sources: [] };
    setNodes(current => [...current, child]); setActiveId(child.id); setInput(`请详细解释“${term}”，并说明它与“${active.title}”的关系。`);
    try { const response = await fetch(`/api/sources?q=${encodeURIComponent(term)}`); const data = await response.json(); setNodes(current => current.map(node => node.id === child.id ? { ...node, sources: data.sources || [] } : node)); } catch { /* sources are optional */ }
  };

  const captureSelection = () => {
    const selection = window.getSelection(); const text = selection?.toString().trim() || '';
    if (text.length > 1 && text.length <= 40) setSelectedText(text.replace(/[【】]/g, ''));
  };

  const send = async (preset) => {
    const question = (preset ?? input).trim(); if (!question || loading) return;
    const nodeId = active.id; const userMessage = { id: uid(), role: 'user', content: question }; const assistantId = uid();
    const history = [...active.messages, userMessage].map(({ role, content }) => ({ role, content }));
    setNodes(current => current.map(node => node.id === nodeId ? { ...node, messages: [...node.messages, userMessage, { id: assistantId, role: 'assistant', content: '' }] } : node));
    setInput(''); setError(''); setLoading(true); abortRef.current = new AbortController();
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }), signal: abortRef.current.signal });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || '模型请求失败'); }
      if (!response.body) throw new Error('浏览器不支持流式响应');
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true });
        setNodes(current => current.map(node => node.id === nodeId ? { ...node, messages: node.messages.map(message => message.id === assistantId ? { ...message, content: message.content + chunk } : message) } : node));
      }
    } catch (reason) {
      if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : '请求失败');
    } finally { setLoading(false); abortRef.current = null; }
  };

  const addQueue = () => { const value = input.trim(); if (value && !queue.includes(value)) { setQueue(current => [...current, value]); setInput(''); } };
  const reset = () => { if (!confirm('确定开始新的探索？当前本地知识树会被清空。')) return; setNodes([{ ...initialNode, messages: [] }]); setActiveId('root'); setQueue([]); setInput(''); };
  const rename = () => { const title = prompt('重命名节点', active.title)?.trim(); if (title) setNodes(current => current.map(node => node.id === active.id ? { ...node, title } : node)); };
  const removeNode = () => {
    if (!active.parentId || !confirm(`删除“${active.title}”及其所有子分支？`)) return;
    const ids = new Set([active.id]); let changed = true;
    while (changed) { changed = false; nodes.forEach(node => { if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true; } }); }
    setActiveId(active.parentId); setNodes(current => current.filter(node => !ids.has(node.id)));
  };

  return <main className="app-shell" onMouseDown={() => selectedText && setSelectedText('')}>
    <aside className="sidebar">
      <div className="brand"><i>∿</i>Threadscape</div><button className="new-chat" onClick={reset}>＋ 新建探索 <kbd>⌘ K</kbd></button>
      <nav className="tree"><label>当前知识树</label><TreeBranch node={nodes.find(n => n.parentId === null) || nodes[0]} nodes={nodes} activeId={active.id} onSelect={setActiveId} />
        <label className="recent-label">节点管理</label><button className="recent" onClick={rename}>✎　重命名当前节点</button>{active.parentId && <button className="recent danger" onClick={removeNode}>×　删除当前分支</button>}
      </nav><div className="profile"><span>DB</span><div><b>SQLite 知识空间</b><small>{nodes.length} 个节点 · 后端保存</small></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div>{path.map((node, index) => <span key={node.id}>{index > 0 && '　/　'}<button onClick={() => setActiveId(node.id)}>{node.title}</button></span>)}</div><nav><span>✓ 已保存</span><button onClick={() => setGraphOpen(!graphOpen)}>⌘</button><button className="share" onClick={() => navigator.clipboard?.writeText(location.href)}>复制链接</button></nav></header>
      <div className={graphOpen ? 'content-grid' : 'content-grid full'}><article className="conversation">
        <div className="branch-meta"><span>{active.parentId ? `分支 · ${path.length - 1} 级` : '主对话'}</span>{active.parentId && <button onClick={() => setActiveId(active.parentId!)}>← 返回父节点</button>}</div>
        <h1>{active.title}</h1>
        {!active.messages.length && <div className="empty-state"><span>✦</span><h2>从这个概念开始探索</h2><p>输入问题，AI 会用【术语】标出值得继续深入的概念。</p><button onClick={() => void send(`请系统解释“${active.title}”，标出关键专业术语。`)}>生成概念导览</button></div>}
        {active.messages.map(message => message.role === 'user'
          ? <div className="user-card live-message" key={message.id}><span>你</span><p>{message.content}</p></div>
          : <div className="assistant live-message" key={message.id}><span className="ai">AI</span><div className="answer" onMouseUp={captureSelection}><label>KNOWLEDGE ASSISTANT</label><p className="model-answer">{message.content ? <TermText text={message.content} onTerm={term => void openTerm(term)} /> : <span className="thinking">正在组织答案 •••</span>}</p></div></div>)}
        {selectedText && <div className="selection-action" onMouseDown={event => event.stopPropagation()}><span>已选择“{selectedText}”</span><button onClick={() => { const term = selectedText; setSelectedText(''); void openTerm(term); }}>创建知识分支</button></div>}
        {error && <div className="api-error">连接失败：{error}</div>}
        {children.length > 0 && <div className="child-strip"><b>由此展开</b>{children.map(child => <button key={child.id} onClick={() => setActiveId(child.id)}>↳ {child.title}</button>)}</div>}
        {!!active.sources?.length && <section className="sources"><header><b>客观资料</b><span>用于交叉验证当前概念</span></header>{active.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><p>{source.excerpt || '打开资料查看详细内容'}</p><small>维基百科 ↗</small></a>)}</section>}
        {queue.length > 0 && <div className="queue"><header><b>稍后探索</b><small>{queue.length} 个问题</small></header>{queue.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p><button className="ask-queued" onClick={() => { setQueue(q => q.filter(x => x !== item)); void send(item); }}>提问</button><button onClick={() => setQueue(q => q.filter(x => x !== item))}>×</button></div>)}</div>}
        <div className="composer"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={`继续探索“${active.title}”…`} /><footer><button aria-label="添加">＋</button><span>Enter 发送 · Shift + Enter 换行</span><button onClick={addQueue}>加入队列</button>{loading ? <button className="send stop" onClick={() => abortRef.current?.abort()}>■</button> : <button className="send" onClick={() => void send()}>↑</button>}</footer></div>
      </article>
      {graphOpen && <aside className="graph-panel"><header><div><b>知识图谱</b><small>随探索自动生长</small></div><button onClick={() => setGraphOpen(false)}>×</button></header><div className="dynamic-graph">
        {nodes.slice(0, 18).map((node, index) => { const angle = index * 2.399; const radius = index === 0 ? 0 : 22 + Math.floor(index / 6) * 14; const left = 50 + Math.cos(angle) * radius; const top = 48 + Math.sin(angle) * radius; return <button key={node.id} className={`dynamic-node ${node.id === active.id ? 'selected' : ''} ${node.parentId ? '' : 'graph-root'}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => setActiveId(node.id)}>{node.title}</button>; })}
      </div><div className="graph-stats"><span><b>{nodes.length}</b> 节点</span><span><b>{Math.max(0, nodes.length - 1)}</b> 关系</span><span><b>{allTerms.length}</b> 术语</span></div><footer>点击节点切换对话 · 最多显示前 18 个节点</footer></aside>}
      </div>
    </section>
  </main>;
}

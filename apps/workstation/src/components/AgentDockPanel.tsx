import React, { useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';

export interface AgentProposalCard {
  proposal_id: string;
  title: string;
  component_id: string;
  refdes: string;
  locked: boolean;
  before_x_nm: number;
  before_y_nm: number;
  after_x_nm: number;
  after_y_nm: number;
  dx_nm: number;
  dy_nm: number;
  status?: 'pending' | 'accepted' | 'rejected' | 'conflict';
  conflictMessage?: string;
}

export const AgentDockPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('Move L1 +1.00mm X to tighten SW_NODE loop');
  const [streaming, setStreaming] = useState(false);
  const [thoughts, setThoughts] = useState<string[]>([
    'Offline agent ready ($0 deterministic_offline or loopback 127.0.0.1 Ollama).',
  ]);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const [proposals, setProposals] = useState<AgentProposalCard[]>([]);

  const submitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setThoughts([`Prompt: ${prompt.trim()}`]);
    setToolCalls([]);

    try {
      const res = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok || !res.body) {
        let errText = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errText = String(errJson.error);
        } catch {
          /* Non-JSON body */
        }
        if (res.status === 403) {
          setThoughts((prev) => [...prev, errText]);
          return;
        }
        throw new Error(errText);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const payload = JSON.parse(line.slice(6));
            if (currentEvent === 'thought_delta' && payload.text) {
              setThoughts((prev) => [...prev, String(payload.text)]);
            } else if (currentEvent === 'tool_call') {
              setToolCalls((prev) => [...prev, `${payload.verb}(${JSON.stringify(payload.args)})`]);
            } else if (currentEvent === 'tool_result') {
              setThoughts((prev) => [...prev, `[${payload.verb}] ${payload.summary}`]);
            } else if (currentEvent === 'proposal_card') {
              const card: AgentProposalCard = { ...payload, status: 'pending' };
              setProposals((prev) => [card, ...prev]);
              globalCrossProbeBus.select([card.refdes], 'agent');
            }
            currentEvent = 'message';
          }
        }
      }
    } catch {
      const offlinePreview: AgentProposalCard = {
        proposal_id: `offline-${Date.now()}`,
        title: 'Offline preview: Shift U2 +1.00 mm X',
        component_id: 'offline-u2',
        refdes: 'U2',
        locked: true,
        before_x_nm: 32_000_000,
        before_y_nm: 24_000_000,
        after_x_nm: 33_000_000,
        after_y_nm: 24_000_000,
        dx_nm: 1_000_000,
        dy_nm: 0,
        status: 'pending',
      };
      setThoughts((prev) => [
        ...prev,
        'Daemon SSE unreachable; loaded fail-closed local preview proposal (U2 human-locked).',
      ]);
      setProposals((prev) => [offlinePreview, ...prev]);
    } finally {
      setStreaming(false);
    }
  };

  const resolveProposal = async (proposalId: string, action: 'accept' | 'reject') => {
    try {
      const res = await fetch(`/api/v1/agent/proposals/${proposalId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json();
      if (res.status === 409) {
        setProposals((prev) =>
          prev.map((p) =>
            p.proposal_id === proposalId
              ? { ...p, status: 'conflict', conflictMessage: body.message || 'KERNEL_LOCK_VIOLATION' }
              : p
          )
        );
        return;
      }
      if (!res.ok) {
        setThoughts((prev) => [...prev, `Proposal error (${res.status}): ${body.error || body.message || 'failed'}`]);
        return;
      }
      setProposals((prev) =>
        prev.map((p) =>
          p.proposal_id === proposalId
            ? { ...p, status: action === 'accept' ? 'accepted' : 'rejected' }
            : p
        )
      );
    } catch {
      setProposals((prev) =>
        prev.map((p) =>
          p.proposal_id === proposalId
            ? {
                ...p,
                status: p.locked && action === 'accept' ? 'conflict' : action === 'accept' ? 'accepted' : 'rejected',
                conflictMessage:
                  p.locked && action === 'accept'
                    ? 'KERNEL_LOCK_VIOLATION: Agent cannot mutate human-locked entity (offline guard)'
                    : undefined,
              }
            : p
        )
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <form onSubmit={submitPrompt} style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          aria-label="Ask AI Agent"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt agent (e.g. Move L1 or Move U2)..."
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: 'var(--vd-bg-canvas)',
            color: 'var(--vd-text-primary)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 4,
            fontSize: 12,
          }}
        />
        <button type="submit" className="vd-btn vd-btn-agent" disabled={streaming}>
          {streaming ? 'Streaming...' : 'Run'}
        </button>
      </form>

      <div className="vd-metric" style={{ color: 'var(--vd-text-secondary)', fontSize: 11 }}>
        {thoughts.map((line, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            {line}
          </div>
        ))}
        {toolCalls.map((call, i) => (
          <div key={`tc-${i}`} style={{ color: 'var(--vd-dlp-airgap)', marginBottom: 3 }}>
            MCP v2: {call}
          </div>
        ))}
      </div>

      {proposals.map((card) => (
        <div
          key={card.proposal_id}
          data-testid={`proposal-card-${card.refdes}`}
          style={{
            border: `1px solid ${
              card.status === 'conflict' || card.locked ? 'var(--vd-human-lock)' : 'var(--vd-agent-pulse)'
            }`,
            backgroundColor: 'var(--vd-bg-canvas)',
            borderRadius: 6,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{card.title}</strong>
            <span className="vd-metric" style={{ color: card.locked ? 'var(--vd-human-lock)' : 'var(--vd-pass)' }}>
              {card.locked ? 'locked=1' : 'unlocked'}
            </span>
          </div>
          <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-text-secondary)' }}>
            {card.refdes}: ({card.before_x_nm} nm, {card.before_y_nm} nm) → ({card.after_x_nm} nm, {card.after_y_nm} nm)
          </div>

          {card.status === 'conflict' && (
            <div
              role="alert"
              style={{
                padding: 6,
                borderRadius: 4,
                border: '1px solid var(--vd-human-lock)',
                color: 'var(--vd-human-lock)',
                backgroundColor: 'var(--vd-bg-elevated)',
                fontSize: 11,
              }}
            >
              {card.conflictMessage}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="vd-btn vd-btn-primary"
              disabled={card.status === 'accepted' || card.status === 'rejected'}
              onClick={() => void resolveProposal(card.proposal_id, 'accept')}
            >
              {card.status === 'accepted' ? 'Applied' : 'Accept'}
            </button>
            <button
              type="button"
              className="vd-btn"
              disabled={card.status === 'accepted' || card.status === 'rejected'}
              onClick={() => void resolveProposal(card.proposal_id, 'reject')}
            >
              {card.status === 'rejected' ? 'Rejected' : 'Reject'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

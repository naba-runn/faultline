import { useState, useEffect, useRef } from 'react';
import api from '../api/axios.js';

// Task 26: subscribes a component to a project's live event stream.
// Mints a fresh short-lived ticket (POST /projects/:id/sse-ticket,
// JWT-authed via the normal axios interceptor) and opens an
// EventSource against GET /sse/stream?ticket=... — see
// docs/DECISIONS.md's "Task 26" entry for why a ticket exists at all
// (native EventSource can't send an Authorization header).
//
// Reconnect handling is deliberately NOT left to the browser's native
// EventSource auto-reconnect: that retries the exact same URL, and
// our ticket is single-use and ~30s-lived, so a native retry would
// just fail forever with the same dead ticket after the first drop.
// Instead, on any error this closes the dead connection, waits a short
// backoff, mints a brand-new ticket, and opens a brand-new
// EventSource.
//
// Returns { connected } (booked to a small "Live" indicator in the
// pages that use this) so a real-time feature has some visible sign
// of actually being real-time — otherwise a push happening correctly
// in the background is functionally invisible and effectively
// undemonstrable.
const RECONNECT_DELAY_MS = 3000;

export function useProjectSSE(projectId, onEvent) {
  const [connected, setConnected] = useState(false);

  // Ref, not a direct dependency — so passing a fresh inline arrow
  // function from the caller on every render doesn't tear down and
  // reopen the connection each time; only a real projectId change
  // should do that.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return undefined;

    let cancelled = false;
    let eventSource = null;
    let reconnectTimer = null;

    async function connect() {
      if (cancelled) return;

      let ticket;
      try {
        const res = await api.post(`/projects/${projectId}/sse-ticket`);
        ticket = res.data.data.ticket;
      } catch (err) {
        // Minting failed — back off and retry rather than giving up
        // permanently. Live push failing is not fatal to the page;
        // the surrounding UI still works via its normal manual
        // refetch, so this stays silent rather than surfacing an
        // error banner for what's an enhancement, not a core feature.
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
        return;
      }

      if (cancelled) return;

      const streamUrl = `${api.defaults.baseURL}/sse/stream?ticket=${ticket}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          onEventRef.current(type, payload);
        } catch (err) {
          // Malformed message from the server side — ignore rather
          // than crash the stream handler over one bad event.
        }
      };

      eventSource.onerror = () => {
        if (!cancelled) setConnected(false);
        eventSource.close();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      setConnected(false);
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [projectId]);

  return { connected };
}
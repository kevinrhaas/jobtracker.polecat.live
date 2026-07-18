// -----------------------------------------------------------------------
// sources/index.js — the DataSource registry.
//
// One place that knows every backend. Adding a new one (Supabase, Neon, D1,
// …) is: write an adapter to the sources/base.js contract and add it here.
// Everything else — the picker, connect flow, sync.js — is generic over this.
// -----------------------------------------------------------------------

import { localSource } from './local.js';
import { tursoSource } from './turso.js';

// Order = order shown in the picker. Local first (the default), then remotes.
export const SOURCES = [ localSource, tursoSource ];

// Just the connectable remotes (Local is the always-present fallback).
export const REMOTE_SOURCES = SOURCES.filter(s=>!s.local);

export function sourceById(id){ return SOURCES.find(s=>s.id===id) || null; }

export { localSource };

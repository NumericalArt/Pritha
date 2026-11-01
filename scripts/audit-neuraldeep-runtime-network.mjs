#!/usr/bin/env node
// Reviewed replacement for the pinned NeuralDeep proxy-only live audit.
// Direct sockets, foreign loopback and tool subprocesses need OS evidence.
import {providerBoundaryAuditCli} from './lib/provider-boundary-audit.mjs';
providerBoundaryAuditCli('network');

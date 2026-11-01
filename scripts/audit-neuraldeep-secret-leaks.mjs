#!/usr/bin/env node
// Reviewed replacement for the pinned NeuralDeep credential scanner. By default
// no real key is read; explicit scope and synthetic evidence prevent cross-profile claims.
import {providerBoundaryAuditCli} from './lib/provider-boundary-audit.mjs';
providerBoundaryAuditCli('secrets');

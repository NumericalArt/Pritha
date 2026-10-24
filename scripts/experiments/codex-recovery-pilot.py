#!/usr/bin/env python3
"""Explicit live, synthetic Codex recovery pilot. No production lifecycle actions.

Run with --run-dir under the instance's external state root. The MCP fixture
can write only one synthetic receipt in that directory; it has no credentials,
network, shell or arbitrary path API. Never use it as a production MCP server.
"""
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def fixture_server(run):
    lock = threading.Lock()
    cancelled = {}

    def send(value):
        with lock:
            print(json.dumps(value), flush=True)

    def call(message):
        rid, p = message["id"], message["params"]
        name, args = p.get("name"), p.get("arguments", {})
        event = threading.Event()
        cancelled[rid] = event
        if name == "trial_receipt" and args == {"key": "synthetic-recovery-01", "value": 7}:
            with lock:
                path = run / "receipt.json"
                state = json.loads(path.read_text()) if path.exists() else {"effect_count": 0, "requests": 0}
                state["requests"] += 1
                if state["effect_count"] == 0:
                    state.update({"effect_count": 1, "key": args["key"], "value": 7})
                save(path, state)
            result = {"receipt": state["key"], "value": 7, "effect_count": state["effect_count"]}
        elif name == "trial_wait" and args == {}:
            save(run / "waiting.json", {"waiting": True})
            event.wait(45)
            result = {"cancelled": event.is_set()}
        else:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32602, "message": "Fixture allowlist rejected request"}})
            return
        send({"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": json.dumps(result)}], "isError": False}})

    for line in sys.stdin:
        try:
            m = json.loads(line)
            method = m.get("method")
            if method == "initialize":
                send({"jsonrpc": "2.0", "id": m["id"], "result": {"protocolVersion": m["params"]["protocolVersion"], "capabilities": {"tools": {}}, "serverInfo": {"name": "pritha-synthetic-recovery", "version": "1.0"}}})
            elif method == "tools/list":
                tools = [
                    {"name": "trial_receipt", "description": "Record or read back ONE synthetic event idempotently. Only the fixed key and value are allowed.", "inputSchema": {"type": "object", "properties": {"key": {"type": "string", "enum": ["synthetic-recovery-01"]}, "value": {"type": "integer", "enum": [7]}}, "required": ["key", "value"], "additionalProperties": False}},
                    {"name": "trial_wait", "description": "Wait at the synthetic interruption checkpoint. No arguments, no external effects.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}}]
                send({"jsonrpc": "2.0", "id": m["id"], "result": {"tools": tools}})
            elif method == "tools/call":
                threading.Thread(target=call, args=(m,), daemon=True).start()
            elif method == "notifications/cancelled":
                cancelled.get(m.get("params", {}).get("requestId"), threading.Event()).set()
            elif "id" in m:
                send({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32601, "message": "Unsupported fixture method"}})
        except (ValueError, KeyError):
            continue


class Client:
    def __init__(self, binary, run):
        self.events = []
        self.inbox = queue.Queue()
        self.next_id = 1
        self.run = run
        self.stderr = (run / ("app-server-" + str(time.time_ns()) + ".err")).open("w")
        env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "TMPDIR", "CODEX_HOME")}
        self.proc = subprocess.Popen([binary, "app-server", "--listen", "stdio://"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=self.stderr, text=True, env=env, cwd=run / "project")
        def read():
            for line in self.proc.stdout:
                try:
                    self.inbox.put(json.loads(line))
                except ValueError:
                    pass
        threading.Thread(target=read, daemon=True).start()
        self.request("initialize", {"clientInfo": {"name": "pritha_recovery_pilot", "version": "1.0"}, "capabilities": {"experimentalApi": True}})
        self.send({"method": "initialized", "params": {}})

    def send(self, message):
        self.proc.stdin.write(json.dumps(message) + "\n")
        self.proc.stdin.flush()

    def receive(self, timeout=1):
        try:
            m = self.inbox.get(timeout=timeout)
        except queue.Empty:
            return None
        self.events.append(m)
        # A pilot never auto-approves broader commands or file changes.
        if "id" in m and "method" in m:
            # Authorize only this user-requested synthetic fixture's pending
            # MCP item, by exact server, tool and arguments. All unrelated
            # command/file/permission requests remain denied.
            params = m.get("params", {})
            item_id = params.get("itemId") or params.get("callId")
            started = [e.get("params", {}).get("item", {}) for e in self.events if e.get("method") == "item/started"]
            allowed = any(i.get("id") == item_id and i.get("type") == "mcpToolCall"
                          and i.get("server") == "pritha_recovery"
                          and ((i.get("tool") == "trial_receipt" and i.get("arguments") == {"key": "synthetic-recovery-01", "value": 7})
                               or (i.get("tool") == "trial_wait" and i.get("arguments") == {})) for i in started)
            meta = params.get("_meta", {})
            fixture_elicitation = (m["method"] == "mcpServer/elicitation/request" and params.get("serverName") == "pritha_recovery"
                                   and meta.get("codex_approval_kind") == "mcp_tool_call" and params.get("mode") == "form"
                                   and ((meta.get("tool_params") == {"key": "synthetic-recovery-01", "value": 7}
                                         and params.get("message") == 'Allow the pritha_recovery MCP server to run tool "trial_receipt"?')
                                        or (meta.get("tool_params") == {} and params.get("message") == 'Allow the pritha_recovery MCP server to run tool "trial_wait"?')))
            if fixture_elicitation:
                self.send({"id": m["id"], "result": {"action": "accept", "content": {}}})
            elif allowed and m["method"] in ("item/commandExecution/requestApproval", "execCommandApproval"):
                self.send({"id": m["id"], "result": {"decision": "accept"}})
            else:
                self.send({"id": m["id"], "error": {"code": -32000, "message": "Pilot denies request outside synthetic fixture"}})
        return m

    def request(self, method, params, timeout=60):
        rid = self.next_id
        self.next_id += 1
        self.send({"id": rid, "method": method, "params": params})
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            m = self.receive()
            if m and m.get("id") == rid and "method" not in m:
                if "error" in m:
                    raise RuntimeError(method + ": " + json.dumps(m["error"]))
                return m["result"]
        raise TimeoutError(method)

    def completed(self, turn_id, timeout=150):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            for m in self.events:
                if m.get("method") == "turn/completed" and m["params"]["turn"]["id"] == turn_id:
                    return m["params"]["turn"]
            self.receive()
        raise TimeoutError("turn/completed")

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=5)
        self.stderr.close()


def live_pilot(binary, run):
    (run / "project").mkdir(exist_ok=True)
    config = {"mcp_servers": {"pritha_recovery": {"command": sys.executable, "args": [str(Path(__file__).resolve()), "--fixture-server", "--run-dir", str(run)], "enabled": True}}, "model_reasoning_effort": "low"}
    report = {"status": "running", "scenario": "synthetic idempotent effect, interrupt, cold resume", "isolation": "Codex read-only; MCP fixture host-owned", "started_at": time.time()}
    save(run / "codex-live-result.json", report)
    all_events = []
    collected = 0
    c = Client(binary, run)
    thread_id = None
    try:
        models = c.request("model/list", {})["data"]
        model = next((m for m in models if m.get("isDefault")), models[0])["model"]
        thread = c.request("thread/start", {"cwd": str(run / "project"), "sandbox": "read-only", "approvalPolicy": "on-request", "model": model, "config": config,
                            "developerInstructions": "This is a bounded synthetic trial. Use only pritha_recovery tools specified in the prompt. Do not use shell, network, files, skills or agents. Never change policy."})
        thread_id = thread["thread"]["id"]
        report.update({"model": model, "thread_id": thread_id})
        turn = c.request("turn/start", {"threadId": thread_id, "effort": "low", "input": [{"type": "text", "text": "Use trial_receipt with key synthetic-recovery-01 and value 7, exactly once. Then call trial_wait and wait for the result. We will intentionally interrupt while waiting. Do not call anything else."}]})["turn"]["id"]
        end = time.monotonic() + 120
        while not (run / "waiting.json").exists() and time.monotonic() < end:
            c.receive()
            if any(e.get("method") == "turn/completed" for e in c.events):
                raise RuntimeError("Turn completed before reaching MCP checkpoint")
        if not (run / "waiting.json").exists():
            raise TimeoutError("MCP interruption checkpoint was not reached")
        c.request("turn/interrupt", {"threadId": thread_id, "turnId": turn})
        stopped = c.completed(turn)
        report["interrupted_status"] = stopped["status"]
        history_before = c.request("thread/read", {"threadId": thread_id, "includeTurns": True})
        save(run / "history-before-resume.json", history_before)
        all_events.extend(c.events)
        collected = len(c.events)
        c.close()
        c = Client(binary, run)
        collected = 0
        resumed = c.request("thread/resume", {"threadId": thread_id, "cwd": str(run / "project"), "model": model,
                                                "sandbox": "read-only", "approvalPolicy": "on-request", "config": config})
        if resumed.get("model") != model:
            raise RuntimeError("Resume changed the pinned model")
        report["resume_approval_policy"] = resumed.get("approvalPolicy")
        report["resume_sandbox"] = resumed.get("sandbox")
        turn2 = c.request("turn/start", {"threadId": thread_id, "model": model, "effort": "low", "input": [{"type": "text", "text": "The interruption is complete. Recover by calling trial_receipt with the SAME key synthetic-recovery-01 and value 7 once for authoritative readback. Do not call trial_wait or any other tool. Reply with the receipt key, value and effect_count from the tool."}]})["turn"]["id"]
        finished = c.completed(turn2)
        history_after = c.request("thread/read", {"threadId": thread_id, "includeTurns": True})
        save(run / "history-after-resume.json", history_after)
        state = json.loads((run / "receipt.json").read_text())
        all_events.extend(c.events)
        collected = len(c.events)
        usage = [e["params"] for e in all_events if e.get("method") == "thread/tokenUsage/updated"]
        tools = [e["params"]["item"] for e in all_events if e.get("method") == "item/completed" and e.get("params", {}).get("item", {}).get("type") == "mcpToolCall"]
        answers = [e["params"]["item"].get("text", "") for e in c.events if e.get("method") == "item/completed" and e.get("params", {}).get("item", {}).get("type") == "agentMessage"]
        report.update({"finished_status": finished["status"], "receipt": state, "usage_notifications": usage,
                       "completed_tool_items": tools, "answers": answers, "history_turns": len(history_after["thread"].get("turns", [])),
                       "status": "pass" if stopped["status"] == "interrupted" and finished["status"] == "completed" and state["effect_count"] == 1 and state["requests"] == 2 and usage else "fail"})
        c.request("thread/archive", {"threadId": thread_id})
        report["test_thread_archived"] = True
    except Exception as e:
        report.update({"status": "fail", "error_type": type(e).__name__, "error": str(e)[:1200]})
    finally:
        all_events.extend(c.events[collected:])
        c.close()
        save(run / "codex-events.json", all_events)
        report["duration_seconds"] = round(time.time() - report["started_at"], 2)
        save(run / "codex-live-result.json", report)
        print(json.dumps({k: report.get(k) for k in ("status", "model", "interrupted_status", "finished_status", "receipt", "error_type", "error", "duration_seconds")}))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--run-dir", type=Path, required=True)
    p.add_argument("--codex-bin", default="codex")
    p.add_argument("--fixture-server", action="store_true")
    a = p.parse_args()
    a.run_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    if a.fixture_server:
        fixture_server(a.run_dir.resolve())
    else:
        live_pilot(a.codex_bin, a.run_dir.resolve())

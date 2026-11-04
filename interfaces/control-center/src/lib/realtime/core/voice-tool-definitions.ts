/** Shared host tool contracts. All transports use the same schemas and names. */
import type { VoiceModel, PrithaVoiceId } from '../voice-settings';
export type RealtimeToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type RealtimeSessionBuildOptions = {
  musicControlEnabled?: boolean;
  voiceModel?: VoiceModel;
  voice?: PrithaVoiceId;
};

function musicControlToolDefinition(): RealtimeToolDefinition {
  return {
    type: "function",
    name: "music_control",
    description:
      "Control background music from the configured provider: SomaFM radio, local audio library, or ACE-Step generated music. Use only when the operator explicitly asks to play, stop, pause, resume, change source/station/style/track, change volume, or change music mode.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["play", "start", "stop", "pause", "resume", "next", "previous", "set_source", "set_channel", "set_style", "set_volume", "set_mode", "repeat_all"],
        },
        source: {
          type: "string",
          enum: ["somafm", "library", "ace-step"],
          description:
            "Optional provider override. Omit to use the default source from Settings. somafm = SomaFM radio, library = local saved audio folder, ace-step = generated music.",
        },
        style: {
          type: "string",
          description:
            "Concise requested ACE-Step music style, for example: organ ambient, calm piano, lofi, orchestral, dark ambient. Keep this short, but preserve the operator's exact detailed request in operator_request.",
        },
        operator_request: {
          type: "string",
          description:
            "For ACE-Step generated music, include the operator's exact natural-language music request and constraints. This is the primary generation intent and should preserve details like 'leave the current track as-is, only remove drums'.",
        },
        preserve_current: {
          type: "boolean",
          description:
            "For ACE-Step generated music. Set true when the operator asks to keep the current track/style/mood as-is and change only one attribute.",
        },
        channel_id: {
          type: "string",
          description: "Optional SomaFM channel id, for example groovesalad, dronezone, defcon, beatblender.",
        },
        query: {
          type: "string",
          description: "Optional natural-language search query for a SomaFM station or local library track.",
        },
        volume: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Music level percent from 0 to 100, where 100 is the maximum player level. Use 100 for maximum, 50 for half, and 0 for mute. Automatic ducking applies only to controllable local/generated music sources.",
        },
        mode: {
          type: "string",
          enum: ["off", "auto", "on"],
          description: "off = never play; auto = play during long Codex work only; on = keep playing until stopped.",
        },
        repeat: {
          type: "boolean",
          description: "For repeat_all. true enables local library repeat-all behavior, false disables it for this session.",
        },
      },
      required: ["action"],
    },
  };
}

export function buildPrithaRealtimeTools(options: RealtimeSessionBuildOptions = {}): RealtimeToolDefinition[] {
  const tools: RealtimeToolDefinition[] = [
    {
      type: "function",
      name: "full_pritha_memory",
      description:
        "Full Pritha memory access. Query-based search always runs the full retrieval path: indexed text or Markdown fallback, semantic retrieval when available, and entity matches when indexed memory is available. Use this before answering questions about Pritha standards, decisions, workflows, child agents, prior experiments, or stored project knowledge.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: [
              "status",
              "search",
              "recent",
              "open",
              "read",
              "entity_search",
              "graph_traverse",
              "runtime_search",
              "reindex",
              "rebuild_embeddings",
              "rebuild_embeddings_async",
              "write_note",
              "append_artifact",
            ],
          },
          query: { type: "string" },
          id_or_path: { type: "string" },
          node_type: { type: "string" },
          entity_type: { type: "string" },
          relation_type: { type: "string" },
          depth: { type: "number" },
          limit: { type: "number" },
          max_chars: { type: "number" },
          title: { type: "string" },
          body: { type: "string" },
          artifact_type: { type: "string" },
          target_path: { type: "string" },
          operator_confirmation: {
            type: "string",
            description: "Required for write_note, append_artifact, reindex, rebuild_embeddings, and rebuild_embeddings_async after explicit operator confirmation.",
          },
        },
      },
    },
    {
      type: "function",
      name: "inspect_pritha_files",
      description:
        "Fast read-only filesystem inspection for Pritha and sibling child-agent projects. Use for listing available agent projects, viewing folder trees, reading safe text files, checking file metadata, and searching filenames or text content without starting a Codex task.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["status", "list_projects", "tree", "file_info", "read_file", "search"],
          },
          project: {
            type: "string",
            description: "Project id/name/alias. Use pritha for the main project, or a child-agent name such as FESPA26, FunnyTeacher, or StupidJoke.",
          },
          path: {
            type: "string",
            description: "Relative path inside the selected project. Defaults to project root.",
          },
          query: {
            type: "string",
            description: "Search query for operation=search. Matches filenames and safe text-file content.",
          },
          depth: { type: "number" },
          limit: { type: "number" },
          max_chars: { type: "number" },
          include_hidden: {
            type: "boolean",
            description: "Default false. Sensitive/private hidden directories remain excluded even when true.",
          },
        },
      },
    },
    {
      type: "function",
      name: "inspect_codex_task",
      description:
        "Read-only Codex task status inspection for realtime voice. Use to answer operator questions about running, queued, completed, failed, timed-out, stale, or approval-gated Codex sidecar tasks without starting a new task.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["list_active", "status", "brief", "timeline", "diagnose"],
            description: "Use brief for a short voice-safe answer; diagnose for stuck/error questions; timeline for recent safe operational events.",
          },
	          task_id: {
	            type: "string",
	            description: "Optional Codex task id or the 3-character short id shown on the task card. If omitted, the most recent active or voice-handoff-required task is used.",
	          },
          limit: { type: "number" },
          max_events: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "recall_rolling_summary",
      description:
        "Read the current summary-only handoff from the previous/current Pritha Realtime voice session. Use when the operator asks what you discussed last time, what the previous conversation was about, where you left off, or asks to continue from the prior session. This is read-only and does not expose raw transcripts.",
      parameters: {
        type: "object",
        properties: {
          topic_key: {
            type: "string",
            description: "Optional stable topic key. Defaults to Pritha's general rolling handoff.",
          },
        },
      },
    },
    {
      type: "function",
      name: "record_good_state_signal",
      description:
        "Record a positive operator acceptance signal from the current voice conversation as a private Good State Alignment signal. Use this whenever the operator clearly says the current Pritha state, recent change, behavior, configuration, or experience is good, beloved, exactly right, working well, or should be preserved, regardless of exact wording. This writes only a private alignment signal; it does not edit tracked Markdown, create Git commits, create tags, push to GitHub, or start Codex.",
      parameters: {
        type: "object",
        properties: {
          operator_signal: {
            type: "string",
            description:
              "Short sanitized summary or direct positive phrase from the operator. Do not include secrets, private URLs, raw logs, credentials, or long transcript.",
          },
          scope: {
            type: "string",
            description:
              "Affected scope if clear: pritha, voice-control, control-center, agents, tailscale, memory-good-state, a clone name, child agent name, or feature surface. Infer a compact scope when possible.",
          },
          reason: {
            type: "string",
            description: "Why this moment seems worth preserving as a Good State alignment signal.",
          },
          reasons: {
            type: "array",
            items: { type: "string" },
            description: "Optional short reasons, accepted behaviors, or clues the operator liked.",
          },
          session_id: {
            type: "string",
            description: "Optional current voice session id when available.",
          },
          confidence: {
            type: "string",
            enum: ["operator-positive-signal", "explicit-save-request", "strong-acceptance", "uncertain-positive"],
          },
        },
        required: ["operator_signal"],
      },
    },
    {
      type: "function",
      name: "answer_codex_task",
      description:
        "Submit the operator's spoken answer to a Codex task that is waiting_for_operator, then resume that same task card in the same Codex thread. Use this when Codex asks a clarification question and the operator answers by voice.",
      parameters: {
        type: "object",
        properties: {
          expected_question_id: { type: "string", description: "Copy the exact operator_request.request_id from inspect_codex_task for a provider task." },
          expected_revision: { type: "integer", minimum: 1, description: "Copy operator_request.revision. A stale question cannot receive an answer." },
          topic_generation: { type: "integer", minimum: 1, maximum: 999, description: "Copy operator_request.topic_generation. Required for provider task answers." },
	          task_id: {
	            type: "string",
	            description: "Optional Codex task id or the 3-character short id shown on the task card. If omitted, the most recent waiting_for_operator task is used.",
	          },
          answer: {
            type: "string",
            description:
              "The operator's direct answer to the Codex clarification question. If Codex asks for an exact confirmation phrase and the operator gives a clear short yes/да, use that short confirmation; the runtime may synthesize the exact phrase for Codex. Do not include secrets.",
          },
          operator_confirmation: {
            type: "string",
            description: "Brief note that the operator gave this answer or confirmation by voice and wants Codex to continue the same task.",
          },
        },
        required: ["answer"],
      },
    },
    {
      type: "function",
      name: "confirm_voice_intake",
      description:
        "Confirm, cancel, or request more detail for a pending Voice Intake that contains pasted files, screenshots, PDFs, ordinary links, video links, or audio files. Use this only after the UI sends a Voice Intake Clarification Pending message and the operator answers what they want done. This client-side tool uploads pending files to Codex only after explicit spoken instruction; for intent=music_local_folder it imports supported audio files into the Music Local Folder library instead of Codex.",
      parameters: {
        type: "object",
        properties: {
          intake_id: {
            type: "string",
            description: "The exact intake_id from the Voice Intake Clarification Pending message.",
          },
          action: {
            type: "string",
            enum: ["submit", "cancel", "ask_more"],
            description: "submit handles the pending files/links according to intent; cancel discards them; ask_more keeps waiting for a clearer operator instruction.",
          },
          operator_instruction: {
            type: "string",
            description: "Required for submit. The operator's spoken instruction for what Codex should do with the files, links, video, or pasted text.",
          },
          intent: {
            type: "string",
            enum: ["summarize", "extract_facts", "memory_candidate", "agent_context", "transcribe", "research", "music_local_folder", "other"],
            description: "Use music_local_folder only when the operator asks to import attached audio into the Music Local Folder library for Music mode playback.",
          },
          original_text_role: {
            type: "string",
            enum: ["instruction", "context", "content_to_analyze", "unknown"],
            description: "Whether pasted text near the files should be treated as instruction, context, content to analyze, or unknown.",
          },
          target_agent: {
            type: "string",
            description: "Optional child-agent/project target when the operator says the material is for a specific agent.",
          },
          persistence: {
            type: "string",
            enum: ["none", "candidate_only", "write_if_relevant"],
            description: "none for one-off analysis; candidate_only for a memory candidate report; write_if_relevant only when the operator explicitly asks to save relevant knowledge.",
          },
          notes: { type: "string" },
        },
        required: ["intake_id", "action"],
      },
    },
    {
      type: "function",
      name: "web_search",
      description:
        "Search the current public web through the search backend pinned to this task provider. Use for ordinary voice questions that need current sources, official pages, release pages, documentation, news lookup, or source discovery. Returns compact source URLs, snippets, warnings and timings. This is read-only and does not update curated memory.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["search", "diagnose"],
            description: "search is the normal path. diagnose checks NeuralDeep quota or runs a tiny SearXNG JSON smoke test, depending on the task provider.",
          },
          query: {
            type: "string",
            description: "Compact web search query. Do not include secrets, raw transcript, private URLs or broad instructions.",
          },
          mode: {
            type: "string",
            enum: ["quick", "sources", "deep"],
            description: "quick returns search results. sources asks for source-focused results. deep currently returns search results and warns that page extraction is not enabled yet.",
          },
          source_policy: {
            type: "string",
            enum: ["general", "official_first", "news", "technical", "community"],
            description: "Use official_first when the operator needs authoritative pages or docs; technical for docs/GitHub-style lookups; news for recent public news.",
          },
          freshness: {
            type: "string",
            enum: ["day", "month", "year"],
            description: "Optional freshness hint. Verify the publication date of returned sources.",
          },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Optional preferred domains such as docs.openai.com, github.com, fifa.com, weather.gov. Used for source preference and engine-dependent site: filters.",
          },
          language: {
            type: "string",
            description: "Optional language/locale hint reserved for future backend use.",
          },
          max_results: {
            type: "number",
            description: "Maximum search results to return, 1-10. Defaults to 5.",
          },
        },
      },
    },
    {
      type: "function",
      name: "run_codex_task",
      description:
        "Start or queue a task with the selected Pritha task provider. Existing tasks retain their original provider and model. Use for implementation, repo inspection, deep analysis, review, or internet/current-source research. Do not claim the task is complete unless the returned status says complete.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          task_type: {
            type: "string",
            enum: ["analysis", "research", "implementation", "review", "agent_creation", "system_change"],
            description: "Use agent_creation for an explicitly requested new standalone agent/project, including a headless CLI with Contract and Outcome Spec; pair with subject_kind=agent and its exact folder slug. implementation edits an existing project. Preparing draft artifacts does not approve them or authorize a build.",
          },
          write_mode: {
            type: "string",
            enum: ["read_only", "workspace_write"],
            description:
              "Use workspace_write only when the operator explicitly asked Codex to edit files, implement code, or create a child-agent project. Use read_only for analysis, review, status checks, and research.",
          },
          priority: { type: "string", enum: ["normal", "high"] },
          requires_internet: { type: "boolean" },
          expected_result: { type: "string" },
          operator_confirmation: {
            type: "string",
            description:
              "Required before agent creation, implementation, workspace-write, agent improvement/fix, or other large Codex handoff tasks. Record that the operator gave a direct positive voice confirmation that the spoken task brief is complete and ready for Codex; do not require the operator to repeat a fixed phrase word for word.",
          },
          subject_kind: {
            type: "string",
            enum: ["agent", "pritha", "task", "control"],
            description: "Stable task subject kind. Use agent for a new or existing child agent (including headless CLI projects), pritha for Pritha subsystem work, task for one-off work. A new agent also requires task_type=agent_creation; subject context alone grants no factory authority.",
          },
          subject_id: {
            type: "string",
            description: "Stable subject id such as fas, fespa26, control-center, memory, operations or agents-mother. Do not use raw transcript text.",
          },
          subject_label: {
            type: "string",
            description: "Short human-readable subject label for task cards and Codex thread names.",
          },
          thread_reset: {
            type: "boolean",
            description: "Only true when the operator explicitly asks to start a new Codex App thread for this subject.",
          },
	          continue_task_id: {
	            type: "string",
	            description:
	              "Optional previous Codex task id or 3-character short card id to continue. Use after the operator names a card id.",
	          },
          continuation_mode: {
            type: "string",
            enum: ["auto", "force_new"],
            description:
              "Default auto lets Pritha link a logical continuation to a previous stopped task. Use force_new only when the operator explicitly wants a separate new task.",
          },
        },
        required: ["task"],
      },
    },
  ];
  if (options.musicControlEnabled) tools.push(musicControlToolDefinition());
  return tools;
}

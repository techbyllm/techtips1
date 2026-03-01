export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, filters } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  const OWNER = "techbyllm";
  const REPO  = "techtips";
  const activeFilters = (filters || []).join(", ") || "readme, docs, code, config, tests, files";

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in environment variables." });
  }

  try {
    // ── Step 1: Fetch repo tree from GitHub ──────────────────────────────────
    const ghHeaders = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "techtips-app",
    };

    const repoRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: ghHeaders });
    if (!repoRes.ok) {
      const msg = repoRes.status === 404
        ? `Repository ${OWNER}/${REPO} not found. Make sure it exists and is public.`
        : `GitHub API error: ${repoRes.status}`;
      return res.status(400).json({ error: msg });
    }
    const repoData = await repoRes.json();
    const branch = repoData.default_branch || "main";

    const treeRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${branch}?recursive=1`,
      { headers: ghHeaders }
    );
    if (!treeRes.ok) return res.status(500).json({ error: "Could not fetch repository tree." });
    const treeData = await treeRes.json();
    const files = (treeData.tree || []).filter(f => f.type === "blob");

    // ── Step 2: Classify & filter files ─────────────────────────────────────
    function classifyFile(path) {
      const lower = path.toLowerCase();
      const name  = lower.split("/").pop();
      const ext   = name.includes(".") ? name.split(".").pop() : "";
      if (name.startsWith("readme")) return "readme";
      if (lower.includes("/docs/") || lower.includes("/doc/") || ["md","rst","txt","adoc"].includes(ext)) return "doc";
      if (name.includes("test") || name.includes("spec") || lower.includes("/test/") || lower.includes("/tests/") || lower.includes("/spec/") || lower.includes("/__tests__/")) return "test";
      const configNames = ["package.json","yarn.lock","pnpm-lock.yaml",".env",".env.example","dockerfile","docker-compose.yml",".gitignore",".eslintrc",".prettierrc",".babelrc","tsconfig.json","vite.config","webpack.config","jest.config","next.config","tailwind.config","pyproject.toml","requirements.txt","cargo.toml","go.mod","gemfile","composer.json","makefile","netlify.toml","vercel.json"];
      const configExts  = ["yaml","yml","toml","ini","cfg","conf","config","env","lock","xml","gradle"];
      if (configNames.some(c => name.startsWith(c)) || configExts.includes(ext) || name.startsWith(".")) return "config";
      const codeExts = ["js","jsx","ts","tsx","py","rb","go","rs","java","kt","swift","c","cpp","cs","php","lua","sh","bash","vue","svelte","scala","dart","ex","exs","sol"];
      if (codeExts.includes(ext)) return "code";
      return "file";
    }

    const activeSet = new Set(filters || ["readme","docs","code","config","tests","files"]);
    const typeMap   = { readme: "readme", doc: "docs", code: "code", config: "config", test: "tests", file: "files" };

    const filesToSearch = files.filter(f => {
      const type = classifyFile(f.path);
      return activeSet.has(typeMap[type] || "files");
    });

    // ── Step 3: Fetch content from key files (up to 10) ──────────────────────
    const readableTypes = ["readme", "doc", "config", "code", "test"];
    const toRead = filesToSearch.filter(f => readableTypes.includes(classifyFile(f.path))).slice(0, 10);

    const fileContents = [];
    for (const f of toRead) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${OWNER}/${REPO}/contents/${f.path}`,
          { headers: ghHeaders }
        );
        if (!r.ok) continue;
        const d = await r.json();
        if (d.encoding === "base64") {
          const content = Buffer.from(d.content.replace(/\n/g, ""), "base64").toString("utf8");
          fileContents.push({ path: f.path, type: classifyFile(f.path), content: content.slice(0, 2000) });
        }
      } catch { /* skip unreadable files */ }
    }

    // ── Step 4: Build context strings ────────────────────────────────────────
    const fileList    = filesToSearch.slice(0, 150).map(f => `[${classifyFile(f.path).toUpperCase()}] ${f.path}`).join("\n");
    const docsContext = fileContents.map(f => `--- FILE: ${f.path} (${f.type}) ---\n${f.content}`).join("\n\n");

    // ── Step 5: Ask Claude to analyze ────────────────────────────────────────
    const systemPrompt = `You are an expert at searching GitHub repositories. Analyze the repository structure and file contents to find the most relevant results for the user's query. Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"summary":"2-3 sentence explanation of what was found","results":[{"path":"path/to/file","type":"readme|doc|code|config|test|file","relevance":85,"reason":"1-2 sentence explanation"}]}
Return 3-6 results. Relevance is 0-100.`;

    const userMsg = `Repository: ${OWNER}/${REPO}
Query: "${query}"
Active filters: ${activeFilters}

FILE TREE:
${fileList || "(empty repository)"}

FILE CONTENTS:
${docsContext || "(no readable files)"}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(500).json({ error: `Anthropic API error: ${aiRes.status} — ${errText}` });
    }

    const aiData = await aiRes.json();
    const raw    = (aiData.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: "AI returned an unexpected response. Please try again." }); }

    return res.status(200).json({ ...parsed, owner: OWNER, repo: REPO, branch });

  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}

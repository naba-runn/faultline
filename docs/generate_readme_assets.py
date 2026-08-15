import os
import math
from PIL import Image, ImageDraw, ImageFont

# Asset Output Directory
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Color Palette (Faultline Design Tokens)
BG = (15, 17, 20)           # #0f1114
SURFACE = (22, 26, 30)      # #161a1e
CONTAINER = (26, 31, 36)    # #1a1f24
CONTAINER_HIGH = (30, 36, 41) # #1e2429
BORDER = (35, 40, 48)       # #232830
BORDER_STRONG = (45, 51, 59)# #2d333b
TEXT = (226, 229, 234)      # #e2e5ea
TEXT_MUTED = (139, 145, 154)# #8b919a
TEXT_FAINT = (86, 93, 104)  # #565d68
ACCENT = (91, 164, 207)     # #5ba4cf (Teal-blue accent)
ACCENT_STRONG = (142, 200, 232) # #8ec8e8
DANGER = (229, 83, 75)      # #e5534b (Red)
DANGER_BG = (45, 20, 20)
WARNING = (210, 153, 34)    # #d29922 (Yellow)
WARNING_BG = (45, 35, 15)
SUCCESS = (87, 171, 90)     # #57ab5a (Green)
SUCCESS_BG = (20, 40, 25)
PURPLE = (163, 113, 247)    # #a371f7
CARD_BG = (18, 22, 26)

def get_fonts():
    """Attempt to load system fonts, fallback to default if missing."""
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf"
    ]
    mono_paths = [
        "/System/Library/Fonts/Monaco.ttf",
        "/System/Library/Fonts/Courier.dfont",
        "/Library/Fonts/Courier New.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf"
    ]
    
    main_font = None
    for p in font_paths:
        if os.path.exists(p):
            main_font = p
            break
            
    mono_font = None
    for p in mono_paths:
        if os.path.exists(p):
            mono_font = p
            break
            
    def load(path, size):
        if path:
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
        return ImageFont.load_default()
        
    return {
        "title": load(main_font, 22),
        "header": load(main_font, 16),
        "body": load(main_font, 13),
        "small": load(main_font, 11),
        "mono": load(mono_font, 12),
        "mono_small": load(mono_font, 10),
        "mono_bold": load(mono_font, 13),
    }

FONTS = get_fonts()

def draw_rounded_rect(draw, xy, corner_radius, fill=None, outline=None, width=1):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=corner_radius, fill=fill, outline=outline, width=width)

def draw_header_bar(draw, width, active_tab="Dashboard"):
    # Window chrome & Nav bar
    draw.rectangle([0, 0, width, 56], fill=SURFACE)
    draw.line([0, 56, width, 56], fill=BORDER, width=1)
    
    # Window controls
    draw.ellipse([16, 22, 28, 34], fill=(237, 106, 94))
    draw.ellipse([34, 22, 46, 34], fill=(245, 191, 79))
    draw.ellipse([52, 22, 64, 34], fill=(98, 197, 84))
    
    # Logo
    draw.rectangle([90, 18, 106, 38], fill=ACCENT)
    draw.text((95, 20), "F", fill=BG, font=FONTS["header"])
    draw.text((115, 20), "FAULTLINE", fill=TEXT, font=FONTS["header"])
    draw.text((205, 24), "v1.4.2", fill=TEXT_MUTED, font=FONTS["mono_small"])
    
    # Navigation Links
    nav_items = ["Dashboard", "Error Groups", "Projects", "API Docs"]
    x = 300
    for item in nav_items:
        color = ACCENT if item == active_tab else TEXT_MUTED
        draw.text((x, 21), item, fill=color, font=FONTS["body"])
        if item == active_tab:
            draw.line([x, 48, x + draw.textlength(item, font=FONTS["body"]), 48], fill=ACCENT, width=2)
        x += 110
        
    # User Profile / Live Status Pill
    draw_rounded_rect(draw, [width - 160, 16, width - 20, 40], 12, fill=CONTAINER, outline=BORDER)
    draw.ellipse([width - 150, 25, width - 142, 33], fill=SUCCESS)
    draw.text((width - 135, 22), "SSE Connected", fill=TEXT, font=FONTS["small"])

# -----------------------------------------------------------------------------
# 1. ARCHITECTURE DIAGRAM
# -----------------------------------------------------------------------------
def generate_architecture_diagram():
    w, h = 1000, 620
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    
    # Grid Background Lines (subtle)
    for x in range(0, w, 40):
        draw.line([x, 0, x, h], fill=(20, 24, 29), width=1)
    for y in range(0, h, 40):
        draw.line([0, y, w, y], fill=(20, 24, 29), width=1)
        
    # Title Header
    draw.text((40, 25), "FAULTLINE ARCHITECTURE & DATA FLOW", fill=TEXT, font=FONTS["title"])
    draw.text((40, 55), "Real-time error ingestion, stack fingerprinting, async AI enrichment, and SSE streaming", fill=TEXT_MUTED, font=FONTS["body"])
    draw.line([40, 85, w - 40, 85], fill=BORDER, width=1)

    nodes = [
        {"id": "sdk", "title": "Client Applications", "subtitle": "Node.js / Python / cURL SDKs", "box": [40, 140, 240, 250], "color": ACCENT, "icon": "CLIENT"},
        {"id": "api", "title": "Express API Server", "subtitle": "Ingestion, Fingerprinting & Source Maps", "box": [320, 140, 640, 250], "color": ACCENT, "icon": "API"},
        {"id": "mongo", "title": "MongoDB Atlas", "subtitle": "Error Groups, Raw Events & Projects", "box": [720, 140, 960, 250], "color": SUCCESS, "icon": "DB"},
        {"id": "redis", "title": "Redis & BullMQ", "subtitle": "Job Queue & Event Pub/Sub", "box": [320, 320, 640, 410], "color": WARNING, "icon": "QUEUE"},
        {"id": "worker", "title": "Enrichment Worker", "subtitle": "Async Worker (worker.js)", "box": [40, 480, 280, 570], "color": PURPLE, "icon": "WORKER"},
        {"id": "gemini", "title": "Google Gemini 2.5 & GitHub", "subtitle": "Source Fetching & AI Root Cause", "box": [360, 480, 640, 570], "color": PURPLE, "icon": "AI"},
        {"id": "ui", "title": "React Dashboard", "subtitle": "Real-Time SSE Live UI Feed", "box": [720, 480, 960, 570], "color": ACCENT, "icon": "UI"}
    ]

    # Draw Connections
    arrows = [
        # SDK -> API
        ([240, 195], [320, 195], "POST /api/events"),
        # API -> Mongo
        ([640, 195], [720, 195], "Write Event / Group"),
        # API -> Redis
        ([480, 250], [480, 320], "Push Job & SSE Pub"),
        # Redis -> Worker
        ([320, 365], [160, 365], [160, 480], "Pull Enrich Job"),
        # Worker -> Gemini
        ([280, 525], [360, 525], "Fetch Source & Prompt"),
        # Redis -> UI
        ([640, 365], [840, 365], [840, 480], "SSE Stream Push")
    ]

    for arr in arrows:
        if len(arr) == 4:
            p1, p2, p3, label = arr
            draw.line([p1[0], p1[1], p2[0], p2[1]], fill=BORDER_STRONG, width=2)
            draw.line([p2[0], p2[1], p3[0], p3[1]], fill=BORDER_STRONG, width=2)
            # Arrow head
            draw.polygon([p3[0]-4, p3[1]-6, p3[0]+4, p3[1]-6, p3[0], p3[1]], fill=BORDER_STRONG)
            draw.text((p2[0] + 10, p2[1] - 15), label, fill=TEXT_MUTED, font=FONTS["mono_small"])
        else:
            p1, p2, label = arr
            draw.line([p1[0], p1[1], p2[0], p2[1]], fill=BORDER_STRONG, width=2)
            # Arrow head
            draw.polygon([p2[0]-6, p2[1]-4, p2[0]-6, p2[1]+4, p2[0], p2[1]], fill=BORDER_STRONG)
            draw.text(((p1[0]+p2[0])//2 - 40, p1[1] - 18), label, fill=TEXT_MUTED, font=FONTS["mono_small"])

    # Draw Nodes
    for n in nodes:
        bx = n["box"]
        draw_rounded_rect(draw, bx, 8, fill=CONTAINER, outline=n["color"], width=2)
        # Node tag
        draw_rounded_rect(draw, [bx[0]+12, bx[1]+12, bx[0]+70, bx[1]+30], 4, fill=CONTAINER_HIGH)
        draw.text((bx[0]+18, bx[1]+14), n["icon"], fill=n["color"], font=FONTS["mono_small"])
        
        draw.text((bx[0]+12, bx[1]+40), n["title"], fill=TEXT, font=FONTS["header"])
        draw.text((bx[0]+12, bx[1]+65), n["subtitle"], fill=TEXT_MUTED, font=FONTS["small"])

    img.save(os.path.join(OUTPUT_DIR, "architecture.png"))
    print("Generated architecture.png")

# -----------------------------------------------------------------------------
# 2. DASHBOARD OVERVIEW SCREENSHOT
# -----------------------------------------------------------------------------
def generate_dashboard_overview():
    w, h = 1100, 700
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    draw_header_bar(draw, w, "Dashboard")

    # Filter Bar
    draw.rectangle([0, 57, w, 110], fill=CONTAINER)
    draw.line([0, 110, w, 110], fill=BORDER, width=1)
    
    # Search Box
    draw_rounded_rect(draw, [24, 69, 320, 99], 6, fill=CONTAINER, outline=BORDER)
    draw.text((36, 76), "Filter by error message or stack...", fill=TEXT_MUTED, font=FONTS["body"])
    
    # Filter Pills
    pills = [("Env: Production", True), ("Status: Open", True), ("Severity: All", False), ("Release: v1.4.2", False)]
    px = 340
    for text, active in pills:
        color = ACCENT if active else TEXT_MUTED
        bg_col = CONTAINER_HIGH if active else CONTAINER
        draw_rounded_rect(draw, [px, 69, px + 120, 99], 6, fill=bg_col, outline=color)
        draw.text((px + 12, 76), text, fill=TEXT, font=FONTS["small"])
        px += 130

    # Summary Metrics Row
    metrics = [
        ("TOTAL ERRORS (24H)", "14,289", "+12.4% vs yesterday", SUCCESS),
        ("OPEN GROUPS", "18", "3 critical severity", DANGER),
        ("24H ANOMALY SPIKES", "3 SPIKES", "Real-time baseline triggered", WARNING),
        ("AI ENRICHED RATE", "98.4%", "Gemini 2.5 Flash grounded", ACCENT)
    ]
    mx = 24
    for title, val, sub, color in metrics:
        draw_rounded_rect(draw, [mx, 125, mx + 250, 205], 6, fill=SURFACE, outline=BORDER)
        draw.text((mx + 16, 137), title, fill=TEXT_MUTED, font=FONTS["mono_small"])
        draw.text((mx + 16, 155), val, fill=TEXT, font=FONTS["title"])
        draw.text((mx + 16, 185), sub, fill=color, font=FONTS["small"])
        mx += 265

    # Main Incident List & Sidebar Container
    # Main Incident List (Left side)
    draw_rounded_rect(draw, [24, 220, 750, 675], 6, fill=SURFACE, outline=BORDER)
    draw.text((40, 235), "ACTIVE ERROR GROUPS", fill=TEXT, font=FONTS["header"])
    draw.line([24, 265, 750, 265], fill=BORDER, width=1)

    incidents = [
        {
            "msg": "TypeError: Cannot read properties of undefined (reading 'user')",
            "loc": "authService.js:42:18",
            "sev": "CRITICAL", "sev_col": DANGER,
            "count": "4,120", "users": "890", "time": "2m ago",
            "spike": True, "enriched": True
        },
        {
            "msg": "MongoNetworkTimeoutError: connection timed out after 3000ms",
            "loc": "dbPool.js:88:12",
            "sev": "HIGH", "sev_col": WARNING,
            "count": "892", "users": "210", "time": "14m ago",
            "spike": False, "enriched": True
        },
        {
            "msg": "SyntaxError: Unexpected token < in JSON at position 0",
            "loc": "apiClient.js:115:4",
            "sev": "MEDIUM", "sev_col": ACCENT,
            "count": "145", "users": "45", "time": "45m ago",
            "spike": False, "enriched": True
        },
        {
            "msg": "PaymentGatewayError: Card declined (stolen_card)",
            "loc": "checkoutService.js:204:9",
            "sev": "CRITICAL", "sev_col": DANGER,
            "count": "89", "users": "12", "time": "1h ago",
            "spike": True, "enriched": True
        },
        {
            "msg": "RedisConnectionRefused: ECONNREFUSED 127.0.0.1:6379",
            "loc": "queueWorker.js:19:8",
            "sev": "HIGH", "sev_col": WARNING,
            "count": "42", "users": "1", "time": "2h ago",
            "spike": False, "enriched": True
        }
    ]

    iy = 275
    for inc in incidents:
        # Row hover/background
        draw_rounded_rect(draw, [34, iy, 740, iy + 72], 4, fill=CONTAINER, outline=BORDER)
        
        # Severity Badge
        draw_rounded_rect(draw, [46, iy + 14, 115, iy + 34], 3, fill=CONTAINER_HIGH, outline=inc["sev_col"])
        draw.text((54, iy + 17), inc["sev"], fill=inc["sev_col"], font=FONTS["mono_small"])

        # Error Message & Location
        draw.text((125, iy + 12), inc["msg"][:52] + "...", fill=TEXT, font=FONTS["mono_bold"])
        draw.text((125, iy + 36), f"Location: {inc['loc']}  |  Environment: production  |  Release: v1.4.2", fill=TEXT_MUTED, font=FONTS["small"])

        # Badges (Spike & AI Enriched)
        bx = 520
        if inc["spike"]:
            draw_rounded_rect(draw, [bx, iy + 14, bx + 70, iy + 34], 10, fill=WARNING_BG, outline=WARNING)
            draw.text((bx + 10, iy + 17), "SPIKE", fill=WARNING, font=FONTS["mono_small"])
            bx += 76
            
        if inc["enriched"]:
            draw_rounded_rect(draw, [bx, iy + 14, bx + 95, iy + 34], 10, fill=CONTAINER_HIGH, outline=PURPLE)
            draw.text((bx + 10, iy + 17), "AI ENRICHED", fill=PURPLE, font=FONTS["mono_small"])

        # Counts & Time
        draw.text((640, iy + 14), f"{inc['count']} events", fill=TEXT, font=FONTS["mono_small"])
        draw.text((640, iy + 34), f"{inc['users']} users", fill=TEXT_MUTED, font=FONTS["small"])
        draw.text((640, iy + 50), inc["time"], fill=TEXT_FAINT, font=FONTS["small"])

        iy += 78

    # Sidebar (Right side)
    draw_rounded_rect(draw, [765, 220, 1075, 675], 6, fill=SURFACE, outline=BORDER)
    draw.text((780, 235), "24H VOLUME TREND", fill=TEXT, font=FONTS["header"])
    
    # Sparkline chart placeholder
    points = [(780, 330), (810, 325), (840, 340), (870, 310), (900, 335), (930, 280), (960, 290), (990, 250), (1020, 260), (1050, 240)]
    draw.line(points, fill=ACCENT, width=3)
    for px, py in points:
        draw.ellipse([px-3, py-3, px+3, py+3], fill=ACCENT_STRONG)
    draw.text((780, 350), "Peak: 1,840 events/hr (Spike at 11:00 AM)", fill=TEXT_MUTED, font=FONTS["small"])
    draw.line([765, 380, 1075, 380], fill=BORDER, width=1)

    # Active Releases Card
    draw.text((780, 395), "RECENT RELEASES", fill=TEXT, font=FONTS["header"])
    releases = [("v1.4.2 (Latest)", "Deployed 3h ago", "12 errors"), ("v1.4.1", "Deployed 2d ago", "6 errors")]
    ry = 425
    for rtag, rtime, rerr in releases:
        draw_rounded_rect(draw, [780, ry, 1060, ry + 48], 4, fill=CONTAINER, outline=BORDER)
        draw.text((792, ry + 8), rtag, fill=TEXT, font=FONTS["mono_bold"])
        draw.text((792, ry + 26), f"{rtime} • {rerr}", fill=TEXT_MUTED, font=FONTS["small"])
        ry += 56

    img.save(os.path.join(OUTPUT_DIR, "dashboard-overview.png"))
    print("Generated dashboard-overview.png")

# -----------------------------------------------------------------------------
# 3. GROUP DETAIL & AI ENRICHMENT SCREENSHOT
# -----------------------------------------------------------------------------
def generate_group_detail_ai():
    w, h = 1100, 720
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    draw_header_bar(draw, w, "Error Groups")

    # Sub-header / Incident Title
    draw.rectangle([0, 57, w, 130], fill=CONTAINER)
    draw.line([0, 130, w, 130], fill=BORDER, width=1)

    draw_rounded_rect(draw, [24, 68, 90, 88], 3, fill=DANGER_BG, outline=DANGER)
    draw.text((32, 71), "CRITICAL", fill=DANGER, font=FONTS["mono_small"])

    draw.text((105, 66), "TypeError: Cannot read properties of undefined (reading 'user')", fill=TEXT, font=FONTS["title"])
    draw.text((105, 96), "Group ID: grp_8f9a2b1c  |  First Seen: 2h ago  |  Last Seen: 2m ago  |  Total Occurrences: 4,120", fill=TEXT_MUTED, font=FONTS["small"])

    draw_rounded_rect(draw, [w - 140, 72, w - 24, 104], 4, fill=SUCCESS_BG, outline=SUCCESS)
    draw.text((w - 122, 80), "Status: OPEN", fill=SUCCESS, font=FONTS["body"])

    # AI Root-Cause Analysis Panel (Gemini 2.5 Flash)
    draw_rounded_rect(draw, [24, 145, 1075, 420], 6, fill=SURFACE, outline=PURPLE, width=2)
    
    # Gemini Header Tag
    draw_rounded_rect(draw, [40, 160, 260, 186], 13, fill=CONTAINER_HIGH, outline=PURPLE)
    draw.ellipse([50, 169, 58, 177], fill=PURPLE)
    draw.text((66, 166), "GOOGLE GEMINI 2.5 FLASH", fill=PURPLE, font=FONTS["mono_small"])
    draw.text((275, 166), "AI Root-Cause Intelligence (Grounded via GitHub Source Code)", fill=TEXT_MUTED, font=FONTS["small"])
    
    draw.line([24, 198, 1075, 198], fill=BORDER, width=1)

    # AI Content Sections
    draw.text((40, 210), "ROOT CAUSE DIAGNOSIS", fill=TEXT, font=FONTS["header"])
    explanation = (
        "In src/services/authService.js at line 42, the code dereferences 'req.session.user.id' without verifying that "
        "'req.session.user' exists. When an unauthenticated client sends a request with an expired JWT header, "
        "the middleware sets 'req.session' to an empty object, causing an uncaught TypeError during property lookup."
    )
    draw.text((40, 235), explanation, fill=TEXT_MUTED, font=FONTS["body"])

    draw.text((40, 290), "RECOMMENDED FIX & CODE DIFF", fill=TEXT, font=FONTS["header"])
    
    # Code Diff Box
    draw_rounded_rect(draw, [40, 315, 1050, 405], 4, fill=CARD_BG, outline=BORDER)
    diff_lines = [
        ("-  const userId = req.session.user.id;", DANGER),
        ("+  const userId = req.session?.user?.id;", SUCCESS),
        ("+  if (!userId) throw new AuthenticationError('Unauthenticated request context');", SUCCESS)
    ]
    dy = 325
    for line, col in diff_lines:
        draw.text((55, dy), line, fill=col, font=FONTS["mono"])
        dy += 24

    # Stack Trace & Source Mapping Section
    draw_rounded_rect(draw, [24, 435, 1075, 695], 6, fill=SURFACE, outline=BORDER)
    draw.text((40, 450), "RESOLVED STACK TRACE & SOURCE MAP (source-map-js v3)", fill=TEXT, font=FONTS["header"])
    draw.line([24, 478, 1075, 478], fill=BORDER, width=1)

    stack_frames = [
        ("authService.js:42:18", "getUserProfile", "src/services/authService.js", True),
        ("router.js:112:5", "dispatchRouteHandler", "src/routes/router.js", False),
        ("expressApp.js:84:10", "Layer.handle [as handle_request]", "node_modules/express/lib/router/layer.js", False),
        ("server.js:45:3", "startServer", "server.js", False)
    ]
    fy = 490
    for loc, fn, src_file, is_highlighted in stack_frames:
        bg_col = CONTAINER_HIGH if is_highlighted else CONTAINER
        border_col = ACCENT if is_highlighted else BORDER
        draw_rounded_rect(draw, [40, fy, 1050, fy + 44], 4, fill=bg_col, outline=border_col)
        
        marker = "-> [ORIGIN]" if is_highlighted else "  "
        color = ACCENT if is_highlighted else TEXT
        draw.text((55, fy + 12), f"{marker} {fn} ({loc})", fill=color, font=FONTS["mono_bold"])
        draw.text((650, fy + 12), f"Mapped to: {src_file}", fill=TEXT_MUTED, font=FONTS["mono_small"])
        fy += 50

    img.save(os.path.join(OUTPUT_DIR, "group-detail-ai.png"))
    print("Generated group-detail-ai.png")

# -----------------------------------------------------------------------------
# 4. API DOCS & SDK SNIPPETS SCREENSHOT
# -----------------------------------------------------------------------------
def generate_api_docs_sdks():
    w, h = 1100, 680
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    draw_header_bar(draw, w, "API Docs")

    # Header section
    draw.rectangle([0, 57, w, 120], fill=CONTAINER)
    draw.line([0, 120, w, 120], fill=BORDER, width=1)
    draw.text((40, 68), "INTERACTIVE API DOCUMENTATION & SDK GENERATOR", fill=TEXT, font=FONTS["title"])
    draw.text((40, 96), "Ingest runtime exceptions, query error groups, and subscribe to SSE streams", fill=TEXT_MUTED, font=FONTS["small"])

    # Left Box: SDK Snippet Generator
    draw_rounded_rect(draw, [24, 135, 535, 655], 6, fill=SURFACE, outline=BORDER)
    draw.text((40, 150), "CLIENT SDK SNIPPET GENERATOR", fill=TEXT, font=FONTS["header"])
    
    # Tabs
    tabs = [("cURL", False), ("Node.js / Express", True), ("Python", False)]
    tx = 40
    for tab_name, active in tabs:
        color = ACCENT if active else TEXT_MUTED
        bg_col = CONTAINER_HIGH if active else CONTAINER
        draw_rounded_rect(draw, [tx, 180, tx + 130, 206], 4, fill=bg_col, outline=color)
        draw.text((tx + 14, 186), tab_name, fill=TEXT, font=FONTS["small"])
        tx += 140

    # Snippet Box
    draw_rounded_rect(draw, [40, 220, 520, 635], 4, fill=CARD_BG, outline=BORDER)
    code_lines = [
        "// Install Faultline Node SDK",
        "npm install @faultline/node",
        "",
        "const Faultline = require('@faultline/node');",
        "",
        "Faultline.init({",
        "  apiKey: 'fl_live_9f8a7b6c5d4e3f2a',",
        "  environment: 'production',",
        "  release: 'v1.4.2',",
        "  serverUrl: 'https://faultline-api.onrender.com'",
        "});",
        "",
        "// Express Error Handler Middleware",
        "app.use(Faultline.expressMiddleware());"
    ]
    cy = 235
    for line in code_lines:
        col = TEXT_MUTED if line.startswith("//") else (ACCENT if "require" in line or "init" in line else TEXT)
        draw.text((55, cy), line, fill=col, font=FONTS["mono"])
        cy += 24

    # Right Box: API Endpoint Definitions
    draw_rounded_rect(draw, [555, 135, 1075, 655], 6, fill=SURFACE, outline=BORDER)
    draw.text((570, 150), "RAW REST API SPECIFICATIONS", fill=TEXT, font=FONTS["header"])

    endpoints = [
        ("POST", "/api/events", "Ingest new runtime error event payload", "202 Accepted"),
        ("GET", "/api/groups", "Query error groups with filter & search", "200 OK"),
        ("GET", "/api/groups/:id", "Retrieve group detail & Gemini AI fix", "200 OK"),
        ("GET", "/api/groups/:id/stream", "SSE endpoint for real-time live updates", "200 Stream"),
        ("POST", "/api/sourcemaps", "Upload minified JavaScript source map v3", "201 Created")
    ]

    ey = 185
    for method, path, desc, status in endpoints:
        draw_rounded_rect(draw, [570, ey, 1060, ey + 82], 4, fill=CONTAINER, outline=BORDER)
        
        m_col = SUCCESS if method == "GET" else ACCENT
        draw_rounded_rect(draw, [582, ey + 12, 640, ey + 34], 3, fill=CONTAINER_HIGH, outline=m_col)
        draw.text((592, ey + 15), method, fill=m_col, font=FONTS["mono_bold"])
        
        draw.text((650, ey + 14), path, fill=TEXT, font=FONTS["mono_bold"])
        draw.text((582, ey + 44), desc, fill=TEXT_MUTED, font=FONTS["small"])
        
        draw_rounded_rect(draw, [960, ey + 12, 1048, ey + 34], 10, fill=CONTAINER_HIGH, outline=BORDER_STRONG)
        draw.text((970, ey + 15), status, fill=TEXT_MUTED, font=FONTS["mono_small"])

        ey += 90

    img.save(os.path.join(OUTPUT_DIR, "api-docs-sdks.png"))
    print("Generated api-docs-sdks.png")

# -----------------------------------------------------------------------------
# 5. ANIMATED WORKFLOW GIF (SIMULATE ERROR -> GROUPING -> AI -> LIVE DASHBOARD)
# -----------------------------------------------------------------------------
def generate_demo_gif():
    w, h = 900, 520
    frames = []

    # 4 Workflow Steps
    steps = [
        {
            "step_title": "STEP 1/4: SIMULATE RUNTIME ERROR",
            "banner_col": DANGER,
            "box_title": "Terminal / Microservice Application",
            "lines": [
                ("$ node app.js", TEXT_MUTED),
                ("Ingesting runtime exception to Faultline API...", TEXT),
                ("POST /api/events HTTP/1.1 (x-api-key: fl_live_9f8a...)", ACCENT),
                ("{", TEXT),
                ("  \"message\": \"TypeError: Cannot read properties of undefined (reading 'user')\",", DANGER),
                ("  \"stack\": \"authService.js:42:18\",", TEXT),
                ("  \"environment\": \"production\", \"release\": \"v1.4.2\"", TEXT),
                ("}", TEXT),
                ("=> HTTP 202 Accepted (Event Ingested)", SUCCESS)
            ]
        },
        {
            "step_title": "STEP 2/4: STACK FINGERPRINTING & GROUPING",
            "banner_col": WARNING,
            "box_title": "Faultline Express API Engine",
            "lines": [
                ("Extracting stack frames...", TEXT_MUTED),
                ("Frame 0: authService.js line 42 col 18", TEXT),
                ("Generating SHA-256 Fingerprint...", TEXT),
                ("Fingerprint: SHA256(\"TypeError|authService.js|42\") -> fp_8a9b0c2d", WARNING),
                ("Querying MongoDB Atlas for existing group...", TEXT),
                ("MATCH FOUND: Group grp_8f9a2b1c", SUCCESS),
                ("Incrementing occurrences count: 4,119 -> 4,120", TEXT),
                ("Evaluating spike detection baseline threshold...", ACCENT),
                ("=> Anomaly Spike Triggered! (+340% frequency)", DANGER)
            ]
        },
        {
            "step_title": "STEP 3/4: ASYNC AI ENRICHMENT (GEMINI 2.5 FLASH)",
            "banner_col": PURPLE,
            "box_title": "BullMQ Worker Process (worker.js)",
            "lines": [
                ("Worker pulled job: enrich-group (grp_8f9a2b1c)", TEXT_MUTED),
                ("Fetching source code from GitHub: src/services/authService.js", ACCENT),
                ("Calling Google Gemini 2.5 Flash API...", PURPLE),
                ("Generating Root Cause Analysis & Code Fix...", PURPLE),
                ("----------------------------------------------------------------", BORDER_STRONG),
                ("Gemini: 'req.session.user dereferenced without optional check.'", SUCCESS),
                ("Diff: - const userId = req.session.user.id;", DANGER),
                ("Diff: + const userId = req.session?.user?.id;", SUCCESS),
                ("=> AI Summary stored to MongoDB Atlas", SUCCESS)
            ]
        },
        {
            "step_title": "STEP 4/4: LIVE SSE DASHBOARD STREAM UPDATE",
            "banner_col": SUCCESS,
            "box_title": "React Observability Dashboard (Vite)",
            "lines": [
                ("Server-Sent Events (SSE) Stream: Event 'group:updated' received", ACCENT),
                ("Bypassing manual page refresh...", TEXT_MUTED),
                ("Updating Incident Row 'grp_8f9a2b1c' live in DOM", SUCCESS),
                ("[CRITICAL] TypeError: Cannot read properties of undefined...", DANGER),
                ("Badges: [SPIKE DETECTED] [AI ENRICHED BY GEMINI 2.5]", PURPLE),
                ("Count updated: 4,120 events  |  User count: 890 users", TEXT),
                ("Multi-channel alert sent via Resend Email API", WARNING),
                ("=> Live Observability State Synchronized Cleanly!", SUCCESS)
            ]
        }
    ]

    # Render each step for several frames to create an animated flow
    for step_idx, step in enumerate(steps):
        # We create 10 frames per step with small progress indicators
        for f_idx in range(12):
            img = Image.new("RGB", (w, h), BG)
            draw = ImageDraw.Draw(img)

            # Top Step Progress Bar
            draw.rectangle([0, 0, w, 50], fill=CONTAINER)
            draw.line([0, 50, w, 50], fill=BORDER, width=1)

            draw_rounded_rect(draw, [20, 10, 360, 40], 4, fill=CONTAINER_HIGH, outline=step["banner_col"])
            draw.text((32, 17), step["step_title"], fill=step["banner_col"], font=FONTS["mono_bold"])

            # Step dots
            for s in range(4):
                dot_col = step["banner_col"] if s == step_idx else BORDER_STRONG
                draw.ellipse([420 + s * 30, 20, 432 + s * 30, 32], fill=dot_col)

            draw.text((560, 17), "FAULTLINE LIVE WORKFLOW", fill=TEXT_MUTED, font=FONTS["mono_small"])

            # Main Card Box
            draw_rounded_rect(draw, [20, 70, w - 20, h - 30], 6, fill=SURFACE, outline=BORDER)
            draw.text((40, 85), step["box_title"], fill=TEXT, font=FONTS["header"])
            draw.line([20, 115, w - 20, 115], fill=BORDER, width=1)

            # Terminal / Console Window Content
            draw_rounded_rect(draw, [40, 130, w - 40, h - 50], 4, fill=CARD_BG, outline=BORDER)
            
            # Draw line by line with slight typing/revealing effect
            visible_count = min(len(step["lines"]), (f_idx // 1) + 4)
            ly = 145
            for line_text, col in step["lines"][:visible_count]:
                draw.text((60, ly), line_text, fill=col, font=FONTS["mono"])
                ly += 32

            frames.append(img)

    # Save as animated GIF
    gif_path = os.path.join(OUTPUT_DIR, "faultline-demo.gif")
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=350, # ms per frame
        loop=0
    )
    print("Generated faultline-demo.gif")

if __name__ == "__main__":
    generate_architecture_diagram()
    generate_dashboard_overview()
    generate_group_detail_ai()
    generate_api_docs_sdks()
    generate_demo_gif()

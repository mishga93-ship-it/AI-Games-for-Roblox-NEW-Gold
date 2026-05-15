//
//  WebUIPreviewView.swift
//  AIGoldRoblox
//
//  Visual mockup of generated Roblox UI rendered in a WKWebView
//  with CSS 3D transforms for depth effect.
//

import SwiftUI
import WebKit

struct WebUIPreviewView: UIViewRepresentable {
    let uiType: String
    let visualStyle: String
    let title: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        loadPreview(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    // MARK: - Color Palettes (matching uiTemplates.ts)

    private struct Palette {
        let bg: String
        let accent: String
        let text: String
        let panel: String
    }

    private var palette: Palette {
        let s = visualStyle.lowercased()
        if s.contains("fantasy") || s.contains("medieval") {
            return Palette(bg: "#2c1654", accent: "#f4c542", text: "#f0e6d3", panel: "#3c2364")
        }
        if s.contains("sci") || s.contains("neon") || s.contains("space") {
            return Palette(bg: "#0a0e27", accent: "#00d4ff", text: "#b0c4de", panel: "#14193c")
        }
        if s.contains("cute") || s.contains("pastel") {
            return Palette(bg: "#ffe4f0", accent: "#ff69b4", text: "#5c3a6b", panel: "#ffc8dc")
        }
        if s.contains("minimal") || s.contains("dark") {
            return Palette(bg: "#121212", accent: "#c8c8c8", text: "#f0f0f0", panel: "#1e1e1e")
        }
        // Default: modern
        return Palette(bg: "#1a1a2e", accent: "#e94560", text: "#ffffff", panel: "#23233c")
    }

    // MARK: - HTML Generation

    private func loadPreview(in webView: WKWebView) {
        let p = palette
        let uiContent = mockupHTML(for: uiType.lowercased(), palette: p)

        let html = """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
                width: 100%; height: 100%;
                overflow: hidden;
                background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%);
                font-family: -apple-system, 'Helvetica Neue', sans-serif;
                display: flex; align-items: center; justify-content: center;
            }
            .viewport {
                width: 92%; height: 88%;
                position: relative;
                background: linear-gradient(180deg, #2a3a5c 0%, #1a2744 30%, #0f1b2d 70%, #1a4a2a 90%, #2a5a3a 100%);
                border-radius: 16px;
                overflow: hidden;
                transform: perspective(1200px) rotateY(3deg) rotateX(2deg);
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(100,80,200,0.15);
                border: 1px solid rgba(255,255,255,0.08);
            }
            .viewport::before {
                content: '';
                position: absolute; inset: 0;
                background: radial-gradient(ellipse at 50% 30%, rgba(100,150,255,0.06) 0%, transparent 70%);
                pointer-events: none;
            }
            .ground {
                position: absolute; bottom: 0; left: 0; right: 0; height: 30%;
                background: linear-gradient(180deg, transparent 0%, rgba(34,80,34,0.3) 100%);
            }
            .stars {
                position: absolute; top: 0; left: 0; right: 0; height: 40%;
                background-image:
                    radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.4), transparent),
                    radial-gradient(1px 1px at 30% 8%, rgba(255,255,255,0.3), transparent),
                    radial-gradient(1px 1px at 55% 20%, rgba(255,255,255,0.5), transparent),
                    radial-gradient(1px 1px at 75% 12%, rgba(255,255,255,0.3), transparent),
                    radial-gradient(1px 1px at 90% 25%, rgba(255,255,255,0.4), transparent);
            }
            .ui-layer {
                position: absolute; inset: 0;
                pointer-events: none;
            }
            .ui-panel {
                background: \(p.panel);
                border: 1px solid \(p.accent)44;
                border-radius: 10px;
                color: \(p.text);
                font-size: 11px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            }
            .ui-accent { color: \(p.accent); }
            .ui-btn {
                background: \(p.accent);
                color: \(p.bg);
                border: none;
                border-radius: 6px;
                padding: 5px 12px;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
            }
            .ui-title {
                font-size: 13px;
                font-weight: 700;
                color: \(p.accent);
                margin-bottom: 6px;
            }
            .bar-track {
                height: 8px;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                overflow: hidden;
            }
            .bar-fill {
                height: 100%;
                border-radius: 4px;
                transition: width 1.5s ease-in-out;
            }
            .label-badge {
                display: inline-flex; align-items: center; gap: 4px;
                font-size: 11px; font-weight: 600;
            }
            @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
            @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .animate-in { animation: slideIn 0.6s ease-out both; }
            .animate-pulse { animation: pulse 2s ease-in-out infinite; }
            \(extraCSS(for: uiType.lowercased(), palette: p))
        </style>
        </head>
        <body>
        <div class="viewport">
            <div class="stars"></div>
            <div class="ground"></div>
            <div class="ui-layer">
                \(uiContent)
            </div>
        </div>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: - Per-Type HTML Mockups

    private func mockupHTML(for type: String, palette: Palette) -> String {
        switch type {
        case "hud":
            return hudHTML(palette)
        case "shop":
            return shopHTML(palette)
        case "inventory":
            return inventoryHTML(palette)
        case "dialogue":
            return dialogueHTML(palette)
        case "leaderboard":
            return leaderboardHTML(palette)
        case "notification":
            return notificationHTML(palette)
        case "main_menu":
            return mainMenuHTML(palette)
        default:
            return hudHTML(palette)
        }
    }

    private func extraCSS(for type: String, palette: Palette) -> String {
        switch type {
        case "shop":
            return """
            .shop-glass {
                background: \(palette.panel)cc;
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border-radius: 14px;
                border: 1px solid \(palette.accent)22;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 \(palette.accent)15;
            }
            .shop-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 12px 14px 8px;
                border-bottom: 1px solid \(palette.accent)15;
            }
            .coin-badge {
                background: \(palette.accent)20; color: \(palette.accent);
                padding: 3px 8px; border-radius: 10px;
                font-size: 11px; font-weight: 700;
            }
            .shop-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .shop-item {
                background: \(palette.bg)88; border-radius: 10px; padding: 8px 6px;
                text-align: center; position: relative; overflow: hidden;
                border: 1px solid \(palette.accent)18;
                transition: transform 0.2s, border-color 0.2s;
            }
            .shop-item:hover { transform: scale(1.03); border-color: \(palette.accent)44; }
            .shop-item .emoji { font-size: 24px; margin-bottom: 2px; }
            .shop-item .price { color: \(palette.accent); font-weight: 700; font-size: 10px; margin-top: 1px; }
            .shop-buy {
                margin-top: 4px; font-size: 8px; padding: 3px 8px; width: 90%;
                border-radius: 6px; transition: transform 0.15s;
            }
            .shop-buy:active { transform: scale(0.93); }
            .shop-pass {
                border-color: \(palette.accent)33;
                background: linear-gradient(180deg, \(palette.bg)66 0%, \(palette.accent)12 100%);
            }
            .shop-owned { opacity: 0.6; }
            .item-glow {
                position: absolute; top: -20px; left: 50%; transform: translateX(-50%);
                width: 40px; height: 40px; border-radius: 50%;
                background: \(palette.accent)15; filter: blur(12px); pointer-events: none;
            }
            .pass-badge {
                position: absolute; top: -4px; right: -2px;
                background: \(palette.accent); color: \(palette.bg);
                font-size: 6px; font-weight: 800; padding: 2px 4px;
                border-radius: 4px; letter-spacing: 0.5px; z-index: 2;
            }
            .shop-footer {
                margin-top: auto; padding: 6px 14px 8px;
                text-align: center; border-top: 1px solid \(palette.accent)10;
            }
            """
        case "inventory":
            return """
            .inv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
            .inv-slot {
                aspect-ratio: 1; background: \(palette.bg); border-radius: 6px;
                border: 1px solid \(palette.accent)33;
                display: flex; align-items: center; justify-content: center; font-size: 18px;
            }
            .inv-slot.selected { border-color: \(palette.accent); box-shadow: 0 0 8px \(palette.accent)66; }
            """
        case "leaderboard":
            return """
            .lb-row {
                display: flex; align-items: center; gap: 8px; padding: 6px 10px;
                border-radius: 6px; margin-bottom: 4px;
            }
            .lb-row:nth-child(1) { background: \(palette.accent)22; }
            .lb-rank { font-weight: 800; width: 18px; text-align: center; }
            .lb-name { flex: 1; font-size: 11px; }
            .lb-score { font-weight: 700; color: \(palette.accent); font-size: 11px; }
            """
        default:
            return ""
        }
    }

    // MARK: - HUD

    private func hudHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;top:12px;left:12px;width:170px;">
            <div class="ui-panel" style="padding:10px;">
                <div class="label-badge" style="margin-bottom:6px;">
                    <span style="font-size:14px;">❤️</span>
                    <span>Health</span>
                    <span class="ui-accent" style="margin-left:auto;">85/100</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill animate-pulse" style="width:85%;background:linear-gradient(90deg,#ff4444,#ff6b6b);"></div>
                </div>
                <div class="label-badge" style="margin-top:8px;margin-bottom:6px;">
                    <span style="font-size:14px;">🪙</span>
                    <span>Coins</span>
                    <span class="ui-accent" style="margin-left:auto;">1,250</span>
                </div>
                <div class="label-badge" style="margin-top:6px;margin-bottom:6px;">
                    <span style="font-size:14px;">⭐</span>
                    <span>XP</span>
                    <span class="ui-accent" style="margin-left:auto;">Lv. 12</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:65%;background:linear-gradient(90deg,#4488ff,#66aaff);"></div>
                </div>
            </div>
        </div>
        <div class="animate-in" style="position:absolute;top:12px;right:12px;animation-delay:0.2s;">
            <div class="ui-panel" style="padding:8px 12px;">
                <span style="font-size:12px;">⚙️</span>
            </div>
        </div>
        """
    }

    // MARK: - Shop

    private func shopHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;inset:6px;display:flex;flex-direction:column;">
            <div class="shop-glass" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                <div class="shop-header">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:16px;">🛒</span>
                        <span style="font-size:15px;font-weight:800;background:linear-gradient(90deg,\(p.accent),\(p.text));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">SHOP</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div class="coin-badge">🪙 2,500</div>
                        <span style="font-size:14px;cursor:pointer;opacity:0.5;">✕</span>
                    </div>
                </div>
                <div style="font-size:10px;font-weight:700;color:\(p.accent);margin:0 14px 6px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.8;">⭐ Game Passes</div>
                <div class="shop-grid" style="margin:0 14px 10px;">
                    <div class="shop-item shop-pass">
                        <div class="pass-badge">PASS</div>
                        <div class="item-glow"></div>
                        <div class="emoji">👑</div>
                        <div style="font-size:11px;font-weight:700;">VIP</div>
                        <div style="font-size:7px;opacity:0.6;margin:2px 0;">2x coins + VIP zone</div>
                        <div class="price">R$ 199</div>
                        <button class="ui-btn shop-buy">Buy Pass</button>
                    </div>
                    <div class="shop-item shop-pass">
                        <div class="pass-badge">PASS</div>
                        <div class="item-glow"></div>
                        <div class="emoji">⚡</div>
                        <div style="font-size:11px;font-weight:700;">Speed</div>
                        <div style="font-size:7px;opacity:0.6;margin:2px 0;">2x walk speed</div>
                        <div class="price">R$ 99</div>
                        <button class="ui-btn shop-buy">Buy Pass</button>
                    </div>
                    <div class="shop-item shop-pass shop-owned">
                        <div class="pass-badge" style="background:#4CAF50;">✓</div>
                        <div class="emoji">🎵</div>
                        <div style="font-size:11px;font-weight:700;">Radio</div>
                        <div style="font-size:7px;opacity:0.6;margin:2px 0;">Play music</div>
                        <div class="price" style="opacity:0.4;">Owned</div>
                        <button class="ui-btn shop-buy" style="opacity:0.3;pointer-events:none;">Owned ✓</button>
                    </div>
                </div>
                <div style="font-size:10px;font-weight:700;color:\(p.accent);margin:0 14px 6px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.8;">🪙 Products</div>
                <div class="shop-grid" style="margin:0 14px;">
                    <div class="shop-item">
                        <div class="emoji">💰</div>
                        <div style="font-size:11px;font-weight:700;">100 Coins</div>
                        <div class="price">R$ 49</div>
                        <button class="ui-btn shop-buy">Buy</button>
                    </div>
                    <div class="shop-item">
                        <div class="emoji">💎</div>
                        <div style="font-size:11px;font-weight:700;">500 Coins</div>
                        <div class="price">R$ 199</div>
                        <button class="ui-btn shop-buy">Buy</button>
                    </div>
                    <div class="shop-item">
                        <div class="emoji">🎁</div>
                        <div style="font-size:11px;font-weight:700;">Starter</div>
                        <div class="price">R$ 99</div>
                        <button class="ui-btn shop-buy">Buy</button>
                    </div>
                </div>
                <div class="shop-footer">
                    <span style="font-size:8px;opacity:0.4;">Prices fetched from catalog · IDs auto-loaded</span>
                </div>
            </div>
        </div>
        """
    }

    // MARK: - Inventory

    private func inventoryHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:220px;">
            <div class="ui-panel" style="padding:12px;">
                <div class="ui-title">🎒 Inventory</div>
                <div class="inv-grid">
                    <div class="inv-slot selected">⚔️</div>
                    <div class="inv-slot">🛡️</div>
                    <div class="inv-slot">🧪</div>
                    <div class="inv-slot">🪙</div>
                    <div class="inv-slot">🍖</div>
                    <div class="inv-slot">🏹</div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                    <div class="inv-slot"></div>
                </div>
                <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:10px;opacity:0.6;">6/16 items</span>
                    <button class="ui-btn" style="font-size:9px;padding:3px 10px;">Equip</button>
                </div>
            </div>
        </div>
        """
    }

    // MARK: - Dialogue

    private func dialogueHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;bottom:14px;left:14px;right:14px;">
            <div class="ui-panel" style="padding:12px;display:flex;gap:10px;">
                <div style="width:48px;height:48px;border-radius:50%;background:\(p.accent)33;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">
                    🧙
                </div>
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:11px;color:\(p.accent);margin-bottom:4px;">Elder Mage</div>
                    <div style="font-size:10px;line-height:1.4;opacity:0.9;">
                        Greetings, adventurer! I have a quest for you. The ancient crystal has been stolen from the tower…
                    </div>
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                        <button class="ui-btn" style="font-size:9px;padding:3px 10px;">Accept Quest</button>
                        <button class="ui-btn" style="font-size:9px;padding:3px 10px;background:\(p.panel);color:\(p.text);border:1px solid \(p.accent)44;">Tell me more</button>
                        <button class="ui-btn" style="font-size:9px;padding:3px 10px;background:\(p.panel);color:\(p.text);border:1px solid \(p.accent)44;">Decline</button>
                    </div>
                </div>
            </div>
        </div>
        """
    }

    // MARK: - Leaderboard

    private func leaderboardHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;top:12px;right:12px;width:160px;">
            <div class="ui-panel" style="padding:10px;">
                <div class="ui-title" style="text-align:center;">🏆 Leaderboard</div>
                <div class="lb-row">
                    <div class="lb-rank" style="color:gold;">1</div>
                    <div class="lb-name">ProGamer99</div>
                    <div class="lb-score">12,450</div>
                </div>
                <div class="lb-row">
                    <div class="lb-rank" style="color:silver;">2</div>
                    <div class="lb-name">NinjaX</div>
                    <div class="lb-score">10,200</div>
                </div>
                <div class="lb-row">
                    <div class="lb-rank" style="color:#cd7f32;">3</div>
                    <div class="lb-name">StarKid</div>
                    <div class="lb-score">8,750</div>
                </div>
                <div class="lb-row">
                    <div class="lb-rank">4</div>
                    <div class="lb-name">CoolDev</div>
                    <div class="lb-score">7,300</div>
                </div>
                <div class="lb-row">
                    <div class="lb-rank">5</div>
                    <div class="lb-name" style="color:\(p.accent);font-weight:700;">You</div>
                    <div class="lb-score">6,100</div>
                </div>
            </div>
        </div>
        """
    }

    // MARK: - Notification / Toast

    private func notificationHTML(_ p: Palette) -> String {
        """
        <div class="animate-in" style="position:absolute;top:14px;left:50%;transform:translateX(-50%);width:240px;">
            <div class="ui-panel" style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-left:3px solid \(p.accent);">
                <span style="font-size:18px;">🎉</span>
                <div>
                    <div style="font-weight:700;font-size:11px;">Achievement Unlocked!</div>
                    <div style="font-size:10px;opacity:0.7;">First Victory — Win your first battle</div>
                </div>
            </div>
        </div>
        <div class="animate-in" style="position:absolute;top:66px;left:50%;transform:translateX(-50%);width:220px;animation-delay:0.3s;">
            <div class="ui-panel" style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-left:3px solid #44dd66;">
                <span style="font-size:16px;">🪙</span>
                <div style="font-size:10px;">+500 Coins earned!</div>
            </div>
        </div>
        <div class="animate-in" style="position:absolute;top:110px;left:50%;transform:translateX(-50%);width:200px;animation-delay:0.6s;">
            <div class="ui-panel" style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-left:3px solid #ff8844;">
                <span style="font-size:16px;">⬆️</span>
                <div style="font-size:10px;">Level Up! Now Lv. 13</div>
            </div>
        </div>
        """
    }

    // MARK: - Main Menu

    private func mainMenuHTML(_ p: Palette) -> String {
        """
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,\(p.bg)cc 0%,\(p.bg)ee 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
            <div class="animate-in" style="font-size:28px;font-weight:900;color:\(p.accent);text-shadow:0 2px 20px \(p.accent)66;letter-spacing:2px;">
                \(title.isEmpty ? "EPIC GAME" : title.uppercased())
            </div>
            <div class="animate-in" style="font-size:10px;color:\(p.text);opacity:0.5;margin-bottom:12px;animation-delay:0.1s;">
                \(visualStyle.capitalized) Edition
            </div>
            <button class="ui-btn animate-in" style="padding:10px 40px;font-size:14px;border-radius:10px;animation-delay:0.2s;box-shadow:0 4px 20px \(p.accent)44;">
                ▶ PLAY
            </button>
            <button class="ui-btn animate-in" style="padding:7px 30px;font-size:11px;border-radius:8px;background:\(p.panel);color:\(p.text);border:1px solid \(p.accent)44;animation-delay:0.3s;">
                ⚙️ Settings
            </button>
            <button class="ui-btn animate-in" style="padding:7px 30px;font-size:11px;border-radius:8px;background:\(p.panel);color:\(p.text);border:1px solid \(p.accent)44;animation-delay:0.4s;">
                🛒 Shop
            </button>
            <button class="ui-btn animate-in" style="padding:7px 30px;font-size:11px;border-radius:8px;background:\(p.panel);color:\(p.text);border:1px solid \(p.accent)44;animation-delay:0.5s;">
                📊 Leaderboard
            </button>
        </div>
        """
    }
}

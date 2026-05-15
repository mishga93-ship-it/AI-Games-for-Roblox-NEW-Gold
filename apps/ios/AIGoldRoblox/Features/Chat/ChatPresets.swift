//
//  ChatPresets.swift
//  AIGoldRoblox
//

import Foundation

struct ChatPreset: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let emoji: String?

    /// Text sent as user message when this preset is tapped.
    var promptText: String {
        "\(title) — \(subtitle)"
    }
}

// MARK: - Preset Data Per Subcategory

enum ChatPresetsData {

    // MARK: Characters / NPC

    static let characters: [ChatPreset] = [
        ChatPreset(title: "Sixseven Boss 67", subtitle: "The ultimate brainrot Italian meme", emoji: "🇮🇹"),
        ChatPreset(title: "Poppy 5 Prototype", subtitle: "Horror monster from new chapter", emoji: "😱"),
        ChatPreset(title: "Cozy Gardener NPC", subtitle: "Cute farmer for cozy games", emoji: "🌱"),
        ChatPreset(title: "Tralalero Shark", subtitle: "Plasticine brainrot meme pet", emoji: "🦈"),
        ChatPreset(title: "Blox Anime God", subtitle: "One-shots entire map with skills", emoji: "⚡"),
        ChatPreset(title: "Server Owner Admin", subtitle: "NPC banning players on command", emoji: nil),
        ChatPreset(title: "Pet Sim Billionaire", subtitle: "Gives away rare Huge pets", emoji: "💰"),
        ChatPreset(title: "Immortal Follower", subtitle: "Invulnerable bodyguard with OP aura", emoji: nil),
        ChatPreset(title: "Bombardiro Crocodilo", subtitle: "Surreal boss with Italian accordion", emoji: "🐊"),
        ChatPreset(title: "Cursed Glitch Noob", subtitle: "Broken NPC with loud jumpscares", emoji: "👻"),
        ChatPreset(title: "Giga-Chad Hamster", subtitle: "Buffed hamster with an RPG", emoji: "🐹"),
        ChatPreset(title: "Smart AI QuestGiver", subtitle: "Smart dialogues powered by ChatGPT", emoji: "🧠"),
        ChatPreset(title: "AAA 4K Avatar (UGC)", subtitle: "Hyper-realistic 3D model with rigging", emoji: "✨"),
        ChatPreset(title: "Advanced Combat AI", subtitle: "Smart enemy with advanced pathfinding", emoji: nil),
        ChatPreset(title: "Monetization Merchant", subtitle: "Ready-made shop with UI gamepasses", emoji: "💵"),
    ]

    // MARK: UI / GUI

    static let ui: [ChatPreset] = [
        ChatPreset(title: "Generate RNG Roll UI", subtitle: "Flashy aura rarity roll screen", emoji: "🎰"),
        ChatPreset(title: "Steal Pet Sim UI", subtitle: "Colorful cartoon shop with gamepasses", emoji: "🍬"),
        ChatPreset(title: "Add Daily Spin Wheel", subtitle: "Addictive daily login reward spinner", emoji: "🎡"),
        ChatPreset(title: "Build Trade Window UI", subtitle: "Safe scam-proof player trading menu", emoji: nil),
        ChatPreset(title: "Deploy God Admin Panel", subtitle: "Secret UI to ban players", emoji: "🔒"),
        ChatPreset(title: "Create P2W VIP Hub", subtitle: "Exclusive glowing menu for donators", emoji: "👑"),
        ChatPreset(title: "Install Global Live Leaderboard", subtitle: "Live leaderboard with player stats", emoji: "🏆"),
        ChatPreset(title: "Setup Dominating Kill Feed", subtitle: "Flashy notification when you destroy", emoji: nil),
        ChatPreset(title: "Spam Fake Brainrot Ads", subtitle: "Annoying fake pop-ups for memes", emoji: "📢"),
        ChatPreset(title: "Apply Glitched Horror HUD", subtitle: "Cursed interface with loud jumpscares", emoji: "💀"),
        ChatPreset(title: "Add VHS Bodycam HUD", subtitle: "Ultra realistic spooky camera overlay", emoji: "📹"),
        ChatPreset(title: "Build Glassmorphism Settings UI", subtitle: "Modern blur interface with toggles", emoji: nil),
        ChatPreset(title: "Script Advanced RPG Inventory", subtitle: "Drag and drop grid slots", emoji: "🎒"),
        ChatPreset(title: "Fix Mobile UI Scaling", subtitle: "Professional auto sizing for devices", emoji: "📱"),
        ChatPreset(title: "Create Smooth Loading Screen", subtitle: "Professional tweening transition with tips", emoji: nil),
    ]

    // MARK: Animations

    static let animations: [ChatPreset] = [
        ChatPreset(title: "Generate Viral Phonk Walk", subtitle: "Sigma male aggressive walking cycle", emoji: "🚶"),
        ChatPreset(title: "Animate Brainrot TikTok Dance", subtitle: "Trendy brainrot dance for players", emoji: "💃"),
        ChatPreset(title: "Apply Cute Idol Idle", subtitle: "K-pop style cute idle animation", emoji: "🩷"),
        ChatPreset(title: "Cast Domain Expansion Anime", subtitle: "Ultimate anime boss skill animation", emoji: "🔥"),
        ChatPreset(title: "Levitate Like A God", subtitle: "Floating above players with aura", emoji: nil),
        ChatPreset(title: "Execute Anime Melee Combo", subtitle: "Flashy fast-paced anime melee strikes", emoji: "⚔️"),
        ChatPreset(title: "Enable Cursed Ragdoll Flop", subtitle: "Broken bones funny falling animation", emoji: "🤪"),
        ChatPreset(title: "Crawl Like A Demon", subtitle: "Creepy crawling with twisted limbs", emoji: "👹"),
        ChatPreset(title: "Bounce With Rubber Physics", subtitle: "Vintage cartoon bouncy walking style", emoji: nil),
        ChatPreset(title: "Apply Smooth Mocap Walk", subtitle: "Ultra realistic smooth walking animation", emoji: "🎬"),
        ChatPreset(title: "Animate Tactical FPS Reload", subtitle: "Professional gun handling and reloading", emoji: "🔫"),
        ChatPreset(title: "Generate Fluid Parkour Vaults", subtitle: "Seamless vaulting and climbing transitions", emoji: nil),
    ]

    // MARK: Audio & Music

    static let audio: [ChatPreset] = [
        ChatPreset(title: "Viral Phonk Beat", subtitle: "Viral drift phonk for racing", emoji: "🎵"),
        ChatPreset(title: "Rare Drop Sound", subtitle: "Satisfying legendary RNG item sound", emoji: "💎"),
        ChatPreset(title: "TikTok Loop", subtitle: "Short catchy meme audio loop", emoji: "🔁"),
        ChatPreset(title: "Player Victory Fanfare", subtitle: "Epic celebratory gold win fanfare", emoji: "🏅"),
        ChatPreset(title: "Final Boss Theme", subtitle: "Intense orchestral domination battle theme", emoji: "🎻"),
        ChatPreset(title: "Admin Panel Sound", subtitle: "Powerful futuristic divine interface hum", emoji: nil),
        ChatPreset(title: "God's Wrath Explosion", subtitle: "Massive explosive destruction sound effect", emoji: "💥"),
        ChatPreset(title: "Immortal Hero Aura", subtitle: "Glorious holy shimmering background loop", emoji: nil),
        ChatPreset(title: "Cringe Reverb Fart", subtitle: "Funny distorted meme sound effect", emoji: "😂"),
        ChatPreset(title: "Cursed Horror Whisper", subtitle: "Eerie reversed voices and static", emoji: "🫣"),
        ChatPreset(title: "AI Surreal Circus", subtitle: "Wacky chaotic generated carnival music", emoji: "🎪"),
        ChatPreset(title: "Glitch Corruption Noise", subtitle: "High pitch digital corruption noise", emoji: nil),
        ChatPreset(title: "Adaptive Battle Soundtrack", subtitle: "Dynamic music changing with intensity", emoji: "🎼"),
        ChatPreset(title: "AAA Cinematic Orchestra", subtitle: "Professional studio quality movie score", emoji: "🎞️"),
        ChatPreset(title: "3D Spatial Ambient", subtitle: "Immersive 3D surrounding environment audio", emoji: nil),
        ChatPreset(title: "Studio UI Sound Pack", subtitle: "Minimalist high-end click sound pack", emoji: "🔊"),
    ]

    // MARK: Decals & Textures

    static let decals: [ChatPreset] = [
        ChatPreset(title: "Brainrot Graffiti Pack", subtitle: "Viral brainrot meme tags collection", emoji: "🏷️"),
        ChatPreset(title: "Poppy 5 Stickers", subtitle: "Hype horror game decor decals", emoji: "😈"),
        ChatPreset(title: "Y2K Aesthetic Pack", subtitle: "Early 2000s nostalgic decal styles", emoji: "✨"),
        ChatPreset(title: "Meme Room Posters", subtitle: "Funny trending meme images set", emoji: "🖼️"),
        ChatPreset(title: "Admin Throne Texture", subtitle: "Intimidating glowing admin authority material", emoji: "👑"),
        ChatPreset(title: "Place Owner Logo", subtitle: "Massive custom flex owner decal", emoji: nil),
        ChatPreset(title: "Dark Matter Armor", subtitle: "Powerful intimidating villain material set", emoji: "🌑"),
        ChatPreset(title: "Gold Donator Pack", subtitle: "Exclusive flexing gold interior materials", emoji: "🪙"),
        ChatPreset(title: "Cursed Noob Face", subtitle: "Disturbing glitched n00b wall decal", emoji: "💀"),
        ChatPreset(title: "Acid Trip Texture", subtitle: "Surreal eye hurting floor pattern", emoji: "🌈"),
        ChatPreset(title: "Surrealism Graffiti", subtitle: "Bizarre nonsense art collection decals", emoji: nil),
        ChatPreset(title: "Cringe Store Signs", subtitle: "Funny ironic cringe ad billboards", emoji: "🤣"),
        ChatPreset(title: "AAA PBR Stone Set", subtitle: "Professional seamless 4K tiling stone", emoji: nil),
        ChatPreset(title: "Store Branding Pack", subtitle: "Complete professional store branding decals", emoji: "🏪"),
        ChatPreset(title: "Wet Asphalt Realistic", subtitle: "High quality realistic wet pavement PBR", emoji: nil),
        ChatPreset(title: "Neon City Signs", subtitle: "Glow neon signs professional decal set", emoji: "🌃"),
    ]

    // MARK: Obby (Games)

    static let obby: [ChatPreset] = [
        ChatPreset(title: "Generate Meme Obby", subtitle: "Viral brainrot meme obstacle course with spinners", emoji: "🤪"),
        ChatPreset(title: "Launch Deathrun Parkour", subtitle: "Kill bricks, moving platforms, and spinners", emoji: "💀"),
        ChatPreset(title: "Make Disappearing Obby", subtitle: "Vanishing platforms that test your timing", emoji: "👻"),
        ChatPreset(title: "Create Escape Obby", subtitle: "Trendy escape with moving platforms", emoji: "🏫"),
        ChatPreset(title: "Generate Tower of Hell", subtitle: "Infinite hardcore procedural spinner tower", emoji: "🔥"),
        ChatPreset(title: "Add Kill Brick Gauntlet", subtitle: "Deadly red neon kill brick obstacle course", emoji: "🔴"),
        ChatPreset(title: "Install Moving Platforms", subtitle: "Sliding platforms with increasing speed", emoji: "🔄"),
        ChatPreset(title: "Add Spinning Kill Arms", subtitle: "Rotating neon spinner obstacle sections", emoji: "🌀"),
        ChatPreset(title: "Generate Candy Obby", subtitle: "Sweet pink obstacle course with checkpoints", emoji: "🍬"),
        ChatPreset(title: "Add Meme Chaser", subtitle: "Terrifying loud meme image chases", emoji: "🏃"),
        ChatPreset(title: "Make Neon Obby", subtitle: "Glowing cyberpunk parkour in the dark", emoji: "💜"),
        ChatPreset(title: "Launch Space Obby", subtitle: "Zero gravity sci-fi platform jumping", emoji: nil),
        ChatPreset(title: "Generate Sci-Fi Obby", subtitle: "AAA futuristic post apocalyptic course", emoji: "🚀"),
        ChatPreset(title: "Create Horror Obby", subtitle: "Dark scary obby with creepy atmosphere", emoji: "🩸"),
        ChatPreset(title: "Build Lava Obby", subtitle: "Volcanic parkour over lava pools", emoji: "🌋"),
        ChatPreset(title: "Setup Speedrun Timer", subtitle: "Professional live time tracking with HUD", emoji: "⏱️"),
    ]

    // MARK: Tycoon

    static let tycoon: [ChatPreset] = [
        ChatPreset(title: "Generate Meme Factory Tycoon", subtitle: "Brainrot meme production empire", emoji: "🏭"),
        ChatPreset(title: "Launch Pizza Empire Tycoon", subtitle: "Build pizza chain from scratch", emoji: "🍕"),
        ChatPreset(title: "Create Military Base Tycoon", subtitle: "Army base with weapon upgrades", emoji: "🪖"),
        ChatPreset(title: "Build Candy Factory Tycoon", subtitle: "Sweet candy dropper production line", emoji: "🍬"),
        ChatPreset(title: "Generate Space Station Tycoon", subtitle: "Galactic resource mining empire", emoji: "🚀"),
        ChatPreset(title: "Make YouTuber Tycoon", subtitle: "Grow channel from zero to fame", emoji: "📹"),
        ChatPreset(title: "Add Rebirth System", subtitle: "Reset progress for permanent multiplier", emoji: "🔄"),
        ChatPreset(title: "Create Dropper Upgrades", subtitle: "Multi-tier droppers with better loot", emoji: "💎"),
        ChatPreset(title: "Add Conveyor Belts", subtitle: "Automated resource transport system", emoji: "⚙️"),
        ChatPreset(title: "Setup Gate Unlocking", subtitle: "Progressive area expansion with gates", emoji: "🚪"),
        ChatPreset(title: "Add Purchase Buttons", subtitle: "Speed, value, capacity upgrade paths", emoji: "🛒"),
        ChatPreset(title: "Build Tycoon Economy", subtitle: "Balanced currency with escalating costs", emoji: "💰"),
    ]

    // MARK: RPG

    static let rpg: [ChatPreset] = [
        ChatPreset(title: "Forest Quest RPG", subtitle: "Town hub, quest NPC, enemy camps, loot, and boss", emoji: "🛡️"),
        ChatPreset(title: "Mage Dungeon RPG", subtitle: "Spell wand, dark dungeon, XP leveling, and chests", emoji: "✨"),
        ChatPreset(title: "Archer Boss Hunt", subtitle: "Ranged class, monster camps, gold rewards, and final boss", emoji: "🏹"),
        ChatPreset(title: "Classic Adventure RPG", subtitle: "Three quests, slime enemies, inventory-lite, and HUD", emoji: "⚔️"),
    ]

    // MARK: Horror

    static let horrorGame: [ChatPreset] = [
        ChatPreset(title: "School Escape Horror", subtitle: "Flashlight, keys, locked doors, and patrol monster", emoji: "🔦"),
        ChatPreset(title: "Hospital Chase Horror", subtitle: "Dark fog, The Watcher, scare UI, and escape objective", emoji: "🚪"),
        ChatPreset(title: "Factory Key Hunt", subtitle: "Five keys, multiple doors, PathfindingService chase", emoji: "🗝️"),
        ChatPreset(title: "Soft Spooky Escape", subtitle: "Creator-safe scares, clear objective, and no gore", emoji: "🌘"),
    ]

    // MARK: PvP Arena

    static let pvpArena: [ChatPreset] = [
        ChatPreset(title: "Neon FFA Arena", subtitle: "Sword and bow rounds, spawns, cover, K/D, timer HUD", emoji: "⚔️"),
        ChatPreset(title: "Blaster Arena", subtitle: "Sword + blaster loadout, fast rounds, scoreboard", emoji: "🔫"),
        ChatPreset(title: "Magic Duel Arena", subtitle: "Magic staff, cover pillars, FFA loop, winner callout", emoji: "🪄"),
        ChatPreset(title: "12 Spawn Tournament", subtitle: "Larger spawn ring, round manager, server damage", emoji: "🏆"),
    ]

    // MARK: Simulator

    static let simulator: [ChatPreset] = [
        ChatPreset(title: "Generate Pet Simulator", subtitle: "Hatch eggs, collect rare pets", emoji: "🐾"),
        ChatPreset(title: "Launch Mining Simulator", subtitle: "Dig deep, sell ores, get rich", emoji: "⛏️"),
        ChatPreset(title: "Create Clicking Simulator", subtitle: "Click to power up infinitely", emoji: "👆"),
        ChatPreset(title: "Build Muscle Simulator", subtitle: "Lift weights, get massive, flex", emoji: "💪"),
        ChatPreset(title: "Generate Fighting Simulator", subtitle: "Train power and fight bosses", emoji: "🥊"),
        ChatPreset(title: "Make Treasure Hunt Sim", subtitle: "Dig treasures across tiered islands", emoji: "🗺️"),
        ChatPreset(title: "Add Egg Hatching System", subtitle: "Random pets with rarity tiers", emoji: "🥚"),
        ChatPreset(title: "Create Pet Following", subtitle: "Pets orbit player with stat bonuses", emoji: "🐕"),
        ChatPreset(title: "Add Rebirth System", subtitle: "Reset for permanent power multiplier", emoji: "🔄"),
        ChatPreset(title: "Setup Tiered Zones", subtitle: "Progressive zones needing more rebirths", emoji: "🌍"),
        ChatPreset(title: "Add Power Upgrades", subtitle: "Escalating multiplier upgrade path", emoji: "⚡"),
        ChatPreset(title: "Build Bag Capacity System", subtitle: "Upgrade inventory to carry more", emoji: "🎒"),
    ]

    // MARK: Game Passes & Products

    static let passes: [ChatPreset] = [
        ChatPreset(title: "VIP Game Pass", subtitle: "Exclusive area + 2x coins multiplier", emoji: "👑"),
        ChatPreset(title: "2x Coins Pass", subtitle: "Permanent double coin earnings", emoji: "💰"),
        ChatPreset(title: "Auto Farm Pass", subtitle: "Automatic resource collection system", emoji: "🤖"),
        ChatPreset(title: "Speed Boost Pass", subtitle: "Permanent increased walk speed", emoji: "⚡"),
        ChatPreset(title: "100 Coins Pack", subtitle: "Repeatable currency purchase product", emoji: "🪙"),
        ChatPreset(title: "2x XP Boost", subtitle: "Temporary 30-min experience multiplier", emoji: "📈"),
        ChatPreset(title: "Skip Stage Pass", subtitle: "Skip any obby stage instantly", emoji: "⏭️"),
        ChatPreset(title: "Full Shop System", subtitle: "Complete shop UI with multiple products", emoji: "🏪"),
        ChatPreset(title: "Starter Pack Bundle", subtitle: "Coins + speed + VIP combo deal", emoji: "🎁"),
        ChatPreset(title: "Premium Benefits", subtitle: "Membership perks and rewards", emoji: "⭐"),
        ChatPreset(title: "Donation Board", subtitle: "Let players donate Robux to you", emoji: "❤️"),
        ChatPreset(title: "Extra Lives Product", subtitle: "Buy extra lives in survival games", emoji: "💚"),
    ]

    // MARK: Brainrot Simulator (Steal-a-Brainrot conveyor — TikTok 2026 trends)

    static let brainrotSim: [ChatPreset] = [
        ChatPreset(title: "Steal Brainrot Pets", subtitle: "Collect rare cursed creatures", emoji: "🧠"),
        ChatPreset(title: "Grow Brainrot Garden", subtitle: "Plant memes, harvest chaos", emoji: "🌱"),
        ChatPreset(title: "Escape Skibidi School", subtitle: "Run from cursed bathrooms", emoji: "🚽"),
        ChatPreset(title: "Survive 99 Brainrot Nights", subtitle: "Forest horror, meme monsters", emoji: "🌲"),
        ChatPreset(title: "Summon Tralalero Shark", subtitle: "Italian brainrot boss fight", emoji: "🦈"),
        ChatPreset(title: "Spawn Tung Sahur Chase", subtitle: "Loud meme monster pursuit", emoji: "🏃"),
        ChatPreset(title: "Build Mr. Feast Giveaway", subtitle: "Fake money rain simulator", emoji: "💸"),
        ChatPreset(title: "Drop Elon Mask Lab", subtitle: "Billionaire memes, robot chaos", emoji: "🤖"),
        ChatPreset(title: "Merge Noob Mutants", subtitle: "Combine noobs into monsters", emoji: "🧪"),
        ChatPreset(title: "Escape Poppy Playtime 5", subtitle: "Toy factory horror chase", emoji: "🧸"),
        ChatPreset(title: "Escape Ohio Backrooms", subtitle: "Weird rooms, impossible exits", emoji: "🚪"),
        ChatPreset(title: "Collect Sigma Rizz Aura", subtitle: "Upgrade aura, flex harder", emoji: "✨"),
    ]

    // MARK: Smart NPC Roast & Chat

    static let roastNpc: [ChatPreset] = [
        ChatPreset(title: "Create Roast Pet", subtitle: "Follows player, mocks fails", emoji: "🐾"),
        ChatPreset(title: "Add Noob Detector", subtitle: "Calls out weak gameplay", emoji: "🟢"),
        ChatPreset(title: "Generate Fit Roaster", subtitle: "Judges avatar outfit instantly", emoji: "👕"),
        ChatPreset(title: "Build Savage Enemy", subtitle: "Trash talks before attacks", emoji: "⚔️"),
        ChatPreset(title: "Spawn Broke Pet", subtitle: "Mocks coins and inventory", emoji: "🪙"),
        ChatPreset(title: "Create Brainrot Buddy", subtitle: "Replies in cursed meme slang", emoji: "🤪"),
        ChatPreset(title: "Make Quest Bully", subtitle: "Gives tasks, insults softly", emoji: "📜"),
        ChatPreset(title: "Add Rizz Judge", subtitle: "Rates charm and aura", emoji: "✨"),
        ChatPreset(title: "Create Panic Companion", subtitle: "Screams during danger moments", emoji: "😱"),
        ChatPreset(title: "Generate Final Boss Roaster", subtitle: "Boss insults every move", emoji: "👹"),
    ]

    // MARK: AI Anime Skill Coder

    static let animeSkills: [ChatPreset] = [
        ChatPreset(title: "Cast Void Domain", subtitle: "Expands arena, traps enemies", emoji: "🌌"),
        ChatPreset(title: "Unleash Flame Slash", subtitle: "Fire blade arc with burn", emoji: "🔥"),
        ChatPreset(title: "Summon Shadow Clones", subtitle: "Copies dash, strike, vanish", emoji: "🥷"),
        ChatPreset(title: "Drop Meteor Fist", subtitle: "Sky punch, crater impact", emoji: "☄️"),
        ChatPreset(title: "Activate Lightning Dash", subtitle: "Teleport strike with afterimage", emoji: "⚡"),
        ChatPreset(title: "Release Ice Prison", subtitle: "Freeze zone, slow enemies", emoji: "🧊"),
        ChatPreset(title: "Charge Dragon Beam", subtitle: "Giant beam, full-screen blast", emoji: "🐉"),
        ChatPreset(title: "Trigger Blood Moon Ult", subtitle: "Red sky, rage mode, AoE", emoji: "🌕"),
        ChatPreset(title: "Cast Spirit Chains", subtitle: "Pull targets, bind movement", emoji: "⛓️"),
        ChatPreset(title: "Awaken Demon Aura", subtitle: "Transform, buff, explode energy", emoji: "👹"),
    ]

    // MARK: Obby Troll & Trap Maker

    static let obbyTroll: [ChatPreset] = [
        ChatPreset(title: "Generate Rage Obby", subtitle: "Fake floors, traps, checkpoints", emoji: "💀"),
        ChatPreset(title: "Make Fake Checkpoint", subtitle: "Looks saved, resets hard", emoji: "⚠️"),
        ChatPreset(title: "Add Fake Floor Trap", subtitle: "Safe platform, sudden drop", emoji: "🕳️"),
        ChatPreset(title: "Create Bait Button", subtitle: "Press reward, trigger chaos", emoji: "🎁"),
        ChatPreset(title: "Build Wrong Door Room", subtitle: "Pick wrong, regret instantly", emoji: "🚪"),
        ChatPreset(title: "Add Invisible Wall Jump", subtitle: "Perfect jump, blocked midair", emoji: "🧱"),
        ChatPreset(title: "Make Disappearing Stairs", subtitle: "Climb up, lose everything", emoji: "👻"),
        ChatPreset(title: "Create Troll Jump Pad", subtitle: "Sends players the wrong way", emoji: "🚀"),
        ChatPreset(title: "Add Fake Shortcut", subtitle: "Looks faster, ruins progress", emoji: "➡️"),
        ChatPreset(title: "Generate Spectator Fail Trap", subtitle: "Funny fail made for clips", emoji: "🎥"),
    ]

    // MARK: Weapons

    static let weapons: [ChatPreset] = [
        ChatPreset(title: "Forge Brainrot Blade", subtitle: "Meme sword with chaos VFX", emoji: "🗡️"),
        ChatPreset(title: "Summon Rizz Ray", subtitle: "Viral blaster with glow effects", emoji: "✨"),
        ChatPreset(title: "Drop Neon Katana", subtitle: "Anime slash, instant impact", emoji: "⚔️"),
        ChatPreset(title: "Build Lucky Scythe", subtitle: "Rare drop weapon kit", emoji: "🍀"),
        ChatPreset(title: "Unleash Void Scythe", subtitle: "Boss-level damage and VFX", emoji: "🌑"),
        ChatPreset(title: "Command Titan Hammer", subtitle: "Heavy hits, shockwave combo", emoji: "🔨"),
        ChatPreset(title: "Spawn Raid Cannon", subtitle: "Co-op boss fight weapon", emoji: "💥"),
        ChatPreset(title: "Overclock Damage Staff", subtitle: "Magic scaling, clean balance", emoji: "🪄"),
        ChatPreset(title: "Summon Banana Railgun", subtitle: "Stupid weapon, huge blast", emoji: "🍌"),
        ChatPreset(title: "Forge Toilet Katana", subtitle: "Cursed blade, meme sounds", emoji: "🚽"),
        ChatPreset(title: "Launch Pizza Spell", subtitle: "Flying slices, splash damage", emoji: "🍕"),
        ChatPreset(title: "Deploy Disco Hammer", subtitle: "Dance hit with stun effect", emoji: "🪩"),
        ChatPreset(title: "Generate Ranked Loadout", subtitle: "Balanced PvP weapon set", emoji: "🏅"),
        ChatPreset(title: "Craft Studio Kit", subtitle: "Export-ready weapon package", emoji: "📦"),
        ChatPreset(title: "Balance Pro Weapon", subtitle: "Damage, cooldown, rarity tuned", emoji: "⚖️"),
        ChatPreset(title: "Export Elite Arsenal", subtitle: "Premium weapons, clean scripts", emoji: "🎖️"),
    ]

    // MARK: NPCs (AI behavior)

    static let npcs: [ChatPreset] = [
        ChatPreset(title: "Spawn Brainrot Vendor", subtitle: "Sells cursed items instantly", emoji: "🛒"),
        ChatPreset(title: "Add Drama NPC", subtitle: "Talks, reacts, starts chaos", emoji: "🎭"),
        ChatPreset(title: "Create Meme Quest", subtitle: "Funny task with rewards", emoji: "📜"),
        ChatPreset(title: "Drop Lucky Trader", subtitle: "Random deals, rare offers", emoji: "🎲"),
        ChatPreset(title: "Command Raid Boss", subtitle: "Attacks, phases, enrages", emoji: "👹"),
        ChatPreset(title: "Spawn Hunter Patrol", subtitle: "Tracks players, guards zones", emoji: "🏹"),
        ChatPreset(title: "Deploy Arena Warden", subtitle: "Controls fights and rewards", emoji: "🛡️"),
        ChatPreset(title: "Unleash Shadow Assassin", subtitle: "Sneaks, strikes, disappears", emoji: "🥷"),
        ChatPreset(title: "Hire Banana Mayor", subtitle: "Gives laws and quests", emoji: "🍌"),
        ChatPreset(title: "Summon Toilet Prophet", subtitle: "Predicts chaos, sells relics", emoji: "🚽"),
        ChatPreset(title: "Spawn Pizza Bandit", subtitle: "Steals slices, starts chase", emoji: "🍕"),
        ChatPreset(title: "Create Cow Wizard", subtitle: "Casts spells, trades milk", emoji: "🐄"),
        ChatPreset(title: "Generate Quest Master", subtitle: "Dialogue, tasks, rewards linked", emoji: "📚"),
        ChatPreset(title: "Build Smart Merchant", subtitle: "Shop logic, prices, reactions", emoji: "💼"),
        ChatPreset(title: "Create Patrol System", subtitle: "Routes, alerts, chase logic", emoji: "👮"),
        ChatPreset(title: "Script Living NPC", subtitle: "Personality, memory, actions", emoji: "🧠"),
    ]

    // MARK: Buildings & Structures

    static let buildings: [ChatPreset] = [
        ChatPreset(title: "Build Brainrot Mansion", subtitle: "Meme villa with cursed rooms", emoji: "🏚️"),
        ChatPreset(title: "Drop Elon Mask House", subtitle: "Billionaire tech home inside", emoji: "🏡"),
        ChatPreset(title: "Spawn Pink Princess Castle", subtitle: "Royal rooms, glam furniture", emoji: "🏰"),
        ChatPreset(title: "Raise Military Mega Base", subtitle: "Defense rooms, gates, control hub", emoji: "🪖"),
        ChatPreset(title: "Forge PvP Arena", subtitle: "Battle map with action zones", emoji: "⚔️"),
        ChatPreset(title: "Create Dark King Castle", subtitle: "Throne halls and boss rooms", emoji: "👑"),
        ChatPreset(title: "Build Skibidi Tower", subtitle: "Weird floors, chaotic interior", emoji: "🚽"),
        ChatPreset(title: "Drop Noob House", subtitle: "Funny home with troll details", emoji: "🟢"),
        ChatPreset(title: "Generate Cozy Café Hub", subtitle: "Trendy café with interactive props", emoji: "☕"),
        ChatPreset(title: "Craft Luxury Mall", subtitle: "Shops, lounge, premium interior", emoji: "🛍️"),
    ]

    // MARK: Maps & Environments

    static let maps: [ChatPreset] = [
        ChatPreset(title: "Build Brainrot City", subtitle: "Chaotic streets, meme skybox, neon mood", emoji: "🌆"),
        ChatPreset(title: "Drop Neon Night City", subtitle: "Glowing downtown with social vibes", emoji: "🌃"),
        ChatPreset(title: "Spawn Sakura Village", subtitle: "Cozy anime town, soft lighting", emoji: "🌸"),
        ChatPreset(title: "Raise Warzone Arena", subtitle: "Combat zones, cover, dramatic lighting", emoji: "💣"),
        ChatPreset(title: "Forge Titan Base Island", subtitle: "Fortress terrain, defense mood, storm sky", emoji: "🏝️"),
        ChatPreset(title: "Create Dark Dungeon Realm", subtitle: "Boss halls, lava caves, epic fog", emoji: "🕯️"),
        ChatPreset(title: "Build Skibidi Sewer World", subtitle: "Weird tunnels, cursed lighting, chaos", emoji: "🚽"),
        ChatPreset(title: "Drop Giant Noob Land", subtitle: "Huge noob terrain, goofy atmosphere", emoji: "🟢"),
        ChatPreset(title: "Generate Rich RP City", subtitle: "Luxury roads, villas, polished skyline", emoji: "🏙️"),
        ChatPreset(title: "Craft Fantasy Adventure World", subtitle: "Forests, cliffs, ruins, cinematic sky", emoji: "🗺️"),
    ]

    // MARK: Items & Tools

    static let items: [ChatPreset] = [
        ChatPreset(title: "Generate Brainrot Key", subtitle: "Opens cursed secret rooms", emoji: "🔑"),
        ChatPreset(title: "Drop Lucky Potion", subtitle: "Random boost with sparkle VFX", emoji: "🧪"),
        ChatPreset(title: "Spawn Mega Coins", subtitle: "Collect, spend, unlock rewards", emoji: "🪙"),
        ChatPreset(title: "Forge Admin Crystal", subtitle: "Activates power tools safely", emoji: "💎"),
        ChatPreset(title: "Create Titan Medkit", subtitle: "Full heal with shield effect", emoji: "🩹"),
        ChatPreset(title: "Build Resource Core", subtitle: "Powers upgrades and crafting", emoji: "⚛️"),
        ChatPreset(title: "Brew Skibidi Potion", subtitle: "Weird effect, chaotic sound", emoji: "🚽"),
        ChatPreset(title: "Drop Noob Tool", subtitle: "Funny item with troll logic", emoji: "🛠️"),
        ChatPreset(title: "Generate Quest Items", subtitle: "Keys, tokens, rewards linked", emoji: "🗝️"),
        ChatPreset(title: "Craft Shop Inventory", subtitle: "Prices, rarity, use logic", emoji: "🏪"),
    ]

    // MARK: Scripts / Systems

    static let scripts: [ChatPreset] = [
        ChatPreset(title: "Generate Daily Rewards", subtitle: "Login streak with spin wheel rewards", emoji: "🎁"),
        ChatPreset(title: "Build Pet Following System", subtitle: "Pets orbit player with stat bonuses", emoji: "🐾"),
        ChatPreset(title: "Add Coin Drop Hook", subtitle: "Satisfying coin pickup with VFX", emoji: "🪙"),
        ChatPreset(title: "Script Trade Window", subtitle: "Safe scam-proof player trading", emoji: "🤝"),
        ChatPreset(title: "Deploy Admin Commands", subtitle: "Kick, ban, fly, give items panel", emoji: "🔒"),
        ChatPreset(title: "Install Rebirth System", subtitle: "Reset progress for permanent multiplier", emoji: "🔄"),
        ChatPreset(title: "Create Live Leaderboard", subtitle: "Global top players with stats", emoji: "🏆"),
        ChatPreset(title: "Add Pay-to-Win Boosts", subtitle: "Premium gamepass speed and damage", emoji: "👑"),
        ChatPreset(title: "Script Cursed Anti-Cheat", subtitle: "Troll fake bans with jumpscare", emoji: "💀"),
        ChatPreset(title: "Add Random Teleport Trap", subtitle: "Send players to chaotic rooms", emoji: "🌀"),
        ChatPreset(title: "Build Robust DataStore", subtitle: "Pro-level save with retry and queue", emoji: "💾"),
        ChatPreset(title: "Generate Quest Dialogue Tree", subtitle: "Branching dialogue with rewards", emoji: "📜"),
        ChatPreset(title: "Setup Day Night Cycle", subtitle: "Smooth lighting transitions with weather", emoji: "🌗"),
        ChatPreset(title: "Script Combat System", subtitle: "Hit detection, combos, knockback, ragdoll", emoji: "⚔️"),
    ]

    // MARK: Furniture & Props

    static let furniture: [ChatPreset] = [
        ChatPreset(title: "Craft Cozy Café Chair", subtitle: "Bentwood seat, warm oak, tiny cushion", emoji: "☕"),
        ChatPreset(title: "Make Brainrot Meme Sign", subtitle: "Cursed slogan board with neon trim", emoji: "🤪"),
        ChatPreset(title: "Build Y2K Desk Lamp", subtitle: "Chrome base, pink shade, soft glow", emoji: "💿"),
        ChatPreset(title: "Spawn Anime Idol Plush", subtitle: "Cute shelf decor with pastel fabric", emoji: "🩷"),
        ChatPreset(title: "Forge Royal Throne", subtitle: "Gold frame, velvet seat, crown details", emoji: "👑"),
        ChatPreset(title: "Build Admin Server Rack", subtitle: "Black tower with glowing status lights", emoji: "🖥️"),
        ChatPreset(title: "Make VIP Velvet Sofa", subtitle: "Single luxury couch with gold legs", emoji: "🍾"),
        ChatPreset(title: "Create Cursed Noob TV", subtitle: "Glitched screen, green casing, troll vibe", emoji: "🟢"),
        ChatPreset(title: "Build Skibidi Toilet Throne", subtitle: "Single chaotic prop with ceramic shine", emoji: "🚽"),
        ChatPreset(title: "Generate AAA Living Room Sofa", subtitle: "Clean PBR fabric, modern silhouette", emoji: "🛋️"),
        ChatPreset(title: "Craft Luxury Mall Showcase", subtitle: "Glass display case with premium glow", emoji: "🛍️"),
        ChatPreset(title: "Build Cinematic Studio Light", subtitle: "Tripod lamp, barn doors, warm beam", emoji: "🎬"),
    ]

    // MARK: - Lookup

    static func presets(forSubcategory sub: String?, projectKind: String?) -> [ChatPreset]? {
        switch sub {
        case "characters": return characters
        case "ui": return ui
        case "animations": return animations
        case "audio": return audio
        case "decals": return decals
        case "passes": return passes
        case "obby": return obby
        case "tycoon": return tycoon
        case "simulator": return simulator
        case "rpg": return rpg
        case "horror": return horrorGame
        case "pvp": return pvpArena
        case "brainrot_sim": return brainrotSim
        case "roast_npc": return roastNpc
        case "anime_skills": return animeSkills
        case "obby_troll": return obbyTroll
        case "weapons": return weapons
        case "npcs": return npcs
        case "buildings": return buildings
        case "maps": return maps
        case "items": return items
        case "scripts": return scripts
        case "furniture": return furniture
        default: break
        }
        // For games without a specific subcategory, show Obby presets as the most popular game type
        let kind = projectKind?.lowercased() ?? ""
        if kind == "game" || kind == "clone" {
            return obby
        }
        return nil
    }
}

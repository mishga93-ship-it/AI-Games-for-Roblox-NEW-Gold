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

    // MARK: Tower Defense

    static let towerDefense: [ChatPreset] = [
        ChatPreset(title: "Build a Brainrot Defense", subtitle: "Stop the meme invasion", emoji: "🧠"),
        ChatPreset(title: "Defend Against Prototype", subtitle: "The experiment escaped", emoji: "🧪"),
        ChatPreset(title: "Build a FNAF Defense", subtitle: "Survive the animatronic attack", emoji: "🐻"),
        ChatPreset(title: "Create a Titan War TD", subtitle: "Giants are attacking", emoji: "🗿"),
        ChatPreset(title: "Generate a 99 Nights Defense", subtitle: "Survive until sunrise", emoji: "🌙"),
        ChatPreset(title: "Build a Tralalero Defense", subtitle: "Stop the brainrot army", emoji: "🦈"),
        ChatPreset(title: "Create a Bananita Defense", subtitle: "Tropical chaos is coming", emoji: "🍌"),
        ChatPreset(title: "Generate an Orangutini TD", subtitle: "Defend the pineapple kingdom", emoji: "🍍"),
        ChatPreset(title: "Build a Monster School TD", subtitle: "Escape the creature academy", emoji: "🏫"),
        ChatPreset(title: "Defend MrBeast Island", subtitle: "Win every challenge wave", emoji: "💰"),
    ]

    // MARK: Roleplay / Town

    static let roleplayTown: [ChatPreset] = [
        ChatPreset(title: "Build a MrBeast City", subtitle: "Every house wins money", emoji: "🏙️"),
        ChatPreset(title: "Create a Brainrot Town", subtitle: "Chaos took over everything", emoji: "🤪"),
        ChatPreset(title: "Build a Millionaire School", subtitle: "Rich kids only allowed", emoji: "🤑"),
        ChatPreset(title: "Spawn a Monster Neighborhood", subtitle: "Your neighbors aren't human", emoji: "👹"),
        ChatPreset(title: "Create a Tralalero Kingdom", subtitle: "Rule the brainrot empire", emoji: "🦈"),
        ChatPreset(title: "Build a Superhero School", subtitle: "Train the next legend", emoji: "🦸"),
        ChatPreset(title: "Generate a 99 Nights Town", subtitle: "Survive the endless night", emoji: "🌙"),
        ChatPreset(title: "Create a Secret Agent City", subtitle: "Everyone hides a secret", emoji: "🕵️"),
        ChatPreset(title: "Build a Giant Pet World", subtitle: "Pets run the town", emoji: "🐾"),
        ChatPreset(title: "Create a Bananita Island", subtitle: "Tropical brainrot paradise", emoji: "🍌"),
    ]

    // MARK: Racing (race-themed half of the user's Racing/Parkour list)

    static let racing: [ChatPreset] = [
        ChatPreset(title: "Race Through Brainrot", subtitle: "Pure meme speed chaos", emoji: "🏎️"),
        ChatPreset(title: "Race for a Billion Dollars", subtitle: "Every checkpoint gets richer", emoji: "💰"),
        ChatPreset(title: "Drive the Dragon Highway", subtitle: "Race above the clouds", emoji: "🐉"),
        ChatPreset(title: "Race Across Lava City", subtitle: "One mistake and you're done", emoji: "🌋"),
    ]

    // MARK: Parkour (run/climb half of the user's Racing/Parkour list)

    static let parkour: [ChatPreset] = [
        ChatPreset(title: "Escape the Prototype", subtitle: "Run before it catches you", emoji: "🧪"),
        ChatPreset(title: "Survive 99 Nights Run", subtitle: "Don't stop moving", emoji: "🌙"),
        ChatPreset(title: "Escape Freddy's Factory", subtitle: "Animatronics are hunting you", emoji: "🐻"),
        ChatPreset(title: "Climb the Giant Titan", subtitle: "Parkour on a living monster", emoji: "🗿"),
        ChatPreset(title: "Escape the Brainrot School", subtitle: "Every class is cursed", emoji: "🏫"),
        ChatPreset(title: "Parkour in MrBeast Tower", subtitle: "Reach the top, get rich", emoji: "🗼"),
    ]

    // MARK: Story Game

    static let storyGame: [ChatPreset] = [
        ChatPreset(title: "Trapped With Prototype", subtitle: "Escape before it's too late", emoji: "🧪"),
        ChatPreset(title: "The Last Night Guard", subtitle: "Survive until 6 AM", emoji: "🔦"),
        ChatPreset(title: "Lost in 99 Nights", subtitle: "Nobody survived before", emoji: "🌲"),
        ChatPreset(title: "Brainrot Apocalypse", subtitle: "The memes became real", emoji: "🧠"),
        ChatPreset(title: "MrBeast's Final Challenge", subtitle: "Only one player wins", emoji: "💰"),
        ChatPreset(title: "The Secret Rich Kid School", subtitle: "Something is hidden here", emoji: "🎓"),
        ChatPreset(title: "Escape Bananita Island", subtitle: "Paradise turned dangerous", emoji: "🍌"),
        ChatPreset(title: "Orangutini's Kingdom", subtitle: "Save the pineapple throne", emoji: "🍍"),
        ChatPreset(title: "Monster School Detention", subtitle: "Never stay after class", emoji: "👹"),
        ChatPreset(title: "The Haunted Sleepover", subtitle: "Your friends vanished overnight", emoji: "👻"),
    ]

    // MARK: Mini-games Hub

    static let minigameHub: [ChatPreset] = [
        ChatPreset(title: "MrBeast Challenge Hub", subtitle: "Win or get eliminated", emoji: "💰"),
        ChatPreset(title: "Brainrot Battle Games", subtitle: "Chaos every single round", emoji: "🤪"),
        ChatPreset(title: "Survive 99 Nights Arena", subtitle: "Every round gets harder", emoji: "🌙"),
        ChatPreset(title: "Prototype's Game Show", subtitle: "Escape or get caught", emoji: "🧪"),
        ChatPreset(title: "FNAF Party Games", subtitle: "Animatronics choose winners", emoji: "🐻"),
        ChatPreset(title: "No Rules Challenge", subtitle: "Anything can happen", emoji: "🎲"),
        ChatPreset(title: "Rich Kid Competitions", subtitle: "Only the richest survive", emoji: "🤑"),
        ChatPreset(title: "Monster School Olympics", subtitle: "Train like a creature", emoji: "🏅"),
        ChatPreset(title: "Bananita Island Games", subtitle: "Tropical meme tournament", emoji: "🍌"),
        ChatPreset(title: "Ultimate Obby Showdown", subtitle: "100 mini-games in one", emoji: "🎮"),
    ]

    // MARK: Survival (survival-themed half of the user's Survival/Fighting list)

    static let survival: [ChatPreset] = [
        ChatPreset(title: "Survive the Prototype", subtitle: "It learns from every kill", emoji: "🧪"),
        ChatPreset(title: "99 Nights Survival", subtitle: "The darkness never ends", emoji: "🌙"),
        ChatPreset(title: "Monster School Survival", subtitle: "Students vs creatures", emoji: "🏫"),
        ChatPreset(title: "Bananita Island Survival", subtitle: "Paradise became dangerous", emoji: "🍌"),
        ChatPreset(title: "The Hungry Worm Hunt", subtitle: "Run before it grows", emoji: "🪱"),
    ]

    // MARK: Fighting (combat-themed half of the user's Survival/Fighting list)

    static let fighting: [ChatPreset] = [
        ChatPreset(title: "Brainrot Wars", subtitle: "Meme factions at war", emoji: "⚔️"),
        ChatPreset(title: "Fight the Animatronics", subtitle: "Every night gets worse", emoji: "🐻"),
        ChatPreset(title: "MrBeast Battle Royale", subtitle: "Last player gets everything", emoji: "💰"),
        ChatPreset(title: "Titan Arena", subtitle: "Giants want you dead", emoji: "🗿"),
        ChatPreset(title: "Tralalero Boss Fight", subtitle: "Save the kingdom", emoji: "🦈"),
    ]

    // MARK: Custom

    static let customGame: [ChatPreset] = [
        ChatPreset(title: "Mix Everything Together", subtitle: "AI chooses complete chaos", emoji: "🎲"),
        ChatPreset(title: "Generate a Viral Hit", subtitle: "Build the next Roblox trend", emoji: "🔥"),
        ChatPreset(title: "Create My Dream Game", subtitle: "Anything you imagine", emoji: "✨"),
        ChatPreset(title: "Random Madness Generator", subtitle: "Nothing makes sense here", emoji: "🌀"),
        ChatPreset(title: "Build a Brainrot Universe", subtitle: "Memes control reality", emoji: "🧠"),
        ChatPreset(title: "Generate a MrBeast Challenge", subtitle: "Bigger than ever before", emoji: "💰"),
        ChatPreset(title: "Create a Prototype World", subtitle: "Horror meets adventure", emoji: "🧪"),
        ChatPreset(title: "Build a No Rules Game", subtitle: "Anything can happen", emoji: "🎮"),
        ChatPreset(title: "Generate Infinite Modes", subtitle: "New gameplay every round", emoji: "♾️"),
        ChatPreset(title: "Create a Roblox Legend", subtitle: "The next big thing", emoji: "👑"),
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

    // MARK: Voice-Controlled Disaster Spawner
    //
    // Session 385 round 7 — Disaster Spawner moved off its dedicated full-screen
    // sheet (DisasterSpawnerStudioView) onto the standard ChatView interview
    // flow. Chips below are tap-to-prefill prompts that the user can fire
    // verbatim, or edit before sending. Server (`generateDisaster()` already
    // safe-sandboxes the Lua — banned services, population cap, Debris cleanup —
    // so chips can be wild; the safety net is at generator level, not preset.

    static let disasterSpawner: [ChatPreset] = [
        ChatPreset(title: "Banana Rain Apocalypse", subtitle: "Yellow banana parts pelt the map", emoji: "🍌"),
        ChatPreset(title: "Giant Rubber Ducks", subtitle: "Bouncy squeaky chaos every 30s", emoji: "🦆"),
        ChatPreset(title: "Skibidi Toilet Flood", subtitle: "Toilets spawn, launch, explode", emoji: "🚽"),
        ChatPreset(title: "Flying Refrigerators", subtitle: "Spinning fridges crash everywhere", emoji: "🧊"),
        ChatPreset(title: "Tornado Barrage", subtitle: "Spinning vortices shred terrain", emoji: "🌪️"),
        ChatPreset(title: "Meteor Storm", subtitle: "Falling glowing rocks every 15s", emoji: "☄️"),
        ChatPreset(title: "Lava Volcano Burst", subtitle: "Magma fountains under players", emoji: "🌋"),
        ChatPreset(title: "Cursed Italian Memes", subtitle: "Tralalero + bombardiro chaos", emoji: "🍕"),
        ChatPreset(title: "Headless Horseman Raid", subtitle: "Floating pumpkins chase players", emoji: "🎃"),
        ChatPreset(title: "Sigma Stone Statues", subtitle: "Moai heads roll across the map", emoji: "🗿"),
        ChatPreset(title: "Brainrot Pet Stampede", subtitle: "Tiny cursed pets swarm", emoji: "🧠"),
        ChatPreset(title: "Falling Couches", subtitle: "Furniture rain — Ohio energy", emoji: "🛋️"),
    ]

    // MARK: Voice-to-Aura
    //
    // Session 388 — Voice-to-Aura migrated off its dedicated full-screen form
    // (VoiceAuraStudioView with mic + style picker + 3 modifier rails) onto
    // the standard ChatView interview flow, on user request («чат войс ту
    // аура надо сделать как все остальные чаты с интервью»). Chips below
    // span the 8 AuraStyle cases (anime / realistic / sigma / demon / cyber /
    // void / cosmic / meme) plus some viral character-flavored prompts so a
    // tap-and-send produces a usable aura. The interview LLM extracts
    // style + intensity + size + tone from the prompt; safety net is the
    // server-side Lua sanitizer (banned identifiers stripped), not preset.

    static let voiceAura: [ChatPreset] = [
        ChatPreset(title: "Purple Lightning Anime Aura", subtitle: "Crackling violet bolts, OP feel", emoji: "⚡"),
        ChatPreset(title: "Sukuna Crimson Demon Aura", subtitle: "Blood-red curse, smoke trails", emoji: "👹"),
        ChatPreset(title: "Sigma Stoic Golden Aura", subtitle: "Calm gold glow, alpha vibe", emoji: "🗿"),
        ChatPreset(title: "Void Black Hole Aura", subtitle: "Dark void rings, swallowing light", emoji: "🕳️"),
        ChatPreset(title: "Cyber Neon Hacker Aura", subtitle: "Glitchy cyan grid, matrix-style", emoji: "💠"),
        ChatPreset(title: "Cosmic Galaxy Aura", subtitle: "Star-dust swirl, nebula colors", emoji: "🌌"),
        ChatPreset(title: "Skibidi Cursed Meme Aura", subtitle: "Brainrot toilet chaos, viral", emoji: "🚽"),
        ChatPreset(title: "Realistic Fire Smoke Aura", subtitle: "Photoreal flame embers", emoji: "🔥"),
        ChatPreset(title: "Goku Ultra Instinct Aura", subtitle: "Silver-blue shimmer, godlike", emoji: "✨"),
        ChatPreset(title: "Itadori Black Flash Aura", subtitle: "Black sparks, knockout vibe", emoji: "💢"),
        ChatPreset(title: "Ice Frost Mage Aura", subtitle: "Pale blue snow swirl", emoji: "❄️"),
        ChatPreset(title: "Lightning God Storm Aura", subtitle: "White-yellow electricity halo", emoji: "🌩️"),
    ]

    // MARK: Zero-Robux Fitting Room
    //
    // Session 389 — Fitting Room migrated off its dedicated full-screen
    // picker (FittingRoomStudioView with vibe grid + customize step) onto
    // the standard ChatView interview flow, on user request («сделать чат
    // генерации с интервью как и все чаты»). Chips below span the 9
    // OutfitAesthetic vibes (sigma / baddie / y2k / goth / rich_emo /
    // slender / cyber / pastel_softgirl / cottagecore — covers female AND
    // male energies) plus a few viral combos (headless+korblox illusion,
    // brainrot fit, drip lord). Each chip is a tap-to-prefill prompt the
    // interview LLM converts into aestheticId + gender + style; backend
    // ultimately reuses assembleOutfit from the Outfit Generator path.

    static let fittingRoom: [ChatPreset] = [
        ChatPreset(title: "Sigma Stoic Suit Fit", subtitle: "Cold minimalist, 1% mindset, all-black", emoji: "🗿"),
        ChatPreset(title: "Baddie Boss Mode Fit", subtitle: "TikTok confident, bold slay energy", emoji: "💋"),
        ChatPreset(title: "Y2K Mall Princess Core", subtitle: "Butterflies, pink, low-rise denim", emoji: "🦋"),
        ChatPreset(title: "Goth Cathedral Drip", subtitle: "Dark dramatic, chains, lace, boots", emoji: "🖤"),
        ChatPreset(title: "Rich Emo Designer Fit", subtitle: "Layered black, chains, intentional sadness", emoji: "⛓️"),
        ChatPreset(title: "Slender Anime Demon", subtitle: "Tall narrow silhouette, mysterious", emoji: "👁️"),
        ChatPreset(title: "Cyber Neon Hacker Fit", subtitle: "Glowing visor, holo jacket, rainbow accents", emoji: "💠"),
        ChatPreset(title: "Pastel Soft Girl Aesthetic", subtitle: "Baby pink, cute plush, gentle vibe", emoji: "🩷"),
        ChatPreset(title: "Cottagecore Forest Witch", subtitle: "Mystical nature, mushrooms, herbs", emoji: "🍄"),
        ChatPreset(title: "Headless Korblox Illusion", subtitle: "Fake limited-look on a 0 R$ budget", emoji: "💀"),
        ChatPreset(title: "Cursed Italian Brainrot Fit", subtitle: "Tralalero core, meme-maxed accessories", emoji: "🍕"),
        ChatPreset(title: "Drip Lord Maxed-Out Flex", subtitle: "Every slot stacked, marketplace-flex", emoji: "🧊"),
    ]

    // MARK: Cursed UGC Modeler
    //
    // Session 390 — Cursed UGC Modeler migrated off its dedicated picker
    // (CursedUGCStudioView: category grid → style grid → customize → result)
    // onto the standard ChatView interview flow, on user request («нужно
    // это заменить на обычный чат с интервью как у всех»). Chips below
    // span the 7 CursedUGCCategoryId values (giant_backpack / cursed_face /
    // meme_plushie / giant_pet / weird_mask / brainrot_item / oversized_hat)
    // crossed with the 8 styles (cute / horror / sigma / brainrot / anime /
    // hyperreal / cursed / emo). Each chip is a tap-to-prefill prompt the
    // viralChatDispatch handler converts into categoryId + styleId + intensity.

    static let cursedUgc: [ChatPreset] = [
        ChatPreset(title: "Screaming Sigma Hamster Backpack", subtitle: "Mythic brainrot — backpack of doom", emoji: "🎒"),
        ChatPreset(title: "Cursed Deep-Fried Smile Face", subtitle: "Wide unsettling meme grin", emoji: "😬"),
        ChatPreset(title: "Giant Brainrot Italian Plushie", subtitle: "Tralalero shoulder plush, oversized", emoji: "🍕"),
        ChatPreset(title: "Massive Sigma Moai Pet", subtitle: "Stone-face follower bigger than avatar", emoji: "🗿"),
        ChatPreset(title: "Weird Skibidi Toilet Mask", subtitle: "Bizarre cursed-meme head covering", emoji: "🚽"),
        ChatPreset(title: "Brainrot Banana-Shark Mythic", subtitle: "Steal-a-Brainrot maxed-out chaos", emoji: "🍌"),
        ChatPreset(title: "Oversized Cursed Crown Hat", subtitle: "Crown 3x bigger than avatar", emoji: "👑"),
        ChatPreset(title: "Cute Pastel Plush Cat Mask", subtitle: "Kawaii face covering, soft pink", emoji: "🐱"),
        ChatPreset(title: "Horror Cursed Eyeball Pet", subtitle: "Floating watching companion", emoji: "👁️"),
        ChatPreset(title: "Anime Demon Backpack of Doom", subtitle: "Sukuna-vibes shoulder horror", emoji: "👹"),
        ChatPreset(title: "Hyperreal Brainrot Fridge Hat", subtitle: "Photoreal absurd appliance crown", emoji: "🧊"),
        ChatPreset(title: "Emo MySpace 2007 Cursed Plush", subtitle: "Black chains, side-bangs, cursed", emoji: "🖤"),
    ]

    // MARK: Avatar Glow-Up
    //
    // Session 395 — Avatar Glow-Up (Fake Headless & Korblox tile) migrated off
    // its dedicated GlowupStudioView picker onto the standard ChatView
    // interview flow, like the other viral kinds. Chips below span the 4
    // GlowupVibe ids (headless_shadow / korblox_style / void / sigma) plus a
    // couple of gender/intensity-flavored combos. Each chip carries the
    // keywords `extractGlowupParams()` (viralChatDispatch.ts) maps into
    // vibeId + gender + intensity — so a tap-and-send produces a usable
    // glow-up. Backend assembles a free/cheap catalog recipe + preview.

    static let glowup: [ChatPreset] = [
        ChatPreset(title: "Fake Headless Horseman Look", subtitle: "Mimic the 31,000 R$ no-head illusion for free", emoji: "🎃"),
        ChatPreset(title: "Korblox Skeleton Leg Glow", subtitle: "Fake the 17,000 R$ frozen undead leg", emoji: "🦴"),
        ChatPreset(title: "Void Faceless All-Black", subtitle: "Pitch-black abyss avatar, cursed aura", emoji: "🕳️"),
        ChatPreset(title: "Sigma Grindset Minimal", subtitle: "Cold stoic alpha, 1% mindset drip", emoji: "🗿"),
        ChatPreset(title: "Scary Headless Demon Girl", subtitle: "Creepy no-head horror, dark female energy", emoji: "💀"),
        ChatPreset(title: "Korblox + Headless Combo", subtitle: "Stack both fake limiteds in one fit", emoji: "🔥"),
        ChatPreset(title: "Void Abyss Boy Glow", subtitle: "Faceless black-hole male avatar", emoji: "🌑"),
        ChatPreset(title: "Sigma Alpha Chad Glow", subtitle: "Grindset moai energy, boys edition", emoji: "😎"),
        ChatPreset(title: "Spooky Void Cursed Vibe", subtitle: "Scary faceless nightmare aesthetic", emoji: "👻"),
        ChatPreset(title: "Clean Korblox Frozen Leg", subtitle: "Undead skeleton leg, polished look", emoji: "❄️"),
        ChatPreset(title: "Headless Horseman Girls", subtitle: "No-head illusion with feminine drip", emoji: "🖤"),
        ChatPreset(title: "Sigma Stoic Void Mix", subtitle: "All-black alpha minimalist combo", emoji: "⚫"),
    ]

    // MARK: 1-Click Outfit Generator
    //
    // Session 395 — 1-Click Outfit Generator migrated off its dedicated
    // OutfitStudioView picker onto the standard ChatView interview flow.
    // Chips below span the 9 OutfitAesthetic ids (sigma / baddie / y2k / goth
    // / rich_emo / slender / softie / cyber / anime_demon). Each chip carries
    // the keywords `extractFittingRoomParams()` maps into aestheticId + gender
    // + style; backend `assembleOutfit()` searches the live catalog for the
    // cheapest matching items + AI style ranking + a hero flux render.

    static let outfit: [ChatPreset] = [
        ChatPreset(title: "Sigma Stoic All-Black Fit", subtitle: "Cold minimalist 1% mindset, full flex", emoji: "🗿"),
        ChatPreset(title: "Baddie Boss Mode Slay Fit", subtitle: "TikTok confident girl, bold colorful", emoji: "💋"),
        ChatPreset(title: "Y2K Mall Princess Outfit", subtitle: "Butterflies, pink, low-rise early 2000s", emoji: "🦋"),
        ChatPreset(title: "Goth Cathedral Dark Drip", subtitle: "Gothic black lace, dramatic vampire", emoji: "🖤"),
        ChatPreset(title: "Rich Emo Designer Layers", subtitle: "Luxury emo, chains layered, dark", emoji: "⛓️"),
        ChatPreset(title: "Slender Mysterious Silhouette", subtitle: "Tall narrow liminal, dark monochrome", emoji: "👁️"),
        ChatPreset(title: "Softie Pastel Coquette Fit", subtitle: "Baby pink kawaii, soft girl colorful", emoji: "🩷"),
        ChatPreset(title: "Cyber Neon Hacker Drip", subtitle: "Cyberpunk holo glitch, rainbow neon", emoji: "💠"),
        ChatPreset(title: "Anime Demon Sukuna Fit", subtitle: "JJK black hair red eyes, dark", emoji: "👹"),
        ChatPreset(title: "Baddie Y2K Crossover", subtitle: "Bold girl meets butterfly nostalgia", emoji: "✨"),
        ChatPreset(title: "Cyber Sigma Tron Flex", subtitle: "Neon alpha grindset, matrix style", emoji: "🤖"),
        ChatPreset(title: "Goth Rich Emo Maxed", subtitle: "Cathedral chains, intentional sadness", emoji: "🥀"),
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

    // Release 3 prop-pack themes (source: "AI Games for Roblox - Presets.md"
    // → "# 3 релиз" / Furniture & Props). Each chip is a themed decor set for
    // filling buildings & maps. NOTE: the furniture pipeline generates ONE prop
    // per run (furnitureType chair/table/lamp/…), so a "pack" chip seeds a
    // themed single prop — true multi-prop set generation is a separate feature.

    static let furniture: [ChatPreset] = [
        ChatPreset(title: "Prototype Lab Props", subtitle: "Abandoned experiment furniture", emoji: "🧪"),
        ChatPreset(title: "Freddy's Pizza Pack", subtitle: "Animatronic restaurant decor", emoji: "🍕"),
        ChatPreset(title: "Brainrot Furniture Pack", subtitle: "Meme decor from another universe", emoji: "🤪"),
        ChatPreset(title: "Bananita Decor Set", subtitle: "Tropical meme furniture", emoji: "🍌"),
        ChatPreset(title: "Orangutini Collection", subtitle: "Pineapple kingdom essentials", emoji: "🍍"),
        ChatPreset(title: "99 Nights Camp Pack", subtitle: "Survival base essentials", emoji: "🏕️"),
        ChatPreset(title: "MrBeast Challenge Props", subtitle: "Viral challenge decorations", emoji: "💰"),
        ChatPreset(title: "Cyberpunk Street Props", subtitle: "Neon city decorations", emoji: "🌃"),
        ChatPreset(title: "Monster School Furniture", subtitle: "Classroom for creatures", emoji: "🏫"),
        ChatPreset(title: "Rich Kid Decor Pack", subtitle: "Luxury lifestyle assets", emoji: "💎"),
        ChatPreset(title: "Horror Motel Props", subtitle: "Creepy abandoned furniture", emoji: "🛏️"),
        ChatPreset(title: "Gamer Room Assets", subtitle: "Ultimate streaming setup", emoji: "🎮"),
    ]

    // MARK: Clothing & Outfits (Release 3)
    //
    // Classic 2D clothing + layered outfits for the Roblox Marketplace.
    // Source: "AI Games for Roblox - Presets.md" → "# 3 релиз" / Clothing.

    static let clothing: [ChatPreset] = [
        ChatPreset(title: "Dress Like Prototype", subtitle: "Poppy Playtime final evolution", emoji: "🧪"),
        ChatPreset(title: "Wear Tung Tung Style", subtitle: "Viral brainrot meme outfit", emoji: "🪵"),
        ChatPreset(title: "Become Homelander", subtitle: "Ultimate supervillain drip", emoji: "🦸"),
        ChatPreset(title: "Join Freddy Crew", subtitle: "Animatronic horror fashion", emoji: "🐻"),
        ChatPreset(title: "Go Skibidi Mode", subtitle: "Brainrot outfit collection", emoji: "🚽"),
        ChatPreset(title: "Wear Bananita Dolfinita", subtitle: "Tropical meme fashion pack", emoji: "🍌"),
        ChatPreset(title: "Dress Like MrBeast", subtitle: "Viral creator luxury fit", emoji: "💸"),
        ChatPreset(title: "Wear Dark Academia", subtitle: "Elite aesthetic wardrobe", emoji: "📚"),
        ChatPreset(title: "Wear Orangutini Ananasini", subtitle: "Legendary fruit monkey drip", emoji: "🍍"),
        ChatPreset(title: "Create Rich Girl Fits", subtitle: "Luxury TikTok fashion pack", emoji: "💅"),
    ]

    // MARK: Vehicles (Release 3)
    //
    // Cars, bikes, boats, planes, tanks — drive script + passengers + sounds.
    // Source: "AI Games for Roblox - Presets.md" → "# 3 релиз" / Vehicles.

    static let vehicles: [ChatPreset] = [
        ChatPreset(title: "Build a Flying Supercar", subtitle: "Impossible future transport", emoji: "🏎️"),
        ChatPreset(title: "Generate a Brainrot Car", subtitle: "Absolute meme transportation", emoji: "🤪"),
        ChatPreset(title: "Drive a Bugatti Empire", subtitle: "Billionaire lifestyle unlocked", emoji: "💎"),
        ChatPreset(title: "Build a Titan Mech", subtitle: "Giant robot battle machine", emoji: "🤖"),
        ChatPreset(title: "Create a MrBeast Challenge Bus", subtitle: "Viral creator mega vehicle", emoji: "🚌"),
        ChatPreset(title: "Spawn a Skibidi Tank", subtitle: "Meme warfare unleashed", emoji: "🚽"),
        ChatPreset(title: "Build a Batmobile X", subtitle: "Dark hero super vehicle", emoji: "🦇"),
        ChatPreset(title: "Create a Shark Submarine", subtitle: "Ocean predator machine", emoji: "🦈"),
        ChatPreset(title: "Generate a Dragon Bike", subtitle: "Ride the legendary beast", emoji: "🐉"),
        ChatPreset(title: "Build a Cyber Drift Beast", subtitle: "Neon racing domination", emoji: "💠"),
        ChatPreset(title: "Create a Billionaire Yacht", subtitle: "Floating luxury kingdom", emoji: "🛥️"),
        ChatPreset(title: "Spawn a Monster Crocodile Truck", subtitle: "Chaos on giant wheels", emoji: "🐊"),
    ]

    // MARK: Pets (Release 3)
    //
    // Standalone pet assets — model + follow animation + leveling + rarity.
    // Source: "AI Games for Roblox - Presets.md" → "# 3 релиз" / Pets.

    static let pets: [ChatPreset] = [
        ChatPreset(title: "Hatch a Brainrot Pet", subtitle: "Viral companion from chaos", emoji: "🧠"),
        ChatPreset(title: "Summon Tralalero Tralala", subtitle: "Legendary Italian brainrot pet", emoji: "🦈"),
        ChatPreset(title: "Hatch Bananita Dolfinita", subtitle: "Chaos from the deep sea", emoji: "🍌"),
        ChatPreset(title: "Summon Orangutini Ananasini", subtitle: "Tropical meme evolution", emoji: "🍍"),
        ChatPreset(title: "Create a Hungry Worm", subtitle: "Always hungry, always growing", emoji: "🪱"),
        ChatPreset(title: "Spawn a 99 Nights Owl", subtitle: "Survivor's legendary companion", emoji: "🦉"),
        ChatPreset(title: "Summon a Galaxy Dragon", subtitle: "Cosmic legendary companion", emoji: "🐉"),
        ChatPreset(title: "Spawn a Shadow Wolf", subtitle: "Ultimate dark companion", emoji: "🐺"),
        ChatPreset(title: "Create a MrBeast Beast", subtitle: "Viral challenge companion", emoji: "💸"),
        ChatPreset(title: "Summon a Meme Raptor", subtitle: "Internet chaos unleashed", emoji: "🦖"),
        ChatPreset(title: "Spawn a Mecha T-Rex", subtitle: "Robotic dinosaur evolution", emoji: "🦾"),
        ChatPreset(title: "Hatch a God Pet", subtitle: "Beyond mythical rarity", emoji: "👑"),
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
        case "tower_defense": return towerDefense
        case "roleplay_town": return roleplayTown
        case "racing": return racing
        case "parkour": return parkour
        case "story_game": return storyGame
        case "minigame_hub": return minigameHub
        case "survival": return survival
        case "fighting": return fighting
        case "custom": return customGame
        case "brainrot_sim": return brainrotSim
        case "disaster_spawner": return disasterSpawner
        case "voice_aura": return voiceAura
        case "fitting_room": return fittingRoom
        case "cursed_ugc": return cursedUgc
        case "glowup": return glowup
        case "outfit": return outfit
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
        case "clothing": return clothing
        case "vehicles": return vehicles
        case "pets": return pets
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

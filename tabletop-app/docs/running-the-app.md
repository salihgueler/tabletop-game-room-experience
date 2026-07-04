# Running the App & Getting Started

Adventurer's Guild Hall is a 16-bit pixel-art tabletop RPG room. You forge a hero,
join or create a campaign in the Guild Hall, and play a turn-based session with a
4-seat party and an **AI Dungeon Master** plus AI companions.

There are two ways to run it: use the **deployed app**, or run it **locally**.

## Running the app

### Option A — Use the deployed app (no setup)

Open **https://d2h5phpnqbldk.cloudfront.net**, create an account (username ≥ 3
characters, password ≥ 8 characters), and follow the "Getting to know the app" steps
below. This is backed by real AWS services, so the AI DM runs on Amazon Bedrock.

### Option B — Run locally

You **don't need an AWS account** to run locally — every backend service runs as an
in-memory/file mock.

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. *(Optional)* Set up **Ollama** for real local AI responses — see
   [Local AI setup (Ollama)](../README.md#local-ai-setup-ollama). Ollama is optional:
   without it, the app falls back to a deterministic canned AI provider and is still
   fully playable — you just won't get scene-specific narration or contextual actions.
4. Start the app:

   ```bash
   npm run dev
   ```

5. Open **http://localhost:3000**.

## Getting to know the app

### 1. Create a user

Sign up with a **username** (at least 3 characters) and a **password** (at least 8
characters).

### 2. Forge your hero

Enter a character **name** and choose from **20 sprites across 4 classes** — Paladin,
Sorcerer, Rogue, and Ranger. Your class isn't just cosmetic: it determines your
abilities and the action choices you'll get during play. Your hero is saved to your
account.

### 3. Enter the Guild Hall

From the lobby you can:

- **Join a public game** that hasn't started yet (claim an open seat and play).
- **Watch** an ongoing game as a spectator (games that are already full are watch-only).
- **Join a private game** by entering its access code.
- **Create a new game** — pick a **scenario theme**, an **AI DM type**, and set it
  public or private. Then choose how to fill the party:
  - **Fill with AI companions** — the other seats become AI and the game starts
    immediately, or
  - **Wait for other players** — seats stay open for humans. As the **host**, you can
    hit **"Start Now (fill with AI)"** at any time to begin.

### 4. Play a turn

The game is turn-based and runs around a 4-seat party:

1. On your turn, the **AI DM sets the scene** and offers **3–4 contextual action
   choices** tailored to the moment and your class.
2. You **pick an action** → the server **rolls a d20 against a difficulty class** →
   the result is success or failure.
3. The **AI DM narrates** the outcome.
4. **AI companions take their turns automatically**, one at a time, then the turn
   passes to the next seat.

> A session lasts at most **15 minutes**. A live countdown shows the time remaining;
> when it runs out, a "Time's Up" dialog appears and the adventure ends. The full
> transcript stays readable in the chat log.

### 5. What to observe

- **Center of the board** — the AI DM's narration and *your* action buttons (this is
  where you choose your move on your turn).
- **Left rail** — the **turn order**, showing whose turn it is.
- **Right side** — the **chat log** recording every action, dice roll, and DM line,
  plus your inventory and the dice tray.
- **Top of the room** — watch the **AI agents' thinking** stream live (both the DM
  setting the scene and each companion reasoning about its move) before actions unlock.
- **Chat** — send messages to the table. Chat is social only; it won't affect the
  story.

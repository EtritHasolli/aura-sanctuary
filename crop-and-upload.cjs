// crop-and-upload.js
//
// Usage:
// 1. npm install @supabase/supabase-js sharp dotenv
// 2. Create a .env file:
//
// SUPABASE_URL=https://YOURPROJECT.supabase.co
// SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
//
// 3. Put your generated sprite sheet image in the same folder.
//    Example: items-sheet.png
//
// 4. Run:
//    node crop-and-upload.js
//
// ------------------------------------------------------------

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

// ============================================================
// CONFIG
// ============================================================

const IMAGE_PATH = "./items-sheet.png";

// Your bucket name
const BUCKET = "item-icons";

// Grid settings
const COLS = 10;
const ROWS = 10;

// Final icon size
const CELL_SIZE = 32;

// If your sheet has padding around the outside
const OUTER_PADDING = 0;

// If there is spacing between cells
const GAP = 0;

// If there is an outline/border around the item inside the cell
const INNER_PADDING = 5;

// ============================================================
// ITEM SLUGS
// IMPORTANT:
// ORDER MUST MATCH THE GRID LEFT->RIGHT, TOP->BOTTOM
// ============================================================

const itemSlugs = [

  "hp-herb-tea"
  ,

  "stamina-vigor-draught"
  ,

  "bulkcon-rose-salve"
  ,

  "stamina-herbal-tea"
  ,

  "bulkcon-mist-elixir-s"
  ,

  "hp-phoenix-salt"
  ,

  "loot-key"
  ,

  "bulkcon-tea-twilight-leaf"
  ,

  "bulkcon-dew-tonic-m"
  ,

  "stamina-energy-bar"
  ,

  "focus-incense"
  ,

  "bulkcon-double-mist-kit"
  ,

  "bulkcon-riverdraft-vial"
  ,

  "bulkcon-phoenix-pinfeather-tea"
  ,

  "bulkcon-guardian-roll"
  ,

  "stamina-crystal-vial"
  ,

  "bulkcon-sunpulse-flask"
  ,

  "companion-egg"
  ,

  "bulkcon-monsoon-jar-mini"
  ,

  "bulkcon-dreamfoam-tinct"
  ,

  "bulkcon-moonswell-crystal"
  ,

  "bulkcon-oracle-balm-jar"
  ,

  "moonshard-cosmetic-orb"
  ,

  "bulkdec-moon-cheek-dash"
  ,

  "bulkdec-sun-disk-mark"
  ,

  "bulkdec-rune-cheek-lines"
  ,

  "bulkdec-starfield-nails"
  ,

  "pet-wizard-hat"
  ,

  "bulkdec-whisper-mask"
  ,

  "pet-amber-aura"
  ,

  "bulkdec-crystal-brow-bind"
  ,

  "pet-crown"
  ,

  "bulkdec-aurora-veils"
  ,

  "bulkdec-garden-halo-wire"
  ,

  "bulkdec-void-eye-liner-kit"
  ,

  "bulkdec-echo-mask-half"
  ,

  "bulkeq-willow-switch"
  ,

  "bulkeq-stick-wand"
  ,

  "bulkeq-twine-bracers"
  ,

  "bulkeq-rope sandals-wrap"
  ,

  "bulkeq-copper-band"
  ,

  "bulkeq-beech-antler-mini"
  ,

  "bulkeq-thread-ring"
  ,

  "bulkeq-moss-pouch-belt"
  ,

  "bulkeq-clay-anklet-duo"
  ,

  "bulkeq-hide-greaves-mini"
  ,

  "bulkeq-reedcloak"
  ,

  "bulkeq-rust-charm-disk"
  ,

  "bulkeq-bark-buckle"
  ,

  "bulkeq-pin-brooch"
  ,

  "bulkeq-pebble-token"
  ,

  "bulkeq-linen-sash-long"
  ,

  "bulkeq-shell-comb"
  ,

  "bulkeq-patch-tunic-mini"
  ,

  "bulkeq-driftwood-knuckle"
  ,

  "bulkeq-ash-wraps"
  ,

  "eq-wooden-training-blade"
  ,

  "eq-steadfast-wraps"
  ,

  "eq-mage-v 1"
  ,

  "eq-rogue-v 1"
  ,

  "eq-swordsman-v 1"
  ,

  "eq-tank-v 1"
  ,

  "eq-mage-v 2"
  ,

  "eq-rogue-v 2"
  ,

  "eq-swordsman-v 2"
  ,

  "eq-tank-v 2"
  ,

  "eq-mage-v 3"
  ,

  "eq-rogue-v 3"
  ,

  "eq-swordsman-v 3"
  ,

  "eq-tank-v 3"
  ,

  "eq-mage-v 4"
  ,

  "eq-rogue-v 4"
  ,

  "eq-swordsman-v 4"
  ,

  "eq-tank-v 4"
  ,

  "eq-mage-v 5"
  ,

  "eq-rogue-v 5"
  ,

  "eq-swordsman-v 5"
  ,

  "eq-tank-v 5"
  ,

  "eq-mage-v 6"
  ,

  "eq-rogue-v 6"
  ,

  "eq-swordsman-v 6"
  ,

  "eq-tank-v 6"
  ,

  "eq-mage-v 7"
  ,

  "eq-rogue-v 7"
  ,

  "eq-swordsman-v 7"
  ,

  "eq-tank-v 7"
  ,

  "eq-mage-v 8"
  ,

  "eq-rogue-v 8"
  ,

  "eq-swordsman-v 8"
  ,

  "eq-tank-v 8"
  ,

  "eq-mage-v 9"
  ,

  "eq-rogue-v 9"
  ,

  "eq-swordsman-v 9"
  ,

  "eq-tank-v 9"
  ,

  "eq-mage-v10"
  ,

  "eq-rogue-v10"
  ,

  "eq-swordsman-v10"
  ,

  "eq-tank-v10"
  ,

  "eq-mage-v11"
  ,

  "eq-rogue-v11"

];

// ============================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  if (!fs.existsSync(IMAGE_PATH)) {
    throw new Error(`Image not found: ${IMAGE_PATH}`);
  }

  const image = sharp(IMAGE_PATH);
  const metadata = await image.metadata();

  const sheetWidth = metadata.width;
  const sheetHeight = metadata.height;

  console.log(`Sheet size: ${sheetWidth}x${sheetHeight}`);

  const usableWidth =
    sheetWidth - OUTER_PADDING * 2 - GAP * (COLS - 1);

  const usableHeight =
    sheetHeight - OUTER_PADDING * 2 - GAP * (ROWS - 1);

  const cellWidth = Math.floor(usableWidth / COLS);
  const cellHeight = Math.floor(usableHeight / ROWS);

  console.log(`Cell size detected: ${cellWidth}x${cellHeight}`);

  if (itemSlugs.length !== COLS * ROWS) {
    throw new Error(
      `Expected ${COLS * ROWS} item slugs, got ${itemSlugs.length}`
    );
  }

  const outputDir = path.join(__dirname, "cropped");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  for (let index = 0; index < itemSlugs.length; index++) {
    const slug = itemSlugs[index];

    const row = Math.floor(index / COLS);
    const col = index % COLS;

    const left =
      OUTER_PADDING + col * (cellWidth + GAP);

    const top =
      OUTER_PADDING + row * (cellHeight + GAP);

    const outputPath = path.join(outputDir, `${slug}.png`);

    // Crop + resize to exact 16x16
    await sharp(IMAGE_PATH)
      .extract({
        left: left + INNER_PADDING,
        top: top + INNER_PADDING,
        width: cellWidth - INNER_PADDING * 2,
        height: cellHeight - INNER_PADDING * 2,
      })
      .resize(CELL_SIZE, CELL_SIZE, {
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toFile(outputPath);

    console.log(`Cropped ${slug}`);

    // Upload to Supabase
    const fileBuffer = fs.readFileSync(outputPath);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${slug}.png`, fileBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error(`Upload failed for ${slug}:`, error.message);
    } else {
      console.log(`Uploaded ${slug}.png`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
});